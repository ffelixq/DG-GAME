import {
  pokerRankValue,
  type Card,
  type CreateSessionInput,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type SeatId,
} from '@lcc/shared';
import { draw, shuffledDeck } from '../cards/Deck';

// High Card — you and the dealer each draw one card; higher wins (2×), tie pushes.
interface HState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  phase: 'betting' | 'done';
  deck: Card[];
  player: Card | null;
  dealer: Card | null;
}

export const HighCardEngine: GameEngine<HState> = {
  kind: 'highcard',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): HState {
    return { seatId: input.seatId, bet: input.bet, allIn: input.bet >= ctx.availableBank, phase: 'betting', deck: shuffledDeck(ctx.rng), player: null, dealer: null };
  },

  legalActions(s: HState): GameAction[] {
    return s.phase === 'betting' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: HState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'betting' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Draw to play.' } };
    const deck = [...input.deck];
    return { session: { ...input, player: draw(deck, ctx.rng), dealer: draw(deck, ctx.rng), deck, phase: 'done' } };
  },

  isComplete(s: HState): boolean {
    return s.phase === 'done';
  },

  resolve(s: HState): GameOutcome {
    const pv = s.player ? pokerRankValue(s.player.rank) : 0;
    const dv = s.dealer ? pokerRankValue(s.dealer.rank) : 0;
    const result: 'win' | 'lose' | 'push' = pv > dv ? 'win' : pv < dv ? 'lose' : 'push';
    const delta = result === 'win' ? s.bet : result === 'lose' ? -s.bet : 0;
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
      summary: { won: result === 'win', bankDelta: delta, text: result === 'push' ? 'Tie — push' : result === 'win' ? `Won $${delta}` : `Lost $${-delta}` },
    };
    if (s.allIn) out.statEvents.push({ seatId: s.seatId, event: { field: 'allIns', value: 1 } });
    if (result === 'win') out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
    else if (result === 'lose') {
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -delta, mode: 'max' } });
      out.mints.push({ ownerSeatId: s.seatId, originSeatId: 'system', count: s.allIn ? 2 : 1, kind: 'alcohol', source: 'game', reason: 'highcard.loss' });
    }
    return out;
  },

  view(s: HState, viewer: SeatId | null) {
    const done = s.phase === 'done' && s.player && s.dealer;
    const pv = s.player ? pokerRankValue(s.player.rank) : 0;
    const dv = s.dealer ? pokerRankValue(s.dealer.rank) : 0;
    const delta = pv > dv ? s.bet : pv < dv ? -s.bet : 0;
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'highcard' as const,
        bet: s.bet,
        phase: s.phase,
        legal: s.phase === 'betting' ? [{ kind: 'spin' as const }] : [],
        result: done ? { won: pv > dv, bankDelta: delta, text: '', player: s.player!, dealer: s.dealer! } : undefined,
      };
    }
    return { kind: 'highcard' as const, seatId: s.seatId, bet: s.bet, phase: s.phase, result: done ? { player: s.player!, dealer: s.dealer! } : undefined };
  },
};
