import type { FloorId, SeatId, TokenId } from '../ids';

// The drink model is BINARY on the alcohol axis: `alcohol` vs non-alcohol.
// `water` covers "water / soft drink"; `dare` is a non-drink forfeit.
export type TokenKind = 'alcohol' | 'water' | 'dare';

export type TokenSource = 'game' | 'drinkCheck' | 'event' | 'item' | 'punishment';

export type TokenStatus = 'pending' | 'resolved' | 'cancelled';

export interface DrinkToken {
  id: TokenId;
  ownerSeatId: SeatId;
  /** Who caused this token. Reverse Card bounces a token back toward its origin. */
  originSeatId: SeatId | 'system';
  kind: TokenKind;
  source: TokenSource;
  /** Machine-readable cause, e.g. 'blackjack.bust', 'event.loanShark'. */
  reason: string;
  mintedFloor: FloorId;
  status: TokenStatus;
  /** How it was resolved at a Drink Check (only set once resolved). */
  resolvedAs?: TokenKind;
  /** Number of Drink Checks survived unresolved; > MAX_CARRY converts to water. */
  carries: number;
}

export const isAlcohol = (t: DrinkToken): boolean => t.kind === 'alcohol';
export const isPending = (t: DrinkToken): boolean => t.status === 'pending';

/** A request to PLACE a token on a seat. Both mints and transfers build one of these and
 *  funnel through the server `placeToken` chokepoint, which applies exempt-coercion and
 *  armed cancel/redirect modifiers. Engines NEVER attach tokens directly. */
export interface TokenMintSpec {
  ownerSeatId: SeatId;
  originSeatId: SeatId | 'system';
  count: number;
  kind: TokenKind;
  source: TokenSource;
  reason: string;
  /** Non-alcohol replacement text shown when this resolves as a dare. */
  dareText?: string;
}

/** Order tokens are removed in (worst-first), so removals always relieve the heaviest burden. */
export const TOKEN_REMOVAL_ORDER: readonly TokenKind[] = ['alcohol', 'water', 'dare'];
