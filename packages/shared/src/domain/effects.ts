import type { ModifierId, SeatId } from '../ids';
import type { StatField } from './stats';
import type { TokenKind } from './tokens';

// Declarative effect taxonomy. Every random event and item card is expressed as EffectOp[]
// (audit fix #4). The server's effects-runtime executes them against an EffectContext.
// CRITICAL: no op can place alcohol on an exempt or over-cap seat — `mintToken`/`moveToken`
// route through placeToken(), which coerces alcohol->water for exempt seats.

/** How a target seat (or seats) is chosen for an op. */
export type SelectionRule =
  | 'lowest-bank-delta' // most negative net this floor (single)
  | 'highest-bank-delta' // richest contributor (single)
  | 'negative-profit' // everyone with net < 0 (multi)
  | 'most-all-ins'
  | 'biggest-single-loss'
  | 'least-recent-play' // hasn't started a game in the longest
  | 'most-tokens'
  | 'random';

export type EffectTarget =
  | { sel: 'self' } // the item user / event's implicit subject
  | { sel: 'all' } // every seat
  | { sel: 'allInRound' } // every seat that has played this floor
  | { sel: 'chosen' } // resolved interactively by a chooser
  | { sel: 'rule'; rule: SelectionRule };

export type EffectCondition = { kind: 'bank-below-quota-fraction'; fraction: number };

export interface EffectChoiceOption {
  id: string;
  label: string;
  ops: EffectOp[];
}

export type EffectOp =
  | { op: 'mintToken'; target: EffectTarget; count: number; kind: TokenKind; reason: string; dareText?: string }
  | { op: 'removeToken'; target: EffectTarget; count: number }
  | { op: 'moveToken'; from: EffectTarget; to: EffectTarget; count: number; reason: string }
  | { op: 'adjustBank'; amount: number; reason: string } // negative = drain
  | { op: 'adjustQuota'; mode: 'percent' | 'absolute'; amount: number }
  | { op: 'arm'; target: EffectTarget; modifier: ModifierSpec }
  | { op: 'armRoom'; modifier: RoomModifierSpec }
  | { op: 'statAdjust'; target: EffectTarget; field: StatField; delta: number }
  | { op: 'chance'; p: number; then: EffectOp[]; otherwise: EffectOp[] }
  | { op: 'choice'; target: EffectTarget; prompt: string; options: EffectChoiceOption[] }
  | { op: 'condition'; when: EffectCondition; then: EffectOp[]; otherwise?: EffectOp[] };

// ---- Deferred modifiers (armed now, consumed later by a trigger) ----

export type ModifierTrigger =
  | 'next-token-onto-self' // before a token attaches to this seat
  | 'next-game-result' // when this seat's next game settles
  | 'next-blackjack-card' // next card dealt to this seat in blackjack
  | 'next-dice-roll' // next dice roll by this seat
  | 'next-punishment' // next quota-fail group punishment
  | 'win-next-game'; // evaluated when this seat's next game settles

export type ModifierKind =
  | 'cancel-token' // Insurance / Happy Hour
  | 'convert-token-water' // Designated Driver / Hangover Shield
  | 'redirect-token' // Reverse Card (params.to)
  | 'double-stakes' // Double Down item: 2x win / +2 tokens on loss
  | 'reroll-result' // Lucky Chip
  | 'cancel-result' // Table Flip
  | 'force-ace' // Fake Ace
  | 'dice-bonus' // Loaded Dice (params.amount)
  | 'odds-boost' // Fake Luck Charm flavour (params.pct)
  | 'immune-punishment' // Scapegoat
  | 'win-or-token'; // Loan Shark Picks

/** A modifier as authored in content (no instance id yet). */
export interface ModifierSpec {
  kind: ModifierKind;
  trigger: ModifierTrigger;
  uses: number;
  to?: SeatId;
  amount?: number;
  pct?: number;
  asKind?: TokenKind;
}

/** A live, armed modifier instance attached to a seat. */
export interface GameModifier extends ModifierSpec {
  id: ModifierId;
  source: string; // item/event id that created it
}

export type RoomModifierKind = 'next-check-water-only';

export interface RoomModifierSpec {
  kind: RoomModifierKind;
  uses: number;
  bonusRemove?: number;
}

export interface RoomModifier extends RoomModifierSpec {
  id: ModifierId;
  source: string;
}
