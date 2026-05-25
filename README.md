# Tiny Prediction Markets

A local TypeScript demo of a 2-minute BTC binary prediction market:

> Will BTC/USD be above $100,000 in 2 minutes?

Users can start a market, trade YES or NO limit orders, watch a live order book and trades feed, and see the market resolve through the deterministic `RAMP_V1` oracle. Everything is local and simulated: no real funds, wallets, signatures, live exchange accounts, database, or on-chain settlement.

## What Is Built

- React + Vite single market page with chart, strike line, trade ticket, account panel, order book, recent trades, countdown, and oracle transparency panel.
- Fastify REST API plus WebSocket server.
- One canonical YES CLOB with price-time priority, GTC/IOC limit orders, partial fills, cancel, snapshots, deltas, and recent trades.
- Signed-position ledger: positive net is long YES, negative net is long NO.
- Deterministic simulated `RAMP_V1` oracle with venue health, final-window partitioning, median aggregation, outlier rejection, full resolution payload, and input hash.
- Market maker bot plus noisy taker bots for local liquidity.

## Prerequisites

- Node.js 20 or newer
- pnpm 9, via Corepack:

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

## Install

```bash
pnpm install
```

## Run Locally

Install dependencies, then set local env vars before starting the API and web app.
The API and WebSocket URLs must come from env; the app does not fall back to a
built-in local address.

```bash
pnpm install
export API_ORIGIN="http://<api-host>:3001"
export FRONTEND_ORIGIN="http://<web-host>:5173"
export WS_ORIGIN="ws://<api-host>:3001"
export PORT=3001
export HOST=0.0.0.0
export CORS_ORIGIN="$FRONTEND_ORIGIN"
export VITE_API_URL="$API_ORIGIN"
export VITE_WS_URL="$WS_ORIGIN/ws"
pnpm dev
```

Open the web app and click `Start Demo Market`.

You can also run API and web separately:

```bash
pnpm --filter @jet/api dev
pnpm --filter @jet/web dev
```

## Run Bots

Run these in separate terminals after the API is running and a market is open:

```bash
pnpm --filter @jet/bots dev
pnpm --filter @jet/bots dev:takers
```

The market maker waits for an open market, then quotes both sides of the YES book. The taker process starts multiple IOC takers that lean YES or NO based on the oracle/strike relationship while adding noise.

Useful bot environment variables:

```bash
API_BASE_URL=<api-http-origin>
WS_URL=<api-ws-origin>/ws
BOT_USER_ID=mm-bot
NUM_TAKERS=30
RATE_LIMIT_TPS=4
```

## Manipulation Demo

The oracle panel includes controls for a spike scenario and a subtler dislocation scenario. They call:

```bash
POST /markets/:marketId/oracle/demo
{ "scenario": "NEAR_EXPIRY_SPIKE" | "SUBTLE_DISLOCATION" }
```

The legacy `POST /markets/:marketId/oracle/demo-spike` route remains available as a wrapper for `NEAR_EXPIRY_SPIKE`.

That switches the deterministic simulated venue set to the selected one-venue stress scenario. At resolution, the RAMP_V1 panel shows the final partitions, quality flags, sources used, source usage, sources excluded, confidence, dispersion state, and input hash. The demo is meant to show resistance to single simulated venue stresses, not impossibility of manipulation.

## API And Web Env

Use the relevant `.env.example` file as the checklist for values to provide in
your shell, hosting dashboard, or Vite env file:

- `apps/api/.env.example`: `PORT`, optional `HOST`, `CORS_ORIGIN`
- `apps/web/.env.example`: `VITE_API_URL`, `VITE_WS_URL`, optional `VITE_DEMO_USER_ID`
- `apps/bots/.env.example`: `API_BASE_URL`, `WS_URL`, bot tuning vars

`VITE_API_URL` must be the API HTTP(S) origin with no trailing slash.
`VITE_WS_URL` must be the full WS(S) endpoint ending in `/ws`.

See `DEPLOY.md` for Vercel/Netlify frontend deployment, WS-capable backend
deployment, and hosted bot startup notes.

## Checks

```bash
pnpm typecheck
pnpm test
```

The CI workflow runs install, typecheck, and test on Node 20.

## Repo Structure

```text
apps/
  api/          Fastify REST + WebSocket server
  web/          React + Vite market page
  bots/         Market maker and noisy takers
packages/
  shared/       Domain types, REST contracts, WebSocket protocol
  config/       Tunable market and oracle constants
  clob/         In-memory YES order book and matching
  market-core/  Signed positions, collateral, settlement
  oracle/       RAMP_V1 methodology and simulated venues
docs/
  DESIGN.md     Technical design writeup
```

See `docs/DESIGN.md` for the full design.
