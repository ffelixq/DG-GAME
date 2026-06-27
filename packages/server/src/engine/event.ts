import {
  EVENT_BY_ID,
  EVENT_DISPLAY_MS,
  FLOOR_BY_INDEX,
  LAST_CALL_WINDOW_MS,
  type RandomEvent,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { resolveEffect } from './effects-runtime';
import { addTicker, enterPlaying } from './state';
import { placeToken } from './tokens';

/** Roll a weighted event from the floor pool (skips if an event/choice is already in flight). */
export function maybeRollEvent(state: RoomState, rctx: ReduceCtx): boolean {
  const floor = FLOOR_BY_INDEX[state.currentFloor];
  state.floor.nextEventRollAtGameMs += state.floor.eventFrequencyMs > 0 ? state.floor.eventFrequencyMs : 30_000;
  if (state.pendingEvent || state.pendingChoices.length > 0) return false;
  const pool = floor.eventPool.map((id) => EVENT_BY_ID[id]).filter((e): e is RandomEvent => Boolean(e));
  if (pool.length === 0) return false;
  const ev = rctx.rng.weighted(pool.map((e) => ({ value: e, weight: e.weight })));
  fireEvent(state, ev, rctx);
  return true;
}

export function fireEvent(state: RoomState, ev: RandomEvent, rctx: ReduceCtx): void {
  if (ev.kind === 'lastCall') {
    state.pendingEvent = {
      eventId: ev.id,
      name: ev.name,
      description: ev.description,
      startedAt: rctx.now,
      kind: 'lastCall',
      deadlineAt: rctx.now + LAST_CALL_WINDOW_MS,
      satisfiedSeatIds: [],
    };
    addTicker(state, `⏰ ${ev.name} — place a bet!`, 'event', rctx.now);
    return;
  }
  resolveEffect(state, ev.effect, null, null, ev.id, rctx);
  state.pendingEvent = {
    eventId: ev.id,
    name: ev.name,
    description: ev.description,
    startedAt: rctx.now,
    kind: 'instant',
    deadlineAt: rctx.now + EVENT_DISPLAY_MS,
  };
  state.phase = 'event';
  addTicker(state, `🎲 ${ev.name}`, 'event', rctx.now);
}

/** Mark a seat as having placed a bet during a Last Call window. */
export function markLastCallBet(state: RoomState, seatId: SeatId): void {
  const pe = state.pendingEvent;
  if (pe?.kind === 'lastCall') {
    pe.satisfiedSeatIds = pe.satisfiedSeatIds ?? [];
    if (!pe.satisfiedSeatIds.includes(seatId)) pe.satisfiedSeatIds.push(seatId);
  }
}

/** During play: close a Last Call window at its deadline, token-ing anyone who didn't bet. */
export function tickLastCall(state: RoomState, rctx: ReduceCtx): boolean {
  const pe = state.pendingEvent;
  if (pe?.kind !== 'lastCall' || pe.deadlineAt === undefined || rctx.now < pe.deadlineAt) return false;
  const satisfied = new Set(pe.satisfiedSeatIds ?? []);
  for (const sid of state.seatOrder) {
    if (!satisfied.has(sid)) {
      placeToken(state, { ownerSeatId: sid, originSeatId: 'system', kind: 'alcohol', source: 'event', reason: 'event.lastCall' }, { ids: rctx.ids, now: rctx.now });
    }
  }
  addTicker(state, 'Last Call closed!', 'event', rctx.now);
  state.pendingEvent = null;
  return true;
}

/** During the 'event' phase: hold while a choice is pending, then resume play. */
export function tickEventPhase(state: RoomState, rctx: ReduceCtx): boolean {
  const pe = state.pendingEvent;
  if (!pe) {
    enterPlaying(state, rctx.now);
    return true;
  }
  if (state.pendingChoices.length > 0) return false; // waiting on the chooser
  if (pe.deadlineAt !== undefined && rctx.now < pe.deadlineAt) return false;
  state.pendingEvent = null;
  enterPlaying(state, rctx.now);
  return true;
}

/** Host skip: clear any in-flight event + its choices and resume play. */
export function forceCloseEvent(state: RoomState, rctx: ReduceCtx): void {
  state.pendingEvent = null;
  state.pendingChoices = [];
  enterPlaying(state, rctx.now);
}
