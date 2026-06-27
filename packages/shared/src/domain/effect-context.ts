import type { SeatId } from '../ids';
import type { EffectChoiceOption, EffectTarget, ModifierSpec, RoomModifierSpec, SelectionRule } from './effects';
import type { StatField } from './stats';
import type { TokenKind } from './tokens';

// The capability surface the effects-runtime calls. Implemented server-side over RoomState.
// Authoring (content) only references the declarative EffectOp data; this interface is how
// those ops are executed. Keeping it explicit lets us prove every op is expressible.
export interface EffectContext {
  /** The implicit subject of the effect (item user, or event's primary seat). May be null for system events. */
  readonly selfSeatId: SeatId | null;

  resolveTargets(target: EffectTarget): SeatId[];
  resolveBySelectionRule(rule: SelectionRule): SeatId[];

  /** Place tokens — routes through placeToken (exempt-coercion + cancel/redirect modifiers). */
  mintToken(seatId: SeatId, count: number, kind: TokenKind, reason: string, dareText?: string): void;
  removeToken(seatId: SeatId, count: number): void;
  /** Remove from `from` then place on `to` (counts as a transfer; still routes through placeToken). */
  moveToken(from: SeatId, to: SeatId, count: number, reason: string): void;

  adjustBank(amount: number, reason: string): void;
  adjustQuota(mode: 'percent' | 'absolute', amount: number): void;

  armSeat(seatId: SeatId, modifier: ModifierSpec, source: string): void;
  armRoom(modifier: RoomModifierSpec, source: string): void;

  statAdjust(seatId: SeatId, field: StatField, delta: number): void;

  chance(p: number): boolean;
  bankBelowQuotaFraction(fraction: number): boolean;

  /** Register an interactive choice (sets a pending choice + notifies the chooser). */
  promptChoice(seatId: SeatId, prompt: string, options: EffectChoiceOption[], source: string): void;
}
