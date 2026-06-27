import type { ChoiceId, DeviceId, ItemInstanceId, Money, RoomCode, SeatId, SessionId, TokenId } from '../ids';
import type { TokenKind } from '../domain/tokens';
import type { BetSelection, GameAction, GameKind } from '../state/game';
import type { Ack } from './envelopes';

export interface HelloPayload {
  deviceId: DeviceId;
  roomCode?: RoomCode;
}
export interface HelloResult {
  inRoom: boolean;
  code: RoomCode | null;
}

export interface CreateRoomPayload {
  deviceId: DeviceId;
}
export interface CreateRoomResult {
  code: RoomCode;
}

export interface JoinRoomPayload {
  deviceId: DeviceId;
  code: RoomCode;
}
export interface JoinRoomResult {
  code: RoomCode;
}

export interface SetBigScreenPayload {
  value: boolean;
}

export interface AddSeatPayload {
  name: string;
}
export interface AddSeatResult {
  seatId: SeatId;
}

export interface RemoveSeatPayload {
  seatId: SeatId;
}

export interface StartGamePayload {
  seatId: SeatId;
  kind: GameKind;
  bet: Money;
  selection?: BetSelection;
}
export interface StartGameResult {
  sessionId: SessionId;
}

export interface GameActionPayload {
  seatId: SeatId;
  action: GameAction;
}

export interface DismissPayload {
  seatId: SeatId;
}

export interface UseItemPayload {
  seatId: SeatId;
  instanceId: ItemInstanceId;
  targetSeatId?: SeatId;
}

export interface DrinkCheckResolvePayload {
  seatId: SeatId;
  resolutions: { tokenId: TokenId; as: TokenKind }[];
}

export interface DrinkCheckSkipPayload {
  seatId: SeatId;
}

export interface ChoiceResolvePayload {
  seatId: SeatId;
  choiceId: ChoiceId;
  optionId: string;
  targetSeatId?: SeatId;
}

export interface SetExemptPayload {
  seatId: SeatId;
  value: boolean;
}

export interface PausePayload {
  value: boolean;
}

export interface TopUpPayload {
  seatId: SeatId;
}

// Socket.io client->server map. Every event carries an ack returning Result<...>.
export interface ClientToServerEvents {
  'session:hello': (p: HelloPayload, ack: Ack<HelloResult>) => void;
  'room:create': (p: CreateRoomPayload, ack: Ack<CreateRoomResult>) => void;
  'room:join': (p: JoinRoomPayload, ack: Ack<JoinRoomResult>) => void;
  'device:setBigScreen': (p: SetBigScreenPayload, ack: Ack<Record<string, never>>) => void;
  'seat:add': (p: AddSeatPayload, ack: Ack<AddSeatResult>) => void;
  'seat:addBot': (p: Record<string, never>, ack: Ack<AddSeatResult>) => void;
  'seat:remove': (p: RemoveSeatPayload, ack: Ack<Record<string, never>>) => void;
  'seat:setExempt': (p: SetExemptPayload, ack: Ack<Record<string, never>>) => void;
  'houseRules:accept': (p: Record<string, never>, ack: Ack<Record<string, never>>) => void;
  'game:start': (p: StartGamePayload, ack: Ack<StartGameResult>) => void;
  'game:action': (p: GameActionPayload, ack: Ack<Record<string, never>>) => void;
  'game:dismiss': (p: DismissPayload, ack: Ack<Record<string, never>>) => void;
  'bank:topUp': (p: TopUpPayload, ack: Ack<Record<string, never>>) => void;
  'item:use': (p: UseItemPayload, ack: Ack<Record<string, never>>) => void;
  'drinkCheck:resolve': (p: DrinkCheckResolvePayload, ack: Ack<Record<string, never>>) => void;
  'drinkCheck:skip': (p: DrinkCheckSkipPayload, ack: Ack<Record<string, never>>) => void;
  'choice:resolve': (p: ChoiceResolvePayload, ack: Ack<Record<string, never>>) => void;
  'control:advance': (p: Record<string, never>, ack: Ack<Record<string, never>>) => void;
  'control:pause': (p: PausePayload, ack: Ack<Record<string, never>>) => void;
  'control:skip': (p: Record<string, never>, ack: Ack<Record<string, never>>) => void;
  'control:playAgain': (p: Record<string, never>, ack: Ack<Record<string, never>>) => void;
  'sync:request': (p: Record<string, never>, ack: Ack<Record<string, never>>) => void;
}
