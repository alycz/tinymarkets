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

Start the API and web app:

```bash
pnpm dev
```

Defaults:

- API: `http://localhost:3001`
- Web: Vite's printed localhost URL, usually `http://localhost:5173`
- WebSocket: `ws://localhost:3001/ws`

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
API_BASE_URL=http://localhost:3001
WS_URL=ws://localhost:3001/ws
BOT_USER_ID=mm-bot
NUM_TAKERS=30
RATE_LIMIT_TPS=4
```

## Manipulation Demo

The oracle panel includes an `Arm Spike Demo` button. It calls:

```bash
POST /markets/:marketId/oracle/demo-spike
```

That switches the deterministic simulated venue set to a near-expiry single-venue spike scenario. At resolution, the RAMP_V1 panel shows the final partitions, sources used, sources excluded, confidence, dispersion state, and input hash. The demo is meant to show resistance to a single simulated venue spike, not impossibility of manipulation.

## API And Web Env

API:

```bash
API_HOST=0.0.0.0
API_PORT=3001
WEB_ORIGIN=http://localhost:5173
```

Web:

```bash
VITE_API_URL=http://localhost:3001
VITE_DEMO_USER_ID=demo
```

If `VITE_API_URL` is omitted, the web app uses `http://localhost:3001` and derives the WebSocket URL from it.

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
