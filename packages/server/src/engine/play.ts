import {
  FLOOR_BY_INDEX,
  GAME_NAMES,
  GAME_REVEAL_MS,
  applyStatEvent,
  err,
  ok,
  type ActiveGamePublic,
  type ActiveSession,
  type BetPolicy,
  type BetSelection,
  type DeviceId,
  type GameAction,
  type GameContext,
  type GameKind,
  type Money,
  type PrivateGameView,
  type PublicGameView,
  type Result,
  type RoomState,
  type SeatId,
  type SeatState,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { available, releaseReserve, reserve, settle } from './bank';
import { addTicker } from './state';
import { mint, removeTokens, type TokenCtx } from './tokens';
import { gameAvailable, getEngine } from './games/registry';
import { pokerAct, pokerPrivateView, pokerPublicView, pokerSeatIds, pokerTick, startOrJoinPoker, type PokerData } from './poker';
import {
  blackjackAct,
  blackjackPrivateView,
  blackjackPublicView,
  blackjackSeatIds,
  blackjackTick,
  startOrJoinBlackjack,
  type BlackjackTableData,
} from './blackjack-table';
import { markLastCallBet } from './event';

function betPolicyFor(state: RoomState): BetPolicy {
  const f = FLOOR_BY_INDEX[state.currentFloor];
  return { minBet: f.minBet, maxBet: f.maxBet, allowAllIn: f.allowAllIn, pokerAnte: f.pokerAnte };
}

function buildContext(state: RoomState, seat: SeatState, rctx: ReduceCtx): GameContext {
  return {
    floor: state.currentFloor,
    betPolicy: betPolicyFor(state),
    availableBank: available(state.bank),
    rng: rctx.rng,
    memory: seat.gameMemory,
    seatId: seat.seatId,
    modifiers: seat.modifiers,
  };
}

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

export function startGame(
  state: RoomState,
  deviceId: DeviceId,
  seatId: SeatId,
  kind: GameKind,
  bet: Money,
  selection: BetSelection | undefined,
  rctx: ReduceCtx,
): Result<{ sessionId: string }> {
  if (state.phase !== 'playing') return err('WRONG_PHASE', 'Wait for the round to start.');
  if (state.paused) return err('PAUSED', 'The game is paused.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat) return err('NOT_FOUND', 'No such seat.');
  if (seat.activeSessionId) return err('GAME_LOCKED', 'Finish your current game first.');
  if (!gameAvailable(kind)) return err('BAD_REQUEST', 'That game is not open yet.');
  const floor = FLOOR_BY_INDEX[state.currentFloor];
  if (!floor.gamePool.includes(kind)) return err('GAME_LOCKED', 'That game is closed on this floor.');

  if (kind === 'poker3') {
    const r = startOrJoinPoker(state, deviceId, seatId, rctx);
    if (r.ok) markLastCallBet(state, seatId);
    return r;
  }
  if (kind === 'blackjack') {
    const r = startOrJoinBlackjack(state, deviceId, seatId, bet, rctx);
    if (r.ok) markLastCallBet(state, seatId);
    return r;
  }

  const policy = betPolicyFor(state);
  const avail = available(state.bank);
  if (bet < policy.minBet) return err('BAD_REQUEST', `Minimum bet is $${policy.minBet}.`);
  if (bet > avail) return err('INSUFFICIENT_BANK', 'The bank can’t cover that bet.');
  if (bet > policy.maxBet && !policy.allowAllIn) return err('BAD_REQUEST', `Maximum bet is $${policy.maxBet}.`);

  const engine = getEngine(kind)!;
  const gctx = buildContext(state, seat, rctx);
  if (!reserve(state.bank, bet)) return err('INSUFFICIENT_BANK', 'The bank can’t cover that bet.');

  const data = engine.createSession({ seatId, bet, selection }, gctx);
  // consume the one-shot Loaded Dice modifier the dice engine just read (Fake Ace is handled
  // inside the blackjack table when cards are dealt)
  if (kind === 'diceDuel') {
    for (const m of seat.modifiers) if (m.trigger === 'next-dice-roll' && m.uses > 0) m.uses -= 1;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
  }
  const sessionId = rctx.ids.session();
  const session: ActiveSession = { id: sessionId, kind, seatId, bet, reserved: bet, selection, startedAt: rctx.now, data, settled: false, revealUntil: null };
  state.sessions[sessionId] = session;
  seat.activeSessionId = sessionId;
  seat.lastGame = null;
  markLastCallBet(state, seatId);
  addTicker(state, `${seat.name} sat down at ${GAME_NAMES[kind]}`, 'info', rctx.now);

  if (engine.isComplete(data)) settleSession(state, session, rctx);
  return ok({ sessionId });
}

export function applyGameAction(
  state: RoomState,
  deviceId: DeviceId,
  seatId: SeatId,
  action: GameAction,
  rctx: ReduceCtx,
): Result<Record<string, never>> {
  if (state.paused) return err('PAUSED', 'The game is paused.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat?.activeSessionId) return err('GAME_LOCKED', 'No active game.');
  const session = state.sessions[seat.activeSessionId];
  if (!session) return err('NOT_FOUND', 'No active game.');
  if (session.kind === 'poker3') return pokerAct(state, deviceId, seatId, action, rctx);
  if (session.kind === 'blackjack') return blackjackAct(state, deviceId, seatId, action, rctx);
  if (action.kind === 'replay') {
    const r = replaySolo(state, deviceId, seatId, rctx);
    return r.ok ? ok({}) : r;
  }
  const engine = getEngine(session.kind);
  if (!engine) return err('BAD_REQUEST', 'Unknown game.');

  const gctx = buildContext(state, seat, rctx);
  const res = engine.applyAction(session.data, action, gctx);
  if (res.rejected) return err('ILLEGAL_ACTION', res.rejected.reason);
  if (res.reserveMore) {
    if (!reserve(state.bank, res.reserveMore)) return err('INSUFFICIENT_BANK', 'The bank can’t cover that.');
    session.reserved += res.reserveMore;
  }
  session.data = res.session;
  if (engine.isComplete(res.session)) settleSession(state, session, rctx);
  return ok({});
}

export function settleSession(state: RoomState, session: ActiveSession, rctx: ReduceCtx): void {
  const engine = getEngine(session.kind);
  if (!engine) return;
  const seat = state.seats[session.seatId];
  if (!seat) return;
  const tokenCtx: TokenCtx = { ids: rctx.ids, now: rctx.now };
  const gctx = buildContext(state, seat, rctx);

  // Table Flip: cancel the whole result — refund the stake, no outcome, no tokens.
  const cancel = seat.modifiers.find((m) => m.kind === 'cancel-result' && m.uses > 0);
  if (cancel) {
    cancel.uses = 0;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
    releaseReserve(state.bank, session.reserved);
    seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Table flipped — bet refunded' }, at: rctx.now };
    addTicker(state, `${seat.name} flipped the table!`, 'event', rctx.now);
    delete state.sessions[session.id];
    seat.activeSessionId = null;
    return;
  }

  let outcome = engine.resolve(session.data, gctx);

  // Lucky Chip: reroll — replay a fresh hand of the same game and take that result instead.
  const reroll = seat.modifiers.find((m) => m.kind === 'reroll-result' && m.uses > 0);
  if (reroll) {
    reroll.uses = 0;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
    let s2 = engine.createSession({ seatId: session.seatId, bet: session.bet }, gctx);
    let guard = 0;
    while (!engine.isComplete(s2) && guard++ < 20) s2 = engine.applyAction(s2, engine.timeoutAction, gctx).session;
    outcome = engine.resolve(s2, gctx);
    addTicker(state, `${seat.name} rerolled with a Lucky Chip`, 'event', rctx.now);
  }

  // Double or Nothing: a win pays double; a loss costs 2 extra tokens.
  const dbl = seat.modifiers.find((m) => m.kind === 'double-stakes' && m.uses > 0);
  if (dbl) {
    dbl.uses = 0;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
    if (outcome.summary.won) {
      outcome = { ...outcome, bankDeltas: outcome.bankDeltas.map((d) => ({ ...d, delta: d.delta * 2 })) };
    } else {
      outcome.mints.push({ ownerSeatId: session.seatId, originSeatId: 'system', count: 2, kind: 'alcohol', source: 'item', reason: 'item.doubleDown' });
    }
  }

  outcome.bankDeltas.forEach((d, i) => {
    settle(state.bank, d.seatId, i === 0 ? session.reserved : 0, d.delta, rctx.now, session.kind);
  });

  for (const m of outcome.mints) mint(state, m, tokenCtx);
  for (const r of outcome.removals) removeTokens(state, r.seatId, r.count);

  for (const ev of outcome.statEvents) {
    const target = state.seats[ev.seatId];
    if (target) applyStatEvent(target.stats, ev.event);
  }

  Object.assign(seat.gameMemory, outcome.memoryPatch);

  // For M4/M5 the token "give-away" choices auto-resolve (interactive choices arrive in M7).
  for (const pc of outcome.pendingChoices) {
    if (pc.kind === 'give-token') {
      const others = state.seatOrder.filter((id) => id !== pc.seatId);
      if (others.length > 0) {
        const target = rctx.rng.pick(others);
        mint(state, { ownerSeatId: target, originSeatId: pc.seatId, count: pc.count, kind: 'alcohol', source: 'game', reason: pc.reason }, tokenCtx);
        addTicker(state, `${seat.name} passed a token to ${state.seats[target]?.name ?? '??'}`, 'token', rctx.now);
      }
    } else if (pc.kind === 'remove-or-give') {
      removeTokens(state, pc.seatId, pc.count);
    }
  }

  // Loan Shark Picks: a "win your next game or take a token" modifier resolves here.
  const winOrToken = seat.modifiers.filter((m) => m.kind === 'win-or-token' && m.uses > 0);
  if (winOrToken.length > 0) {
    for (const m of winOrToken) m.uses = 0;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
    if (!outcome.summary.won) {
      mint(state, { ownerSeatId: seat.seatId, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'event', reason: 'event.loanSharkPicks' }, tokenCtx);
    }
  }

  seat.lastGame = { summary: outcome.summary, at: rctx.now };
  addTicker(state, `${seat.name}: ${outcome.summary.text}`, outcome.summary.won ? 'win' : 'loss', rctx.now);

  // Solo games (slots/roulette/dice/...) are continuous: stay on the result with "Spin again"
  // / "Go back" instead of auto-returning to the menu.
  session.settled = true;
  session.revealUntil = null;
}

/** "Spin again" — replay a finished solo game with the same bet/selection. */
export function replaySolo(state: RoomState, deviceId: DeviceId, seatId: SeatId, rctx: ReduceCtx): Result<{ sessionId: string }> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  const sessionId = seat?.activeSessionId;
  const session = sessionId ? state.sessions[sessionId] : undefined;
  if (!seat || !session || !session.settled) return err('GAME_LOCKED', 'Nothing to replay.');
  const { kind, bet, selection } = session;
  delete state.sessions[session.id];
  seat.activeSessionId = null;
  seat.lastGame = null;
  return startGame(state, deviceId, seatId, kind, bet, selection, rctx);
}

/** Player tapped "Go back" — clear their reveal early instead of waiting for the timer. */
export function dismissReveal(state: RoomState, deviceId: DeviceId, seatId: SeatId): Result<Record<string, never>> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat?.activeSessionId) return ok({});
  const session = state.sessions[seat.activeSessionId];
  if (!session) return ok({});
  if (!session.settled) return err('GAME_LOCKED', 'The game isn’t finished.');
  seat.activeSessionId = null;
  if (session.kind === 'poker3') {
    // shared showdown: only drop the table once no one is still looking
    const stillViewing = pokerSeatIds(session.data as PokerData).some((sid) => state.seats[sid]?.activeSessionId === session.id);
    if (!stillViewing) delete state.sessions[session.id];
  } else {
    delete state.sessions[session.id];
  }
  return ok({});
}

/** Clear settled games whose reveal time has elapsed (returns the seat to the casino menu). */
export function clearExpiredReveals(state: RoomState, now: number): boolean {
  let changed = false;
  for (const s of Object.values(state.sessions)) {
    if (s.revealUntil != null && now >= s.revealUntil) {
      const seatIds =
        s.kind === 'poker3'
          ? pokerSeatIds(s.data as PokerData)
          : s.kind === 'blackjack'
            ? blackjackSeatIds(s.data as BlackjackTableData)
            : [s.seatId];
      for (const sid of seatIds) {
        const seat = state.seats[sid];
        if (seat && seat.activeSessionId === s.id) seat.activeSessionId = null;
      }
      delete state.sessions[s.id];
      changed = true;
    }
  }
  return changed;
}

// ---- projection helpers (used by project.ts) ----

export function tickGames(state: RoomState, rctx: ReduceCtx): boolean {
  const poker = pokerTick(state, rctx);
  const bj = blackjackTick(state, rctx);
  const reveals = clearExpiredReveals(state, rctx.now);
  return poker || bj || reveals;
}

export function publicActiveGames(state: RoomState): ActiveGamePublic[] {
  const out: ActiveGamePublic[] = [];
  for (const s of Object.values(state.sessions)) {
    if (s.kind === 'poker3') {
      out.push({ sessionId: s.id, view: pokerPublicView(s) });
      continue;
    }
    if (s.kind === 'blackjack') {
      out.push({ sessionId: s.id, view: blackjackPublicView(s) });
      continue;
    }
    const e = getEngine(s.kind);
    if (!e) continue;
    out.push({ sessionId: s.id, view: e.view(s.data, null) as PublicGameView });
  }
  return out;
}

export function privateActiveGame(state: RoomState, seat: SeatState): PrivateGameView | null {
  if (!seat.activeSessionId) return null;
  const s = state.sessions[seat.activeSessionId];
  if (!s) return null;
  if (s.kind === 'poker3') return pokerPrivateView(s, seat.seatId);
  if (s.kind === 'blackjack') return blackjackPrivateView(s, seat.seatId);
  const e = getEngine(s.kind);
  if (!e) return null;
  return e.view(s.data, seat.seatId) as PrivateGameView;
}
