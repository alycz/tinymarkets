# Jet Prediction Market — 2-Minute BTC Market (local demo)

A short-duration binary prediction market: **"Will BTC/USD be above $X in 2 minutes?"**
Buy YES/NO between 1¢ and 99¢; the winning side pays $1/share at resolution.

Two ideas define the system:
- **One canonical YES order book + a signed-position ledger** (Unified Market Structure) — no dual YES/NO tokens. `+N` = long YES, `-N` = long NO, `0` = flat. `NO price = 100 - YES price`.
- **`RAMP_V1`** — a deterministic, auditable settlement oracle built for short markets: a final-30s window in six 5s partitions, per-venue mid-price TWAPs, equal-weight median across vetted venues, median across partitions, stale/MAD-outlier rejection, and a dispersion circuit-breaker. Designed so profitable manipulation requires moving consensus across several liquid venues for a sustained period.

Everything is local/simulated: no funds, wallets, smart contracts, or on-chain settlement.

## Status

Scaffolding stage (BUILD_PLAN step 1). Done so far:
- pnpm monorepo
- **`@jet/shared`** — the contract spine: domain types, REST DTOs, WebSocket protocol *(type-checks under strict TS)*
- **`@jet/config`** — tunable market + RAMP_V1 parameters
- Placeholder workspaces for api, web, bots, clob, market-core, oracle

## Repo structure
```
apps/
  web/          React + Vite single market page          (todo)
  api/          Fastify REST + WebSocket server           (todo)
  bots/         Market maker + noisy taker bots           (todo)
packages/
  shared/       Types · REST contracts · WS events   ← the spine
  config/       Tunable constants
  clob/         Order book + matching                     (todo)
  market-core/  Lifecycle · signed positions · settlement (todo)
  oracle/       RAMP_V1 + venue adapters / sim feeds       (todo)
docs/
  DESIGN.md     Technical writeup (the oracle is the deepest section)
```

## Prerequisites
- Node >= 20
- pnpm (`corepack enable` then `corepack prepare pnpm@9 --activate`)

## Setup
```bash
pnpm install
pnpm typecheck   # type-checks every package that defines a typecheck script
```

## Design highlights baked into `@jet/shared`
- **No floats.** Money and sizes are *branded* integer types (`UsdCents`, `PriceCents`, `Shares`, `SignedShares`) — the compiler refuses to mix scales.
- **Server-authoritative.** `MarketState.msRemaining` and status come from the server; clients render, never run their own clock.
- **Public vs. user channels are separate** (`market:` / `book:` / `trades:` / `oracle:` vs `user:`); user data never rides the public stream.
- **Order book uses sequence numbers** so clients detect gaps and re-snapshot on reconnect.
- **Confidence is an output, not a weight** — a median can't be bought; an attacker dressing up a controlled venue as "confident" gains no influence.

See `docs/DESIGN.md` for the full writeup (in progress) and `BUILD_PLAN.md` for the roadmap.
