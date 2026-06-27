// Cloudflare Worker bindings (see wrangler.toml).
export interface Env {
  /** Durable Object namespace — one RoomDO instance per room code. */
  ROOM: DurableObjectNamespace;
  /** Static client assets (the built Vite app), served with SPA fallback. */
  ASSETS: Fetcher;
}
