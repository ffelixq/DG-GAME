import { describe, expect, it } from 'vitest';
import { FLOOR_INTRO_MS, asDeviceId, type SeatId } from '@lcc/shared';
import { FakeClock } from '../runtime/Clock';
import { SeqIdGen } from '../runtime/IdGen';
import { RoomManager } from './RoomManager';
import type { Transport, Emitter } from '../socket/transport';
import { projectPrivateForDevice } from '../engine/project';

class FakeTransport implements Transport {
  msgs: { channel: string; ev: string }[] = [];
  private make(channel: string): Emitter {
    return {
      emit: (ev, ..._args) => {
        this.msgs.push({ channel, ev: ev as string });
      },
    };
  }
  room(code: string): Emitter {
    return this.make(`room:${code}`);
  }
  device(id: string): Emitter {
    return this.make(`dev:${id}`);
  }
  captured(channel: string): { channel: string; ev: string }[] {
    return this.msgs.filter((m) => m.channel === channel);
  }
}

function setup() {
  const clock = new FakeClock(1000);
  const transport = new FakeTransport();
  const manager = new RoomManager({ clock, transport, makeIds: () => new SeqIdGen() });
  return { clock, transport, manager };
}

const seatIdOf = (r: unknown): SeatId => (r as { data: { seatId: SeatId } }).data.seatId;

describe('Room: topology, privacy, reconnection', () => {
  it('builds a hybrid topology (big screen + two phones, one shared)', () => {
    const { manager } = setup();
    const host = asDeviceId('host');
    const pa = asDeviceId('pa');
    const pb = asDeviceId('pb');

    const room = manager.create(host);
    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's-host' });
    expect(room.dispatch({ t: 'setBigScreen', deviceId: host, value: true }).ok).toBe(true);

    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 's-pa' });
    const alex = room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' });
    expect(alex.ok).toBe(true);

    room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 's-pb' });
    expect(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Sam' }).ok).toBe(true);
    expect(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Jordan' }).ok).toBe(true);

    expect(room.state.seatOrder).toHaveLength(3);
    expect(room.state.bigScreenDeviceId).toBe(host);
    const accents = Object.values(room.state.seats).map((s) => s.accentIndex);
    expect(new Set(accents).size).toBe(3);

    // the big screen can't hold a seat
    expect(room.dispatch({ t: 'addSeat', deviceId: host, name: 'Nope' }).ok).toBe(false);
    // duplicate names rejected
    expect(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'alex' }).ok).toBe(false);
  });

  it('never sends private state to a zero-seat big-screen device', () => {
    const { clock, transport, manager } = setup();
    const host = asDeviceId('host');
    const pa = asDeviceId('pa');

    const room = manager.create(host);
    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's-host' });
    room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 's-pa' });
    room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' });

    // structural guarantee
    expect(projectPrivateForDevice(room.state, host, clock.now())).toBeNull();
    const paView = projectPrivateForDevice(room.state, pa, clock.now());
    expect(paView?.seats.map((s) => s.name)).toEqual(['Alex']);

    // simulate the handler-side per-device sync that runs on (re)connect
    room.syncDevice(host);
    room.syncDevice(pa);

    // over the wire: the host channel saw public snapshots but NEVER private state
    const hostMsgs = transport.captured('dev:host');
    expect(hostMsgs.some((m) => m.ev === 'state:public')).toBe(true);
    expect(hostMsgs.some((m) => m.ev === 'state:private')).toBe(false);
    // the phone DID get private state
    expect(transport.captured('dev:pa').some((m) => m.ev === 'state:private')).toBe(true);
  });

  it('reattaches seats to the same device on reconnect', () => {
    const { manager } = setup();
    const host = asDeviceId('host');
    const pa = asDeviceId('pa');

    const room = manager.create(host);
    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's-host' });
    room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 's-pa' });
    const alex = seatIdOf(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }) as never);

    room.dispatch({ t: 'detachDevice', deviceId: pa });
    expect(room.state.seats[alex]!.connected).toBe(false);
    expect(room.state.devices[pa]!.connected).toBe(false);

    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 's-pa-2' });
    expect(room.state.seats[alex]!.connected).toBe(true);
    expect(room.state.devices[pa]!.ownedSeatIds).toContain(alex);
    expect(room.state.devices[pa]!.socketId).toBe('s-pa-2');
  });

  it('gates the start on min seats, then goes straight into the floor (no house-rules page)', () => {
    const { clock, manager } = setup();
    const host = asDeviceId('host');
    const pa = asDeviceId('pa');
    const pb = asDeviceId('pb');

    const room = manager.create(host);
    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 's-host' });
    room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 's-pa' });

    // only one seat so far -> host can't advance
    room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' });
    expect(room.dispatch({ t: 'advance', deviceId: host }).ok).toBe(false);

    room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 's-pb' });
    room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Sam' });

    // non-host can't advance
    expect(room.dispatch({ t: 'advance', deviceId: pa }).ok).toBe(false);
    expect(room.dispatch({ t: 'advance', deviceId: host }).ok).toBe(true);
    expect(room.state.phase).toBe('floorIntro'); // straight to the floor

    clock.advance(FLOOR_INTRO_MS + 10);
    room.tick();
    expect(room.state.phase).toBe('playing');
    expect(room.state.floor.endsAt).toBeGreaterThan(clock.now());
  });
});
