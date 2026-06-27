import { type DeviceId, type Result, type RoomCode, type SeatId } from '@lcc/shared';
import type { Clock } from '../runtime/Clock';
import type { IdGen } from '../runtime/IdGen';
import type { SeededRng } from '../runtime/ServerRng';
import type { Transport } from '../socket/transport';
import type { Command } from '../engine/commands';
import type { SideEffect } from '../engine/side-effects';
import { createInitialRoom } from '../engine/state';
import { projectPrivateForDevice, projectPublic } from '../engine/project';
import { reduce } from '../engine/reducer';
import type { RoomState } from '@lcc/shared';

export interface RoomDeps {
  clock: Clock;
  rng: SeededRng;
  ids: IdGen;
  transport: Transport;
  hostDeviceId: DeviceId;
  /** When provided (Durable Object rehydration), resume this state instead of starting fresh. */
  state?: RoomState;
}

export class Room {
  state: RoomState;

  constructor(
    public readonly code: RoomCode,
    private readonly deps: RoomDeps,
  ) {
    this.state = deps.state ?? createInitialRoom(code, deps.hostDeviceId, deps.clock.now(), deps.rng.seed);
  }

  dispatch(cmd: Command): Result<unknown> {
    const before = this.state.version;
    const { effects, ack } = reduce(this.state, cmd, {
      now: this.deps.clock.now(),
      rng: this.deps.rng,
      ids: this.deps.ids,
    });
    if (this.state.version !== before) this.broadcast();
    this.flush(effects);
    return ack;
  }

  tick(): void {
    this.dispatch({ t: 'tick', now: this.deps.clock.now() });
  }

  /** Push the public snapshot to the room and a private snapshot to each seat-owning device. */
  broadcast(): void {
    const now = this.deps.clock.now();
    this.deps.transport.room(this.code).emit('state:public', projectPublic(this.state, now));
    for (const dev of Object.values(this.state.devices)) {
      if (dev.ownedSeatIds.length === 0) continue; // big screen / spectator never gets private data
      const view = projectPrivateForDevice(this.state, dev.deviceId, now);
      if (view) this.deps.transport.device(dev.deviceId).emit('state:private', view);
    }
  }

  /** Re-send snapshots to a single device (used after attach/reconnect). */
  syncDevice(deviceId: DeviceId): void {
    const now = this.deps.clock.now();
    this.deps.transport.device(deviceId).emit('state:public', projectPublic(this.state, now));
    const priv = projectPrivateForDevice(this.state, deviceId, now);
    if (priv) this.deps.transport.device(deviceId).emit('state:private', priv);
  }

  private seatDevice(seatId: SeatId): DeviceId | null {
    return this.state.seats[seatId]?.deviceId ?? null;
  }

  private flush(effects: SideEffect[]): void {
    const t = this.deps.transport;
    for (const e of effects) {
      switch (e.t) {
        case 'toast':
          if (e.deviceId) t.device(e.deviceId).emit('toast', { tone: e.tone, text: e.text });
          else t.room(this.code).emit('toast', { tone: e.tone, text: e.text });
          break;
        case 'drinkCheckOpen':
          t.room(this.code).emit('drinkCheck:open', { index: e.index });
          break;
        case 'drinkCheckClose':
          t.room(this.code).emit('drinkCheck:close', { index: e.index });
          break;
        case 'eventFired':
          t.room(this.code).emit('event:fired', { eventId: e.eventId, name: e.name, description: e.description });
          break;
        case 'choicePrompt': {
          const dev = this.seatDevice(e.seatId);
          if (dev) t.device(dev).emit('choice:prompt', { choiceId: e.choiceId, seatId: e.seatId, prompt: e.prompt });
          break;
        }
        case 'roundResult':
          t.room(this.code).emit('round:result', e.result);
          break;
        case 'ending':
          t.room(this.code).emit('game:ending', e.ending);
          break;
      }
    }
  }
}
