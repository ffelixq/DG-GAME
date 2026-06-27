import type { DeviceId, RoomCode, ServerToClientEvents } from '@lcc/shared';

export interface Emitter {
  emit<Ev extends keyof ServerToClientEvents>(ev: Ev, ...args: Parameters<ServerToClientEvents[Ev]>): void;
}

// Decouples the engine/Room from the wire transport so tests can capture outbound traffic and the
// Cloudflare Durable Object can fan out over raw WebSockets (see edge/RoomDO.ts).
export interface Transport {
  room(code: RoomCode): Emitter;
  device(deviceId: DeviceId): Emitter;
}
