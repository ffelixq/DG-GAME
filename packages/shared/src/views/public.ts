import type { ChoiceId, DeviceId, EventId, FloorId, Money, RoomCode, SeatId, SessionId } from '../ids';
import type { GameKind } from '../state/game';
import type { EndingResult, RoomPhase, RoundResult, TickerEntry } from '../state/room';
import type { PublicGameView } from '../games/views';

export interface PublicSeatView {
  seatId: SeatId;
  name: string;
  accentIndex: number;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  exempt: boolean;
  tokenCounts: { alcohol: number; water: number; dare: number };
  bankDelta: Money;
  activeGame: GameKind | null;
  itemCount: number;
}

export interface DrinkCheckPublicSeat {
  seatId: SeatId;
  pending: number;
  alcoholResolved: number;
  done: boolean;
}

export interface DrinkCheckPublic {
  index: number;
  waterOnly: boolean;
  seats: DrinkCheckPublicSeat[];
}

export interface EventPublic {
  eventId: EventId;
  name: string;
  description: string;
  kind: 'instant' | 'lastCall';
  deadlineAt?: number;
}

export interface ActiveGamePublic {
  sessionId: SessionId;
  view: PublicGameView;
}

export interface PendingChoicePublic {
  id: ChoiceId;
  seatId: SeatId;
  prompt: string;
}

export interface PublicTimer {
  endsAt: number;
  durationMs: number;
  remainingMs: number; // authoritative remaining active-play time (use when not running)
  serverNow: number;
  running: boolean;
}

export interface PublicRoomView {
  version: number;
  code: RoomCode;
  phase: RoomPhase;
  paused: boolean;

  floor: FloorId;
  floorName: string;
  bank: Money;
  reserved: Money;
  quota: Money;
  deficitCarry: Money;
  bets: { min: Money; max: Money; pokerAnte: Money; allowAllIn: boolean };
  games: GameKind[];
  timer: PublicTimer;

  hostDeviceId: DeviceId;
  bigScreenDeviceId: DeviceId | null;

  seats: PublicSeatView[];
  seatOrder: SeatId[];

  activeGames: ActiveGamePublic[];
  ticker: TickerEntry[];

  drinkCheck: DrinkCheckPublic | null;
  activeEvent: EventPublic | null;
  pendingChoices: PendingChoicePublic[];

  lastResult: RoundResult | null;
  ending: EndingResult | null;

  houseRules: { ackedCount: number; total: number };
}
