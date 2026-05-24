# CLAUDE.md — rules for every agent working in this repo

A 4-day take-home: a local 2-minute BTC binary prediction market
("Will BTC/USD be above $X in 2 minutes?"). See `BUILD_PLAN.md` for the full
plan and `docs/DESIGN.md` for the writeup-in-progress. These rules are
non-negotiable — follow them in every change so that agents on different
packages make identical assumptions.

## Architecture (locked)
- Monorepo, pnpm workspaces, TypeScript end-to-end. No Rust.
- One canonical YES order book + a signed-position ledger (Unified Market Structure):
  `+N` long YES, `-N` long NO, `0` flat. `NO price = 100 - YES price`.
- Contracts live in `@jet/shared`. ALWAYS import domain types, REST DTOs, and WS
  events from there. NEVER redefine them locally. If a contract must change,
  change it in `@jet/shared` and update all consumers in the SAME PR.
- Tunable parameters live in `@jet/config`.

## Hard rules
- **No floats for money or sizes.** Use the branded `@jet/shared` types
  (`UsdCents`, `PriceCents`, `Shares`, `SignedShares`) via their constructors.
- **Server is the source of truth** for clock/countdown, status, order book,
  balances, positions, resolution. Never trust client-supplied state.
- **Real-time = WebSocket only** (no polling, no SSE). Public market data and
  user-specific data are SEPARATE channels.
- **Collateral invariant:** total locked collateral == openInterest x $1, always.
- Validate orders server-side: price 1..99, integer size, market must be open.

## Oracle (RAMP_V1) — locked decisions
- Settlement window: final 30s, six 5s partitions.
- Per venue: mid-price TWAP (NOT last-trade, NOT volume-weighted in the demo).
- Per partition: equal-weight median of surviving venues.
- Across partitions: **median** of the six partition prices (NOT mean).
- Exclude venues: stale (>3s), missing/crossed book, spread >15bps, MAD outlier
  (> max(10bps, 3xMAD) from cross-venue median). Require >= 3 valid venues.
- Confidence is an OUTPUT band, never an aggregation weight.
- Dispersion circuit-breaker: NORMAL/ELEVATED/STRESSED/DISLOCATED at 5/12/25 bps.
- Resolution is deterministic + replayable: emit the full RampResolution + inputHash.
- USD venues settle directly; USDT venues need a basis adjustment + lower confidence.

## Scope discipline (this is graded)
- Highest value: oracle reasoning, frontend/product experience, real-time feel.
- Lower value: matching-engine polish, bot realism, code polish — don't gold-plate.
- Deterministic simulated venue feeds are the default; live adapters are stretch.

## Definition of done for any change
- `pnpm typecheck` passes and `pnpm test` is green.
- New behavior has tests (especially the four fill kinds + oracle determinism/replay).
- Imports domain types from `@jet/shared`; no local redefinitions.
- PR description states the tradeoff in 1-2 lines (feeds the design doc).

## Package ownership (deps flow apps -> packages, never reverse)
`@jet/shared` contracts | `@jet/config` params | `@jet/clob` book+matching |
`@jet/market-core` lifecycle+positions+settlement | `@jet/oracle` RAMP_V1 |
`apps/api` REST+WS | `apps/web` React UI | `apps/bots` MM + takers.
