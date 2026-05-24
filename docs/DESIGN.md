# Design Document (in progress)

> Written continuously alongside the code. The oracle section is the deepest.

## 1. Product / demo overview
What was built · how to run it · what the user can do · what is real vs simulated. *(todo)*

## 2. System architecture
Monorepo layout · frontend / backend / bots / oracle / shared · REST (commands + snapshots) vs WebSocket (live streams). *(todo)*

## 3. CLOB / API design
One canonical YES book · price-time priority · matching · recent trades · balances/positions · shortcuts. *(todo)*

## 4. Unified Market Structure
Signed-position ledger · `NO = 100 - YES` · order normalization · the four fill kinds (Open / Transfer YES / Transfer NO / Close) · collateral invariant (`locked == openInterest * $1`) · why it beats dual YES/NO token books. *(todo)*

## 5. WebSocket / real-time design
Public market channels vs user channels · snapshot+delta with sequence numbers · reconnect re-snapshot · server-authoritative clock. *(todo)*

## 6. Bot design
Market maker (quotes both sides, requotes, tracks oracle/strike) · noisy takers (lean YES above strike / NO below) · realistic vs fake. *(todo)*

## 7. Oracle design — RAMP_V1 (deepest section)
- Why naive single-venue / single-instant resolution fails for short markets (Polymarket XRP, Jan 2026).
- Why existing oracles fall short for 2-minute markets (UMA too slow; Chainlink instant-snapshot timing risk; Pyth EMA too long).
- Methodology: vetted USD-first venues (USDT basis-adjusted) · mid-price TWAP per venue · equal-weight median across venues · final-30s window in six 5s partitions · **median across partitions** (robust to clustered end-of-window spikes).
- Robustness: stale/missing/crossed/wide-spread exclusion · MAD-based outlier rejection · `min 3 venues`.
- Adaptive: dispersion circuit-breaker (NORMAL/ELEVATED/STRESSED/DISLOCATED) anchored to observed data.
- Confidence as an *output* band (not an aggregation weight) and the threshold tie rule.
- Determinism & auditability: replayable resolution object + input hash.
- Production improvements. *(todo — anchored on the research already gathered)*

## 8. Frontend / product decisions
Market-page layout · displayed vs resolution price (strike line, forming-resolution marker) · oracle transparency panel · tradeoffs. *(todo)*

## 9. Future production considerations
Persistence · auth · signatures · risk engine · on-chain settlement · real venue integrations · monitoring / replay. *(todo)*
