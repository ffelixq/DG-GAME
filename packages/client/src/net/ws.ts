import {
  asDeviceId,
  asRoomCode,
  err,
  type DeviceId,
  type Result,
  type RoomCode,
  type ServerToClientEvents,
  type WsServerFrame,
} from '@lcc/shared';

const DEVICE_KEY = 'lcc.deviceId';
const ROOM_KEY = 'lcc.roomCode';

function randomId(): string {
  // crypto.randomUUID only exists in secure contexts (https / localhost); phones on a plain-http
  // LAN address fall back to this.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function getDeviceId(): DeviceId {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return asDeviceId(id);
}

export function getStoredRoomCode(): RoomCode | null {
  const c = localStorage.getItem(ROOM_KEY);
  return c ? asRoomCode(c) : null;
}

export function setStoredRoomCode(code: RoomCode | null): void {
  if (code) localStorage.setItem(ROOM_KEY, code);
  else localStorage.removeItem(ROOM_KEY);
}

type PushHandler = (payload: unknown) => void;

/**
 * One live WebSocket to a room's Durable Object. Provides socket.io-style request/ack semantics
 * over raw frames, push-event subscriptions, and transparent reconnect with backoff.
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private seq = 0;
  private readonly pending = new Map<number, (r: Result<unknown>) => void>();
  private readonly handlers = new Map<string, PushHandler>();
  private code: string | null = null;
  private closedByUs = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private static readonly MAX_ATTEMPTS = 6; // ~1s,2s,4s,8s,16s,30s then give up (avoid hammering the server)

  onStatus: ((connected: boolean) => void) | null = null;

  constructor(private readonly deviceId: DeviceId) {}

  on<Ev extends keyof ServerToClientEvents>(ev: Ev, handler: (p: Parameters<ServerToClientEvents[Ev]>[0]) => void): void {
    this.handlers.set(ev, handler as PushHandler);
  }

  open(code: string): void {
    this.code = code;
    this.closedByUs = false;
    this.attempts = 0;
    this.connect();
  }

  /** Manual reconnect (e.g. after the auto-retries gave up). */
  retry(): void {
    if (!this.code) return;
    this.closedByUs = false;
    this.attempts = 0;
    this.connect();
  }

  private connect(): void {
    if (!this.code) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?room=${this.code}&device=${encodeURIComponent(this.deviceId)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.onStatus?.(true);
    };
    ws.onclose = () => {
      this.onStatus?.(false);
      if (this.closedByUs || this.attempts >= RoomConnection.MAX_ATTEMPTS) return;
      const delay = Math.min(30000, 1000 * 2 ** this.attempts);
      this.attempts += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onmessage = (e) => {
      let frame: WsServerFrame;
      try {
        frame = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (frame.t === 'ack') {
        const resolve = this.pending.get(frame.id);
        if (resolve) {
          this.pending.delete(frame.id);
          resolve(frame.result);
        }
      } else if (frame.t === 'push') {
        this.handlers.get(frame.ev)?.(frame.payload);
      }
    };
  }

  call<R>(ev: string, payload: unknown): Promise<Result<R>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(err('NOT_IN_ROOM', 'Not connected to a room.'));
    const id = ++this.seq;
    return new Promise<Result<R>>((resolve) => {
      this.pending.set(id, resolve as (r: Result<unknown>) => void);
      ws.send(JSON.stringify({ t: 'rpc', id, ev, payload }));
      setTimeout(() => {
        if (this.pending.delete(id)) resolve(err('BAD_REQUEST', 'The server took too long to respond.'));
      }, 8000);
    });
  }

  close(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

/** Ask the server whether a room exists (clean join error without opening a socket). */
export async function roomExists(code: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/join?room=${encodeURIComponent(code)}`);
    const { exists } = (await r.json()) as { exists: boolean };
    return exists;
  } catch {
    return false;
  }
}

/** Create a room; returns its code. */
export async function createRoom(deviceId: DeviceId): Promise<Result<{ code: RoomCode }>> {
  try {
    const r = await fetch('/api/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!r.ok) return err('BAD_REQUEST', 'Could not create a room. Try again.');
    const { code } = (await r.json()) as { code: RoomCode };
    return { ok: true, data: { code: asRoomCode(code) } };
  } catch {
    return err('BAD_REQUEST', 'Could not reach the server.');
  }
}
