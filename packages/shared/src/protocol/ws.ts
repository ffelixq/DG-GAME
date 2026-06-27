import type { Result } from './envelopes';
import type { ClientToServerEvents } from './client-events';
import type { ServerToClientEvents } from './server-events';

// Raw-WebSocket wire protocol (replaces socket.io). Every client request carries a numeric id;
// the server answers with a matching `ack`. Server state is delivered via `push` frames.

/** Client → server: an RPC call expecting an ack. */
export interface WsRpcFrame {
  t: 'rpc';
  id: number;
  ev: keyof ClientToServerEvents;
  payload: unknown;
}

/** Server → client: the ack for a prior rpc id. */
export interface WsAckFrame {
  t: 'ack';
  id: number;
  result: Result<unknown>;
}

/** Server → client: a pushed event (state snapshots, toasts, prompts, …). */
export interface WsPushFrame {
  t: 'push';
  ev: keyof ServerToClientEvents;
  payload: unknown;
}

export type WsClientFrame = WsRpcFrame;
export type WsServerFrame = WsAckFrame | WsPushFrame;
