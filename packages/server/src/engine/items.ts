import {
  FLOOR_BY_INDEX,
  ITEM_BY_ID,
  err,
  ok,
  type DeviceId,
  type ItemInstanceId,
  type Result,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { resolveEffect } from './effects-runtime';
import { addTicker } from './state';

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

/** Deal each seat a few floor-appropriate item cards at the start of a floor. */
export function grantFloorItems(state: RoomState, rctx: ReduceCtx, count = 2): void {
  const floor = FLOOR_BY_INDEX[state.currentFloor];
  const pool = floor.itemPool.filter((id) => (ITEM_BY_ID[id]?.floorMin ?? 1) <= state.currentFloor);
  if (pool.length === 0) return;
  for (const sid of state.seatOrder) {
    const seat = state.seats[sid];
    if (!seat) continue;
    for (let i = 0; i < count; i++) {
      seat.items.push({ instanceId: rctx.ids.itemInstance(), itemId: rctx.rng.pick(pool) });
    }
  }
}

function phaseAllows(state: RoomState, usableWhen: string): boolean {
  switch (usableWhen) {
    case 'anytime':
      return state.phase === 'playing' || state.phase === 'drinkCheck' || state.phase === 'event';
    case 'during-drink-check':
      return state.phase === 'drinkCheck';
    case 'before-game':
    case 'on-result':
      return state.phase === 'playing';
    default:
      return false;
  }
}

export function useItem(
  state: RoomState,
  deviceId: DeviceId,
  seatId: SeatId,
  instanceId: ItemInstanceId,
  targetSeatId: SeatId | undefined,
  rctx: ReduceCtx,
): Result<Record<string, never>> {
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  if (!seat) return err('NOT_FOUND', 'No such seat.');
  const holdingIdx = seat.items.findIndex((h) => h.instanceId === instanceId);
  if (holdingIdx < 0) return err('NOT_FOUND', "You don't have that card.");
  const card = ITEM_BY_ID[seat.items[holdingIdx]!.itemId];
  if (!card) return err('BAD_REQUEST', 'Unknown card.');
  if (card.floorMin > state.currentFloor) return err('GAME_LOCKED', 'Not usable on this floor.');
  if (!phaseAllows(state, card.usableWhen)) return err('WRONG_PHASE', 'Can’t use that right now.');
  if (card.usableWhen === 'before-game' && seat.activeSessionId) return err('GAME_LOCKED', 'Use this before a game.');
  if (card.needsTarget) {
    if (!targetSeatId || !state.seats[targetSeatId]) return err('BAD_REQUEST', 'Choose a target.');
    if (targetSeatId === seatId) return err('BAD_REQUEST', 'Choose someone else.');
  }

  // consume the card, then run its effect through the same runtime as events
  seat.items.splice(holdingIdx, 1);
  resolveEffect(state, card.effect, seatId, targetSeatId ?? null, card.id, rctx);
  addTicker(state, `${seat.name} played ${card.name}`, 'event', rctx.now);
  return ok({});
}
