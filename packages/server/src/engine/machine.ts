import { MIN_SEATS_TO_START, type DeviceId, type RoomState } from '@lcc/shared';

export function seatDeviceIds(state: RoomState): DeviceId[] {
  return Object.values(state.devices)
    .filter((d) => d.ownedSeatIds.length > 0)
    .map((d) => d.deviceId);
}

export function allSeatDevicesAcked(state: RoomState): boolean {
  const seatDevs = seatDeviceIds(state);
  if (seatDevs.length === 0) return false;
  return seatDevs.every((id) => state.houseRulesAckedDeviceIds.includes(id));
}

export function hasMinSeats(state: RoomState): boolean {
  return state.seatOrder.length >= MIN_SEATS_TO_START;
}

export function hasHuman(state: RoomState): boolean {
  return state.seatOrder.some((id) => state.seats[id] && !state.seats[id]!.isBot);
}

export function shiftDeadlines(state: RoomState, deltaMs: number): void {
  state.floor.endsAt += deltaMs;
  if (state.pendingCheck) state.pendingCheck.softDeadlineAt += deltaMs;
  if (state.pendingEvent?.deadlineAt !== undefined) state.pendingEvent.deadlineAt += deltaMs;
}
