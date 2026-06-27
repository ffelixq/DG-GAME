import {
  type CreateSessionInput,
  type GameAction,
  type GameContext,
  type GameEngine,
  type GameOutcome,
  type Money,
  type SeatId,
} from '@lcc/shared';

const SYMBOLS = [
  { s: '🍒', w: 30, three: 4 },
  { s: '🍋', w: 26, three: 3 },
  { s: '🔔', w: 18, three: 6 },
  { s: '💎', w: 10, three: 10 },
  { s: '7️⃣', w: 6, three: 20 },
] as const;

const THREE_MULT: Record<string, number> = Object.fromEntries(SYMBOLS.map((x) => [x.s, x.three]));

interface SState {
  seatId: SeatId;
  bet: Money;
  allIn: boolean;
  phase: 'ready' | 'done';
  reels: string[] | null;
}

type Kind = 'jackpot' | 'two' | 'none';

function compute(s: SState): { reels: string[]; kind: Kind; profit: Money } {
  const reels = s.reels ?? ['🍒', '🍋', '🔔'];
  const [a, b, c] = reels as [string, string, string];
  if (a === b && b === c) {
    const mult = THREE_MULT[a] ?? 4;
    return { reels, kind: 'jackpot', profit: s.bet * (mult - 1) };
  }
  if (a === b || b === c || a === c) {
    return { reels, kind: 'two', profit: Math.floor(s.bet * 0.5) };
  }
  return { reels, kind: 'none', profit: -s.bet };
}

export const SlotsEngine: GameEngine<SState> = {
  kind: 'slots',
  mode: 'solo',
  timeoutAction: { kind: 'spin' },

  createSession(input: CreateSessionInput, ctx: GameContext): SState {
    return { seatId: input.seatId, bet: input.bet, allIn: input.bet >= ctx.availableBank, phase: 'ready', reels: null };
  },

  legalActions(s: SState): GameAction[] {
    return s.phase === 'ready' ? [{ kind: 'spin' }] : [];
  },

  applyAction(input: SState, action: GameAction, ctx: GameContext) {
    if (input.phase !== 'ready' || action.kind !== 'spin') return { session: input, rejected: { reason: 'Spin to play.' } };
    const reels = [0, 1, 2].map(() => ctx.rng.weighted(SYMBOLS.map((x) => ({ value: x.s, weight: x.w }))));
    return { session: { ...input, reels, phase: 'done' } };
  },

  isComplete(s: SState): boolean {
    return s.phase === 'done';
  },

  resolve(s: SState, ctx: GameContext): GameOutcome {
    const r = compute(s);
    const won = r.profit > 0;
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
      summary: { won, bankDelta: r.profit, text: '' },
    };
    if (s.allIn) out.statEvents.push({ seatId: s.seatId, event: { field: 'allIns', value: 1 } });

    let streak = ctx.memory.slotsNoMatchStreak;
    if (r.kind === 'jackpot') {
      streak = 0;
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
      out.pendingChoices.push({ seatId: s.seatId, kind: 'remove-or-give', count: 2, reason: 'slots.jackpot' });
      out.summary.text = `JACKPOT ${r.reels.join('')} — won $${r.profit}!`;
    } else if (r.kind === 'two') {
      streak = 0;
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesWon', value: 1 } });
      out.summary.text = `${r.reels.join('')} — small win $${r.profit}`;
    } else {
      streak += 1;
      out.statEvents.push({ seatId: s.seatId, event: { field: 'gamesLost', value: 1 } });
      out.statEvents.push({ seatId: s.seatId, event: { field: 'biggestSingleLoss', value: -r.profit, mode: 'max' } });
      if (streak >= 3) {
        out.mints.push({ ownerSeatId: s.seatId, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'game', reason: 'slots.noMatch3' });
        streak = 0;
      }
      out.summary.text = `${r.reels.join('')} — no match`;
    }
    out.memoryPatch = { slotsNoMatchStreak: streak };
    return out;
  },

  view(s: SState, viewer: SeatId | null) {
    if (viewer !== null && viewer === s.seatId) {
      return {
        kind: 'slots' as const,
        bet: s.bet,
        phase: s.phase,
        reels: s.reels,
        legal: s.phase === 'ready' ? [{ kind: 'spin' as const }] : [],
        result: s.phase === 'done' ? { won: compute(s).profit > 0, bankDelta: compute(s).profit, text: '' } : undefined,
      };
    }
    return { kind: 'slots' as const, seatId: s.seatId, bet: s.bet, phase: s.phase, reels: s.reels };
  },
};
