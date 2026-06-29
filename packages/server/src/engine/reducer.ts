import {
  BANK_TOPUP_AMOUNT,
  FINAL_FLOOR,
  FLOOR_BY_INDEX,
  FLOOR_INTRO_MS,
  MAX_SEATS,
  err,
  ok,
  type DeviceId,
  type FloorId,
  type Result,
  type Rng,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import type { Command } from './commands';
import type { SideEffect } from './side-effects';
import type { IdGen } from '../runtime/IdGen';
import { adjust, available } from './bank';
import { mint } from './tokens';
import { addTicker, enterPlaying, ensureDevice, makeFloorRuntime, makeSeat, nameTaken, nextAccentIndex, resetForReplay } from './state';
import { allSeatDevicesAcked, hasHuman, hasMinSeats, shiftDeadlines } from './machine';
import { addBot, botTick } from './bots';
import { applyGameAction, dismissReveal, startGame, tickGames } from './play';
import { forceCloseDrinkCheck, openDrinkCheck, resolveDrinkCheck, skipDrinkCheck } from './drink';
import { endRound } from './floors';
import { forceCloseEvent, maybeRollEvent, tickEventPhase, tickLastCall } from './event';
import { resolveChoice } from './effects-runtime';
import { grantFloorItems, useItem } from './items';
import { applyPunishment, reachEnding } from './endings';

export interface ReduceCtx {
  now: number;
  rng: Rng;
  ids: IdGen;
}

export interface ReduceResult {
  effects: SideEffect[];
  ack: Result<unknown>;
}

interface Out {
  changed: boolean;
}

export function reduce(state: RoomState, cmd: Command, ctx: ReduceCtx): ReduceResult {
  const effects: SideEffect[] = [];
  const out: Out = { changed: false };
  const ack = apply(state, cmd, ctx, effects, out);
  if (ack.ok && out.changed) {
    state.version += 1;
    state.lastActivityAt = ctx.now;
    state.rngCursor = (ctx.rng as { cursor?: number }).cursor ?? state.rngCursor;
  }
  return { effects, ack };
}

function requireHost(state: RoomState, deviceId: DeviceId): Result<unknown> | null {
  if (state.hostDeviceId !== deviceId) return err('NOT_HOST', 'Only the host can do that.');
  return null;
}

function ownsSeat(state: RoomState, deviceId: DeviceId, seatId: SeatId): boolean {
  return state.devices[deviceId]?.ownedSeatIds.includes(seatId) ?? false;
}

function apply(state: RoomState, cmd: Command, ctx: ReduceCtx, effects: SideEffect[], out: Out): Result<unknown> {
  switch (cmd.t) {
    case 'attachDevice': {
      const dev = ensureDevice(state, cmd.deviceId, cmd.socketId, ctx.now);
      for (const sid of dev.ownedSeatIds) {
        const seat = state.seats[sid];
        if (seat) seat.connected = true;
      }
      out.changed = true;
      return ok({ reattachedSeats: dev.ownedSeatIds.length });
    }

    case 'detachDevice': {
      const dev = state.devices[cmd.deviceId];
      if (!dev) return ok({});
      dev.connected = false;
      dev.socketId = null;
      dev.lastSeenAt = ctx.now;
      for (const sid of dev.ownedSeatIds) {
        const seat = state.seats[sid];
        if (seat) seat.connected = false;
      }
      out.changed = true;
      return ok({});
    }

    case 'setBigScreen': {
      const dev = state.devices[cmd.deviceId];
      if (!dev) return err('NOT_IN_ROOM', 'Unknown device.');
      if (cmd.value) {
        if (dev.ownedSeatIds.length > 0) return err('BAD_REQUEST', 'A big screen can’t also hold players.');
        state.bigScreenDeviceId = cmd.deviceId;
        dev.role = 'bigScreen';
      } else if (state.bigScreenDeviceId === cmd.deviceId) {
        state.bigScreenDeviceId = null;
        dev.role = 'controller';
      }
      out.changed = true;
      return ok({});
    }

    case 'addSeat': {
      const dev = state.devices[cmd.deviceId];
      if (!dev) return err('NOT_IN_ROOM', 'Unknown device.');
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Players can only join in the lobby.');
      if (state.bigScreenDeviceId === cmd.deviceId) return err('BAD_REQUEST', 'This device is the big screen.');
      const name = cmd.name.trim();
      if (!name) return err('BAD_REQUEST', 'Enter a name.');
      if (name.length > 16) return err('BAD_REQUEST', 'Name too long.');
      if (state.seatOrder.length >= MAX_SEATS) return err('ROOM_FULL', 'The table is full.');
      if (nameTaken(state, name)) return err('NAME_TAKEN', 'That name is taken.');

      const seatId = ctx.ids.seat();
      const isHost = state.seatOrder.length === 0 && state.bigScreenDeviceId !== cmd.deviceId;
      const seat = makeSeat(seatId, cmd.deviceId, name, isHost, nextAccentIndex(state));
      state.seats[seatId] = seat;
      state.seatOrder.push(seatId);
      dev.ownedSeatIds.push(seatId);
      out.changed = true;
      return ok({ seatId });
    }

    case 'addBot': {
      const r = addBot(state, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'removeSeat': {
      // owner can remove their own seat; the host can kick anyone (players or bots)
      const isHost = state.hostDeviceId === cmd.deviceId;
      if (!ownsSeat(state, cmd.deviceId, cmd.seatId) && !isHost) return err('NOT_SEAT_OWNER', 'Only the host can remove other players.');
      if (state.phase !== 'lobby') return err('WRONG_PHASE', 'Players can only be removed in the lobby.');
      const seat = state.seats[cmd.seatId];
      if (!seat) return err('NOT_FOUND', 'No such seat.');
      const ownerDev = state.devices[seat.deviceId];
      if (ownerDev) ownerDev.ownedSeatIds = ownerDev.ownedSeatIds.filter((s) => s !== cmd.seatId);
      state.seatOrder = state.seatOrder.filter((s) => s !== cmd.seatId);
      delete state.seats[cmd.seatId];
      out.changed = true;
      return ok({});
    }

    case 'setExempt': {
      if (!ownsSeat(state, cmd.deviceId, cmd.seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
      const seat = state.seats[cmd.seatId];
      if (!seat) return err('NOT_FOUND', 'No such seat.');
      seat.exempt = cmd.value;
      if (cmd.value) {
        // Coerce any pending alcohol tokens to water immediately.
        for (const tid of seat.tokenIds) {
          const tok = state.tokens[tid];
          if (tok && tok.kind === 'alcohol' && tok.status === 'pending') tok.kind = 'water';
        }
        addTicker(state, `${seat.name} is sitting out the drinks 💧`, 'info', ctx.now);
      }
      out.changed = true;
      return ok({});
    }

    case 'ackHouseRules': {
      const dev = state.devices[cmd.deviceId];
      if (!dev) return err('NOT_IN_ROOM', 'Unknown device.');
      if (!state.houseRulesAckedDeviceIds.includes(cmd.deviceId)) {
        state.houseRulesAckedDeviceIds.push(cmd.deviceId);
      }
      // Auto-advance to the floor intro once every seat-owning device has acked.
      if (state.phase === 'houseRules' && allSeatDevicesAcked(state) && hasMinSeats(state)) {
        enterFloorIntro(state, ctx);
      }
      out.changed = true;
      return ok({});
    }

    case 'advance': {
      const hostErr = requireHost(state, cmd.deviceId);
      if (hostErr) return hostErr;
      if (state.phase === 'lobby') {
        if (!hasMinSeats(state)) return err('MIN_SEATS', `Need at least 2 players.`);
        if (!hasHuman(state)) return err('MIN_SEATS', 'Need at least one human player.');
        enterFloorIntro(state, ctx); // house-rules screen removed — straight into the night
        out.changed = true;
        return ok({});
      }
      if (state.phase === 'floorIntro') {
        beginPlaying(state, ctx.now);
        out.changed = true;
        return ok({});
      }
      if (state.phase === 'roundResults') {
        const passed = state.lastResult?.passed ?? state.bank.balance >= state.bank.quota;
        if (state.currentFloor === FINAL_FLOOR) {
          reachEnding(state, passed, ctx);
        } else if (passed) {
          state.currentFloor = (state.currentFloor + 1) as FloorId;
          enterFloorIntro(state, ctx);
        } else {
          state.bank.deficitCarry += Math.max(0, state.bank.quota - state.bank.balance);
          applyPunishment(state, ctx);
          state.currentFloor = (state.currentFloor + 1) as FloorId;
          enterFloorIntro(state, ctx);
        }
        out.changed = true;
        return ok({});
      }
      return err('WRONG_PHASE', 'Nothing to advance.');
    }

    case 'pause': {
      if (state.paused === cmd.value) return ok({});
      state.paused = cmd.value;
      if (cmd.value) {
        state.pausedAt = ctx.now;
        addTicker(state, 'Game paused', 'info', ctx.now);
      } else if (state.pausedAt !== null) {
        const delta = ctx.now - state.pausedAt;
        state.pauseAccumMs += delta;
        shiftDeadlines(state, delta);
        state.floor.lastTickAt = ctx.now; // don't count paused time as game time
        state.pausedAt = null;
        addTicker(state, 'Game resumed', 'info', ctx.now);
      }
      out.changed = true;
      return ok({});
    }

    case 'skip': {
      const hostErr = requireHost(state, cmd.deviceId);
      if (hostErr) return hostErr;
      if (state.pendingCheck) {
        forceCloseDrinkCheck(state, ctx); // finalizes safely — never auto-alcohol
        out.changed = true;
      } else if (state.pendingEvent || state.phase === 'event') {
        forceCloseEvent(state, ctx);
        out.changed = true;
      }
      return ok({});
    }

    case 'endRoundNow': {
      const hostErr = requireHost(state, cmd.deviceId);
      if (hostErr) return hostErr;
      if (state.phase !== 'playing') return err('WRONG_PHASE', 'No round in progress.');
      endRound(state, ctx);
      out.changed = true;
      return ok({});
    }

    case 'playAgain': {
      const hostErr = requireHost(state, cmd.deviceId);
      if (hostErr) return hostErr;
      resetForReplay(state, ctx.now);
      out.changed = true;
      return ok({});
    }

    case 'startGame': {
      const r = startGame(state, cmd.deviceId, cmd.seatId, cmd.kind, cmd.bet, cmd.selection, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'gameAction': {
      const r = applyGameAction(state, cmd.deviceId, cmd.seatId, cmd.action, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'topUpBank': {
      if (!ownsSeat(state, cmd.deviceId, cmd.seatId)) return err('NOT_SEAT_OWNER', 'Not your seat.');
      if (state.phase !== 'playing') return err('WRONG_PHASE', 'You can only top up during a round.');
      if (state.paused) return err('PAUSED', 'The game is paused.');
      const seat = state.seats[cmd.seatId];
      if (!seat) return err('NOT_FOUND', 'No such seat.');
      const minBet = FLOOR_BY_INDEX[state.currentFloor].minBet;
      if (available(state.bank) >= minBet) return err('BAD_REQUEST', 'The bank still has money to bet.');
      // Drink to top up: one alcohol token (coerced to water for exempt seats by the chokepoint),
      // and a cash injection into the shared bank so the night can continue.
      mint(state, { ownerSeatId: cmd.seatId, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'punishment', reason: 'bank.topup' }, ctx);
      adjust(state.bank, BANK_TOPUP_AMOUNT, 'TOPUP', cmd.seatId, ctx.now);
      addTicker(state, `${seat.name} drank to top up the bank (+$${BANK_TOPUP_AMOUNT.toLocaleString()}) 🍺💰`, 'event', ctx.now);
      out.changed = true;
      return ok({});
    }

    case 'dismissReveal': {
      const r = dismissReveal(state, cmd.deviceId, cmd.seatId);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'useItem': {
      const r = useItem(state, cmd.deviceId, cmd.seatId, cmd.instanceId, cmd.targetSeatId, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'resolveDrinkCheck': {
      const r = resolveDrinkCheck(state, cmd.deviceId, cmd.seatId, cmd.resolutions, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'skipDrinkCheck': {
      const r = skipDrinkCheck(state, cmd.deviceId, cmd.seatId, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'resolveChoice': {
      const r = resolveChoice(state, cmd.deviceId, cmd.seatId, cmd.choiceId, cmd.optionId, cmd.targetSeatId, ctx);
      if (r.ok) out.changed = true;
      return r;
    }

    case 'tick': {
      out.changed = tick(state, ctx);
      return ok({ changed: out.changed });
    }

    default: {
      const _exhaustive: never = cmd;
      return err('BAD_REQUEST', `Unknown command ${(_exhaustive as { t: string }).t}`);
    }
  }
}

function enterFloorIntro(state: RoomState, ctx: ReduceCtx): void {
  state.floor = makeFloorRuntime(state.currentFloor, ctx.now);
  state.bank.floorStartBalance = state.bank.balance;
  state.bank.quota = state.floor.quota + state.bank.deficitCarry;
  state.phase = 'floorIntro';
  // startedAt doubles as the intro timestamp until play begins.
  state.floor.startedAt = ctx.now;
  grantFloorItems(state, ctx);
}

function beginPlaying(state: RoomState, now: number): void {
  state.floor.startedAt = now;
  enterPlaying(state, now);
}

/** Returns true if the tick mutated state (so the room knows whether to re-broadcast). */
function tick(state: RoomState, ctx: ReduceCtx): boolean {
  if (state.paused) return false;

  // bots act in any phase (resolve their drink checks/choices, join & play poker)
  let botChanged = botTick(state, ctx);

  if (state.phase === 'floorIntro') {
    if (ctx.now - state.floor.startedAt >= FLOOR_INTRO_MS) {
      beginPlaying(state, ctx.now);
      return true;
    }
    return botChanged;
  }

  if (state.phase === 'event') return tickEventPhase(state, ctx) || botChanged;

  if (state.phase !== 'playing') return botChanged;

  // accrue active-play time (silent — clients count down locally from endsAt)
  const dt = Math.max(0, ctx.now - state.floor.lastTickAt);
  state.floor.lastTickAt = ctx.now;
  state.floor.elapsedGameMs += dt;

  let changed = botChanged || tickLastCall(state, ctx);

  if (state.floor.elapsedGameMs >= state.floor.roundMs) {
    endRound(state, ctx);
    return true;
  }
  if (state.floor.eventsEnabled && state.floor.elapsedGameMs >= state.floor.nextEventRollAtGameMs) {
    if (maybeRollEvent(state, ctx)) return true;
  }
  if (state.floor.elapsedGameMs >= state.floor.nextDrinkCheckAtGameMs) {
    openDrinkCheck(state, ctx);
    return true;
  }
  if (tickGames(state, ctx)) changed = true;
  return changed;
}
