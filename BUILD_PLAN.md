# Build Plan — Jet Work Trial (2-Minute BTC Prediction Market)

> Living document. We work against this for the rest of the trial.
> Status: decisions locked, ready to build on approval.

---

## 1. Purpose & evaluation priorities

A local/demo 2-minute BTC binary prediction market: **"Will BTC/USD be above $X in 2 minutes?"**

We optimize for the rubric, not for production infra:

| Priority | Area |
|---|---|
| **Very high** | Oracle design / reasoning |
| **Very high** | Frontend / product experience |
| **Very high** | Real-time feel |
| Medium | CLOB / API design |
| Medium | Writeup clarity |
| Medium-low | Bots / liquidity simulation |
| Medium-low | Code polish |

The demo must feel like a real short-term trading product: live BTC/oracle price, moving order book, recent trades, balance, positions, server-driven countdown, clean resolution, final PnL.

---

## 2. Locked decisions

1. **Language: TypeScript end-to-end.** Not Rust. Matching throughput is the one thing explicitly *not* graded; TS gives shared contracts across frontend/backend/bots/oracle and far better velocity in four days.
2. **Oracle feeds: deterministic simulation is the default**, behind a venue-adapter abstraction, with **live adapters (Coinbase, Kraken) toggle-able** and intended ON for the hosted demo. Determinism guarantees the reviewer can always run it and lets us inject a *reproducible* manipulation scenario.
3. **Unified Market Structure four-case logic is CORE, not optional.** It is the one bespoke spec Jet handed us. We implement it correctly (time-boxed). We skip everything *past* the model (margin, liquidation, risk engine, netting).
4. **Security is deprioritized.** Keep only cheap, visible validation discipline + one writeup paragraph on production.
5. **Hosted demo: committed.** Built last, but *designed for from day one* (env-based URLs, `wss://`, CORS, WS-friendly host).
6. **Displayed vs. resolution price** made legible via: strike in the title, a toggle-able strike line on the BTC chart, a forming-resolution-price marker in the final TWAP window, and the oracle transparency panel.
7. **Oracle methodology (`RAMP_V1`) settled:** final-30s window in six 5s partitions; per venue a **mid-price TWAP** (not trade/volume-weighted); per partition an **equal-weight median** of surviving venues after stale/MAD-outlier rejection; resolution = **median of the six partition prices** (not mean — robust to clustered end-of-window spikes); **confidence is an output, not an aggregation weight** (weights are gameable; a median can't be bought); one dispersion signal read at three points (exclude / express confidence / circuit-break). Full spec in §9.

---

## 3. Core deliverables (monorepo)

1. Working frontend (single market page)
2. Working backend / REST API
3. Real WebSocket server + client (hard requirement — no polling, no SSE)
4. In-memory CLOB / order book
5. Simulated bots (market maker + noisy takers)
6. BTC oracle / resolution methodology in code
7. README (setup/run)
8. Design doc (oracle is the deepest section)
9. Hosted demo

---

## 4. Architecture

- **REST** for commands and one-shot snapshots.
- **WebSocket** for all live streaming.
- **Server is the source of truth** for: clock/countdown, market status, order book, balances, positions, resolution. Never trust client-supplied state.

### REST endpoints
```
GET  /markets/current
GET  /markets/:id
GET  /markets/:id/orderbook
GET  /markets/:id/trades
GET  /users/:id
GET  /users/:id/positions
POST /orders
POST /orders/:id/cancel
POST /markets/start-demo        # start a fresh 2-minute market
```

### WebSocket channels
```
market:<id>   status, countdown/expiry
book:<id>     snapshots + deltas
trades:<id>   recent trades feed
oracle:<id>   displayed price, venue health, resolution audit
user:<id>     balance, positions, fills, personal resolution/PnL
```
Public market data and user-specific data are separate channels.

### Example messages
```jsonc
// client -> server
{ "type": "subscribe", "channels": ["market:btc-2m","book:btc-2m","trades:btc-2m","oracle:btc-2m","user:demo"] }

// server -> client
{ "type": "oracle:price",   "marketId": "btc-2m", "priceCents": 10012342, "ts": 1710000000 }
{ "type": "book:snapshot",  "marketId": "btc-2m", "bids": [], "asks": [] }
{ "type": "book:delta",     "marketId": "btc-2m", "changes": [] }
{ "type": "trade:created",  "marketId": "btc-2m", "side": "YES", "priceCents": 64, "size": 10 }
{ "type": "user:fill",      "userId": "demo", "marketId": "btc-2m", "priceCents": 64, "size": 10, "positionAfter": 10 }
{ "type": "market:resolved","marketId": "btc-2m", "outcome": "YES", "resolutionPriceCents": 10012342 }
```

### On reconnect
Client re-requests / receives fresh snapshots. Never leave stale book/trade/position state on screen.

---

## 5. Repo structure
```
apps/
  web/          React + Vite frontend
  api/          Fastify backend + WebSocket server
  bots/         Market maker + noisy takers
packages/
  shared/       Types, API contracts, WS events  (the spine)
  clob/         Order book + matching
  market-core/  Lifecycle, signed positions, settlement
  oracle/       Methodology + venue adapters / simulated feeds
  config/       Shared constants
docs/
  DESIGN.md
README.md
```

---

## 6. Tech stack

- Monorepo: **pnpm workspaces**
- Frontend: **React + TypeScript + Vite + Tailwind**; charts via **lightweight-charts**; state via **Zustand** or WS-backed hooks
- Backend: **Node + TypeScript + Fastify**
- WebSocket: raw **`ws`** or **`@fastify/websocket`** with a clean typed subscription protocol (avoid Socket.IO — Jet may expect a direct WS implementation)
- Persistence: in-memory only
- Money/positions: **integer cents and integer share counts — never floats**
  - YES price: integer cents 1–99 · BTC price: integer cents · position: integer shares · balance: integer cents
- Testing: targeted units for order normalization, the four fill cases, settlement, and the oracle
- Deploy (built last): frontend on Vercel/Netlify; backend on **Render / Railway / Fly** (must keep long-lived WS alive)

---

## 7. Unified Market Structure (CORE)

One canonical **YES** book + one **signed position ledger**:
- `+N` = long N YES · `−N` = short N YES (effectively long N NO) · `0` = flat
- `NO price = 1 − YES price`
- UI shows YES/NO; engine normalizes everything to the YES book:
  - Buy NO @ 35¢ = **sell** YES @ 65¢ · Sell NO @ 35¢ = **buy** YES @ 65¢

Every fill = "buyer buys YES from seller at price p", classified by both parties' positions:
- **Open** — both increase exposure → open interest ↑ → new collateral enters
- **Transfer YES** — YES position changes hands → OI unchanged
- **Transfer NO** — short position changes hands → OI unchanged
- **Close** — a YES and a NO cancel → OI ↓ → collateral released

Implementation notes:
- The fiddly case is a fill that crosses zero for a party (e.g. +3 → −2 on a sale of 5 = part Close, part Open) — decompose at the zero-crossing. Cover with unit tests.
- **Hard invariant:** total locked collateral == open interest × $1 at all times.
- Graceful degradation if time-crunched: simplify per-fill *labeling* but preserve the invariant.
- **Skip** (real gold-plating): margin, liquidation, risk checks, multi-market netting, fees.

---

## 8. CLOB scope

Required: price-time priority (bids desc, asks asc), limit placement, basic matching, partial fills, cancel, snapshots, recent-trades ring buffer, balances, signed positions, lifecycle awareness (open → resolving → resolved). In-memory, no auth, no DB. Do not over-build matching.

Balance model: each demo user starts with fake cash; placing an order reserves funds conservatively; fills update balance + signed position; at resolution winning-side position pays $1/share; UI shows payout + PnL.

---

## 9. Oracle — the showcase

Method name: **`RAMP_V1` — Robust Adaptive Multi-venue Price oracle.**
Treat settlement as a *short-duration benchmark problem*, not a price-feed lookup. We borrow Chainlink's multi-venue mid-price data, Pyth's confidence-awareness, CME CF's partitioned-window benchmark, and Kaiko/Cboe's vetted-venue + auditability discipline — compressed into a deterministic 30s settlement oracle for a 2-minute market.

> **Scope discipline:** the oracle is one of THREE "very high" criteria. Time-box it. The lean core below earns nearly all the credit; everything in *Stretch* is optional and must not starve the frontend.

### Two prices, by design
- **Live Indicative Price** — fast cross-venue median of mid-prices, updated ~1s. What the user sees and (loosely) trades against. Makes the product feel live.
- **Resolution Reference Price** — the manipulation-resistant benchmark over the final 30s. Settles the market. *Indicative ≠ resolution, intentionally* (mirrors CME's real-time index vs settlement-rate split).

### Settlement window: 30s, six 5s partitions
`T-30s → T`, split into six 5s partitions. (A 60s window averages half a 2-min market — too sluggish; 30s balances responsiveness vs manipulation resistance.) A last-second spike lands in at most one partition.

### Per-partition computation
1. **DECISION — mid-price, not trade/volume-weighted.** Per venue, compute a **mid-price TWAP** over the 5s (mid = `(bestBid+bestAsk)/2`). Mid is harder to manipulate than last-trade (attacker must move the whole book, not just print one trade) and is immune to wash-trade volume games; over a 5s window on liquid BTC venues the gap vs a volume-weighted price is negligible. CME volume-weights *within* its partitions because it settles a trade-based reference rate — document that as the production option, but mid-price is the locked demo choice.
2. **Reject** venues that are: stale (>3s since update), missing/crossed/invalid book, spread >15 bps, or **MAD-outliers** — deviation from cross-venue median > `max(10 bps, 3 × MAD)`. (MAD = median absolute deviation; adapts to current dispersion.)
3. Require **≥3 valid venues**; below that, see DISLOCATED.
4. Partition price = **equal-weight median of surviving venues** (no confidence weighting — see "Confidence" below for why).

### Across-partition aggregation — DECISION
Default: **median of the six partition prices** (not mean). For a binary threshold, median is strictly better. On clean data it ≈ mean (the six partition prices are already tightly clustered robust medians), but it rejects clustered end-of-window manipulation. Median of 6 tolerates up to **2 same-side outlier partitions** (the final ~10s) with zero effect. A mean gives one spiked partition 1/6 weight — decisive near a strike. Even a trimmed mean (drop high+low) is flipped by a 2-partition attack (the 2nd spike survives the trim). Median breaks only at **3+** spiked partitions = manipulating half the window (expensive + detectable). Keep mean and trimmed-mean behind a config flag for the writeup comparison.
> Deliberate divergence from CME's arithmetic mean: CME settles a reference *rate* meant to represent the window's average traded price (so it wants the mean); we do binary threshold *classification* robust to end-of-window spikes (so we want the most robust central estimate). Property that falls out: to move our median, an attacker must move consensus across the *majority* of the window, not just the final seconds.

### Vetted venues — USD first
Priority (true USD): **Coinbase, Kraken, Bitstamp, Gemini, LMAX, itBit/Paxos** (mirrors CME constituents). USDT venues (Binance/OKX/Bybit) only with a **USDT/USD basis adjustment and lower confidence** — BTC/USDT ≠ BTC/USD, and a USDT depeg would settle the market wrong. (Document this; it's high-signal.)

### Confidence — output, not weight
Threat-model insight: confidence-*weighted* aggregation is **gameable** here. An attacker controlling a venue can present a tight, fast, "confident" quote to buy more weight. A plain **median can't be bought** — influence depends only on sort position. (Pyth weights by confidence because its publishers are vetted first-party providers who can't fake it; our venues are external and one is adversarial, so we don't import that.) Therefore:
- **Aggregation = equal-weight median of surviving venues.** Per-venue trust signals (spread, staleness, depth, deviation) drive *inclusion/exclusion* only — never weighting. (Also matches CME's no-pre-set-venue-weights rationale.)
- **Confidence is an OUTPUT:** an aggregate uncertainty band (bps) from residual cross-venue dispersion among survivors + survivor count + partition-to-partition variance. Feeds the UI ("$100,123 ± 4 bps") and the near-threshold LOW flag.
- **One signal, three readouts:** cross-venue dispersion is the master quantity — read it large for a venue → *exclude* it; read the residual among survivors → *express* the confidence band; read its overall level → set the *circuit-breaker* state. Coherent by construction, not three ad-hoc penalty stacks, and less code.
- Per-venue health (green/amber/red from spread/staleness/deviation) is still *displayed* in the transparency panel — it just doesn't weight the math.

### Dispersion circuit-breaker (the adaptive part)
Anchored to Kaiko data (<5 bps normal weekday; 18 bps during the XRP attack):

| State | Dispersion | Behavior |
|---|---|---|
| NORMAL | ≤ 5 bps | Settle normally |
| ELEVATED | 5–12 bps | Stricter outlier filters |
| STRESSED | 12–25 bps | Aggressive outlier exclusion + enforce min-venue count |
| DISLOCATED | > 25 bps | Flag low-confidence; (production: extend window / refund) |

For the take-home: **flag and display** the state — do not actually refund.

### Threshold rule
`YES` iff `resolutionPrice > threshold` (strict `>` for "above $X"); else `NO`. If the price is within the oracle's uncertainty band of the threshold, still resolve by the strict rule but mark **confidence = LOW**. No refunds in the demo.

### Resolution output (replayable)
```jsonc
{
  "marketId": "btc-above-100000-2m",
  "method": "RAMP_V1", "ruleVersion": "ramp-v1.0.0",
  "thresholdCents": 10000000, "expiryTs": 1710000000,
  "window": { "startTs": 1709999970, "endTs": 1710000000, "partitionSeconds": 5, "partitionCount": 6 },
  "venueInput": "mid_price_twap", "venueAggregation": "median", "partitionAggregation": "median",
  "resolutionPriceCents": 10012342, "outcome": "YES",
  "confidenceBps": 3.4, "dispersionState": "NORMAL",
  "sourcesUsed": ["coinbase","kraken","bitstamp","gemini"],
  "sourcesExcluded": [{ "venue": "binance", "reason": "OUTLIER", "deviationBps": 21.8 }],
  "partitions": [{ "index": 1, "startTs": 1709999970, "endTs": 1709999975, "priceCents": 10012180, "validVenues": 4, "excludedVenues": 1 }],
  "inputHash": "sha256:..."
}
```

### Manipulation-cost metric (Stretch)
From simulated book depth, estimate notional to push one venue across the strike vs. to move the median (need to move several venues). Display e.g. "single-venue: \$52k · median-basket: \$1.8M." Turns the economic argument into a visible number.
> **Integrity:** frame this as *illustrative, computed from simulated depth* — never present the fabricated figure as a measured liquidity estimate.

### Simulated feeds
Base BTC path + per-venue noise/latency/staleness + occasional spike/wick + a **reproducible near-expiry single-venue manipulation scenario** (spike one venue → show the median/outlier-rejection ignore it, and the attack-cost jump). Reliability is a feature: the demo always runs and the attack is reproducible.

### Build tiers
- **Must:** mock adapters (Coinbase/Kraken/Bitstamp/Gemini/Binance) · 1s samples · indicative median · 30s/6-partition resolution · stale + MAD-outlier rejection · dispersion state · full resolution JSON · UI oracle panel · single-venue-spike demo.
- **Stretch:** confidence bps · input hash · attack-cost estimate · 1–2 live API adapters (for hosted demo).
- **Don't overbuild:** real Chainlink/Pyth integration · governance/dispute system · complex refunds · many live deps.

### Oracle transparency panel (UI)
Before: method `RAMP_V1`, live price, resolution-window countdown, venue health (N healthy / M excluded), dispersion bps + state, confidence, note "resolves on final-30s multi-venue benchmark."
After: final reference price, outcome, sources used, sources excluded + reason + deviation, input hash, payout/PnL.
This makes the top-graded criterion a *visible product feature*, not buried writeup text.

---

## 10. Frontend (single market page)

Shows: title (with strike $X), live BTC/oracle price, price chart, countdown, status (open/resolving/resolved), YES/NO trade ticket, balance, position, real order book, recent-trades feed, oracle/resolution panel, resolution result, final payout/PnL.

Layout: dark, dense-but-readable; chart main/left; trade ticket + order book right; activity feed visible; clear resolution reveal.

**Displayed vs. resolution UX (your design):**
- Strike $X in the title.
- Toggle-able **strike line** on the BTC chart so users see live BTC vs the deciding level.
- In the final TWAP window, a **forming-resolution-price marker** so users see the actual number that will settle it.

Must answer instantly: what am I betting on · what price am I getting · how much can I win · time left · did I win · final PnL.

---

## 11. Real-time feel

Price updates smoothly; book changes frequently but not chaotically; trades print regularly; countdown is server-driven; fills update fast; status changes are obvious; resolving feels intentional; final result is unmistakable. Reconnect re-snapshots cleanly.

---

## 12. Bots

**Market maker:** larger balance; quotes both sides of the YES book; requotes periodically; keeps depth; cancels/replaces stale quotes; tracks oracle/strike probability; no nonsensical prices near expiry.

**Noisy takers:** ~20–50 (up to 100 if not spammy); periodic trades; lean YES above strike / NO below; more confident near expiry when far from strike; random noise for organic feel; populate the trades feed. Throttle for readability. Don't over-optimize realism.

---

## 13. Market lifecycle
open → bots quote/trade → user trades → countdown → **resolving** (new orders disabled) → oracle computes → **resolved** → settle balances/positions → UI shows won/lost + PnL → button to start a new 2-minute market.

---

## 14. Build order (protects the oracle)

1. Scaffold monorepo + **shared types/contracts** (the spine).
2. Deterministic lifecycle: open → resolving → resolved.
3. **Mock oracle / price stream** (everything downstream needs it).
4. Real WebSocket server + client.
5. Thin frontend: price, countdown, status (proves real-time feel on day one).
6. Basic CLOB + user order placement.
7. Market maker bot.
8. Order book / trades WS streams.
9. Signed position ledger + four-case settlement (+ unit tests).
10. **Deep oracle** (multi-venue sim, TWAP, stale/outlier handling, audit payload) — pulled *ahead of* heavy polish.
11. Oracle transparency panel + strike line + forming-resolution marker.
12. Noisy taker bots.
13. Frontend polish toward Figma/trading feel (time-boxed).
14. Hosted deploy.

> Oracle **research/design starts day one in parallel**, even though deep implementation lands at step 10. Never let the top criterion be last in line.
> README + design doc written continuously, not in the final hour.

---

## 15. Acceptance checklist (definition of done)
- [ ] Starts with one or two clear commands
- [ ] One BTC 2-minute market opens
- [ ] Live BTC/oracle price updates
- [ ] Countdown from server clock
- [ ] Status: open → resolving → resolved
- [ ] Order book real + live
- [ ] Recent trades live
- [ ] User can place YES and NO orders
- [ ] NO normalized into YES-book terms internally
- [ ] User orders fill against bots
- [ ] Balance + signed position update
- [ ] Collateral invariant holds (locked == OI × $1)
- [ ] Market maker keeps book populated; takers feel alive
- [ ] Oracle produces deterministic, auditable resolution object
- [ ] Oracle panel shows sources used/excluded
- [ ] UI shows final outcome + PnL/payout
- [ ] README explains setup/run
- [ ] Design doc deeply explains oracle methodology + tradeoffs
- [ ] Hosted demo is live and tradeable

---

## 16. Design doc outline (write alongside code)
1. Product/demo overview (what's real vs simulated)
2. System architecture (monorepo, REST vs WS)
3. CLOB/API design + shortcuts
4. Unified Market Structure (signed ledger, NO = 1 − YES, normalization, four cases, why simpler than dual-token)
5. WebSocket/realtime (public vs user streams, snapshot/delta, reconnect, server-authoritative clock)
6. Bot design (realistic vs fake)
7. **Oracle (deepest):** naive single-venue shortcomings · why short markets are manipulation-sensitive · venue selection · trade vs mid vs index · TWAP/windowing · aggregation/median · stale/missing/outlier handling · manipulation resistance · equality rule · displayed vs resolution · determinism/auditability · production improvements
8. Frontend/product decisions + tradeoffs
9. Future production: persistence, auth, signatures, risk engine, on-chain settlement, real venues, monitoring/replay

---

## 17. Things to avoid
- No Rust · no matching-engine micro-optimization · no multi-page app · no wallet/on-chain flows
- No reliance on live APIs without deterministic fallback
- No floats for money/positions · no bot spam that hurts readability
- Don't hide the oracle (make it visible) · don't treat WebSocket as optional · don't defer the design doc

---

## 18. Final narrative (what Jet should walk away with)
> "A focused, real-time 2-minute BTC prediction market demo built on one canonical YES order book with signed positions. It feels alive through WebSocket streams and simulated liquidity. Settlement is treated as a short-duration benchmark problem, not a price-feed lookup: RAMP_V1 resolves via a vetted multi-venue basket, robust median aggregation, a partitioned final-30s window, confidence scoring, stale/outlier rejection, and a dispersion circuit-breaker — with a fully replayable audit trail surfaced as a visible product feature. The goal isn't to make manipulation impossible, but to make profitable manipulation require moving broad market consensus across several liquid venues for a sustained period."
