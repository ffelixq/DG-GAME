import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type RoomCode } from '@lcc/shared';
import type { Env } from './env';

export { RoomDO } from './RoomDO';

function randomCode(): RoomCode {
  let s = '';
  const bytes = crypto.getRandomValues(new Uint32Array(ROOM_CODE_LENGTH));
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  return s as RoomCode;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // ---- create a room (mint a unique code, initialise its Durable Object) ----
    if (url.pathname === '/api/create' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
      if (!body.deviceId) return json({ error: 'deviceId required' }, 400);
      for (let attempt = 0; attempt < 25; attempt++) {
        const code = randomCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const r = await stub.fetch(`https://do/init?room=${code}&device=${encodeURIComponent(body.deviceId)}`);
        const { created } = (await r.json()) as { created: boolean };
        if (created) return json({ code });
      }
      return json({ error: 'could not allocate a room code' }, 503);
    }

    // ---- check a room exists (clean join error before opening a socket) ----
    if (url.pathname === '/api/join') {
      const code = (url.searchParams.get('room') ?? '').toUpperCase();
      if (!code) return json({ exists: false });
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      const r = await stub.fetch('https://do/exists');
      return json(await r.json());
    }

    // ---- websocket: route to the room's Durable Object ----
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const code = (url.searchParams.get('room') ?? '').toUpperCase();
      const device = url.searchParams.get('device') ?? '';
      if (!code || !device) return new Response('bad request', { status: 400 });
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(new Request(`https://do/ws?room=${code}&device=${encodeURIComponent(device)}`, req));
    }

    if (url.pathname === '/health') return json({ ok: true, game: 'one-more-shot-casino' });

    // ---- everything else: the static client (SPA) ----
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
