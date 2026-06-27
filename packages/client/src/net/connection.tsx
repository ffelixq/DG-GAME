import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  CreateRoomResult,
  DeviceId,
  JoinRoomResult,
  PrivateDeviceView,
  PublicRoomView,
  Result,
  TickerTone,
} from '@lcc/shared';
import { err } from '@lcc/shared';
import {
  RoomConnection,
  createRoom,
  getDeviceId,
  getStoredRoomCode,
  roomExists,
  setStoredRoomCode,
} from './ws';

export interface ToastItem {
  id: number;
  tone: TickerTone;
  text: string;
}

export interface Conn {
  deviceId: DeviceId;
  connected: boolean;
  pub: PublicRoomView | null;
  priv: PrivateDeviceView | null;
  joined: boolean;
  lastAction: 'create' | 'join' | null;
  toasts: ToastItem[];
  serverOffset: number;
  create: () => Promise<Result<CreateRoomResult>>;
  join: (code: string) => Promise<Result<JoinRoomResult>>;
  call: <R = Record<string, never>>(ev: string, payload: unknown) => Promise<Result<R>>;
  /** Fire-and-forget action that automatically surfaces any error as a toast. */
  act: (ev: string, payload: unknown) => void;
  pushToast: (tone: TickerTone, text: string) => void;
  dismissToast: (id: number) => void;
  reset: () => void;
}

const ConnContext = createContext<Conn | null>(null);

export function useConn(): Conn {
  const v = useContext(ConnContext);
  if (!v) throw new Error('useConn outside provider');
  return v;
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const deviceId = useMemo(() => getDeviceId(), []);
  const connRef = useRef<RoomConnection | null>(null);
  if (!connRef.current) connRef.current = new RoomConnection(deviceId);
  const conn = connRef.current;

  const [connected, setConnected] = useState(true);
  const [pub, setPub] = useState<PublicRoomView | null>(null);
  const [priv, setPriv] = useState<PrivateDeviceView | null>(null);
  const [joined, setJoined] = useState(false);
  const [lastAction, setLastAction] = useState<'create' | 'join' | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [serverOffset, setServerOffset] = useState(0);
  const toastSeq = useRef(0);

  const pushToast = useCallback((tone: TickerTone, text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    conn.onStatus = (c) => setConnected(c);
    conn.on('state:public', (view) => {
      setPub(view);
      setServerOffset(view.timer.serverNow - Date.now());
    });
    conn.on('state:private', (view) => setPriv(view));
    conn.on('toast', (p) => pushToast(p.tone, p.text));

    // reconnect on load if we were in a room (and it still exists)
    const stored = getStoredRoomCode();
    if (stored) {
      void roomExists(stored).then((exists) => {
        if (exists) {
          conn.open(stored);
          setJoined(true);
        } else {
          setStoredRoomCode(null);
        }
      });
    }
    return () => conn.close();
  }, [conn, pushToast]);

  const value: Conn = useMemo(
    () => ({
      deviceId,
      connected,
      pub,
      priv,
      joined,
      lastAction,
      toasts,
      serverOffset,
      async create() {
        const r = await createRoom(deviceId);
        if (r.ok) {
          setStoredRoomCode(r.data.code);
          conn.open(r.data.code);
          setLastAction('create');
          setJoined(true);
        }
        return r;
      },
      async join(code: string) {
        const upper = code.toUpperCase();
        const exists = await roomExists(upper);
        if (!exists) return err('ROOM_NOT_FOUND', 'No room with that code.');
        setStoredRoomCode(upper as never);
        conn.open(upper);
        setLastAction('join');
        setJoined(true);
        return { ok: true as const, data: { code: upper as never } };
      },
      call<R = Record<string, never>>(ev: string, payload: unknown) {
        return conn.call<R>(ev, payload);
      },
      act(ev: string, payload: unknown) {
        void conn.call(ev, payload).then((r) => {
          if (!r.ok) pushToast('loss', r.message);
        });
      },
      pushToast,
      dismissToast(id: number) {
        setToasts((t) => t.filter((x) => x.id !== id));
      },
      reset() {
        conn.close();
        setStoredRoomCode(null);
        setJoined(false);
        setLastAction(null);
        setPub(null);
        setPriv(null);
      },
    }),
    [deviceId, connected, pub, priv, joined, lastAction, toasts, serverOffset, conn, pushToast],
  );

  return <ConnContext.Provider value={value}>{children}</ConnContext.Provider>;
}
