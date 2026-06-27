import { describe, expect, it } from 'vitest';
import {
  FLOOR_BY_INDEX,
  FLOOR_INTRO_MS,
  GOOD_ENDING_MIN_BANK,
  asDeviceId,
  asModifierId,
  type RoomState,
  type SeatId,
} from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { SeededRng } from '../runtime/ServerRng';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { endRound } from './floors';
import { computeAwards } from './endings';
import type { ReduceCtx } from './reducer';

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
  const rctx = (): ReduceCtx => ({ now: clock.now(), rng: new SeededRng(7), ids: new SeqIdGen() });
  return { room, host, pa, a, b, rctx };
}

const tokenCount = (state: RoomState, seat: SeatId) => state.seats[seat]!.tokenIds.length;

describe('floor progression', () => {
  it('advances to the next floor on a pass', () => {
    const { room, host, rctx } = playingRoom();
    room.state.bank.balance = 5000;
    endRound(room.state, rctx());
    expect(room.state.phase).toBe('roundResults');
    room.dispatch({ t: 'advance', deviceId: host });
    expect(room.state.currentFloor).toBe(2);
    expect(room.state.phase).toBe('floorIntro');
    expect(room.state.bank.quota).toBe(FLOOR_BY_INDEX[2].quota);
  });

  it('punishes the table and carries the deficit on a fail', () => {
    const { room, host, a, b, rctx } = playingRoom();
    room.state.bank.balance = 100; // quota 1500
    endRound(room.state, rctx());
    room.dispatch({ t: 'advance', deviceId: host });
    expect(room.state.currentFloor).toBe(2);
    expect(room.state.bank.deficitCarry).toBe(1400);
    expect(room.state.bank.quota).toBe(FLOOR_BY_INDEX[2].quota + 1400);
    expect(tokenCount(room.state, a)).toBe(1);
    expect(tokenCount(room.state, b)).toBe(1);
  });

  it('Scapegoat dodges the group punishment', () => {
    const { room, host, a, b, rctx } = playingRoom();
    room.state.seats[a]!.modifiers.push({ id: asModifierId('m1'), source: 'test', kind: 'immune-punishment', trigger: 'next-punishment', uses: 1 });
    room.state.bank.balance = 0;
    endRound(room.state, rctx());
    room.dispatch({ t: 'advance', deviceId: host });
    expect(tokenCount(room.state, a)).toBe(0);
    expect(tokenCount(room.state, b)).toBe(1);
  });
});

describe('endings', () => {
  function atFinalFloor(balance: number, passedQuota = 10000) {
    const ctx = playingRoom();
    ctx.room.state.currentFloor = 4;
    ctx.room.state.bank.quota = passedQuota;
    ctx.room.state.bank.balance = balance;
    endRound(ctx.room.state, ctx.rctx());
    ctx.room.dispatch({ t: 'advance', deviceId: ctx.host });
    return ctx.room.state.ending!;
  }

  it('good ending when final bank clears the profit bar', () => {
    expect(atFinalFloor(GOOD_ENDING_MIN_BANK + 500).endingId).toBe('good');
  });
  it('normal ending when quota met but below the profit bar', () => {
    expect(atFinalFloor(11000).endingId).toBe('normal');
  });
  it('bad ending when the final quota is missed', () => {
    const e = atFinalFloor(5000);
    expect(e.endingId).toBe('bad');
    expect(e.finalForfeitText).toBeTruthy();
  });
});

describe('awards', () => {
  it('picks winners by metric and awards no one for zero-count categories', () => {
    const { room, a, b } = playingRoom();
    room.state.seats[a]!.stats.netBank = 500;
    room.state.seats[b]!.stats.netBank = -200;
    room.state.seats[a]!.stats.tokensReceived = 3;
    room.state.seats[b]!.stats.tokensReceived = 1;
    const awards = computeAwards(room.state);
    const by = (id: string) => awards.find((x) => x.awardId === id)!;
    expect(by('biggest-winner').seatId).toBe(a);
    expect(by('biggest-loser').seatId).toBe(b);
    expect(by('most-drink-tokens').seatId).toBe(a);
    expect(by('most-all-ins').seatId).toBeNull(); // nobody went all-in
    expect(by('most-betrayals').seatId).toBeNull();
  });
});

describe('play again', () => {
  it('resets the run but keeps the seats', () => {
    const { room, host, a, rctx } = playingRoom();
    room.state.currentFloor = 4;
    room.state.bank.balance = 99999;
    room.state.seats[a]!.stats.netBank = 500;
    endRound(room.state, rctx());
    room.dispatch({ t: 'advance', deviceId: host }); // -> ending
    expect(room.state.phase).toBe('ending');
    room.dispatch({ t: 'playAgain', deviceId: host });
    expect(room.state.phase).toBe('lobby');
    expect(room.state.currentFloor).toBe(1);
    expect(room.state.seatOrder).toHaveLength(2);
    expect(room.state.seats[a]!.stats.netBank).toBe(0);
  });
});
