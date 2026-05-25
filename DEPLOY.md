# Deploy

This repo is provider-agnostic. Host the web app as static Vite output, and host
the API as a long-running Node process on a platform that supports WebSocket
upgrades.

## Backend

Use Render, Railway, Fly, or another WS-capable host.

Backend settings:

```bash
pnpm install --frozen-lockfile
pnpm --filter @jet/api start
```

Backend env:

```bash
PORT=<provided by host>
HOST=0.0.0.0
CORS_ORIGIN=https://web.example.com
```

Set `CORS_ORIGIN` to the deployed frontend origin. Multiple origins are allowed
as a comma-separated list.

Health check:

```text
GET /health
```

The WebSocket endpoint is:

```text
/ws
```

Most hosts terminate TLS before Node. Point clients at the hosted API with
`https://` for REST and `wss://.../ws` for WebSocket.

## Frontend

Use Vercel, Netlify, or any static host.

Frontend settings:

```bash
pnpm install --frozen-lockfile
pnpm --filter @jet/web build
```

Publish directory:

```text
apps/web/dist
```

Frontend env:

```bash
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com/ws
VITE_DEMO_USER_ID=demo
```

Set `VITE_API_URL` to the backend HTTPS origin with no trailing slash. Set
`VITE_WS_URL` to the backend WebSocket endpoint. Vite reads these at build time,
so changing them requires rebuilding and redeploying the frontend bundle.

After the frontend URL is known, update the backend `CORS_ORIGIN` to that exact
origin and redeploy or restart the backend.

## Bots

Bots are a separate operator-started process. They are not part of the frontend
or backend deployment unless you choose to run them as their own service.

Bot env:

```bash
API_BASE_URL=https://api.example.com
WS_URL=wss://api.example.com/ws
BOT_USER_ID=mm-bot
NUM_TAKERS=30
RATE_LIMIT_TPS=4
```

Start the market maker:

```bash
pnpm --filter @jet/bots start
```

Start noisy takers:

```bash
pnpm --filter @jet/bots start:takers
```
