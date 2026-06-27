import type { ChoiceId, DeviceId, ItemId, ItemInstanceId, SeatId, TokenId } from '../ids';
import type { TokenKind, TokenSource } from '../domain/tokens';
import type { PrivateGameView, ResultSummary } from '../games/views';

export interface ItemView {
  instanceId: ItemInstanceId;
  itemId: ItemId;
  name: string;
  description: string;
  usableNow: boolean;
  needsTarget: boolean;
}

export interface TokenView {
  id: TokenId;
  kind: TokenKind;
  source: TokenSource;
  reason: string;
  carries: number;
}

/** A single token awaiting resolution in the current Drink Check. */
export interface DrinkCheckTokenSlot {
  id: TokenId;
  kind: TokenKind;
  reason: string;
}

export interface DrinkCheckResolveState {
  index: number;
  /** Remaining alcohol the seat may resolve this check (cap minus already-resolved). 0 if exempt. */
  budgetAlcohol: number;
  waterOnly: boolean;
  exempt: boolean;
  tokens: DrinkCheckTokenSlot[];
  done: boolean;
}

export interface PendingChoiceView {
  id: ChoiceId;
  prompt: string;
  options: { id: string; label: string }[];
}

export interface PrivateSeatView {
  seatId: SeatId;
  name: string;
  exempt: boolean;
  tokens: TokenView[];
  tokenCounts: { alcohol: number; water: number; dare: number };
  items: ItemView[];
  modifierLabels: string[];
  activeGame: PrivateGameView | null;
  lastResult: ResultSummary | null;
  drinkCheck: DrinkCheckResolveState | null;
  pendingChoice: PendingChoiceView | null;
}

export interface PrivateDeviceView {
  version: number;
  deviceId: DeviceId;
  ownedSeatIds: SeatId[];
  seats: PrivateSeatView[];
}
