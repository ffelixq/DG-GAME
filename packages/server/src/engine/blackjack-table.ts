import {
  BLACKJACK_JOIN_WINDOW_MS,
  FLOOR_BY_INDEX,
  GAME_REVEAL_MS,
  TURN_TIMEOUT_MS,
  applyStatEvent,
  evalBlackjackHand,
  err,
  ok,
  type Card,
  type DeviceId,
  type GameAction,
  type Money,
  type PrivateGameView,
  type PublicGameView,
  type Result,
  type RoomState,
  type SeatId,
  type SessionId,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { available, releaseReserve, reserve, settle } from './bank';
import { addTicker } from './state';
import { mint, removeTokens, type TokenCtx } from './tokens';
import { draw, shuffledDeck } from './games/cards/Deck';

// Multiplayer blackjack: many players join one table and each plays their own hand against a
// single shared dealer. Bets come from the shared bank (reserved per seat).

interface BJEntry {
  seatId: SeatId;
  bet: Money;
  reserved: Money;
  allIn: boolean;
  cards: Card[];
  doubled: boolean;
  done: boolean; // stood, doubled, or busted
  busted: boolean;
  outcome?: 'win' | 'lose' | 'push';
}

export interface BlackjackTableData {
  phase: 'joining' | 'playing' | 'done';
  joinDeadline: number;
  actDeadline: number;
  deck: Card[];
  dealer: Card[];
  entries: BJEntry[];
}

export function blackjackSeatIds(data: BlackjackTableData): SeatId[] {
  return data.entries.map((e) => e.seatId);
}

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

/** Draw a card for a seat, honouring (and consuming) a Fake Ace modifier. */
function drawForSeat(state: RoomState, seatId: SeatId, deck: Card[], rng: ReduceCtx['rng']): Card {
  const card = draw(deck, rng);
  const seat = state.seats[seatId];
  const forceAce = seat?.modifiers.find((m) => m.kind === 'force-ace' && m.uses > 0);
  if (forceAce && seat) {
    forceAce.uses -= 1;
    seat.modifiers = seat.modifiers.filter((m) => m.uses > 0);
    return { rank: 'A', suit: card.suit };
  }
  return card;
}

export function findOpenBlackjack(state: RoomState): { id: SessionId; data: BlackjackTableData } | undefined {
  for (const s of Object.values(state.sessions)) {
    if (s.kind === 'blackjack' && (s.data as BlackjackTableData).phase === 'joining') return { id: s.id, data: s.data as BlackjackTableData };
  }
  return undefined;
}

export function startOrJoinBlackjack(state: RoomState, deviceId: DeviceId, seatId: SeatId, bet: Money, rctx: ReduceCtx): Result<{ sessionId: string }> {
  if (state.phase !== 'playing') return err('WRONG_PHASE', 'Wait for the round to start.');
  if (state.paused) return err('PAUSED', 'The game is paused.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat) return err('NOT_FOUND', 'No such seat.');
  if (seat.activeSessionId) return err('GAME_LOCKED', 'Finish your current game first.');
  const floor = FLOOR_BY_INDEX[state.currentFloor];
  if (!floor.gamePool.includes('blackjack')) return err('GAME_LOCKED', 'Blackjack is closed on this floor.');

  const avail = available(state.bank);
  if (bet < floor.minBet) return err('BAD_REQUEST', `Minimum bet is $${floor.minBet}.`);
  if (bet > avail) return err('INSUFFICIENT_BANK', 'The bank can’t cover that bet.');
  if (bet > floor.maxBet && !floor.allowAllIn) return err('BAD_REQUEST', `Maximum bet is $${floor.maxBet}.`);
  const allIn = bet >= avail;
  if (!reserve(state.bank, bet)) return err('INSUFFICIENT_BANK', 'The bank can’t cover that bet.');

  const open = findOpenBlackjack(state);
  if (open) {
    const data = open.data;
    data.entries.push({ seatId, bet, reserved: bet, allIn, cards: [drawForSeat(state, seatId, data.deck, rctx.rng), drawForSeat(state, seatId, data.deck, rctx.rng)], doubled: false, done: false, busted: false });
    seat.activeSessionId = open.id;
    seat.lastGame = null;
    addTicker(state, `${seat.name} sat down at the blackjack table`, 'info', rctx.now);
    return ok({ sessionId: open.id });
  }

  const deck = shuffledDeck(rctx.rng);
  const sessionId = rctx.ids.session();
  const data: BlackjackTableData = {
    phase: 'joining',
    joinDeadline: rctx.now + BLACKJACK_JOIN_WINDOW_MS,
    actDeadline: 0,
    deck,
    dealer: [],
    entries: [{ seatId, bet, reserved: bet, allIn, cards: [drawForSeat(state, seatId, deck, rctx.rng), drawForSeat(state, seatId, deck, rctx.rng)], doubled: false, done: false, busted: false }],
  };
  state.sessions[sessionId] = { id: sessionId, kind: 'blackjack', seatId, bet, reserved: bet, startedAt: rctx.now, data, settled: false, revealUntil: null };
  seat.activeSessionId = sessionId;
  seat.lastGame = null;
  addTicker(state, `${seat.name} opened a blackjack table — join now!`, 'event', rctx.now);
  return ok({ sessionId });
}

export function blackjackAct(state: RoomState, deviceId: DeviceId, seatId: SeatId, action: GameAction, rctx: ReduceCtx): Result<Record<string, never>> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat?.activeSessionId) return err('GAME_LOCKED', 'No active game.');
  const session = state.sessions[seat.activeSessionId];
  if (!session || session.kind !== 'blackjack') return err('NOT_FOUND', 'No blackjack game.');
  const data = session.data as BlackjackTableData;
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return err('NOT_FOUND', 'Not at this table.');

  // "Deal now" — anyone at the table can start the hand without waiting out the join window
  if (action.kind === 'deal') {
    if (data.phase !== 'joining') return err('WRONG_PHASE', 'Already dealt.');
    startPlay(state, session, rctx);
    return ok({});
  }

  if (data.phase !== 'playing') return err('WRONG_PHASE', 'Not dealt yet.');
  if (entry.done) return err('ILLEGAL_ACTION', 'You’re done this hand.');

  if (action.kind === 'hit') {
    entry.cards.push(drawForSeat(state, seatId, data.deck, rctx.rng));
    const v = evalBlackjackHand(entry.cards);
    if (v.bust) {
      entry.busted = true;
      entry.done = true;
    } else if (v.total === 21) {
      entry.done = true;
    }
  } else if (action.kind === 'stand') {
    entry.done = true;
  } else if (action.kind === 'double') {
    if (entry.cards.length !== 2) return err('ILLEGAL_ACTION', 'Double only on two cards.');
    if (!reserve(state.bank, entry.bet)) return err('INSUFFICIENT_BANK', 'The bank can’t cover a double.');
    entry.reserved += entry.bet;
    entry.doubled = true;
    entry.cards.push(drawForSeat(state, seatId, data.deck, rctx.rng));
    if (evalBlackjackHand(entry.cards).bust) entry.busted = true;
    entry.done = true;
  } else {
    return err('ILLEGAL_ACTION', 'Hit, stand or double.');
  }

  if (data.entries.every((e) => e.done)) resolveTable(state, session, rctx);
  return ok({});
}

function dealerPlay(data: BlackjackTableData, rctx: ReduceCtx): void {
  while (evalBlackjackHand(data.dealer).total < 17) data.dealer.push(draw(data.deck, rctx.rng));
}

function startPlay(state: RoomState, session: { id: string; data: unknown; revealUntil?: number | null }, rctx: ReduceCtx): void {
  const data = session.data as BlackjackTableData;
  data.dealer = [draw(data.deck, rctx.rng), draw(data.deck, rctx.rng)];
  data.phase = 'playing';
  for (const e of data.entries) {
    if (evalBlackjackHand(e.cards).total === 21) e.done = true; // natural -> auto-stand
  }
  data.actDeadline = rctx.now + TURN_TIMEOUT_MS;
  addTicker(state, 'Blackjack: cards are out — hit or stand!', 'event', rctx.now);
  if (data.entries.every((e) => e.done)) resolveTable(state, session, rctx);
}

export function blackjackTick(state: RoomState, rctx: ReduceCtx): boolean {
  let changed = false;
  for (const session of Object.values(state.sessions)) {
    if (session.kind !== 'blackjack') continue;
    const data = session.data as BlackjackTableData;
    if (data.phase === 'joining' && rctx.now >= data.joinDeadline) {
      if (data.entries.length === 0) delete state.sessions[session.id];
      else startPlay(state, session, rctx);
      changed = true;
    } else if (data.phase === 'playing' && rctx.now >= data.actDeadline) {
      for (const e of data.entries) e.done = true; // slow players auto-stand
      resolveTable(state, session, rctx);
      changed = true;
    }
  }
  return changed;
}

function resolveTable(state: RoomState, session: { id: string; data: unknown; revealUntil?: number | null; settled?: boolean }, rctx: ReduceCtx): void {
  const data = session.data as BlackjackTableData;
  data.phase = 'done';
  session.settled = true;
  const tokenCtx: TokenCtx = { ids: rctx.ids, now: rctx.now };
  dealerPlay(data, rctx);
  const dv = evalBlackjackHand(data.dealer);
  const dealerNatural = data.dealer.length === 2 && dv.total === 21;

  for (const entry of data.entries) {
    const seat = state.seats[entry.seatId];
    if (!seat) continue;
    const pv = evalBlackjackHand(entry.cards);
    const effBet = entry.bet * (entry.doubled ? 2 : 1);
    const natural = entry.cards.length === 2 && pv.total === 21;
    let result: 'win' | 'lose' | 'push';
    let delta: Money;
    let naturalWin = false;
    if (pv.bust) {
      result = 'lose';
      delta = -effBet;
    } else if (natural && !dealerNatural) {
      result = 'win';
      naturalWin = true;
      delta = Math.floor(entry.bet * 1.5);
    } else if (dealerNatural && !natural) {
      result = 'lose';
      delta = -effBet;
    } else if (dv.bust || pv.total > dv.total) {
      result = 'win';
      delta = effBet;
    } else if (pv.total < dv.total) {
      result = 'lose';
      delta = -effBet;
    } else {
      result = 'push';
      delta = 0;
    }
    entry.outcome = result;

    settle(state.bank, entry.seatId, entry.reserved, delta, rctx.now, 'blackjack');
    applyStatEvent(seat.stats, { field: 'plays', value: 1 });
    applyStatEvent(seat.stats, { field: 'netBank', value: delta });
    if (entry.allIn) applyStatEvent(seat.stats, { field: 'allIns', value: 1 });

    let streak = seat.gameMemory.blackjackWinStreak;
    if (result === 'win') {
      streak += 1;
      applyStatEvent(seat.stats, { field: 'gamesWon', value: 1 });
      if (naturalWin) removeTokens(state, entry.seatId, 1);
      if (streak >= 3) {
        const others = data.entries.map((e) => e.seatId).filter((id) => id !== entry.seatId);
        if (others.length > 0) mint(state, { ownerSeatId: rctx.rng.pick(others), originSeatId: entry.seatId, count: 1, kind: 'alcohol', source: 'game', reason: 'blackjack.streak3' }, tokenCtx);
        streak = 0;
      }
      seat.lastGame = { summary: { won: true, bankDelta: delta, text: naturalWin ? `Blackjack! +$${delta}` : `Won $${delta}` }, at: rctx.now };
    } else if (result === 'lose') {
      streak = 0;
      applyStatEvent(seat.stats, { field: 'gamesLost', value: 1 });
      applyStatEvent(seat.stats, { field: 'biggestSingleLoss', value: -delta, mode: 'max' });
      mint(state, { ownerSeatId: entry.seatId, originSeatId: 'system', count: entry.doubled || entry.allIn ? 2 : 1, kind: 'alcohol', source: 'game', reason: pv.bust ? 'blackjack.bust' : 'blackjack.loss' }, tokenCtx);
      seat.lastGame = { summary: { won: false, bankDelta: delta, text: pv.bust ? `Bust! −$${-delta}` : `Lost $${-delta}` }, at: rctx.now };
    } else {
      seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Push' }, at: rctx.now };
    }
    seat.gameMemory.blackjackWinStreak = streak;
  }

  addTicker(state, `Dealer has ${dv.total}${dv.bust ? ' — bust!' : ''}`, dv.bust ? 'win' : 'info', rctx.now);
  session.revealUntil = rctx.now + GAME_REVEAL_MS;
}

/** Bot strategy: hit below 17, otherwise stand. */
export function blackjackBotAction(data: BlackjackTableData, seatId: SeatId): GameAction {
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return { kind: 'stand' };
  return evalBlackjackHand(entry.cards).total < 17 ? { kind: 'hit' } : { kind: 'stand' };
}

// ---- projection ----

export function blackjackPublicView(session: { data: unknown }): PublicGameView {
  const data = session.data as BlackjackTableData;
  const done = data.phase === 'done';
  return {
    kind: 'blackjack',
    phase: data.phase,
    dealer: done ? data.dealer : data.dealer.slice(0, 1),
    dealerHidden: !done && data.dealer.length > 0,
    seats: data.entries.map((e) => ({
      seatId: e.seatId,
      bet: e.bet,
      cardCount: e.cards.length,
      total: done ? evalBlackjackHand(e.cards).total : null,
      busted: e.busted,
      done: e.done,
      outcome: e.outcome,
    })),
  };
}

export function blackjackPrivateView(session: { data: unknown }, seatId: SeatId): PrivateGameView | null {
  const data = session.data as BlackjackTableData;
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return null;
  const done = data.phase === 'done';
  const pv = evalBlackjackHand(entry.cards);
  const legal: GameAction[] =
    data.phase === 'playing' && !entry.done
      ? entry.cards.length === 2
        ? [{ kind: 'hit' }, { kind: 'stand' }, { kind: 'double' }]
        : [{ kind: 'hit' }, { kind: 'stand' }]
      : [];
  return {
    kind: 'blackjack',
    bet: entry.bet,
    phase: data.phase,
    hole: entry.cards,
    total: pv.total,
    soft: pv.soft,
    dealer: done ? data.dealer : data.dealer.slice(0, 1),
    dealerHidden: !done && data.dealer.length > 0,
    legal,
    others: data.entries.filter((e) => e.seatId !== seatId).map((e) => ({ seatId: e.seatId, cardCount: e.cards.length, done: e.done, busted: e.busted })),
  };
}
