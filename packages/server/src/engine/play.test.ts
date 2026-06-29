import { describe, expect, it } from 'vitest';
import { BANK_TOPUP_AMOUNT, FLOOR_INTRO_MS, GAME_REVEAL_MS, STARTING_BANK, asDeviceId, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';

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
  return { room, host, pa, a, b, clock };
}

describe('play: blackjack through the reducer', () => {
  it('reaches the playing phase with a fresh bank', () => {
    const { room } = playingRoom();
    expect(room.state.phase).toBe('playing');
    expect(room.state.bank.balance).toBe(STARTING_BANK);
  });

  it('runs a full hand: stake reserved then settled, result recorded, tokens consistent', () => {
    const { room, pa, a, clock } = playingRoom();
    const start = room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
    expect(start.ok).toBe(true);

    const seat = () => room.state.seats[a]!;
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'deal' } }); // skip the join window
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'stand' } }); // (no-op if natural)

    // settled: stake released, result recorded, bank moved by exactly the recorded delta.
    // (default money mode: a loss costs cash but never mints a drink token.)
    expect(room.state.bank.reserved).toBe(0);
    const last = seat().lastGame;
    expect(last).not.toBeNull();
    expect(room.state.bank.balance).toBe(STARTING_BANK + last!.summary.bankDelta);
    const myTokens = seat().tokenIds.map((id) => room.state.tokens[id]!);
    expect(myTokens.some((t) => t.kind === 'alcohol')).toBe(false);

    // the result is held on the reveal screen, then cleared back to the menu
    expect(seat().activeSessionId).not.toBeNull();
    clock.advance(GAME_REVEAL_MS + 50);
    room.tick();
    expect(seat().activeSessionId).toBeNull();
  });

  it('rejects a second concurrent game and rejects bets the bank cannot cover', () => {
    const { room, pa, a } = playingRoom();
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
    if (room.state.seats[a]!.activeSessionId) {
      const second = room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
      expect(second.ok).toBe(false);
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'stand' } });
    }
    const tooBig = room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 999999 });
    expect(tooBig.ok).toBe(false);
  });

  it('rejects starting a game for a seat owned by another device', () => {
    const { room, host, a } = playingRoom();
    const bad = room.dispatch({ t: 'startGame', deviceId: host, seatId: a, kind: 'blackjack', bet: 100 });
    expect(bad.ok).toBe(false);
  });

  it('solo games are continuous: result stays (no auto-clear) and "Play again" starts a fresh round', () => {
    const { room, pa, a, clock } = playingRoom();
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'slots', bet: 50 });
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'spin' } });
    const first = room.state.seats[a]!.activeSessionId;
    expect(first).not.toBeNull();
    expect(room.state.sessions[first!]!.settled).toBe(true);

    // it must NOT auto-clear on a tick (continuous play)
    clock.advance(GAME_REVEAL_MS + 500);
    room.tick();
    expect(room.state.seats[a]!.activeSessionId).toBe(first);

    // "Play again" -> fresh round, same bet, ready to spin again
    const r = room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'replay' } });
    expect(r.ok).toBe(true);
    const second = room.state.seats[a]!.activeSessionId;
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(room.state.sessions[second!]!.settled).toBe(false);
  });

  it('drink-to-top-up: when the bank is dry a seat drinks to refill it, then it is blocked once solvent', () => {
    const { room, pa, a } = playingRoom();
    room.state.bank.balance = 10; // dry (below floor-1 min bet of $50)
    const before = room.state.seats[a]!.tokenIds.length;
    const r = room.dispatch({ t: 'topUpBank', deviceId: pa, seatId: a });
    expect(r.ok).toBe(true);
    expect(room.state.bank.balance).toBe(10 + BANK_TOPUP_AMOUNT);
    expect(room.state.seats[a]!.tokenIds.length).toBe(before + 1); // picked up a drink token
    // now solvent -> further top-ups are rejected
    expect(room.dispatch({ t: 'topUpBank', deviceId: pa, seatId: a }).ok).toBe(false);
  });

  it('drink-to-top-up still refills the bank for an exempt seat but mints water, not alcohol (safety)', () => {
    const { room, pa, a } = playingRoom();
    room.state.bank.balance = 0;
    room.state.seats[a]!.exempt = true;
    expect(room.dispatch({ t: 'topUpBank', deviceId: pa, seatId: a }).ok).toBe(true);
    expect(room.state.bank.balance).toBe(BANK_TOPUP_AMOUNT);
    const tokens = room.state.seats[a]!.tokenIds.map((id) => room.state.tokens[id]!);
    expect(tokens.some((t) => t.kind === 'alcohol')).toBe(false);
  });

  it('"Go back" dismisses the result reveal immediately (no waiting for the timer)', () => {
    const { room, pa, a } = playingRoom();
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'deal' } });
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'stand' } });
    expect(room.state.seats[a]!.activeSessionId).not.toBeNull(); // held on reveal
    const r = room.dispatch({ t: 'dismissReveal', deviceId: pa, seatId: a });
    expect(r.ok).toBe(true);
    expect(room.state.seats[a]!.activeSessionId).toBeNull();
    expect(Object.keys(room.state.sessions)).toHaveLength(0);
  });
});
