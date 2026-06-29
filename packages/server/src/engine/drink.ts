import {
  DRINK_CHECK_SOFT_MS,
  MAX_ALCOHOL_PER_CHECK,
  MAX_CARRY,
  err,
  ok,
  type DeviceId,
  type DrinkCheckSeatState,
  type Result,
  type RoomState,
  type SeatId,
  type SeatState,
  type TokenId,
  type TokenKind,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { addTicker, enterPlaying } from './state';
import { removeTokens } from './tokens';

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

function pendingTokenIds(state: RoomState, seat: SeatState): TokenId[] {
  return seat.tokenIds.filter((tid) => state.tokens[tid]?.status === 'pending');
}

export function openDrinkCheck(state: RoomState, rctx: ReduceCtx): void {
  const idx = state.floor.drinkChecksFired + 1;

  const waterMod = state.roomModifiers.find((m) => m.kind === 'next-check-water-only' && m.uses > 0);
  const waterOnly = Boolean(waterMod);
  const bonusRemove = waterMod?.bonusRemove ?? 0;
  if (waterMod) {
    waterMod.uses -= 1;
    state.roomModifiers = state.roomModifiers.filter((m) => m.uses > 0);
  }

  const seats: Record<string, DrinkCheckSeatState> = {};
  for (const sid of state.seatOrder) {
    const seat = state.seats[sid];
    if (!seat) continue;
    if (bonusRemove > 0) removeTokens(state, sid, bonusRemove);
    // exempt seats never face alcohol — convert any pending alcohol to water up front
    if (seat.exempt) {
      for (const tid of seat.tokenIds) {
        const t = state.tokens[tid];
        if (t?.kind === 'alcohol' && t.status === 'pending') t.kind = 'water';
      }
    }
    const pending = pendingTokenIds(state, seat);
    seats[sid] = { seatId: sid, pendingTokenIds: pending, alcoholResolved: 0, done: pending.length === 0 };
  }

  state.pendingCheck = {
    id: `dc-${idx}`,
    index: idx,
    startedAtGameMs: state.floor.elapsedGameMs,
    softDeadlineAt: rctx.now + DRINK_CHECK_SOFT_MS,
    waterOnly,
    bonusRemove,
    seats,
  };
  state.phase = 'drinkCheck';
  state.floor.drinkChecksFired = idx;
  state.floor.nextDrinkCheckAtGameMs += state.floor.drinkCheckIntervalMs;
  addTicker(state, `🍻 Drink Check #${idx}!`, 'event', rctx.now);
  maybeCloseCheck(state, rctx);
}

/** No carry-forward: any token not drunk THIS check is cleared (resolved, gone) — drink it now or lose it. */
function finalizeSeat(state: RoomState, dcs: DrinkCheckSeatState): void {
  for (const tid of dcs.pendingTokenIds) {
    const t = state.tokens[tid];
    if (!t || t.status !== 'pending') continue;
    t.status = 'resolved';
    t.resolvedAs = 'water';
    const seat = state.seats[t.ownerSeatId];
    if (seat) seat.tokenIds = seat.tokenIds.filter((id) => id !== tid);
    delete state.tokens[tid];
  }
  dcs.pendingTokenIds = [];
  dcs.done = true;
}

export function resolveDrinkCheck(
  state: RoomState,
  deviceId: DeviceId,
  seatId: SeatId,
  resolutions: { tokenId: TokenId; as: TokenKind }[],
  rctx: ReduceCtx,
): Result<Record<string, never>> {
  if (!state.pendingCheck) return err('WRONG_PHASE', 'No Drink Check right now.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const seat = state.seats[seatId];
  const dcs = state.pendingCheck.seats[seatId];
  if (!seat || !dcs) return err('NOT_FOUND', 'Not in this check.');
  if (dcs.done) return err('ILLEGAL_ACTION', 'Already resolved.');

  // validate everything before mutating (so a rejection leaves state untouched)
  let alcohol = 0;
  for (const r of resolutions) {
    const t = state.tokens[r.tokenId];
    if (!t || t.status !== 'pending' || t.ownerSeatId !== seatId || !dcs.pendingTokenIds.includes(r.tokenId)) {
      return err('BAD_REQUEST', 'Unknown token.');
    }
    if (r.as === 'alcohol') {
      if (seat.exempt) return err('CAP_EXCEEDED', 'Exempt players take no alcohol.');
      if (state.pendingCheck.waterOnly) return err('CAP_EXCEEDED', 'Water round — no alcohol.');
      alcohol += 1;
    }
  }
  if (alcohol > MAX_ALCOHOL_PER_CHECK) return err('CAP_EXCEEDED', `Max ${MAX_ALCOHOL_PER_CHECK} sips per check.`);

  // apply
  for (const r of resolutions) {
    const t = state.tokens[r.tokenId]!;
    t.status = 'resolved';
    t.resolvedAs = r.as;
    seat.tokenIds = seat.tokenIds.filter((id) => id !== r.tokenId);
    delete state.tokens[r.tokenId];
    dcs.pendingTokenIds = dcs.pendingTokenIds.filter((id) => id !== r.tokenId);
  }
  dcs.alcoholResolved = alcohol;
  finalizeSeat(state, dcs);
  maybeCloseCheck(state, rctx);
  return ok({});
}

export function skipDrinkCheck(state: RoomState, deviceId: DeviceId, seatId: SeatId, rctx: ReduceCtx): Result<Record<string, never>> {
  if (!state.pendingCheck) return err('WRONG_PHASE', 'No Drink Check right now.');
  if (!ownsSeat(state, deviceId, seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
  const dcs = state.pendingCheck.seats[seatId];
  if (!dcs) return err('NOT_FOUND', 'Not in this check.');
  if (dcs.done) return ok({});
  finalizeSeat(state, dcs); // carries everything forward — NEVER auto-alcohol
  maybeCloseCheck(state, rctx);
  return ok({});
}

/** Host skip: safely finalize every remaining seat. */
export function forceCloseDrinkCheck(state: RoomState, rctx: ReduceCtx): void {
  if (!state.pendingCheck) return;
  for (const dcs of Object.values(state.pendingCheck.seats)) {
    if (!dcs.done) finalizeSeat(state, dcs);
  }
  maybeCloseCheck(state, rctx);
}

function maybeCloseCheck(state: RoomState, rctx: ReduceCtx): void {
  if (!state.pendingCheck) return;
  if (Object.values(state.pendingCheck.seats).every((s) => s.done)) {
    state.pendingCheck = null;
    enterPlaying(state, rctx.now);
    addTicker(state, 'Drink Check done — back to the tables', 'info', rctx.now);
  }
}
