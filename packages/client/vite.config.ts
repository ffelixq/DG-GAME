import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// In dev, the Cloudflare Worker + Durable Objects run under `wrangler dev` (default :8787);
// Vite proxies the WebSocket (/ws) and the room API (/api, /health) to it.
const WORKER_PORT = process.env.WORKER_PORT ?? '8787';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: `http://localhost:${WORKER_PORT}`, ws: true, changeOrigin: true },
      '/api': { target: `http://localhost:${WORKER_PORT}`, changeOrigin: true },
      '/health': { target: `http://localhost:${WORKER_PORT}`, changeOrigin: true },
    },
  },
});
