import { describe, expect, it } from 'vitest';
import { asDeviceId, type DeviceId, type RoomCode, type SeatId } from '@lcc/shared';
import { RealClock } from './runtime/Clock';
import { NanoIdGen } from './runtime/IdGen';
import { RoomManager } from './rooms/RoomManager';
import { projectPrivateForDevice } from './engine/project';
import type { Emitter, Transport } from './socket/transport';

// The wire transport (socket.io → Cloudflare Durable Object) is exercised by the headless
// browser tests; here we drive the same Room/command path the DO uses, with a capturing transport,
// to assert onboarding, privacy, and authz without a network.
interface Frame {
  ev: string;
  payload: unknown;
}
class Capture implements Transport {
  roomFrames: Frame[] = [];
  deviceFrames = new Map<string, Frame[]>();
  room(): Emitter {
    return { emit: (ev, ...args) => this.roomFrames.push({ ev, payload: args[0] }) };
  }
  device(deviceId: DeviceId): Emitter {
    const arr = this.deviceFrames.get(deviceId) ?? [];
    this.deviceFrames.set(deviceId, arr);
    return { emit: (ev, ...args) => arr.push({ ev, payload: args[0] }) };
  }
  framesFor(deviceId: string): Frame[] {
    return this.deviceFrames.get(deviceId) ?? [];
  }
}

function setup() {
  const transport = new Capture();
  const manager = new RoomManager({ clock: new RealClock(), transport, makeIds: () => new NanoIdGen() });
  return { transport, manager };
}

describe('integration: onboarding + privacy + authz (Room/command path)', () => {
  it('host big screen + two phones (one shared) reach a started round; board never gets private state', () => {
    const { transport, manager } = setup();
    const host = asDeviceId('host');
    const pa = asDeviceId('pa');
    const pb = asDeviceId('pb');

    const room = manager.create(host);
    const code: RoomCode = room.code;
    expect(manager.get(code)).toBe(room);

    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 'h' });
    expect(room.dispatch({ t: 'setBigScreen', deviceId: host, value: true }).ok).toBe(true);

    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'a' });
    expect(room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }).ok).toBe(true);

    room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 'b' });
    expect(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Sam' }).ok).toBe(true);
    expect(room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Jordan' }).ok).toBe(true);

    expect(room.state.seatOrder.length).toBe(3);
    expect(room.state.bigScreenDeviceId).toBe(host);

    expect(room.dispatch({ t: 'advance', deviceId: host }).ok).toBe(true);
    expect(['floorIntro', 'playing']).toContain(room.state.phase);

    // privacy: the big screen device must NEVER receive private state
    expect(transport.framesFor(host).some((f) => f.ev === 'state:private')).toBe(false);
    // controllers get private state scoped to their own seats
    expect(projectPrivateForDevice(room.state, pa, Date.now())?.seats.map((s) => s.name)).toEqual(['Alex']);
    expect(projectPrivateForDevice(room.state, pb, Date.now())?.seats.map((s) => s.name).sort()).toEqual(['Jordan', 'Sam']);
  });

  it('rejects an intent for a seat the device does not own (authz)', () => {
    const { manager } = setup();
    const host = asDeviceId('h2');
    const pa = asDeviceId('pa2');
    const pb = asDeviceId('pb2');
    const room = manager.create(host);

    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 'h' });
    room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'a' });
    const seat = room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }) as { ok: true; data: { seatId: SeatId } };
    room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 'b' });

    const bad = room.dispatch({ t: 'setExempt', deviceId: pb, seatId: seat.data.seatId, value: true });
    expect(bad.ok).toBe(false);
    expect((bad as { code: string }).code).toBe('NOT_SEAT_OWNER');
  });

  it('the host can kick any seat (player or bot); a non-host cannot', () => {
    const { manager } = setup();
    const host = asDeviceId('h3');
    const pa = asDeviceId('pa3');
    const pb = asDeviceId('pb3');
    const room = manager.create(host);
    room.dispatch({ t: 'attachDevice', deviceId: host, socketId: 'h' });
    room.dispatch({ t: 'setBigScreen', deviceId: host, value: true });
    room.dispatch({ t: 'attachDevice', deviceId: pa, socketId: 'a' });
    const alex = room.dispatch({ t: 'addSeat', deviceId: pa, name: 'Alex' }) as { ok: true; data: { seatId: SeatId } };
    room.dispatch({ t: 'attachDevice', deviceId: pb, socketId: 'b' });
    room.dispatch({ t: 'addSeat', deviceId: pb, name: 'Sam' });
    room.dispatch({ t: 'addBot', deviceId: host });
    expect(room.state.seatOrder.length).toBe(3);

    // a non-host can't kick someone else's seat
    expect(room.dispatch({ t: 'removeSeat', deviceId: pb, seatId: alex.data.seatId }).ok).toBe(false);

    // the host can kick a player and a bot
    expect(room.dispatch({ t: 'removeSeat', deviceId: host, seatId: alex.data.seatId }).ok).toBe(true);
    const botSeat = room.state.seatOrder.find((id) => room.state.seats[id]!.isBot)!;
    expect(room.dispatch({ t: 'removeSeat', deviceId: host, seatId: botSeat }).ok).toBe(true);

    expect(room.state.seatOrder.length).toBe(1); // only Sam remains
    expect(room.state.devices[pa]!.ownedSeatIds).toHaveLength(0); // Alex's owner no longer references it
  });
});
