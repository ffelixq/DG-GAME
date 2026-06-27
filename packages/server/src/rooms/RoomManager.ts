import { DEVICE_TTL_MS, ROOM_TTL_MS, type DeviceId, type RoomCode } from '@lcc/shared';
import type { Clock } from '../runtime/Clock';
import type { IdGen } from '../runtime/IdGen';
import { createServerRng, type SeededRng } from '../runtime/ServerRng';
import type { Transport } from '../socket/transport';
import { generateRoomCode } from './codes';
import { Room } from './Room';

export interface RoomManagerDeps {
  clock: Clock;
  transport: Transport;
  makeIds: () => IdGen;
  makeRng?: () => SeededRng; // seedable for tests; defaults to a crypto-seeded RNG
}

export class RoomManager {
  private readonly rooms = new Map<RoomCode, Room>();

  constructor(private readonly deps: RoomManagerDeps) {}

  create(hostDeviceId: DeviceId): Room {
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room = new Room(code, {
      clock: this.deps.clock,
      rng: (this.deps.makeRng ?? createServerRng)(),
      ids: this.deps.makeIds(),
      transport: this.deps.transport,
      hostDeviceId,
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: RoomCode): Room | undefined {
    return this.rooms.get(code);
  }

  findByDevice(deviceId: DeviceId): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.state.devices[deviceId]) return room;
    }
    return undefined;
  }

  remove(code: RoomCode): void {
    this.rooms.delete(code);
  }

  count(): number {
    return this.rooms.size;
  }

  tickAll(): void {
    for (const room of this.rooms.values()) room.tick();
  }

  gcSweep(now: number): void {
    for (const [code, room] of this.rooms) {
      const s = room.state;
      const idle = now - s.lastActivityAt;
      const anyConnected = Object.values(s.devices).some((d) => d.connected);
      if (idle > ROOM_TTL_MS || (!anyConnected && idle > DEVICE_TTL_MS)) {
        this.rooms.delete(code);
      }
    }
  }
}
