# Setup

This repo is designed to run locally with no env exports.

## Prerequisites

- Node.js 20 or newer.
- pnpm 9 through Corepack.

```bash
node -v
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm -v
```

## Fresh Clone

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` and click `Start Demo Market`.

In a second terminal, start local liquidity:

```bash
pnpm dev:bots
```

Alternatively:

```bash
pnpm bots
```

For the full demo stack:

```bash
pnpm demo
```

`pnpm demo` starts API, web, market maker, and takers together. Bots wait until a market is open.

## Local Defaults

The app uses these defaults when env vars are omitted:

```bash
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001/ws
VITE_DEMO_USER_ID=demo
API_BASE_URL=http://localhost:3001
WS_URL=ws://localhost:3001/ws
BOT_USER_ID=market-maker-1
NUM_TAKERS=75
LEVEL_SIZES=25,50,100,150,250
REQUOTE_FAIR_MOVE_CENTS=1
FAIR_VALUE_VOL_SCALE_CENTS=25000
MIN_INTERVAL_MS=250
MAX_INTERVAL_MS=1500
```

Override them with shell env vars or local env files only when needed.

## Useful Commands

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Troubleshooting

- If `tsc` or `vitest` is missing, run `pnpm install`.
- If the web app cannot reach the API, confirm the API is listening on `http://localhost:3001` and the browser is opening `http://localhost:5173`.
- If WebSocket connection fails, confirm `VITE_WS_URL` points to `ws://localhost:3001/ws` for local development.
- If bots appear idle, start a market in the browser. They intentionally wait for an open market before quoting or taking.
- If CORS fails in a non-local setup, set `CORS_ORIGIN` to the exact frontend origin.
