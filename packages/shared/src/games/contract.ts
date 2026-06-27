import type { FloorId, Money, SeatId } from '../ids';
import type { Rng } from '../rng/rng';
import type { GameModifier } from '../domain/effects';
import type { StatEvent } from '../domain/stats';
import type { TokenMintSpec } from '../domain/tokens';
import type { BetPolicy, BetSelection, GameAction, GameKind, SeatGameMemory } from '../state/game';
import type { PrivateGameView, PublicGameView, ResultSummary } from './views';

export interface GameContext {
  floor: FloorId;
  betPolicy: BetPolicy;
  availableBank: Money;
  rng: Rng;
  memory: SeatGameMemory;
  seatId: SeatId;
  /** All seats currently mid-blackjack — used for the dealer-blackjack table mint. */
  activeBlackjackSeats?: SeatId[];
  /** Armed seat modifiers relevant to this game (force-ace, dice-bonus, double-stakes, ...). */
  modifiers: GameModifier[];
}

export interface ActionResult<S> {
  session: S;
  /** Extra bank to reserve (e.g. blackjack double-down doubles the stake). */
  reserveMore?: Money;
  rejected?: { reason: string };
}

/** A token-related decision the resolving seat must make (give a token away, or remove). */
export interface PendingTokenChoice {
  seatId: SeatId;
  kind: 'give-token' | 'remove-or-give';
  count: number;
  reason: string;
}

export interface GameOutcome {
  /** Bank deltas (already net of the original reserved stake — see bank.settle). */
  bankDeltas: { seatId: SeatId; delta: Money }[];
  /** Token mints — the reducer runs each through placeToken(); engines never attach directly. */
  mints: TokenMintSpec[];
  removals: { seatId: SeatId; count: number }[];
  pendingChoices: PendingTokenChoice[];
  statEvents: { seatId: SeatId; event: StatEvent }[];
  memoryPatch: Partial<SeatGameMemory>;
  summary: ResultSummary;
}

export interface CreateSessionInput {
  seatId: SeatId;
  bet: Money;
  selection?: BetSelection;
}

/** One interface, five games. Engines are PURE (RNG via ctx.rng only). */
export interface GameEngine<S = unknown> {
  readonly kind: GameKind;
  readonly mode: 'solo' | 'table';
  /** Action applied automatically on a slow-player timeout (never an auto-drink). */
  readonly timeoutAction: GameAction;
  createSession(input: CreateSessionInput, ctx: GameContext): S;
  legalActions(s: S, ctx: GameContext): GameAction[];
  applyAction(s: S, action: GameAction, ctx: GameContext): ActionResult<S>;
  isComplete(s: S): boolean;
  resolve(s: S, ctx: GameContext): GameOutcome;
  view(s: S, viewer: SeatId | null): PublicGameView | PrivateGameView;
}
