import { describe, expect, it } from 'vitest';
import { FLOOR_INTRO_MS, asDeviceId, type RoomState, type SeatId, type TokenId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { mint } from './tokens';

class NullTransport implements Transport {
  private e: Emitter = { emit: () => {} };
  room(): Emitter {
    return this.e;
  }
  device(): Emitter {
    return this.e;
  }
}

const seatIdOf = (r: unknown): SeatId => (r as { data: { seatId: SeatId } }).data.seatId;
const mintIds = new SeqIdGen();

function giveAlcohol(state: RoomState, seatId: SeatId, n: number, now: number) {
  mint(state, { ownerSeatId: seatId, originSeatId: 'system', count: n, kind: 'alcohol', source: 'event', reason: 'test' }, { ids: mintIds, now });
}

function playingRoom() {
  const clock = new FakeClock(1000);
  const manager = new RoomManager({ clock, transport: new NullTransport(), makeIds: () => new SeqIdGen() });
  const host = asDeviceId('h');
  const pa = asDeviceId('pa');
  const room = manager.create(host);
  room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's' });
  room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
  room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sp' });
  const a = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }));
  const b = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Sam' }));
  room.dispatch({ t: 'advance', deviceId: host });
  room.dispatch({ t: 'ackHouseRules', deviceId: pa });
  clock.advance(FLOOR_INTRO_MS + 10);
  room.tick();
  return { room, pa, a, b, clock };
}

function openCheck(room: ReturnType<typeof playingRoom>['room'], clock: FakeClock) {
  clock.advance(61_000); // floor 1 interval is 60s of game time
  room.tick();
}

describe('Drink Check resolver', () => {
  it('fires on cadence and snapshots pending tokens', () => {
    const { room, a, clock } = playingRoom();
    giveAlcohol(room.state, a, 2, clock.now());
    openCheck(room, clock);
    expect(room.state.phase).toBe('drinkCheck');
    expect(room.state.pendingCheck?.seats[a]?.pendingTokenIds).toHaveLength(2);
  });

  it('enforces the 2-alcohol hard cap (3 alcohol -> CAP_EXCEEDED, state unchanged)', () => {
    const { room, pa, a, clock } = playingRoom();
    giveAlcohol(room.state, a, 3, clock.now());
    openCheck(room, clock);
    const ids = [...room.state.seats[a]!.tokenIds] as TokenId[];
    const res = room.dispatch({
      t: 'resolveDrinkCheck',
      deviceId: pa,
      seatId: a,
      resolutions: ids.map((tokenId) => ({ tokenId, as: 'alcohol' as const })),
    });
    expect(res.ok).toBe(false);
    expect((res as { code: string }).code).toBe('CAP_EXCEEDED');
    expect(room.state.seats[a]!.tokenIds).toHaveLength(3); // untouched
  });

  it('allows 2 alcohol + the rest water', () => {
    const { room, pa, a, clock } = playingRoom();
    giveAlcohol(room.state, a, 3, clock.now());
    openCheck(room, clock);
    const ids = [...room.state.seats[a]!.tokenIds] as TokenId[];
    const res = room.dispatch({
      t: 'resolveDrinkCheck',
      deviceId: pa,
      seatId: a,
      resolutions: [
        { tokenId: ids[0]!, as: 'alcohol' },
        { tokenId: ids[1]!, as: 'alcohol' },
        { tokenId: ids[2]!, as: 'water' },
      ],
    });
    expect(res.ok).toBe(true);
    expect(room.state.seats[a]!.tokenIds).toHaveLength(0); // all resolved & cleared
  });

  it('exempt seats can never resolve alcohol', () => {
    const { room, pa, a, clock } = playingRoom();
    giveAlcohol(room.state, a, 1, clock.now());
    room.dispatch({ t: 'setExempt', deviceId: pa, seatId: a, value: true });
    openCheck(room, clock);
    const ids = [...room.state.seats[a]!.tokenIds] as TokenId[];
    const res = room.dispatch({ t: 'resolveDrinkCheck', deviceId: pa, seatId: a, resolutions: [{ tokenId: ids[0]!, as: 'alcohol' }] });
    expect(res.ok).toBe(false);
    expect((res as { code: string }).code).toBe('CAP_EXCEEDED');
  });

  it('skip carries tokens forward, never auto-alcohol', () => {
    const { room, pa, a, clock } = playingRoom();
    giveAlcohol(room.state, a, 2, clock.now());
    openCheck(room, clock);
    const res = room.dispatch({ t: 'skipDrinkCheck', deviceId: pa, seatId: a });
    expect(res.ok).toBe(true);
    const toks = room.state.seats[a]!.tokenIds.map((id) => room.state.tokens[id]!);
    expect(toks).toHaveLength(2);
    expect(toks.every((t) => t.carries === 1)).toBe(true);
    // closing the check returns to play
    expect(room.state.phase).toBe('playing');
  });

  it('resuming from pause does not burn game time', () => {
    const { room, pa, clock } = playingRoom();
    const before = room.state.floor.elapsedGameMs;
    room.dispatch({ t: 'pause', deviceId: pa, value: true });
    clock.advance(120_000);
    room.tick(); // paused -> no accrual
    room.dispatch({ t: 'pause', deviceId: pa, value: false });
    room.tick();
    expect(room.state.floor.elapsedGameMs - before).toBeLessThan(1000);
  });
});
