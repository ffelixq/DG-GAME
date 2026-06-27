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
  type PrivateGameView,
  type PublicGameView,
  type Result,
  type RoomState,
  type SeatId,
  type SessionId,
} from '@lcc/shared';
import type { Rng } from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { addTicker } from './state';
import { mint, type TokenCtx } from './tokens';
import { shuffledDeck } from './games/cards/Deck';

// ---- Poker (multiplayer Texas Hold'em, drink-stakes) ----
// 2 hole cards each; community flop/turn/river revealed street by street. Real betting rounds with
// check / bet / raise / call / fold — but the pot is DRINKS, not money (the bank is shared). Each
// bet/raise adds a drink to the pot; at showdown the WORST hand among the players still in drinks it.

interface HoldemEntry {
  seatId: SeatId;
  hole: Card[];
  folded: boolean;
  actedThisRound: boolean; // acted since the last bet/raise on this street
}

// Drink-stakes poker: there's no money pot (the bank is shared). Instead `pot` is the number of
// DRINKS the worst hand will take at showdown; bet/raise each add one drink to the pot.
export const POKER_POT_START = 1; // the ante: the loser always drinks at least this
export const POKER_BET_CAP = 3; // max bet level per street (caps raise wars)
export const POKER_POT_CAP = 5; // overall pot cap (the safety system still caps drinking at resolution)

export interface PokerData {
  phase: 'joining' | 'betting' | 'done';
  street: HoldemStreet;
  joinDeadline: number;
  turnDeadline: number;
  deck: Card[];
  community: Card[];
  entries: HoldemEntry[];
  pot: number; // drinks at stake
  bet: number; // outstanding raise this street (0 => current player may check)
  turnIndex: number; // index into entries whose turn it is
  result?: {
    winnerSeatId: SeatId | null;
    loserSeatId: SeatId | null;
    pot: number;
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

  // Poker is drink-stakes only — no money leaves the shared bank.
  const open = findOpenPoker(state);
  if (open) {
    const data = open.data;
    data.entries.push({ seatId, hole: [data.deck.pop()!, data.deck.pop()!], folded: false, actedThisRound: false });
    seat.activeSessionId = open.id;
    seat.lastGame = null;
    addTicker(state, `${seat.name} joined the poker table 🪑`, 'event', rctx.now);
    return ok({ sessionId: open.id });
  }

  const deck = shuffledDeck(rctx.rng);
  const sessionId = rctx.ids.session();
  const data: PokerData = {
    phase: 'joining',
    street: 'preflop',
    joinDeadline: rctx.now + POKER_JOIN_WINDOW_MS,
    turnDeadline: 0,
    deck,
    community: [],
    entries: [{ seatId, hole: [deck.pop()!, deck.pop()!], folded: false, actedThisRound: false }],
    pot: POKER_POT_START,
    bet: 0,
    turnIndex: 0,
  };
  state.sessions[sessionId] = { id: sessionId, kind: 'poker3', seatId, bet: 0, reserved: 0, startedAt: rctx.now, data, settled: false, revealUntil: null };
  seat.activeSessionId = sessionId;
  seat.lastGame = null;
  addTicker(state, `${seat.name} opened a poker table — join now! 🃏`, 'event', rctx.now);
  return ok({ sessionId });
}


type PokerSession = { id: string; data: unknown; revealUntil?: number | null; settled?: boolean };

// ---- turn / betting helpers ----

function activeEntries(data: PokerData): HoldemEntry[] {
  return data.entries.filter((e) => !e.folded);
}
function firstActiveIndex(data: PokerData): number {
  const i = data.entries.findIndex((e) => !e.folded);
  return i < 0 ? 0 : i;
}
function nextActiveIndex(data: PokerData, from: number): number {
  const n = data.entries.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (!data.entries[idx]!.folded) return idx;
  }
  return from;
}

/** Legal actions for an entry whose turn it is. */
function legalFor(data: PokerData): GameAction[] {
  if (data.bet === 0) {
    const acts: GameAction[] = [{ kind: 'check' }];
    if (data.pot < POKER_POT_CAP) acts.push({ kind: 'bet' });
    return acts;
  }
  const acts: GameAction[] = [{ kind: 'call' }];
  if (data.bet < POKER_BET_CAP && data.pot < POKER_POT_CAP) acts.push({ kind: 'raise' });
  acts.push({ kind: 'fold' });
  return acts;
}

export function pokerAct(state: RoomState, deviceId: DeviceId, seatId: SeatId, action: GameAction, rctx: ReduceCtx): Result<Record<string, never>> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat?.activeSessionId) return err('GAME_LOCKED', 'No active game.');
  const session = state.sessions[seat.activeSessionId];
  if (!session || session.kind !== 'poker3') return err('NOT_FOUND', 'No poker game.');
  const data = session.data as PokerData;
  if (data.phase !== 'betting') return err('WRONG_PHASE', 'Not your move yet.');
  const entry = data.entries[data.turnIndex];
  if (!entry || entry.seatId !== seatId) return err('NOT_YOUR_TURN', "It's not your turn.");

  switch (action.kind) {
    case 'check':
      if (data.bet !== 0) return err('ILLEGAL_ACTION', 'There’s a bet — call, raise or fold.');
      entry.actedThisRound = true;
      break;
    case 'bet':
      if (data.bet !== 0) return err('ILLEGAL_ACTION', 'Already a bet — raise instead.');
      if (data.pot >= POKER_POT_CAP) return err('ILLEGAL_ACTION', 'Pot is maxed out.');
      data.bet = 1;
      data.pot = Math.min(POKER_POT_CAP, data.pot + 1);
      for (const e of data.entries) e.actedThisRound = false;
      entry.actedThisRound = true;
      addTicker(state, `${seat.name} bet — pot ${data.pot} 🍺`, 'event', rctx.now);
      break;
    case 'raise':
      if (data.bet === 0) return err('ILLEGAL_ACTION', 'Nothing to raise — bet first.');
      if (data.bet >= POKER_BET_CAP || data.pot >= POKER_POT_CAP) return err('ILLEGAL_ACTION', 'Can’t raise any higher.');
      data.bet += 1;
      data.pot = Math.min(POKER_POT_CAP, data.pot + 1);
      for (const e of data.entries) e.actedThisRound = false;
      entry.actedThisRound = true;
      addTicker(state, `${seat.name} raised — pot ${data.pot} 🍺`, 'event', rctx.now);
      break;
    case 'call':
      if (data.bet === 0) return err('ILLEGAL_ACTION', 'Nothing to call — check instead.');
      entry.actedThisRound = true;
      break;
    case 'fold':
      entry.folded = true;
      entry.actedThisRound = true;
      break;
    default:
      return err('ILLEGAL_ACTION', 'Check, bet, raise, call or fold.');
  }

  afterAction(state, session, rctx);
  return ok({});
}

function afterAction(state: RoomState, session: PokerSession, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  if (activeEntries(data).length <= 1) {
    resolveShowdown(state, session, rctx);
    return;
  }
  if (activeEntries(data).every((e) => e.actedThisRound)) {
    closeStreet(state, session, rctx);
    return;
  }
  data.turnIndex = nextActiveIndex(data, data.turnIndex);
  data.turnDeadline = rctx.now + TURN_TIMEOUT_MS;
}

function dealCommunity(data: PokerData, n: number): void {
  for (let i = 0; i < n; i++) data.community.push(data.deck.pop()!);
}

/** Reset the betting round at the start of a street. */
function startStreet(data: PokerData, now: number): void {
  data.bet = 0;
  for (const e of data.entries) if (!e.folded) e.actedThisRound = false;
  data.turnIndex = firstActiveIndex(data);
  data.turnDeadline = now + TURN_TIMEOUT_MS;
}

function closeStreet(state: RoomState, session: PokerSession, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  if (data.street === 'river') {
    resolveShowdown(state, session, rctx);
    return;
  }
  if (data.street === 'preflop') {
    data.street = 'flop';
    dealCommunity(data, 3);
    addTicker(state, 'Poker: the flop 🃏', 'event', rctx.now);
  } else if (data.street === 'flop') {
    data.street = 'turn';
    dealCommunity(data, 1);
    addTicker(state, 'Poker: the turn', 'event', rctx.now);
  } else {
    data.street = 'river';
    dealCommunity(data, 1);
    addTicker(state, 'Poker: the river', 'event', rctx.now);
  }
  startStreet(data, rctx.now);
}

/** Drives join close + per-turn timeouts. */
export function pokerTick(state: RoomState, rctx: ReduceCtx): boolean {
  let changed = false;
  for (const session of Object.values(state.sessions)) {
    if (session.kind !== 'poker3') continue;
    const data = session.data as PokerData;
    if (data.phase === 'joining' && rctx.now >= data.joinDeadline) {
      if (data.entries.length < 2) fizzle(state, session, rctx);
      else {
        data.phase = 'betting';
        data.street = 'preflop';
        startStreet(data, rctx.now);
        addTicker(state, 'Poker: cards dealt — place your bets! 🃏', 'event', rctx.now);
      }
      changed = true;
    } else if (data.phase === 'betting' && rctx.now >= data.turnDeadline) {
      const cur = data.entries[data.turnIndex];
      if (cur && !cur.folded) {
        cur.folded = true; // away player auto-folds (never forced to drink)
        cur.actedThisRound = true;
        addTicker(state, `${state.seats[cur.seatId]?.name ?? '??'} timed out — folded`, 'info', rctx.now);
        afterAction(state, session, rctx);
      } else {
        data.turnIndex = nextActiveIndex(data, data.turnIndex);
        data.turnDeadline = rctx.now + TURN_TIMEOUT_MS;
      }
      changed = true;
    }
  }
  return changed;
}

function fizzle(state: RoomState, session: PokerSession, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  for (const e of data.entries) {
    const seat = state.seats[e.seatId];
    if (seat) seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Table fizzled' }, at: rctx.now };
  }
  data.phase = 'done';
  data.result = { winnerSeatId: null, loserSeatId: null, pot: 0, community: data.community, reveals: [] };
  session.revealUntil = rctx.now;
  session.settled = true;
  addTicker(state, 'Poker table fizzled', 'info', rctx.now);
}

function resolveShowdown(state: RoomState, session: PokerSession, rctx: ReduceCtx): void {
  const data = session.data as PokerData;
  data.phase = 'done';
  session.settled = true;
  const tokenCtx: TokenCtx = { ids: rctx.ids, now: rctx.now };

  const evals = data.entries.map((e) => ({ entry: e, hand: bestHand([...e.hole, ...data.community]) }));
  const reveals = evals.map((x) => ({ seatId: x.entry.seatId, handLabel: x.hand.label, cards: x.entry.hole, folded: x.entry.folded }));
  const stayers = evals.filter((x) => !x.entry.folded);
  for (const { entry } of evals) {
    const seat = state.seats[entry.seatId];
    if (seat) applyStatEvent(seat.stats, { field: 'plays', value: 1 });
  }

  // everyone folded but (at most) one — the survivor wins, nobody drinks
  if (stayers.length <= 1) {
    const winnerId = stayers[0]?.entry.seatId ?? null;
    for (const { entry } of evals) {
      const seat = state.seats[entry.seatId];
      if (!seat) continue;
      if (entry.seatId === winnerId) {
        applyStatEvent(seat.stats, { field: 'gamesWon', value: 1 });
        seat.lastGame = { summary: { won: true, bankDelta: 0, text: 'Everyone folded — you win 🏆' }, at: rctx.now };
      } else {
        seat.lastGame = { summary: { won: false, bankDelta: 0, text: 'Folded' }, at: rctx.now };
      }
    }
    data.result = { winnerSeatId: winnerId, loserSeatId: null, pot: 0, community: data.community, reveals };
    addTicker(state, `Poker: ${winnerId ? state.seats[winnerId]?.name ?? '??' : 'nobody'} took it — no drinks`, 'info', rctx.now);
    session.revealUntil = rctx.now + GAME_REVEAL_MS;
    return;
  }

  stayers.sort((a, b) => cmp(b.hand.tiebreak, a.hand.tiebreak));
  const winner = stayers[0]!;
  const loser = stayers[stayers.length - 1]!;
  const pot = data.pot;

  for (const { entry, hand } of evals) {
    const seat = state.seats[entry.seatId];
    if (!seat) continue;
    if (entry.seatId === winner.entry.seatId) {
      applyStatEvent(seat.stats, { field: 'gamesWon', value: 1 });
      seat.lastGame = { summary: { won: true, bankDelta: 0, text: `Won with ${winner.hand.label} 🏆` }, at: rctx.now };
    } else if (entry.seatId === loser.entry.seatId) {
      applyStatEvent(seat.stats, { field: 'gamesLost', value: 1 });
      seat.lastGame = { summary: { won: false, bankDelta: 0, text: `Worst hand (${loser.hand.label}) — drink ${pot} 🍺` }, at: rctx.now };
    } else {
      seat.lastGame = { summary: { won: false, bankDelta: 0, text: entry.folded ? 'Folded' : hand.label }, at: rctx.now };
    }
  }

  mint(state, { ownerSeatId: loser.entry.seatId, originSeatId: 'system', count: pot, kind: 'alcohol', source: 'game', reason: 'poker.worstHand' }, tokenCtx);
  addTicker(state, `Poker: ${state.seats[loser.entry.seatId]?.name ?? '??'} lost with ${loser.hand.label} — drinks ${pot} 🍺`, 'win', rctx.now);
  data.result = { winnerSeatId: winner.entry.seatId, loserSeatId: loser.entry.seatId, pot, community: data.community, reveals };
  session.revealUntil = rctx.now + GAME_REVEAL_MS;
}

/** Bot betting: lean on hand strength, with light bluffing; never raises into the cap. */
export function pokerBotAction(data: PokerData, seatId: SeatId, rng: Rng): GameAction {
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return { kind: 'fold' };
  const hand = bestHand([...entry.hole, ...data.community]);
  const strong = hand.category >= 4;
  const decent = hand.category >= 2 || (hand.tiebreak[1] ?? 0) >= 12;
  if (data.bet === 0) {
    if (strong && data.pot < POKER_POT_CAP && rng.chance(0.7)) return { kind: 'bet' };
    return { kind: 'check' };
  }
  if (strong && data.bet < POKER_BET_CAP && data.pot < POKER_POT_CAP && rng.chance(0.5)) return { kind: 'raise' };
  if (decent) return { kind: 'call' };
  return rng.chance(0.6) ? { kind: 'fold' } : { kind: 'call' };
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
    pot: data.pot,
    toCall: data.bet,
    turnSeatId: data.phase === 'betting' ? data.entries[data.turnIndex]?.seatId ?? null : null,
    players: data.entries.map((e) => ({ seatId: e.seatId, folded: e.folded })),
    result: data.result,
  };
}

export function pokerPrivateView(session: { data: unknown }, seatId: SeatId): PrivateGameView | null {
  const data = session.data as PokerData;
  const entry = data.entries.find((e) => e.seatId === seatId);
  if (!entry) return null;
  const myTurn = data.phase === 'betting' && data.entries[data.turnIndex]?.seatId === seatId && !entry.folded;
  return {
    kind: 'poker3',
    phase: data.phase === 'betting' ? 'acting' : data.phase,
    street: data.street,
    hole: entry.hole,
    community: data.community,
    handLabel: bestHand([...entry.hole, ...data.community]).label,
    pot: data.pot,
    toCall: data.bet,
    myTurn,
    folded: entry.folded,
    legal: myTurn ? legalFor(data) : [],
    others: data.entries.filter((e) => e.seatId !== seatId).map((e) => ({ seatId: e.seatId, folded: e.folded })),
  };
}
