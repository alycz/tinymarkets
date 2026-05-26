# Tiny Prediction Markets

A local TypeScript demo of a 2-minute BTC binary prediction market:

> Will BTC/USD be above $100,000 in 2 minutes?

Users can start a market, trade YES or NO limit orders, watch a live order book and trades feed, and see the market resolve through the deterministic `VENUE_WEIGHTED_TWAP_V1` oracle. Everything is local and simulated: no real funds, wallets, signatures, live exchange accounts, database, or on-chain settlement.

## Reviewer Quickstart

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
pnpm dev
```

Then:

1. Open `http://localhost:5173`.
2. Click `Start Demo Market`.
3. In another terminal, run `pnpm dev:bots`.
4. Place a YES or NO order.
5. Click `Arm Spike Demo` or `Arm Subtle Demo` before expiry.
6. Watch resolution, payout, PnL, sources used/excluded, per-venue weights, and input hash.

For a single command after install, use:

```bash
pnpm demo
```

`pnpm demo` starts API, web, market maker, and takers together. The bots can start before a market exists; they wait until the web app starts an open market.

## What Is Built

- React + Vite single market page with a primary YES share-price chart, compact BTC oracle reference chart, trade ticket, account panel, order book, recent trades, countdown, and oracle transparency panel.
- Fastify REST API plus WebSocket server at `/ws`.
- One canonical YES CLOB with price-time priority, GTC/IOC limit orders, partial fills, cancel, snapshots, deltas, and recent trades.
- Signed-position ledger: positive net is long YES, negative net is long NO.
- Deterministic simulated `VENUE_WEIGHTED_TWAP_V1` oracle with venue health, a final 15-second multi-venue mid-price TWAP, static venue weights, stale/outlier rejection, full resolution payload, and input hash.
- Market maker bot plus noisy taker bots for local liquidity.

## Local Commands

```bash
pnpm dev        # API + web
pnpm bots       # market maker + takers
pnpm dev:bots   # market maker + takers
pnpm demo       # API + web + market maker + takers
```

Local defaults require no env exports:

- API: `PORT=3001`, `HOST=0.0.0.0`, localhost CORS origins.
- Web: `VITE_API_URL=http://localhost:3001`, `VITE_WS_URL=ws://localhost:3001/ws`, `VITE_DEMO_USER_ID=demo`.
- Bots: `API_BASE_URL=http://localhost:3001`, `WS_URL=ws://localhost:3001/ws`, `BOT_USER_ID=market-maker-1`, `NUM_TAKERS=75`, `LEVEL_SIZES=25,50,100,150,250`, `RATE_LIMIT_TPS=6`, `MIN_INTERVAL_MS=250`, `MAX_INTERVAL_MS=1500`, `REQUOTE_FAIR_MOVE_CENTS=1`, `FAIR_VALUE_VOL_SCALE_CENTS=25000`.

Bots submit normal REST orders through `POST /orders`; they do not write trades, books, or charts directly. The market maker reconciles its resting YES-book orders each tick, while the taker swarm sends IOC `BUY_YES` and `BUY_NO` flow that crosses the spread through the backend CLOB.
Both bot processes wait when no market is open and stop trading when the active market moves to `resolving` or `resolved`.

Use the `.env.example` files only when you want to override those defaults.

## Demo Path

See `docs/DEMO_SCRIPT.md` for the intended reviewer walkthrough. The short version:

1. Start a market.
2. Observe live BTC indicative price, server countdown, book, and trades.
3. Place a BUY YES or BUY NO order.
4. Start bots if they are not already running.
5. Arm the spike or subtle dislocation demo.
6. During the final 15 seconds, inspect the forming `VENUE_WEIGHTED_TWAP_V1` window.
7. At resolution, inspect final price, outcome, used/excluded sources, input hash, payout, and PnL.

## Manipulation Demo

The oracle panel includes controls for a spike scenario and a subtler dislocation scenario. They call:

```bash
POST /markets/:marketId/oracle/demo
{ "scenario": "NEAR_EXPIRY_SPIKE" | "SUBTLE_DISLOCATION" }
```

The legacy `POST /markets/:marketId/oracle/demo-spike` route remains available as a wrapper for `NEAR_EXPIRY_SPIKE`.

The demo switches the deterministic simulated venue set to a one-venue stress scenario. At resolution, the `VENUE_WEIGHTED_TWAP_V1` panel shows per-venue TWAPs, normalized weights, quality flags, sources used/excluded, confidence, dispersion state, and input hash. It demonstrates resistance to these single simulated venue stresses, not impossibility of manipulation.

## Checks

```bash
pnpm typecheck
pnpm test
```

The CI workflow runs install, typecheck, and test on Node 20.

## Known Simplifications

- In-memory only; no database or durable replay store.
- Fake balances and unauthenticated string user ids.
- No wallets, signatures, custody, or on-chain settlement.
- Deterministic simulated venue feeds are implemented. `DEMO_MODE=live` and `DEMO_MODE=hybrid` currently retain simulated adapters so the demo stays reliable; real live adapters are future production work.
- The account panel shows available cash, resting-order reserves, and an OI collateral share. It is not exact per-fill collateral basis.
- No fee, liquidation, margin, or production risk system.
- Bots are intentionally approximate local liquidity, not realistic market participants.
- `DISLOCATED` markets still resolve by the strict demo rule. Production should define pause, extension, refund, or dispute behavior.

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
  oracle/       VENUE_WEIGHTED_TWAP_V1 methodology and simulated venues
docs/
  DESIGN.md                 Technical design writeup
  DEMO_SCRIPT.md            Reviewer walkthrough
  SUBMISSION_CHECKLIST.md   Final submission checklist
```

See `docs/DESIGN.md` for the full design, `SETUP.md` for local troubleshooting, and `DEPLOY.md` for hosted environment notes.
