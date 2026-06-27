import {
  FLOOR_BY_INDEX,
  GAME_REVEAL_MS,
  POKER_JOIN_WINDOW_MS,
  TURN_TIMEOUT_MS,
  applyStatEvent,
  err,
  ok,
  pokerRankValue,
  type Card,
  type DeviceId,
  type GameAction,
  type HoldemStreet,
  type Money,
  type PrivateGameView,
  type PublicGameView,
  type Result,
  type RoomState,
  type SeatId,
  type SessionId,
} from '@lcc/shared';
import type { Rng } from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { adjust, reserve, releaseReserve } from './bank';
import { addTicker } from './state';
import { mint, type TokenCtx } from './tokens';
import { shuffledDeck } from './games/cards/Deck';

// ---- Texas Hold'em (shared-bank party adaptation) ----
// 2 hole cards each, community flop/turn/river revealed street by street. There's no money
// betting (the bank is shared, so a pot is meaningless) — each street you Stay or Fold, and at
// the showdown the WORST hand among stayers drinks; folders who'd have won also drink.

interface HoldemEntry {
  seatId: SeatId;
  ante: Money;
  hole: Card[];
  folded: boolean;
  acted: boolean;
}

export interface PokerData {
  phase: 'joining' | 'betting' | 'done';
  street: HoldemStreet;
  ante: Money;
  joinDeadline: number;
  actDeadline: number;
  streetStartedAt: number;
  deck: Card[];
  community: Card[];
  entries: HoldemEntry[];
  pot: Money;
  result?: {
    winnerSeatId: SeatId | null;
    community: Card[];
    reveals: { seatId: SeatId; handLabel: string; cards: Card[]; folded: boolean }[];
  };
}

export function pokerSeatIds(data: PokerData): SeatId[] {
  return data.entries.map((e) => e.seatId);
}

// ---- hand evaluation (best 5 of up to 7) ----

interface Hand {
  category: number; // 1 high .. 9 straight flush
  tiebreak: number[];
  label: string;
}

export function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function rankName(v: number): string {
  return { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack' }[v] ?? String(v);
}

const CAT_LABEL: Record<number, string> = {
  9: 'Straight flush',
  8: 'Four of a kind',
  7: 'Full house',
  6: 'Flush',
  5: 'Straight',
  4: 'Trips',
  3: 'Two pair',
  2: 'Pair',
  1: 'High card',
};

function labelFor(cat: number, groups: { rank: number; count: number }[], straightHigh: number): string {
  const r = (v: number) => rankName(v);
  const g0 = groups[0]?.rank ?? 0;
  const g1 = groups[1]?.rank ?? 0;
  switch (cat) {
    case 9:
      return `Straight flush, ${r(straightHigh)} high`;
    case 8:
      return `Four ${r(g0)}s`;
    case 7:
      return `Full house, ${r(g0)}s over ${r(g1)}s`;
    case 6:
      return `Flush, ${r(g0)} high`;
    case 5:
      return `Straight, ${r(straightHigh)} high`;
    case 4:
      return `Three ${r(g0)}s`;
    case 3:
      return `Two pair, ${r(g0)}s & ${r(g1)}s`;
    case 2:
      return `Pair of ${r(g0)}s`;
    default:
      return `${r(g0)} high`;
  }
}

function evaluate(cards: Card[]): Hand {
  const vs = cards.map((c) => pokerRankValue(c.rank)).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const groupRanks = groups.map((g) => g.rank);
  const maxCount = groups[0]?.count ?? 0;
  const flush = cards.length >= 5 && cards.every((c) => c.suit === cards[0]!.suit);
  let straightHigh = 0;
  if (cards.length === 5) {
    const uniq = [...new Set(vs)];
    if (uniq.length === 5) {
      if (vs[0]! - vs[4]! === 4) straightHigh = vs[0]!;
      else if (vs[0] === 14 && vs[1] === 5 && vs[2] === 4 && vs[3] === 3 && vs[4] === 2) straightHigh = 5;
    }
  }
  const isStraight = straightHigh > 0;
  let category: number;
  let tiebreak: number[];
  if (isStraight && flush) {
    category = 9;
    tiebreak = [9, straightHigh];
  } else if (maxCount === 4) {
    category = 8;
    tiebreak = [8, ...groupRanks];
  } else if (maxCount === 3 && (groups[1]?.count ?? 0) >= 2) {
    category = 7;
    tiebreak = [7, groups[0]!.rank, groups[1]!.rank];
  } else if (flush) {
    category = 6;
    tiebreak = [6, ...vs];
  } else if (isStraight) {
    category = 5;
    tiebreak = [5, straightHigh];
  } else if (maxCount === 3) {
    category = 4;
    tiebreak = [4, ...groupRanks];
  } else if (maxCount === 2 && (groups[1]?.count ?? 0) === 2) {
    category = 3;
    tiebreak = [3, ...groupRanks];
  } else if (maxCount === 2) {
    category = 2;
    tiebreak = [2, ...groupRanks];
  } else {
    category = 1;
    tiebreak = [1, ...vs];
  }
  return { category, tiebreak, label: labelFor(category, groups, straightHigh) };
}

function combos5(cards: Card[]): Card[][] {
  if (cards.length <= 5) return [cards];
  const out: Card[][] = [];
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  while (true) {
    out.push(idx.map((i) => cards[i]!));
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i]!++;
    for (let j = i + 1; j < 5; j++) idx[j] = idx[j - 1]! + 1;
  }
  return out;
}

export function bestHand(cards: Card[]): Hand {
  if (cards.length < 5) return evaluate(cards);
  let best: Hand | null = null;
  for (const c of combos5(cards)) {
    const e = evaluate(c);
    if (!best || cmp(e.tiebreak, best.tiebreak) > 0) best = e;
  }
  return best!;
}

// ---- lifecycle ----

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

export function findOpenPoker(state: RoomState): { id: SessionId; data: PokerData } | undefined {
  for (const s of Object.values(state.sessions)) {
    if (s.kind === 'poker3' && (s.data as PokerData).phase === 'joining') return { id: s.id, data: s.data as PokerData };
  }
  return undefined;
}

export function startOrJoinPoker(state: RoomState, deviceId: DeviceId, seatId: SeatId, rctx: ReduceCtx): Result<{ sessionId: string }> {
  if (state.phase !== 'playing') return err('WRONG_PHASE', 'Wait for the round to start.');
  if (state.paused) return err('PAUSED', 'The game is paused.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat) return err('NOT_FOUND', 'No such seat.');
  if (seat.activeSessionId) return err('GAME_LOCKED', 'Finish your current game first.');
  const floor = FLOOR_BY_INDEX[state.currentFloor];
  if (!floor.gamePool.includes('poker3')) return err('GAME_LOCKED', 'Poker is closed on this floor.');
  const ante = floor.pokerAnte;
  if (!reserve(state.bank, ante)) return err('INSUFFICIENT_BANK', 'The bank can’t cover the ante.');

  const open = findOpenPoker(state);
  if (open) {
    const data = open.data;
    data.entries.push({ seatId, ante, hole: [data.deck.pop()!, data.deck.pop()!], folded: false, acted: false });
    data.pot += ante;
    seat.activeSessionId = open.id;
    seat.lastGame = null;
    addTicker(state, `${seat.name} joined the Hold'em table`, 'info', rctx.now);
    return ok({ sessionId: open.id });
  }

  const deck = shuffledDeck(rctx.rng);
  const sessionId = rctx.ids.session();
  const data: PokerData = {
    phase: 'joining',
    street: 'preflop',
    ante,
    joinDeadline: rctx.now + POKER_JOIN_WINDOW_MS,
    actDeadline: 0,
    streetStartedAt: rctx.now,
    deck,
    community: [],
    entries: [{ seatId, ante, hole: [deck.pop()!, deck.pop()!], folded: false, acted: false }],
    pot: ante,
  };
  state.sessions[sessionId] = { id: sessionId, kind: 'poker3', seatId, bet: ante, reserved: 0, startedAt: rctx.now, data, settled: false, revealUntil: null };
  seat.activeSessionId = sessionId;
  seat.lastGame = null;
  addTicker(state, `${seat.name} opened a Texas Hold'em table — join now!`, 'event', rctx.now);
  return ok({ sessionId });
}

export function pokerAct(state: RoomState, deviceId: DeviceId, seatId: SeatId, action: GameAction, rctx: ReduceCtx): Result<Record<string, never>> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat?.activeSessionId) return err('GAME_LOCKED', 'No active game.');
  const session = state.sessions[seat.activeSessionId];
  if (!session || session.kind !== 'poker3') return err('NOT_FOUND', 'No poker game.');
  const data = session.data as PokerData;
  if (data.phase !== 'betting') return err('WRONG_PHASE', 'Not your move yet.');
  if (action.kind !== 'play' && action.kind !== 'fold') return err('ILLEGAL_ACTION', 'Stay or fold.');
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry || entry.folded) return err('NOT_FOUND', 'Not in this hand.');
  if (entry.acted) return err('ILLEGAL_ACTION', 'Already acted this street.');
  entry.acted = true;
  if (action.kind === 'fold') entry.folded = true;
  const active = data.entries.filter((e) => !e.folded);
  if (active.length <= 1 || active.every((e) => e.acted)) advanceStreet(state, session, rctx);
  return ok({});
}

function dealCommunity(data: PokerData, n: number): void {
  for (let i = 0; i < n; i++) data.community.push(data.deck.pop()!);
}

function advanceStreet(state: RoomState, session: { id: string; data: unknown }, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  const active = data.entries.filter((e) => !e.folded);
  if (active.length <= 1) {
    resolveShowdown(state, session, rctx);
    return;
  }
  if (data.street === 'river') {
    resolveShowdown(state, session, rctx);
    return;
  }
  if (data.street === 'preflop') {
    data.street = 'flop';
    dealCommunity(data, 3);
    addTicker(state, `Poker: the flop — ${data.community.map((c) => c.rank).join(' ')}`, 'event', rctx.now);
  } else if (data.street === 'flop') {
    data.street = 'turn';
    dealCommunity(data, 1);
    addTicker(state, 'Poker: the turn', 'event', rctx.now);
  } else {
    data.street = 'river';
    dealCommunity(data, 1);
    addTicker(state, 'Poker: the river', 'event', rctx.now);
  }
  for (const e of active) e.acted = false;
  data.streetStartedAt = rctx.now;
  data.actDeadline = rctx.now + TURN_TIMEOUT_MS;
}

/** Drives join close + per-street timeouts. */
export function pokerTick(state: RoomState, rctx: ReduceCtx): boolean {
  let changed = false;
  for (const session of Object.values(state.sessions)) {
    if (session.kind !== 'poker3') continue;
    const data = session.data as PokerData;
    if (data.phase === 'joining' && rctx.now >= data.joinDeadline) {
      if (data.entries.length < 2) {
        fizzle(state, session, rctx);
      } else {
        data.phase = 'betting';
        data.street = 'preflop';
        for (const e of data.entries) e.acted = false;
        data.streetStartedAt = rctx.now;
        data.actDeadline = rctx.now + TURN_TIMEOUT_MS;
        addTicker(state, "Hold'em: hole cards dealt — stay or fold!", 'event', rctx.now);
      }
      changed = true;
    } else if (data.phase === 'betting' && rctx.now >= data.actDeadline) {
      for (const e of data.entries) if (!e.folded) e.acted = true; // slow players auto-stay
      advanceStreet(state, session, rctx);
      changed = true;
    }
  }
  return changed;
}

function fizzle(state: RoomState, session: { id: string; data: unknown }, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  for (const e of data.entries) {
    releaseReserve(state.bank, e.ante);
    const seat = state.seats[e.seatId];
    if (seat) seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Table fizzled' }, at: rctx.now };
  }
  data.phase = 'done';
  data.result = { winnerSeatId: null, community: data.community, reveals: [] };
  session.data = data;
  (session as { revealUntil?: number | null; settled?: boolean }).revealUntil = rctx.now;
  (session as { settled?: boolean }).settled = true;
  addTicker(state, 'Poker table fizzled', 'info', rctx.now);
}

function resolveShowdown(state: RoomState, session: { id: string; data: unknown; revealUntil?: number | null; settled?: boolean }, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  data.phase = 'done';
  session.settled = true;
  const tokenCtx: TokenCtx = { ids: rctx.ids, now: rctx.now };

  for (const e of data.entries) releaseReserve(state.bank, e.ante);

  const evals = data.entries.map((e) => ({ entry: e, hand: bestHand([...e.hole, ...data.community]) }));
  const reveals = evals.map((x) => ({ seatId: x.entry.seatId, handLabel: x.hand.label, cards: x.entry.hole, folded: x.entry.folded }));
  const stayers = evals.filter((x) => !x.entry.folded);

  if (stayers.length === 0) {
    for (const e of data.entries) {
      const seat = state.seats[e.seatId];
      if (seat) seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Everyone folded' }, at: rctx.now };
    }
    data.result = { winnerSeatId: null, community: data.community, reveals };
    session.revealUntil = rctx.now;
    return;
  }

  stayers.sort((a, b) => cmp(b.hand.tiebreak, a.hand.tiebreak));
  const winner = stayers[0]!;
  const worst = stayers[stayers.length - 1]!;

  for (const { entry } of evals) {
    const seat = state.seats[entry.seatId];
    if (!seat) continue;
    applyStatEvent(seat.stats, { field: 'plays', value: 1 });
    if (entry.seatId === winner.entry.seatId) {
      const credit = data.pot - entry.ante;
      applyStatEvent(seat.stats, { field: 'gamesWon', value: 1 });
      applyStatEvent(seat.stats, { field: 'netBank', value: credit });
      seat.lastGame = { summary: { won: true, bankDelta: credit, text: `Won with ${winner.hand.label}` }, at: rctx.now };
    } else {
      applyStatEvent(seat.stats, { field: 'gamesLost', value: 1 });
      applyStatEvent(seat.stats, { field: 'netBank', value: -entry.ante });
      const e2 = evals.find((x) => x.entry === entry)!;
      seat.lastGame = {
        summary: { won: false, bankDelta: -entry.ante, text: entry.folded ? 'Folded' : `Lost with ${e2.hand.label}` },
        at: rctx.now,
      };
    }
  }

  if (stayers.length >= 2) {
    mint(state, { ownerSeatId: worst.entry.seatId, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'game', reason: 'poker.worstHand' }, tokenCtx);
  }
  for (const { entry, hand } of evals) {
    if (entry.folded && cmp(hand.tiebreak, winner.hand.tiebreak) > 0) {
      mint(state, { ownerSeatId: entry.seatId, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'game', reason: 'poker.foldWouldWin' }, tokenCtx);
    }
  }
  if (winner.hand.category === 1) {
    const others = data.entries.map((e) => e.seatId).filter((id) => id !== winner.entry.seatId);
    if (others.length > 0) {
      mint(state, { ownerSeatId: rctx.rng.pick(others), originSeatId: winner.entry.seatId, count: 1, kind: 'alcohol', source: 'game', reason: 'poker.highCardWin' }, tokenCtx);
    }
  }

  addTicker(state, `Poker: ${state.seats[winner.entry.seatId]?.name ?? '??'} won with ${winner.hand.label}`, 'win', rctx.now);
  data.result = { winnerSeatId: winner.entry.seatId, community: data.community, reveals };
  session.revealUntil = rctx.now + GAME_REVEAL_MS;
}

/** Simple bot strategy: stay with a pair+, otherwise lean on high cards. */
export function holdemBotDecision(data: PokerData, seatId: SeatId, rng: Rng): 'play' | 'fold' {
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return 'fold';
  const hand = bestHand([...entry.hole, ...data.community]);
  if (hand.category >= 2) return 'play';
  const hi = hand.tiebreak[1] ?? 0;
  if (hi >= 12) return 'play';
  return rng.chance(0.45) ? 'play' : 'fold';
}

// ---- projection ----

export function pokerPublicView(session: { data: unknown }): PublicGameView {
  const data = session.data as PokerData;
  return {
    kind: 'poker3',
    seatIds: data.entries.map((e) => e.seatId),
    phase: data.phase === 'betting' ? 'acting' : data.phase,
    street: data.street,
    community: data.community,
    ante: data.ante,
    pot: data.pot,
    result: data.result,
  };
}

export function pokerPrivateView(session: { data: unknown }, seatId: SeatId): PrivateGameView | null {
  const data = session.data as PokerData;
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return null;
  const canAct = data.phase === 'betting' && !entry.folded && !entry.acted;
  return {
    kind: 'poker3',
    bet: entry.ante,
    phase: data.phase === 'betting' ? 'acting' : data.phase,
    street: data.street,
    hole: entry.hole,
    community: data.community,
    handLabel: bestHand([...entry.hole, ...data.community]).label,
    legal: canAct ? [{ kind: 'play' }, { kind: 'fold' }] : [],
  };
}
