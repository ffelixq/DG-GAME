import { describe, expect, it } from 'vitest';
import { FLOOR_INTRO_MS, GAME_REVEAL_MS, POKER_JOIN_WINDOW_MS, TURN_TIMEOUT_MS, asDeviceId, type Card, type Rank, type SeatId, type Suit } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { bestHand, cmp } from './poker';

class NullTransport implements Transport {
  private e: Emitter = { emit: () => {} };
  room(): Emitter {
    return this.e;
  }
  device(): Emitter {
    return this.e;
  }
}

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });
const seatIdOf = (r: unknown): SeatId => (r as { data: { seatId: SeatId } }).data.seatId;

describe("Hold'em hand evaluation (best 5 of 7)", () => {
  it('ranks the standard categories in order', () => {
    const straightFlush = bestHand([card('9', 'S'), card('10', 'S'), card('J', 'S'), card('Q', 'S'), card('K', 'S'), card('2', 'D'), card('3', 'C')]);
    const quads = bestHand([card('7', 'S'), card('7', 'H'), card('7', 'D'), card('7', 'C'), card('K', 'S'), card('2', 'D'), card('3', 'C')]);
    const fullHouse = bestHand([card('7', 'S'), card('7', 'H'), card('7', 'D'), card('K', 'C'), card('K', 'S'), card('2', 'D'), card('3', 'C')]);
    const flush = bestHand([card('2', 'S'), card('5', 'S'), card('8', 'S'), card('J', 'S'), card('K', 'S'), card('2', 'D'), card('3', 'C')]);
    const straight = bestHand([card('9', 'S'), card('10', 'H'), card('J', 'D'), card('Q', 'C'), card('K', 'S'), card('2', 'D'), card('3', 'C')]);
    const trips = bestHand([card('7', 'S'), card('7', 'H'), card('7', 'D'), card('K', 'C'), card('Q', 'S'), card('2', 'D'), card('3', 'C')]);
    const twoPair = bestHand([card('7', 'S'), card('7', 'H'), card('K', 'D'), card('K', 'C'), card('Q', 'S'), card('2', 'D'), card('3', 'C')]);
    const pair = bestHand([card('7', 'S'), card('7', 'H'), card('K', 'D'), card('J', 'C'), card('Q', 'S'), card('2', 'D'), card('3', 'C')]);
    const high = bestHand([card('7', 'S'), card('9', 'H'), card('K', 'D'), card('J', 'C'), card('Q', 'S'), card('2', 'D'), card('4', 'C')]);

    expect(straightFlush.category).toBe(9);
    expect(quads.category).toBe(8);
    expect(fullHouse.category).toBe(7);
    expect(flush.category).toBe(6);
    expect(straight.category).toBe(5);
    expect(trips.category).toBe(4);
    expect(twoPair.category).toBe(3);
    expect(pair.category).toBe(2);
    expect(high.category).toBe(1);

    const ordered = [high, pair, twoPair, trips, straight, flush, fullHouse, quads, straightFlush];
    for (let i = 1; i < ordered.length; i++) {
      expect(cmp(ordered[i]!.tiebreak, ordered[i - 1]!.tiebreak)).toBeGreaterThan(0);
    }
  });

  it('finds the best hand using community cards (the wheel A-2-3-4-5)', () => {
    const h = bestHand([card('A', 'S'), card('2', 'H'), card('3', 'D'), card('4', 'C'), card('5', 'S'), card('K', 'D'), card('Q', 'C')]);
    expect(h.category).toBe(5); // straight
  });
});

function NullManager() {
  const clock = new FakeClock(1000);
  const manager = new RoomManager({ clock, transport: new NullTransport(), makeIds: () => new SeqIdGen() });
  return { clock, manager };
}

function playingRoom() {
  const { clock, manager } = NullManager();
  const host = asDeviceId('h');
  const pa = asDeviceId('pa');
  const room = manager.create(host);
  room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's' });
  room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
  room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sp' });
  const a = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }));
  const b = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Sam' }));
  room.dispatch({ t: 'advance', deviceId: host });
  clock.advance(FLOOR_INTRO_MS + 10);
  room.tick();
  return { room, pa, a, b, clock };
}

describe('Poker table betting lifecycle', () => {
  it('runs bet/call/check rounds to a showdown; the worst hand drinks the pot of drinks', () => {
    const { room, pa, a, b, clock } = playingRoom();
    expect(room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'poker3', bet: 0 }).ok).toBe(true);
    expect(room.dispatch({ t: 'startGame', deviceId: pa, seatId: b, kind: 'poker3', bet: 0 }).ok).toBe(true);

    // close join window -> preflop betting (a acts first)
    clock.advance(POKER_JOIN_WINDOW_MS + 10);
    room.tick();

    // out-of-turn action is rejected
    expect(room.dispatch({ t: 'gameAction', deviceId: pa, seatId: b, action: { kind: 'check' } }).ok).toBe(false);

    // preflop: a bets (+1 drink), b calls
    expect(room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'bet' } }).ok).toBe(true);
    expect(room.dispatch({ t: 'gameAction', deviceId: pa, seatId: b, action: { kind: 'call' } }).ok).toBe(true);
    // flop, turn, river: both check
    for (let street = 0; street < 3; street++) {
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'check' } });
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: b, action: { kind: 'check' } });
    }

    expect(room.state.bank.reserved).toBe(0); // poker never touches the bank
    const tokens = Object.values(room.state.tokens);
    expect(tokens.length).toBe(2); // ante(1) + one bet = 2 drinks, all on the loser
    expect(tokens.every((t) => t.kind === 'alcohol')).toBe(true);
    const owners = new Set(tokens.map((t) => t.ownerSeatId));
    expect(owners.size).toBe(1);

    clock.advance(GAME_REVEAL_MS + 50);
    room.tick();
    expect(Object.keys(room.state.sessions)).toHaveLength(0);
    expect(room.state.seats[a]!.activeSessionId).toBeNull();
  });

  it('a lone player wins when everyone else folds — nobody drinks', () => {
    const { room, pa, a, b, clock } = playingRoom();
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'poker3', bet: 0 });
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: b, kind: 'poker3', bet: 0 });
    clock.advance(POKER_JOIN_WINDOW_MS + 10);
    room.tick();
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'check' } });
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: b, action: { kind: 'fold' } });
    expect(room.state.seats[a]!.lastGame?.summary.won).toBe(true);
    expect(Object.values(room.state.tokens).length).toBe(0);
    void TURN_TIMEOUT_MS;
  });
});
