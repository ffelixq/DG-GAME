import { describe, expect, it } from 'vitest';
import { FLOOR_INTRO_MS, POKER_JOIN_WINDOW_MS, BOT_THINK_MS, asDeviceId, type RoomState, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { mint } from './tokens';
import type { PokerData } from './poker';

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

function newRoom() {
  const clock = new FakeClock(1000);
  const manager = new RoomManager({ clock, transport: new NullTransport(), makeIds: () => new SeqIdGen() });
  const host = asDeviceId('h');
  const room = manager.create(host);
  room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's' });
  room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
  return { room, host, clock };
}

describe('bots: lobby', () => {
  it('adds a bot seat', () => {
    const { room, host } = newRoom();
    const r = room.dispatch({ t: 'addBot', deviceId: host });
    expect(r.ok).toBe(true);
    const seat = room.state.seats[seatIdOf(r)]!;
    expect(seat.isBot).toBe(true);
  });

  it('refuses to start with only bots — needs a human', () => {
    const { room, host } = newRoom();
    room.dispatch({ t: 'addBot', deviceId: host });
    room.dispatch({ t: 'addBot', deviceId: host });
    expect(room.dispatch({ t: 'advance', deviceId: host }).ok).toBe(false); // 2 seats, 0 humans
  });

  it('a human + a bot can start', () => {
    const { room, host, clock } = newRoom();
    const pa = asDeviceId('pa');
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sp' });
    room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' });
    room.dispatch({ t: 'addBot', deviceId: host });
    expect(room.dispatch({ t: 'advance', deviceId: host }).ok).toBe(true);
    expect(room.state.phase).toBe('floorIntro');
    void clock;
  });
});

function playingWithBot() {
  const { room, host, clock } = newRoom();
  const pa = asDeviceId('pa');
  room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sp' });
  const a = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }));
  room.dispatch({ t: 'addBot', deviceId: host });
  room.dispatch({ t: 'advance', deviceId: host });
  clock.advance(FLOOR_INTRO_MS + 10);
  room.tick();
  return { room, pa, a, clock };
}

describe('bots: play', () => {
  it('a bot joins the human’s poker table and the betting plays to a result', () => {
    const { room, pa, a, clock } = playingWithBot();
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'poker3', bet: 0 });
    room.tick(); // bot joins during the join window

    const open = Object.values(room.state.sessions).find((sx) => sx.kind === 'poker3')!;
    expect((open.data as PokerData).entries.length).toBe(2); // human + bot

    clock.advance(POKER_JOIN_WINDOW_MS + 10);
    room.tick(); // -> preflop

    // drive the hand: human checks/calls whenever it's their turn, bot auto-acts after its think delay
    for (let i = 0; i < 60 && room.state.seats[a]!.activeSessionId; i++) {
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'check' } });
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'call' } });
      clock.advance(BOT_THINK_MS + 50);
      room.tick();
    }
    expect(room.state.seats[a]!.lastGame).not.toBeNull(); // hand resolved
    expect(room.state.bank.reserved).toBe(0);
  });

  it('bots auto-finish a Drink Check so it can close', () => {
    const { room, clock } = playingWithBot();
    const botSeat = Object.values(room.state.seats).find((sx) => sx.isBot)!;
    mint(room.state, { ownerSeatId: botSeat.seatId, originSeatId: 'system', count: 2, kind: 'alcohol', source: 'event', reason: 't' }, { ids: mintIds, now: 0 });
    clock.advance(61_000);
    room.tick(); // opens the drink check (human has no tokens -> auto-done; bot pending)
    expect(room.state.phase).toBe('drinkCheck');
    room.tick(); // bot finalizes -> all done -> check closes
    expect(room.state.phase).toBe('playing');
    expect(room.state.pendingCheck).toBeNull();
  });
});
