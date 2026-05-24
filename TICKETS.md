# Work Tickets (do in order — mirrors BUILD_PLAN section 14)

Each ticket is scoped to ~one package and built against `@jet/shared`.
"Model" is a suggestion: Opus for the oracle + reviews; Sonnet for plumbing.

## T1 - Thin vertical slice (proves real-time feel)  [api, web, oracle-mock]
Lifecycle open->resolving->resolved + a MOCK oracle price stream + WS server +
a bare frontend showing price, countdown, status. No CLOB yet.
Done: open the app, watch a 2-min market tick down over WS and resolve.  (Sonnet)

## T2 - CLOB core  [clob]
Price-time-priority YES book, limit orders, matching, partial fills, cancel,
snapshots, recent-trades ring buffer.
Done: orders match; unit tests on matching + price-time priority.  (Sonnet)

## T3 - Signed positions + four-case settlement  [market-core]
Signed ledger, balances, collateral, the four fill kinds (Open / Transfer YES /
Transfer NO / Close) incl. the zero-crossing split.
Done: collateral invariant holds; unit tests on all four kinds.  (Sonnet/Opus)

## T4 - WS streams + REST  [api]
All REST endpoints + book/trades/oracle/user channels, snapshot+delta with seq,
reconnect re-snapshot.
Done: frontend renders a live, moving book over WS.  (Sonnet)

## T5 - Market maker bot  [bots]
Quotes both sides, requotes, keeps depth, tracks oracle/strike probability.
Done: book stays populated and roughly tracks the strike.  (Sonnet)

## T6 - RAMP_V1 oracle (deep)  [oracle]
Simulated venue adapters, 30s/6x5s window, mid-price TWAP, median aggregation,
stale/MAD-outlier rejection, dispersion state, confidence band, deterministic
RampResolution + inputHash, reproducible single-venue manipulation scenario.
Done: spike one venue near expiry -> median ignores it; resolution replays from logs.  (Opus)

## T7 - Noisy taker bots  [bots]
20-50 takers leaning YES above strike / NO below, plus noise.
Done: recent-trades feed looks alive, never nonsensical near expiry.  (Sonnet)

## T8 - Frontend polish  [web]
Full market page to the Figma feel: order book, trade ticket, balance/positions,
countdown, trades feed, strike line + forming-resolution marker, resolution + PnL.
Done: "feels like a short-term trading product."  (Opus/Sonnet)

## T9 - Oracle transparency panel + live manipulation demo  [web, oracle]
Surface method/venue health/dispersion/sources used+excluded; a button that
triggers the manipulation scenario live.
Done: the oracle is a visible product feature.  (Opus)

## T10 - Design doc + README finalize  [docs]
Fill docs/DESIGN.md (oracle deepest) + finalize README run instructions.  (Opus)

## T11 - Hosted deploy  [infra]
Frontend (Vercel/Netlify) + backend (Render/Railway/Fly, WS-capable),
env-based URLs, wss, CORS.  (you)
