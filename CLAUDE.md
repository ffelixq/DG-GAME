# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**One More Shot Casino** — a browser-based, in-person party casino *drinking* game for 2–8 friends. A shared TV/laptop is the "big screen" (board); each player joins on their phone with a 4-letter room code. Friends gamble one shared fake bank toward a rising **quota** before a round timer, and mistakes mint **drink tokens** resolved during play at timed **Drink Checks**. Originally "Last Call Casino" (the `@lcc/*` scope and `lcc-` CSS prefixes are leftovers — keep them). Inspired by "Gamble With Your Friends" but deliberately does NOT copy its IP/names (enforced by `guards.test.ts`).

## Commands

```bash
npm install
npm run build          # build the client (the Worker serves it; build before deploy / first wrangler dev)
npm run dev            # wrangler dev (Worker + Durable Objects, :8787) + Vite client (:5173) concurrently
npm run typecheck      # tsc over shared, server, server edge (workers-types), and client — run after edits
npm run test           # vitest run (all projects)
npm run deploy         # build client + `wrangler deploy` (needs `wrangler login` or CLOUDFLARE_API_TOKEN)
```

Run one test file / test: `npx vitest run packages/server/src/engine/poker.test.ts` or add `-t "substring of it() name"`. `npm run test:watch` for watch mode. Tests are co-located `*.test.ts`; the unit project (node) covers `shared` + `server`, the client project (jsdom) covers `client`.

## Architecture

npm-workspaces TypeScript monorepo: **`@lcc/shared`** (types + content + pure helpers), **`@lcc/server`** (game engine + Cloudflare edge), **`@lcc/client`** (React + Vite). Node ≥20.

### Server-authoritative single-writer engine (the core)
All game logic is a **pure, synchronous reducer**: `reduce(state, cmd, {now, rng, ids})` in `packages/server/src/engine/reducer.ts`. Clients send **intents only**; the server runs them through this one writer (no `await` in the critical path → no double-spend) and projects **redacted views** back. The engine is the source of truth and is transport-agnostic — it must stay pure:

- **No `Math.random` anywhere in `shared/` or `server/engine`** — randomness comes only from the injected `Rng` (mulberry32 `SeededRng`, server-only). Enforced by `guards.test.ts`. Time comes only from the injected `Clock`. This is what lets a Durable Object replay/persist a room.
- **`engine/tokens.ts` `placeToken()` is THE safety chokepoint** — every drink token, whether minted by a game or transferred by an item/event, routes through it. It enforces the non-negotiable safety rules: alcohol→water coercion for exempt seats, and the hard **2-alcohol cap per Drink Check** (`MAX_ALCOHOL_PER_CHECK`). Never mint/move tokens around it.
- `Room` (`rooms/Room.ts`) wraps the reducer: `dispatch(cmd)` → `reduce` → broadcast public/private views via a `Transport`. `reducer.ts` `tick` drives timers, drink-check cadence, events, bots, reveal expiry.

### Game model
- **Solo games** (roulette, dice, slots, coinflip, wheel, highcard) implement the `GameEngine` interface (`games/registry.ts`), settled centrally by `play.ts settleSession`.
- **Multiplayer tables** — **blackjack** (`engine/blackjack-table.ts`) and **poker** (`engine/poker.ts`, drink-stakes Texas Hold'em, internal kind `poker3`) — are special-cased OUTSIDE the solo `GameEngine` interface: a join window, a shared session across seats, turn order, and a reveal/showdown hold. Bots (`engine/bots.ts`, synthetic `BOT_DEVICE_ID`) auto-join tables and resolve their own checks/choices from the tick.
- **Per-room mode** (`state.mode: 'money' | 'drinks'`, host-set in lobby): the money-vs-drinks split is applied at the **settlement layer** (`settleSession` + blackjack `resolveTable`), NOT in the engines — money mode keeps cash and drops game-loss alcohol; drinks mode refunds the stake (no money) and keeps the drink. Add new game outcomes as `GameOutcome` (bankDeltas + mints) so this branch keeps working.

### Cloudflare edge (production + local dev runtime)
Deployed entirely on Cloudflare (free tier): `packages/server/src/edge/worker.ts` is the Worker (serves the built client via the `ASSETS` binding, routes `/api/create`, `/api/join`, `/ws`); **`RoomDO.ts` is one Durable Object per room** holding `RoomState`, fanning out over **hibernatable WebSockets**, persisting to DO storage, and driving the tick with a self-rescheduling **alarm** (only while a round is live + someone's connected — DO free tier has a daily request cap, so avoid extra ticking/loops). `edge/commands.ts` maps wire events → engine `Command`s (same mapping the now-removed socket.io server used). `wrangler.toml` configures the DO (SQLite migration) + assets. `tsconfig.edge.json` typechecks the edge with `@cloudflare/workers-types` and is **excluded** from the main server tsconfig.

### Wire protocol & client
Raw WebSocket (not socket.io): `shared/src/protocol/ws.ts` defines `rpc`/`ack`/`push` frames. Client transport is `client/src/net/ws.ts` (`RoomConnection`, with backoff reconnect) + `connection.tsx` (the `Conn` context: `create`/`join` over `/api`, then `call`/`act` over the WS; `act` auto-toasts errors). Two surfaces under `client/src/surfaces`: `board/` (big screen, 0 seats — structurally never receives private card data) and `phone/` (controllers). A **device owns 0..N seats** (0 = big screen, 1 = phone, N = pass-and-play); topology is derived, never asked.

### Content as data
All games/items/events/floors/endings/awards live in `shared/src/content/*` (validated by `content.test.ts`). Tunables (caps, round/quota config, bank amounts) are in `shared/src/constants.ts` and `content/floors.ts`.

## Conventions

- Branded ID types (`SeatId`, `TokenId`, …) via `as*`/`asSeatId` constructors in `shared/src/ids.ts`.
- Intents return `Result<T>` (`{ok:true,data}` | `{ok:false,code,message}`) — see `protocol/envelopes.ts`.
- Verify changes with `npm run typecheck` + `npm run test`; the engine has strong unit coverage (per-game payout/token tables across many seeds, the safety invariants, FSM/scheduler) — keep it green.
- Only commit/push when asked. Deploying reuses a Cloudflare token — prefer `wrangler login`.
