import {
  FLOOR_BY_INDEX,
  SEAT_ACCENT_COUNT,
  STARTING_BANK,
  MAX_TICKER_ENTRIES,
  type DeviceId,
  type DeviceState,
  type FloorId,
  type FloorRuntime,
  type RoomCode,
  type RoomState,
  type SeatId,
  type SeatState,
  type TickerTone,
  emptyGameMemory,
  emptyStats,
} from '@lcc/shared';
import { makeBank } from './bank';

/** Reset a finished room back to the lobby, keeping seats, devices and the big-screen role. */
export function resetForReplay(state: RoomState, now: number): void {
  state.currentFloor = 1;
  state.floor = makeFloorRuntime(1, now);
  state.bank = makeBank(FLOOR_BY_INDEX[1].quota, STARTING_BANK);
  state.tokens = {};
  state.sessions = {};
  state.roomModifiers = [];
  state.ticker = [];
  state.pendingCheck = null;
  state.pendingEvent = null;
  state.pendingChoices = [];
  state.lastResult = null;
  state.ending = null;
  state.houseRulesAckedDeviceIds = [];
  state.paused = false;
  state.pausedAt = null;
  state.pauseAccumMs = 0;
  state.phase = 'lobby';
  for (const sid of state.seatOrder) {
    const seat = state.seats[sid];
    if (!seat) continue;
    seat.tokenIds = [];
    seat.items = [];
    seat.modifiers = [];
    seat.gameMemory = emptyGameMemory();
    seat.stats = emptyStats();
    seat.activeSessionId = null;
    seat.lastGame = null;
    seat.exempt = false;
  }
}

export function makeFloorRuntime(index: FloorId, now: number): FloorRuntime {
  const cfg = FLOOR_BY_INDEX[index];
  return {
    index,
    quota: cfg.quota,
    roundMs: cfg.roundMs,
    elapsedGameMs: 0,
    startedAt: now,
    endsAt: now + cfg.roundMs,
    lastTickAt: now,
    drinkCheckIntervalMs: cfg.drinkCheckIntervalMs,
    nextDrinkCheckAtGameMs: cfg.drinkCheckIntervalMs,
    drinkChecksFired: 0,
    eventsEnabled: cfg.eventsEnabled,
    eventFrequencyMs: cfg.eventFrequencyMs,
    nextEventRollAtGameMs: cfg.eventFrequencyMs > 0 ? cfg.eventFrequencyMs : Number.POSITIVE_INFINITY,
  };
}

export function createInitialRoom(code: RoomCode, hostDeviceId: DeviceId, now: number, seed: number): RoomState {
  const firstFloor: FloorId = 1;
  const cfg = FLOOR_BY_INDEX[firstFloor];
  return {
    code,
    phase: 'lobby',
    paused: false,
    pauseAccumMs: 0,
    pausedAt: null,
    createdAt: now,
    lastActivityAt: now,
    hostDeviceId,
    bigScreenDeviceId: null,
    houseRulesAckedDeviceIds: [],
    devices: {},
    seats: {},
    seatOrder: [],
    bank: makeBank(cfg.quota, STARTING_BANK),
    currentFloor: firstFloor,
    floor: makeFloorRuntime(firstFloor, now),
    tokens: {},
    sessions: {},
    roomModifiers: [],
    ticker: [],
    pendingCheck: null,
    pendingEvent: null,
    pendingChoices: [],
    lastResult: null,
    ending: null,
    rngSeed: seed,
    rngCursor: 0,
    version: 0,
  };
}

export function ensureDevice(state: RoomState, deviceId: DeviceId, socketId: string | null, now: number): DeviceState {
  let dev = state.devices[deviceId];
  if (!dev) {
    dev = {
      deviceId,
      socketId,
      role: 'controller',
      connected: socketId !== null,
      lastSeenAt: now,
      ownedSeatIds: [],
    };
    state.devices[deviceId] = dev;
  } else {
    dev.socketId = socketId;
    dev.connected = socketId !== null;
    dev.lastSeenAt = now;
  }
  return dev;
}

export function makeSeat(seatId: SeatId, deviceId: DeviceId, name: string, isHost: boolean, accentIndex: number, isBot = false): SeatState {
  return {
    seatId,
    deviceId,
    name,
    isHost,
    isBot,
    accentIndex,
    exempt: false,
    connected: true,
    tokenIds: [],
    items: [],
    modifiers: [],
    gameMemory: emptyGameMemory(),
    stats: emptyStats(),
    activeSessionId: null,
    lastGame: null,
  };
}

export function nextAccentIndex(state: RoomState): number {
  return state.seatOrder.length % SEAT_ACCENT_COUNT;
}

/** Enter (or resume) the playing phase: recompute the wall-clock end from remaining game time. */
export function enterPlaying(state: RoomState, now: number): void {
  state.phase = 'playing';
  state.floor.lastTickAt = now;
  state.floor.endsAt = now + Math.max(0, state.floor.roundMs - state.floor.elapsedGameMs);
}

export function addTicker(state: RoomState, text: string, tone: TickerTone, at: number): void {
  state.ticker.push({ id: `tk-${state.ticker.length}-${at}`, at, text, tone });
  if (state.ticker.length > MAX_TICKER_ENTRIES) {
    state.ticker.splice(0, state.ticker.length - MAX_TICKER_ENTRIES);
  }
}

export function activeSeats(state: RoomState): SeatState[] {
  return state.seatOrder.map((id) => state.seats[id]).filter((s): s is SeatState => Boolean(s));
}

export function seatsOwnedBy(state: RoomState, deviceId: DeviceId): SeatId[] {
  const dev = state.devices[deviceId];
  return dev ? [...dev.ownedSeatIds] : [];
}

export function nameTaken(state: RoomState, name: string): boolean {
  const norm = name.trim().toLowerCase();
  return activeSeats(state).some((s) => s.name.trim().toLowerCase() === norm);
}
