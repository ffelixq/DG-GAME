import { describe, expect, it } from 'vitest';
import { EVENT_BY_ID, EVENT_IDS, FLOOR_INTRO_MS, LAST_CALL_WINDOW_MS, asDeviceId, type RoomState, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { SeededRng } from '../runtime/ServerRng';
import { RoomManager } from '../rooms/RoomManager';
import type { Emitter, Transport } from '../socket/transport';
import { mint, moveTokens } from './tokens';
import { applyPunishment } from './endings';
import { fireEvent, markLastCallBet, tickLastCall } from './event';
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
  const ids = new SeqIdGen(); // one shared generator so token ids stay unique across calls
  const rng = new SeededRng(3);
  const rctx = (): ReduceCtx => ({ now: clock.now(), rng, ids });
  return { room, host, pa, a, b, clock, rctx };
}

const noAlcohol = (state: RoomState, seat: SeatId) => state.seats[seat]!.tokenIds.every((id) => state.tokens[id]!.kind !== 'alcohol');

describe('SAFETY: an exempt player never holds an alcohol token, from ANY source', () => {
  it('direct mint, transfer, punishment, last-call and events all coerce to non-alcohol', () => {
    const { room, pa, a, b, clock, rctx } = playingRoom();
    room.dispatch({ t: 'setExempt', deviceId: pa, seatId: a, value: true });

    // 1. direct mint (a game loss path)
    mint(room.state, { ownerSeatId: a, originSeatId: 'system', count: 2, kind: 'alcohol', source: 'game', reason: 't' }, rctx());
    expect(noAlcohol(room.state, a)).toBe(true);

    // 2. transfer (Reverse / give-away) from b onto a
    mint(room.state, { ownerSeatId: b, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'game', reason: 't' }, rctx());
    moveTokens(room.state, b, a, 1, 'reverse', rctx());
    expect(noAlcohol(room.state, a)).toBe(true);

    // 3. quota-fail punishment
    applyPunishment(room.state, rctx());
    expect(noAlcohol(room.state, a)).toBe(true);

    // 4. Last Call (a didn't bet)
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.lastCall]!, rctx());
    markLastCallBet(room.state, b);
    clock.advance(LAST_CALL_WINDOW_MS + 50);
    tickLastCall(room.state, rctx());
    expect(noAlcohol(room.state, a)).toBe(true);

    // 5. an event that tokens the player in the red
    room.state.seats[a]!.stats.netBank = -500;
    fireEvent(room.state, EVENT_BY_ID[EVENT_IDS.loanSharkCalls]!, rctx());
    expect(noAlcohol(room.state, a)).toBe(true);
  });

  it('a Drink Check never resolves alcohol for an exempt seat even if the client asks', () => {
    const { room, pa, a, clock, rctx } = playingRoom();
    mint(room.state, { ownerSeatId: a, originSeatId: 'system', count: 1, kind: 'alcohol', source: 'game', reason: 't' }, rctx());
    room.dispatch({ t: 'setExempt', deviceId: pa, seatId: a, value: true });
    clock.advance(61_000);
    room.tick(); // opens a drink check
    const ids = [...room.state.seats[a]!.tokenIds];
    const res = room.dispatch({ t: 'resolveDrinkCheck', deviceId: pa, seatId: a, resolutions: [{ tokenId: ids[0]!, as: 'alcohol' }] });
    expect(res.ok).toBe(false);
  });
});
