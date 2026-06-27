import {
  ITEM_BY_ID,
  MAX_ALCOHOL_PER_CHECK,
  type DeviceId,
  type DrinkCheckResolveState,
  type GameKind,
  type ItemView,
  type PendingChoicePublic,
  type PrivateDeviceView,
  type PrivateSeatView,
  type PublicRoomView,
  type PublicSeatView,
  type RoomState,
  type SeatState,
  type TokenView,
  FLOOR_BY_INDEX,
} from '@lcc/shared';
import { privateActiveGame, publicActiveGames } from './play';
import { gameAvailable } from './games/registry';

function tokenCounts(state: RoomState, seat: SeatState): { alcohol: number; water: number; dare: number } {
  const counts = { alcohol: 0, water: 0, dare: 0 };
  for (const id of seat.tokenIds) {
    const tok = state.tokens[id];
    if (tok) counts[tok.kind] += 1;
  }
  return counts;
}

function seatActiveGameKind(state: RoomState, seat: SeatState): GameKind | null {
  if (!seat.activeSessionId) return null;
  return state.sessions[seat.activeSessionId]?.kind ?? null;
}

function publicSeat(state: RoomState, seat: SeatState): PublicSeatView {
  return {
    seatId: seat.seatId,
    name: seat.name,
    accentIndex: seat.accentIndex,
    isHost: seat.isHost,
    isBot: seat.isBot,
    connected: seat.connected,
    exempt: seat.exempt,
    tokenCounts: tokenCounts(state, seat),
    bankDelta: seat.stats.netBank,
    activeGame: seatActiveGameKind(state, seat),
    itemCount: seat.items.length,
  };
}

function itemUsableNow(state: RoomState, usableWhen: string): boolean {
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

function privateSeat(state: RoomState, seat: SeatState, now: number): PrivateSeatView {
  const tokens: TokenView[] = seat.tokenIds
    .map((id) => state.tokens[id])
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({ id: t.id, kind: t.kind, source: t.source, reason: t.reason, carries: t.carries }));

  const items: ItemView[] = seat.items.map((h) => {
    const card = ITEM_BY_ID[h.itemId];
    return {
      instanceId: h.instanceId,
      itemId: h.itemId,
      name: card?.name ?? h.itemId,
      description: card?.description ?? '',
      usableNow: card ? itemUsableNow(state, card.usableWhen) : false,
      needsTarget: card?.needsTarget ?? false,
    };
  });

  let drinkCheck: DrinkCheckResolveState | null = null;
  const pc = state.pendingCheck;
  if (pc) {
    const dcs = pc.seats[seat.seatId];
    if (dcs) {
      drinkCheck = {
        index: pc.index,
        budgetAlcohol: seat.exempt ? 0 : Math.max(0, MAX_ALCOHOL_PER_CHECK - dcs.alcoholResolved),
        waterOnly: pc.waterOnly,
        exempt: seat.exempt,
        tokens: dcs.pendingTokenIds
          .map((id) => state.tokens[id])
          .filter((t): t is NonNullable<typeof t> => Boolean(t))
          .map((t) => ({ id: t.id, kind: t.kind, reason: t.reason })),
        done: dcs.done,
      };
    }
  }

  const choice = state.pendingChoices.find((c) => c.seatId === seat.seatId) ?? null;

  return {
    seatId: seat.seatId,
    name: seat.name,
    exempt: seat.exempt,
    tokens,
    tokenCounts: tokenCounts(state, seat),
    items,
    modifierLabels: seat.modifiers.map((m) => m.kind),
    activeGame: privateActiveGame(state, seat),
    lastResult: seat.lastGame?.summary ?? null,
    drinkCheck,
    pendingChoice: choice
      ? { id: choice.id, prompt: choice.prompt, options: choice.options.map((o) => ({ id: o.id, label: o.label })) }
      : null,
    // note: void `now` to keep signature stable for future time-based gating
  };
}

export function projectPublic(state: RoomState, now: number): PublicRoomView {
  const cfg = FLOOR_BY_INDEX[state.currentFloor];
  const seatDevices = Object.values(state.devices).filter((d) => d.ownedSeatIds.length > 0);
  const ackedCount = seatDevices.filter((d) => state.houseRulesAckedDeviceIds.includes(d.deviceId)).length;

  const pendingChoices: PendingChoicePublic[] = state.pendingChoices.map((c) => ({
    id: c.id,
    seatId: c.seatId,
    prompt: c.prompt,
  }));

  return {
    version: state.version,
    code: state.code,
    phase: state.phase,
    paused: state.paused,
    floor: state.currentFloor,
    floorName: cfg.name,
    bank: state.bank.balance,
    reserved: state.bank.reserved,
    quota: state.bank.quota,
    deficitCarry: state.bank.deficitCarry,
    bets: { min: cfg.minBet, max: cfg.maxBet, pokerAnte: cfg.pokerAnte, allowAllIn: cfg.allowAllIn },
    games: cfg.gamePool.filter(gameAvailable),
    timer: {
      endsAt: state.floor.endsAt,
      durationMs: state.floor.roundMs,
      remainingMs: Math.max(0, state.floor.roundMs - state.floor.elapsedGameMs),
      serverNow: now,
      running: state.phase === 'playing' && !state.paused,
    },
    hostDeviceId: state.hostDeviceId,
    bigScreenDeviceId: state.bigScreenDeviceId,
    seats: state.seatOrder.map((id) => state.seats[id]).filter((s): s is SeatState => Boolean(s)).map((s) => publicSeat(state, s)),
    seatOrder: state.seatOrder,
    activeGames: publicActiveGames(state),
    ticker: state.ticker,
    drinkCheck: state.pendingCheck
      ? {
          index: state.pendingCheck.index,
          waterOnly: state.pendingCheck.waterOnly,
          seats: Object.values(state.pendingCheck.seats).map((s) => ({
            seatId: s.seatId,
            pending: s.pendingTokenIds.length,
            alcoholResolved: s.alcoholResolved,
            done: s.done,
          })),
        }
      : null,
    activeEvent: state.pendingEvent
      ? {
          eventId: state.pendingEvent.eventId,
          name: state.pendingEvent.name,
          description: state.pendingEvent.description,
          kind: state.pendingEvent.kind,
          deadlineAt: state.pendingEvent.deadlineAt,
        }
      : null,
    pendingChoices,
    lastResult: state.lastResult,
    ending: state.ending,
    houseRules: { ackedCount, total: seatDevices.length },
  };
}

export function projectPrivateForDevice(state: RoomState, deviceId: DeviceId, now: number): PrivateDeviceView | null {
  const dev = state.devices[deviceId];
  if (!dev || dev.ownedSeatIds.length === 0) return null; // big screen / spectator: NO private data
  const seats = dev.ownedSeatIds
    .map((id) => state.seats[id])
    .filter((s): s is SeatState => Boolean(s))
    .map((s) => privateSeat(state, s, now));
  return { version: state.version, deviceId, ownedSeatIds: [...dev.ownedSeatIds], seats };
}
