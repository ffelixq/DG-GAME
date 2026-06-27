import { ok, err, type DeviceId, type RoomCode, type RoomState, type ServerToClientEvents, type WsServerFrame } from '@lcc/shared';
import { Room } from '../rooms/Room';
import { RealClock } from '../runtime/Clock';
import { NanoIdGen } from '../runtime/IdGen';
import { SeededRng, createServerRng, type RngSnapshot } from '../runtime/ServerRng';
import type { Emitter, Transport } from '../socket/transport';
import { commandForEvent } from './commands';
import type { Env } from './env';

const TICK_MS = 1000; // alarm-driven tick cadence while a round is live (client animates the countdown)

interface Persisted {
  code: RoomCode;
  host: DeviceId;
  state: RoomState;
  rng: RngSnapshot;
}

/** A round only needs the tick loop while time is actually advancing. */
function wantsTick(state: RoomState): boolean {
  if (state.paused) return false;
  return state.phase === 'floorIntro' || state.phase === 'playing' || state.phase === 'drinkCheck' || state.phase === 'event';
}

/**
 * One Durable Object per room. Holds the authoritative RoomState in memory (persisted to DO storage
 * so it survives hibernation), fans out over hibernatable WebSockets, and drives the engine tick
 * with a self-rescheduling alarm.
 */
export class RoomDO {
  private room: Room | null = null;
  private rng: SeededRng | null = null;
  private code: RoomCode | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  // ---- transport: fan out push frames to this room's sockets ----
  private transport(): Transport {
    const ctx = this.ctx;
    const send = (sockets: WebSocket[], ev: keyof ServerToClientEvents, payload: unknown) => {
      const frame: WsServerFrame = { t: 'push', ev, payload };
      const data = JSON.stringify(frame);
      for (const ws of sockets) {
        try {
          ws.send(data);
        } catch {
          /* socket closing */
        }
      }
    };
    const emitterFor = (sockets: () => WebSocket[]): Emitter => ({
      emit: (ev, ...args) => send(sockets(), ev, args[0]),
    });
    return {
      room: () => emitterFor(() => ctx.getWebSockets()),
      device: (deviceId) => emitterFor(() => ctx.getWebSockets(deviceId)),
    };
  }

  private async load(): Promise<Room | null> {
    if (this.room) return this.room;
    const p = await this.ctx.storage.get<Persisted>('room');
    if (!p) return null;
    this.code = p.code;
    this.rng = SeededRng.restore(p.rng);
    this.room = new Room(p.code, {
      clock: new RealClock(),
      rng: this.rng,
      ids: new NanoIdGen(),
      transport: this.transport(),
      hostDeviceId: p.host,
      state: p.state,
    });
    return this.room;
  }

  private async persist(): Promise<void> {
    if (!this.room || !this.rng || !this.code) return;
    const data: Persisted = {
      code: this.code,
      host: this.room.state.hostDeviceId,
      state: this.room.state,
      rng: this.rng.snapshot(),
    };
    await this.ctx.storage.put('room', data);
  }

  private async scheduleTick(): Promise<void> {
    if (!this.room) return;
    const want = wantsTick(this.room.state);
    const current = await this.ctx.storage.getAlarm();
    if (want && current == null) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    else if (!want && current != null) await this.ctx.storage.deleteAlarm();
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // create: initialise this room exactly once
    if (url.pathname === '/init') {
      if (await this.ctx.storage.get('room')) return Response.json({ created: false });
      const host = url.searchParams.get('device') as DeviceId;
      const code = url.searchParams.get('room') as RoomCode;
      this.code = code;
      this.rng = createServerRng();
      this.room = new Room(code, {
        clock: new RealClock(),
        rng: this.rng,
        ids: new NanoIdGen(),
        transport: this.transport(),
        hostDeviceId: host,
      });
      await this.persist();
      return Response.json({ created: true });
    }

    if (url.pathname === '/exists') {
      return Response.json({ exists: (await this.ctx.storage.get('room')) != null });
    }

    if (url.pathname === '/ws') {
      const room = await this.load();
      if (!room) return new Response('room not found', { status: 404 });
      const deviceId = url.searchParams.get('device') as DeviceId;
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server, [deviceId]);
      room.dispatch({ t: 'attachDevice', deviceId, socketId: deviceId });
      room.syncDevice(deviceId);
      await this.persist();
      await this.scheduleTick();
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = await this.load();
    if (!room) return;
    let frame: { t?: string; id?: number; ev?: keyof import('@lcc/shared').ClientToServerEvents; payload?: unknown };
    try {
      frame = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (frame.t !== 'rpc' || typeof frame.id !== 'number' || !frame.ev) return;
    const id = frame.id;
    const deviceId = this.ctx.getTags(ws)[0] as DeviceId | undefined;
    const ack = (result: unknown) => {
      const f: WsServerFrame = { t: 'ack', id, result: result as never };
      try {
        ws.send(JSON.stringify(f));
      } catch {
        /* closing */
      }
    };
    if (!deviceId) return ack(err('NOT_IN_ROOM', 'No device.'));

    if (frame.ev === 'sync:request') {
      room.syncDevice(deviceId);
      return ack(ok({}));
    }
    const cmd = commandForEvent(frame.ev, frame.payload as never, deviceId);
    if (!cmd) return ack(err('BAD_REQUEST', 'Unknown action.'));
    const result = room.dispatch(cmd);
    ack(result);
    await this.persist();
    await this.scheduleTick();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const room = await this.load();
    if (!room) return;
    const deviceId = this.ctx.getTags(ws)[0] as DeviceId | undefined;
    if (deviceId) {
      room.dispatch({ t: 'detachDevice', deviceId });
      await this.persist();
    }
  }

  async alarm(): Promise<void> {
    const room = await this.load();
    if (!room) return;
    room.tick();
    await this.persist();
    await this.scheduleTick();
  }
}
