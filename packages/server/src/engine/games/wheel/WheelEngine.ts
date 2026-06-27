import {
  type CreateSessionInput,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type SeatId,
} from '@lcc/shared';

// Lucky Wheel — a spin of fortune. 0× = lose; everything else multiplies the bet.
const SEGMENTS = [
  { mult: 0, weight: 30 },
  { mult: 1.5, weight: 26 },
  { mult: 2, weight: 20 },
  { mult: 3, weight: 12 },
  { mult: 5, weight: 8 },
  { mult: 10, weight: 3 },
  { mult: 20, weight: 1 },
] as const;

interface WState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  phase: 'betting' | 'done';
  mult: number | null;
}

export const WheelEngine: GameEngine<WState> = {
  kind: 'wheel',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): WState {
    return { seatId: input.seatId, bet: input.bet, allIn: input.bet >= ctx.availableBank, phase: 'betting', mult: null };
  },

  legalActions(s: WState): GameAction[] {
    return s.phase === 'betting' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: WState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'betting' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Spin to play.' } };
    const mult = ctx.rng.weighted(SEGMENTS.map((seg) => ({ value: seg.mult, weight: seg.weight })));
    return { session: { ...input, mult, phase: 'done' } };
  },

  isComplete(s: WState): boolean {
    return s.phase === 'done';
  },

  resolve(s: WState): GameOutcome {
    const mult = s.mult ?? 0;
    const delta = Math.round(s.bet * mult) - s.bet;
    const won = delta > 0;
    const out: GameOutcome = {
      bankDeltas: [{ seatId: s.seatId, delta }],
      mints: [],
      removals: [],
      pendingChoices: [],
      statEvents: [
        { seatId: s.seatId, event: { field: 'plays', value: 1 } },
        { seatId: s.seatId, event: { field: 'netBank', value: delta } },
      ],
      memoryPatch: {},
      summary: { won, bankDelta: delta, text: won ? `${mult}× — won $${delta}` : `${mult}× — lost $${-delta}` },
    };
    if (s.allIn) out.statEvents.push({ seatId: s.seatId, event: { field: 'allIns', value: 1 } });
    if (won) out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
    else {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -delta, mode: 'max' } });
      out.mints.push({ ownerSeatId: s.seatId, originSeatId: 'system', count: s.allIn ? 2 : 1, kind: 'alcohol', source: 'game', reason: 'wheel.loss' });
    }
    return out;
  },

  view(s: WState, viewer: SeatId | null) {
    const mult = s.mult ?? 0;
    const delta = Math.round(s.bet * mult) - s.bet;
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'wheel' as const,
        bet: s.bet,
        phase: s.phase,
        legal: s.phase === 'betting' ? [{ kind: 'spin' as const }] : [],
        result: s.phase === 'done' ? { won: delta > 0, bankDelta: delta, text: '', mult } : undefined,
      };
    }
    return { kind: 'wheel' as const, seatId: s.seatId, bet: s.bet, phase: s.phase, result: s.phase === 'done' ? { mult } : undefined };
  },
};
