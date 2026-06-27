import {
  type CreateSessionInput,
  type DiceBand,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type SeatId,
} from '@lcc/shared';

interface DState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  band: DiceBand;
  bonus: number; // Loaded Dice modifier
  phase: 'guessing' | 'done';
  dice: [number, number] | null;
}

function bandOf(sum: number): DiceBand {
  if (sum <= 6) return 'low';
  if (sum === 7) return 'mid';
  return 'high';
}

// low/high pay 2x (profit = bet); mid pays 5x (profit = 4*bet) — mid is the rare one (sum 7).
function profitFor(band: DiceBand, bet: Money): Money {
  return band === 'mid' ? bet * 4 : bet;
}

function compute(s: DState): { dice: [number, number]; sum: number; band: DiceBand; win: boolean; profit: Money } {
  const dice = s.dice ?? [1, 1];
  const sum = Math.min(12, dice[0] + dice[1] + s.bonus);
  const band = bandOf(sum);
  const win = band === s.band;
  const profit = win ? profitFor(s.band, s.bet) : -s.bet;
  return { dice, sum, band, win, profit };
}

export const DiceDuelEngine: GameEngine<DState> = {
  kind: 'diceDuel',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): DState {
    const band: DiceBand = input.selection?.kind === 'band' ? input.selection.band : 'low';
    const bonus = ctx.modifiers.filter((m) => m.kind === 'dice-bonus' && m.uses > 0).reduce((a, m) => a + (m.amount ?? 0), 0);
    return { seatId: input.seatId, bet: input.bet, allIn: input.bet >= ctx.availableBank, band, bonus, phase: 'guessing', dice: null };
  },

  legalActions(s: DState): GameAction[] {
    return s.phase === 'guessing' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: DState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'guessing' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Roll to play.' } };
    const dice: [number, number] = [ctx.rng.int(6) + 1, ctx.rng.int(6) + 1];
    return { session: { ...input, dice, phase: 'done' } };
  },

  isComplete(s: DState): boolean {
    return s.phase === 'done';
  },

  resolve(s: DState): GameOutcome {
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
      out.summary.text = `Rolled ${r.sum} (${r.band}) — won $${r.profit}`;
    } else {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -r.profit, mode: 'max' } });
      out.mints.push({ ownerSeatId: s.seatId, originSeatId: 'system', count: s.allIn ? 2 : 1, kind: 'alcohol', source: 'game', reason: 'dice.loss' });
      out.summary.text = `Rolled ${r.sum} (${r.band}) — lost $${-r.profit}`;
    }
    return out;
  },

  view(s: DState, viewer: SeatId | null) {
    const done = s.phase === 'done';
    const r = done ? compute(s) : null;
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'diceDuel' as const,
        bet: s.bet,
        phase: s.phase,
        band: s.band,
        legal: s.phase === 'guessing' ? [{ kind: 'spin' as const }] : [],
        result: r ? { won: r.win, bankDelta: r.profit, text: '', dice: r.dice, band: r.band } : undefined,
      };
    }
    return {
      kind: 'diceDuel' as const,
      seatId: s.seatId,
      bet: s.bet,
      phase: s.phase,
      result: r ? { dice: r.dice, band: r.band } : undefined,
    };
  },
};
