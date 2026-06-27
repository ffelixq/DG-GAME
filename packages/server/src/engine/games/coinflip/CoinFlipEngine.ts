import {
  type CoinSide,
  type CreateSessionInput,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type SeatId,
} from '@lcc/shared';

interface CState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  side: CoinSide;
  phase: 'betting' | 'done';
  flipped: CoinSide | null;
}

export const CoinFlipEngine: GameEngine<CState> = {
  kind: 'coinflip',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): CState {
    return {
      seatId: input.seatId,
      bet: input.bet,
      allIn: input.bet >= ctx.availableBank,
      side: input.selection?.kind === 'coin' ? input.selection.side : 'heads',
      phase: 'betting',
      flipped: null,
    };
  },

  legalActions(s: CState): GameAction[] {
    return s.phase === 'betting' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: CState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'betting' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Flip to play.' } };
    return { session: { ...input, flipped: ctx.rng.chance(0.5) ? 'heads' : 'tails', phase: 'done' } };
  },

  isComplete(s: CState): boolean {
    return s.phase === 'done';
  },

  resolve(s: CState): GameOutcome {
    const won = s.flipped === s.side;
    const delta = won ? s.bet : -s.bet;
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
      summary: { won, bankDelta: delta, text: won ? `${s.flipped} — won $${delta}` : `${s.flipped} — lost $${-delta}` },
    };
    if (s.allIn) out.statEvents.push({ seatId: s.seatId, event: { field: 'allIns', value: 1 } });
    if (won) out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
    else {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -delta, mode: 'max' } });
      out.mints.push({ ownerSeatId: s.seatId, originSeatId: 'system', count: s.allIn ? 2 : 1, kind: 'alcohol', source: 'game', reason: 'coinflip.loss' });
    }
    return out;
  },

  view(s: CState, viewer: SeatId | null) {
    const r = s.phase === 'done' ? { won: s.flipped === s.side, delta: s.flipped === s.side ? s.bet : -s.bet } : null;
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'coinflip' as const,
        bet: s.bet,
        phase: s.phase,
        side: s.side,
        legal: s.phase === 'betting' ? [{ kind: 'spin' as const }] : [],
        result: r && s.flipped ? { won: r.won, bankDelta: r.delta, text: '', side: s.flipped } : undefined,
      };
    }
    return { kind: 'coinflip' as const, seatId: s.seatId, bet: s.bet, phase: s.phase, result: s.flipped ? { side: s.flipped } : undefined };
  },
};
