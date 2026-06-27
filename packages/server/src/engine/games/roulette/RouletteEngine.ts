import {
  type BetSelection,
  type CreateSessionInput,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type RouletteColor,
  type SeatId,
} from '@lcc/shared';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

interface RState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  selection: BetSelection;
  phase: 'betting' | 'done';
  rolled: number | null;
}

function colorOf(n: number): RouletteColor | 'green' {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

function compute(s: RState): { number: number; color: RouletteColor | 'green'; win: boolean; profit: Money } {
  const n = s.rolled ?? 0;
  const color = colorOf(n);
  let win = false;
  let profit = -s.bet;
  if (s.selection.kind === 'rb') {
    win = color === s.selection.color;
    profit = win ? s.bet : -s.bet; // 2x payout = profit of one bet
  } else if (s.selection.kind === 'straightUp') {
    win = n === s.selection.number;
    profit = win ? s.bet * 9 : -s.bet; // 10x payout = profit of 9 bets
  }
  return { number: n, color, win, profit };
}

export const RouletteEngine: GameEngine<RState> = {
  kind: 'roulette',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): RState {
    return {
      seatId: input.seatId,
      bet: input.bet,
      allIn: input.bet >= ctx.availableBank,
      selection: input.selection ?? { kind: 'rb', color: 'red' },
      phase: 'betting',
      rolled: null,
    };
  },

  legalActions(s: RState): GameAction[] {
    return s.phase === 'betting' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: RState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'betting' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Spin to play.' } };
    return { session: { ...input, rolled: ctx.rng.int(37), phase: 'done' } };
  },

  isComplete(s: RState): boolean {
    return s.phase === 'done';
  },

  resolve(s: RState): GameOutcome {
    const r = compute(s);
    const out: GameOutcome = {
      bankDeltas: [{ seatId: s.seatId, delta: r.profit }],
      mints: [],
      removals: [],
      pendingChoices: [],
      statEvents: [
        { seatId: s.seatId, event: { field: 'plays', value: 1 } },
        { seatId: s.seatId, event: { field: 'netBank', value: r.profit } },
      ],
      memoryPatch: {},
      summary: { won: r.win, bankDelta: r.profit, text: '' },
    };
    if (s.allIn) out.statEvents.push({ seatId: s.seatId, event: { field: 'allIns', value: 1 } });
    if (r.win) {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
      out.summary.text = `${r.number} ${r.color} — won $${r.profit}`;
    } else {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -r.profit, mode: 'max' } });
      out.mints.push({
        ownerSeatId: s.seatId,
        originSeatId: 'system',
        count: s.allIn ? 2 : 1,
        kind: 'alcohol',
        source: 'game',
        reason: 'roulette.loss',
      });
      out.summary.text = `${r.number} ${r.color} — lost $${-r.profit}`;
    }
    return out;
  },

  view(s: RState, viewer: SeatId | null) {
    const done = s.phase === 'done';
    const r = done ? compute(s) : null;
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'roulette' as const,
        bet: s.bet,
        phase: s.phase,
        selection: s.selection,
        legal: s.phase === 'betting' ? [{ kind: 'spin' as const }] : [],
        result: r ? { won: r.win, bankDelta: r.profit, text: '', number: r.number, color: r.color } : undefined,
      };
    }
    return {
      kind: 'roulette' as const,
      seatId: s.seatId,
      bet: s.bet,
      phase: s.phase,
      result: r ? { number: r.number, color: r.color } : undefined,
    };
  },
};
