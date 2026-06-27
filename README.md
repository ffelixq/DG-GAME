# One More Shot Casino

> One more shot. One more round. 🥃

A browser-based, in-person **party casino drinking game** for 2–8 friends. Everyone shares one
fake bank account and gambles to hit a rising **quota** before each 5-minute round ends. Bad
beats mint **drink tokens** that you resolve *during* play at timed **Drink Checks** — the
drinking is woven into the game, not saved for the end. Inspired by the genre; original art,
names and code.

> **Safety first.** Drinking is always optional. Every token can be swapped for water or a dare,
> there's a hard cap of 2 sips per Drink Check, anyone can pause, and "I feel unwell" makes a
> player exempt (their tokens become water). These rules are **enforced in code**, not just
> printed — see `packages/server/src/engine/tokens.ts` and `safety.test.ts`.

## Run it

```bash
npm install
npm run build        # build the client once (the Worker serves it)
npm run dev          # Cloudflare Worker + Durable Objects (wrangler) on :8787, Vite web app on :5173
```

- On a **laptop/TV**: open the Vite URL → **Create Room** → "make it the big screen".
- On each **phone** (same Wi-Fi): scan the QR (or enter the 4-letter code) → add player(s) →
  accept the house rules. Two people can share one phone — add two names; a "Pass to ___"
  curtain keeps cards private.
- Host taps **Start the night**.

Other scripts: `npm run typecheck`, `npm run test`, `npm run build`.

## Deploy (Cloudflare, free)

The whole app — static client **and** the real-time server — runs on Cloudflare's edge: a Worker
serves the client and routes WebSockets to a **Durable Object** (one per room) that holds the
authoritative `RoomState`, fans out over hibernatable WebSockets, and drives the game-loop with a
Durable Object **alarm** (only while a round is live). No separate server, database, or always-on
host needed.

```bash
wrangler login          # once, in your terminal
npm run deploy          # builds the client + `wrangler deploy`
```

Local dev uses the same runtime via `wrangler dev` (started by `npm run dev`).

## How it works

| Area | Where |
|---|---|
| Shared types + all content (items, events, floors, endings, awards) | `packages/shared/src` |
| Server-authoritative engine (single-writer reducer, RNG, room lifecycle) | `packages/server/src/engine`, `packages/server/src/rooms` |
| Token safety chokepoint + Drink Check resolver | `packages/server/src/engine/tokens.ts`, `drink.ts` |
| 5 games (blackjack, 3-card poker, roulette, dice, slots) | `packages/server/src/engine/games`, `poker.ts` |
| Events / items / floors / endings | `engine/effects-runtime.ts`, `event.ts`, `items.ts`, `floors.ts`, `endings.ts` |
| React client — board (big screen) + phone controller | `packages/client/src/surfaces` |

**Architecture:** clients send intents over a raw WebSocket (request/ack + pushed state) to the
room's Durable Object; the server runs them through one pure, synchronous reducer (no double-spend)
and projects **redacted views** — a zero-seat big screen can never receive private card data
(asserted by tests). State lives in the Durable Object (persisted to its storage so it survives
hibernation); rooms reconnect via a stable `deviceId`. The pure engine + injected Clock/RNG are
transport-agnostic, so the same code runs under `wrangler dev` locally and on the edge in prod.

## Tests

`npm run test` runs 68 unit + integration tests, including the headline safety invariants
(2-alcohol cap, exempt coercion on mint **and** transfer, carry-forward, pause never burns game
time), every game's payout/token rules, the full onboarding over real Socket.io, and the
RNG-determinism + IP guardrails.
