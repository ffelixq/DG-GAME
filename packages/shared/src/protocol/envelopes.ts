export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'BAD_CODE'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'NOT_IN_ROOM'
  | 'NOT_SEAT_OWNER'
  | 'NOT_HOST'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'INSUFFICIENT_BANK'
  | 'GAME_LOCKED'
  | 'PAUSED'
  | 'RATE_LIMITED'
  | 'CAP_EXCEEDED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'HOUSE_RULES_NOT_ACKED'
  | 'MIN_SEATS'
  | 'WRONG_PHASE';

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (code: ErrorCode, message: string): Result<never> => ({ ok: false, code, message });

export type Ack<T> = (r: Result<T>) => void;
