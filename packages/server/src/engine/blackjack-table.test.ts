import { describe, expect, it } from 'vitest';
import { FLOOR_INTRO_MS, evalBlackjackHand, asDeviceId, type PrivateGameView, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { SeededRng } from '../runtime/ServerRng';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { projectPrivateForDevice } from './project';

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

function playingRoom(seed = 1) {
  const clock = new FakeClock(1000);
  const manager = new RoomManager({ clock, transport: new NullTransport(), makeIds: () => new SeqIdGen(), makeRng: () => new SeededRng(seed) });
  const host = asDeviceId('h');
  const pa = asDeviceId('pa');
  const pb = asDeviceId('pb');
  const room = manager.create(host);
  room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's' });
  room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
  room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'sa' });
  room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 'sb' });
  const a = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }));
  const b = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Sam' }));
  room.dispatch({ t: 'advance', deviceId: host });
  clock.advance(FLOOR_INTRO_MS + 10);
  room.tick();
  return { room, pa, pb, a, b, clock };
}

describe('multiplayer blackjack table', () => {
  it('two players join one table and both settle against the same dealer', () => {
    const { room, pa, pb, a, b } = playingRoom(5);
    expect(room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 }).ok).toBe(true);
    // Sam joins the SAME open table
    expect(room.dispatch({ t: 'startGame', deviceId: pb, seatId: b, kind: 'blackjack', bet: 100 }).ok).toBe(true);
    expect(Object.keys(room.state.sessions)).toHaveLength(1); // one shared table

    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'deal' } }); // deal now
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'stand' } });
    room.dispatch({ t: 'gameAction', deviceId: pb, seatId: b, action: { kind: 'stand' } });

    expect(room.state.seats[a]!.lastGame).not.toBeNull();
    expect(room.state.seats[b]!.lastGame).not.toBeNull();
    expect(room.state.bank.reserved).toBe(0);
  });

  it('"Deal now" starts the hand without waiting out the join window', () => {
    const { room, pa, a } = playingRoom(7);
    room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
    const session = () => Object.values(room.state.sessions)[0];
    expect((session()!.data as { phase: string }).phase).toBe('joining');
    room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'deal' } });
    expect((session()?.data as { phase: string } | undefined)?.phase ?? 'done').not.toBe('joining');
  });

  it('outcome sign + loss-token rule are consistent with the final hands (120 seeds)', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { room, pa, a } = playingRoom(seed);
      room.dispatch({ t: 'startGame', deviceId: pa, seatId: a, kind: 'blackjack', bet: 100 });
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'deal' } });
      room.dispatch({ t: 'gameAction', deviceId: pa, seatId: a, action: { kind: 'stand' } });

      const view = projectPrivateForDevice(room.state, pa, 0)!.seats.find((s) => s.seatId === a)!.activeGame as Extract<
        PrivateGameView,
        { kind: 'blackjack' }
      >;
      const pv = evalBlackjackHand(view.hole);
      const dv = evalBlackjackHand(view.dealer);
      const natural = view.hole.length === 2 && pv.total === 21;
      const dealerNat = view.dealer.length === 2 && dv.total === 21;
      let expected: 'win' | 'lose' | 'push';
      if (pv.bust) expected = 'lose';
      else if (natural && !dealerNat) expected = 'win';
      else if (dealerNat && !natural) expected = 'lose';
      else if (dv.bust || pv.total > dv.total) expected = 'win';
      else if (pv.total < dv.total) expected = 'lose';
      else expected = 'push';

      const delta = room.state.seats[a]!.lastGame!.summary.bankDelta;
      const tokens = room.state.seats[a]!.tokenIds.map((id) => room.state.tokens[id]!);
      if (expected === 'win') expect(delta, `seed ${seed}`).toBeGreaterThan(0);
      else if (expected === 'lose') {
        expect(delta, `seed ${seed}`).toBeLessThan(0);
        expect(tokens.some((t) => t.kind === 'alcohol'), `seed ${seed} should mint a token`).toBe(true);
      } else expect(delta, `seed ${seed}`).toBe(0);
    }
  });
});
