import type {
  BetSelection,
  ChoiceId,
  DeviceId,
  GameAction,
  GameKind,
  ItemInstanceId,
  Money,
  SeatId,
  TokenId,
  TokenKind,
} from '@lcc/shared';

// Internal dispatch model. socket/handlers.ts translates wire events into Commands tagged with
// the acting deviceId. All commands flow through Room.dispatch -> reduce (single writer).
export type Command =
  | { t: 'attachDevice'; deviceId: DeviceId; socketId: string }
  | { t: 'detachDevice'; deviceId: DeviceId }
  | { t: 'setBigScreen'; deviceId: DeviceId; value: boolean }
  | { t: 'addSeat'; deviceId: DeviceId; name: string }
  | { t: 'addBot'; deviceId: DeviceId }
  | { t: 'removeSeat'; deviceId: DeviceId; seatId: SeatId }
  | { t: 'setExempt'; deviceId: DeviceId; seatId: SeatId; value: boolean }
  | { t: 'ackHouseRules'; deviceId: DeviceId }
  | { t: 'advance'; deviceId: DeviceId }
  | { t: 'pause'; deviceId: DeviceId; value: boolean }
  | { t: 'skip'; deviceId: DeviceId }
  | { t: 'playAgain'; deviceId: DeviceId }
  | { t: 'startGame'; deviceId: DeviceId; seatId: SeatId; kind: GameKind; bet: Money; selection?: BetSelection }
  | { t: 'gameAction'; deviceId: DeviceId; seatId: SeatId; action: GameAction }
  | { t: 'dismissReveal'; deviceId: DeviceId; seatId: SeatId }
  | { t: 'topUpBank'; deviceId: DeviceId; seatId: SeatId }
  | { t: 'useItem'; deviceId: DeviceId; seatId: SeatId; instanceId: ItemInstanceId; targetSeatId?: SeatId }
  | { t: 'resolveDrinkCheck'; deviceId: DeviceId; seatId: SeatId; resolutions: { tokenId: TokenId; as: TokenKind }[] }
  | { t: 'skipDrinkCheck'; deviceId: DeviceId; seatId: SeatId }
  | { t: 'resolveChoice'; deviceId: DeviceId; seatId: SeatId; choiceId: ChoiceId; optionId: string; targetSeatId?: SeatId }
  | { t: 'tick'; now: number };

export type CommandType = Command['t'];
