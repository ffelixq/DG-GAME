import type {
  ChoiceId,
  DeviceId,
  EventId,
  FloorId,
  ItemId,
  ItemInstanceId,
  Money,
  RoomCode,
  SeatId,
  SessionId,
  TokenId,
} from '../ids';
import type { EffectChoiceOption, GameModifier, RoomModifier } from '../domain/effects';
import type { SeatStats } from '../domain/stats';
import type { DrinkToken } from '../domain/tokens';
import type { BetSelection, GameKind, SeatGameMemory } from './game';
import type { FloorRuntime } from './floor';
import type { ResultSummary } from '../games/views';

export type RoomPhase =
  | 'lobby'
  | 'houseRules'
  | 'floorIntro'
  | 'playing'
  | 'drinkCheck'
  | 'event'
  | 'roundResults'
  | 'ending';

export type DeviceRole = 'bigScreen' | 'controller';

export type EndingId = 'good' | 'normal' | 'bad';

export type TickerTone = 'win' | 'loss' | 'token' | 'event' | 'info';

export interface TickerEntry {
  id: string;
  at: number;
  text: string;
  tone: TickerTone;
}

export interface DeviceState {
  deviceId: DeviceId;
  socketId: string | null;
  role: DeviceRole;
  connected: boolean;
  lastSeenAt: number;
  ownedSeatIds: SeatId[];
}

export interface ItemHolding {
  instanceId: ItemInstanceId;
  itemId: ItemId;
}

export interface SeatState {
  seatId: SeatId;
  deviceId: DeviceId;
  name: string;
  isHost: boolean;
  isBot: boolean;
  accentIndex: number; // stable seat colour, server-assigned
  exempt: boolean; // "I feel unwell" — alcohol coerced to water
  connected: boolean;
  tokenIds: TokenId[];
  items: ItemHolding[];
  modifiers: GameModifier[]; // armed deferred modifiers
  gameMemory: SeatGameMemory;
  stats: SeatStats;
  activeSessionId: SessionId | null;
  /** Transient result of the seat's most recent game, shown briefly on the phone. */
  lastGame: { summary: ResultSummary; at: number } | null;
}

export type BankReason = 'BET' | 'PAYOUT' | 'EVENT' | 'ITEM' | 'PUNISHMENT';

export interface BankEntry {
  id: string;
  at: number;
  seatId: SeatId | null;
  delta: Money;
  reason: BankReason;
  ref?: string;
  balanceAfter: Money;
}

export interface Bank {
  balance: Money;
  reserved: Money; // funds locked by in-flight bets
  quota: Money;
  floorStartBalance: Money;
  deficitCarry: Money; // shortfall carried from a failed non-final floor
  ledger: BankEntry[];
}

/** An active minigame session. Engine-private state lives in `data` (opaque at the shared layer). */
export interface ActiveSession {
  id: SessionId;
  kind: GameKind;
  seatId: SeatId; // initiator / solo seat
  bet: Money;
  reserved: Money; // total bank funds reserved for this session (stake, incl. double-down)
  selection?: BetSelection; // remembered for "play again"
  startedAt: number;
  data: unknown;
  /** True once the game has resolved (result is showing). */
  settled: boolean;
  /** Tables auto-clear at this wall-clock time; solo games stay (null) until dismissed/replayed. */
  revealUntil: number | null;
}

export interface DrinkCheckSeatState {
  seatId: SeatId;
  pendingTokenIds: TokenId[];
  alcoholResolved: number;
  done: boolean;
}

export interface DrinkCheckRuntime {
  id: string;
  index: number;
  startedAtGameMs: number;
  softDeadlineAt: number; // wall-clock advisory only
  waterOnly: boolean;
  bonusRemove: number;
  seats: Record<SeatId, DrinkCheckSeatState>;
}

export interface EventRuntime {
  eventId: EventId;
  name: string;
  description: string;
  startedAt: number;
  kind: 'instant' | 'lastCall';
  deadlineAt?: number; // for timed events
  satisfiedSeatIds?: SeatId[];
}

export interface PendingChoice {
  id: ChoiceId;
  seatId: SeatId;
  prompt: string;
  options: EffectChoiceOption[]; // full ops kept server-side; view redacts to {id,label}
  source: string;
}

export interface RoundResult {
  floor: FloorId;
  quota: Money;
  finalBank: Money;
  bankDelta: Money;
  passed: boolean;
  topWinnerSeatId: SeatId | null;
  topLoserSeatId: SeatId | null;
}

export interface AwardResult {
  awardId: string;
  name: string;
  description: string;
  seatId: SeatId | null;
  value: number;
}

export interface EndingResult {
  endingId: EndingId;
  finalBank: Money;
  awards: AwardResult[];
  worstGamblerSeatId: SeatId | null;
  finalDareSeatId?: SeatId; // good ending: winner picks a dare
  finalForfeitText?: string; // bad ending: one non-alcohol forfeit
}

export interface RoomState {
  code: RoomCode;
  phase: RoomPhase;
  paused: boolean;
  pauseAccumMs: number;
  pausedAt: number | null;

  createdAt: number;
  lastActivityAt: number;

  hostDeviceId: DeviceId;
  bigScreenDeviceId: DeviceId | null;
  houseRulesAckedDeviceIds: DeviceId[];

  devices: Record<DeviceId, DeviceState>;
  seats: Record<SeatId, SeatState>;
  seatOrder: SeatId[];

  bank: Bank;
  currentFloor: FloorId;
  floor: FloorRuntime;

  tokens: Record<TokenId, DrinkToken>;
  sessions: Record<SessionId, ActiveSession>;
  roomModifiers: RoomModifier[];
  ticker: TickerEntry[];

  pendingCheck: DrinkCheckRuntime | null;
  pendingEvent: EventRuntime | null;
  pendingChoices: PendingChoice[];

  lastResult: RoundResult | null;
  ending: EndingResult | null;

  rngSeed: number;
  rngCursor: number;
  version: number;
}
