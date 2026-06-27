import {
  BOT_NAMES,
  BOT_THINK_MS,
  FLOOR_BY_INDEX,
  MAX_SEATS,
  TURN_TIMEOUT_MS,
  asDeviceId,
  err,
  ok,
  type DeviceId,
  type DeviceState,
  type Result,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import type { ReduceCtx } from './reducer';
import { addTicker, makeSeat, nextAccentIndex } from './state';
import { removeTokens } from './tokens';
import { skipDrinkCheck } from './drink';
import { resolveChoice } from './effects-runtime';
import { findOpenPoker, pokerAct, pokerBotAction, startOrJoinPoker, type PokerData } from './poker';
import {
  blackjackAct,
  blackjackBotAction,
  findOpenBlackjack,
  startOrJoinBlackjack,
  type BlackjackTableData,
} from './blackjack-table';

export const BOT_DEVICE_ID = asDeviceId('__bot__');

function ensureBotDevice(state: RoomState): DeviceState {
  let dev = state.devices[BOT_DEVICE_ID];
  if (!dev) {
    dev = { deviceId: BOT_DEVICE_ID, socketId: null, role: 'controller', connected: true, lastSeenAt: 0, ownedSeatIds: [] };
    state.devices[BOT_DEVICE_ID] = dev;
  }
  return dev;
}

export function botCount(state: RoomState): number {
  return state.seatOrder.filter((id) => state.seats[id]?.isBot).length;
}

export function addBot(state: RoomState, rctx: ReduceCtx): Result<{ seatId: SeatId }> {
  if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Add bots in the lobby.');
  if (state.seatOrder.length >= MAX_SEATS) return err('ROOM_FULL', 'The table is full.');
  const dev = ensureBotDevice(state);
  const taken = new Set(state.seatOrder.map((id) => state.seats[id]?.name));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${botCount(state) + 1}`;
  const seatId = rctx.ids.seat();
  const seat = makeSeat(seatId, BOT_DEVICE_ID, name, false, nextAccentIndex(state), true);
  state.seats[seatId] = seat;
  state.seatOrder.push(seatId);
  dev.ownedSeatIds.push(seatId);
  addTicker(state, `🤖 ${name} joined`, 'info', rctx.now);
  return ok({ seatId });
}

/** Bots act: resolve choices/drink-checks aimed at them, join open Hold'em tables and decide. */
export function botTick(state: RoomState, rctx: ReduceCtx): boolean {
  const dev = state.devices[BOT_DEVICE_ID];
  if (!dev || dev.ownedSeatIds.length === 0) return false;
  let changed = false;
  const botSeatIds = [...dev.ownedSeatIds];
  const isBotSeat = (id: SeatId) => botSeatIds.includes(id);

  // resolve any interactive choice pointed at a bot (pick the first, safe option)
  for (const choice of [...state.pendingChoices]) {
    if (isBotSeat(choice.seatId) && choice.options[0]) {
      resolveChoice(state, BOT_DEVICE_ID, choice.seatId, choice.id, choice.options[0].id, undefined, rctx);
      changed = true;
    }
  }

  // bots never drink — clear their tokens and finish their Drink Check so it can close
  if (state.pendingCheck) {
    for (const sid of botSeatIds) {
      const dcs = state.pendingCheck.seats[sid];
      if (dcs && !dcs.done) {
        removeTokens(state, sid, 99);
        skipDrinkCheck(state, BOT_DEVICE_ID, sid, rctx);
        changed = true;
      }
    }
  }

  // join an open table (poker or blackjack), then play it
  if (state.phase === 'playing' && !state.paused) {
    const openPoker = findOpenPoker(state);
    const openBj = findOpenBlackjack(state);
    for (const sid of botSeatIds) {
      const seat = state.seats[sid];
      if (!seat) continue;
      if (!seat.activeSessionId) {
        if (openPoker) {
          startOrJoinPoker(state, BOT_DEVICE_ID, sid, rctx);
          changed = true;
        } else if (openBj) {
          startOrJoinBlackjack(state, BOT_DEVICE_ID, sid, FLOOR_BY_INDEX[state.currentFloor].minBet, rctx);
          changed = true;
        }
        continue;
      }
      const session = state.sessions[seat.activeSessionId];
      if (session?.kind === 'poker3') {
        const data = session.data as PokerData;
        const turnStart = data.turnDeadline - TURN_TIMEOUT_MS;
        if (data.phase === 'betting' && data.entries[data.turnIndex]?.seatId === sid && rctx.now - turnStart >= BOT_THINK_MS) {
          pokerAct(state, BOT_DEVICE_ID, sid, pokerBotAction(data, sid, rctx.rng), rctx);
          changed = true;
        }
      } else if (session?.kind === 'blackjack') {
        const data = session.data as BlackjackTableData;
        const entry = data.entries.find((e) => e.seatId === sid);
        if (data.phase === 'playing' && entry && !entry.done) {
          blackjackAct(state, BOT_DEVICE_ID, sid, blackjackBotAction(data, sid), rctx);
          changed = true;
        }
      }
    }
  }
  return changed;
}
