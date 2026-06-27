// Branded id types + money. Ids are minted server-side; these brand casts keep the
// type system honest without runtime cost.

type Brand<T, B extends string> = T & { readonly __brand: B };

export type RoomCode = Brand<string, 'RoomCode'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type SeatId = Brand<string, 'SeatId'>;
export type TokenId = Brand<string, 'TokenId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type ItemInstanceId = Brand<string, 'ItemInstanceId'>;
export type EventId = Brand<string, 'EventId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ModifierId = Brand<string, 'ModifierId'>;
export type ChoiceId = Brand<string, 'ChoiceId'>;

/** A floor index, 1..4. */
export type FloorId = 1 | 2 | 3 | 4;

/** Integer fake-dollars. Never a float. */
export type Money = number;

export const asRoomCode = (s: string) => s as RoomCode;
export const asDeviceId = (s: string) => s as DeviceId;
export const asSeatId = (s: string) => s as SeatId;
export const asTokenId = (s: string) => s as TokenId;
export const asItemId = (s: string) => s as ItemId;
export const asEventId = (s: string) => s as EventId;
export const asSessionId = (s: string) => s as SessionId;
export const asModifierId = (s: string) => s as ModifierId;
export const asChoiceId = (s: string) => s as ChoiceId;
