# Design Document

This app is a local 2-minute BTC binary prediction market demo. The important choices are the single canonical YES book, the signed-position ledger, server-authoritative realtime state, and the `VENUE_WEIGHTED_TWAP_V1` oracle.

## 1. Product / Demo Overview

The product is a single local market:

> Will BTC/USD be above $100,000 in 2 minutes?

From the web app, a user can start a demo market, watch the server countdown, place YES or NO limit orders, see balances and signed positions update, follow the live order book and trades feed, and view the final resolution and personal PnL. The UI also exposes the oracle method, venue health, dispersion, confidence, forming final-window TWAP, final sources used/excluded, per-venue weights, and the replay input hash.

The app runs locally with:

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the API and web app with local defaults; no env exports are required. Liquidity is added by running the market maker and takers in another terminal:

```bash
pnpm dev:bots
```

`pnpm demo` starts API, web, market maker, and takers together. The bots can start before the market is open because they wait for an open market.

What is real:

- The REST and WebSocket server.
- The in-memory CLOB and matching logic.
- The signed-position ledger and four fill classifications.
- The VENUE_WEIGHTED_TWAP_V1 calculation over deterministic simulated venue quotes.
- The browser UI, WebSocket subscriptions, order entry, and settlement display.

What is simulated:

- BTC venue feeds are deterministic simulated adapters, not live exchange connections.
- Balances are fake demo cash.
- Users are unauthenticated string ids.
- Bots are local processes.
- There is no persistence, wallet, signature flow, custody, or on-chain settlement.

`DEMO_MODE=live` and `DEMO_MODE=hybrid` are accepted for future compatibility, but currently retain deterministic simulated venues so the demo remains reliable. Real live exchange adapters are production/future work.

The manipulation demo is also simulated. The oracle controls can arm either a near-expiry single-venue spike or a subtler single-venue dislocation. The point is to show that this implementation resists those one-venue stresses through multi-venue aggregation, final-window TWAP, static weight normalization, and outlier exclusion. It is not a claim that manipulation is impossible.

## 2. System Architecture

The repository is a pnpm TypeScript monorepo:

```text
apps/
  api/          Fastify REST + WebSocket server
  web/          React + Vite single market page
  bots/         Market maker and noisy takers
packages/
  shared/       Domain types, REST DTOs, WebSocket protocol
  config/       Tunable constants
  clob/         In-memory YES order book and matching
  market-core/  Signed positions, collateral accounting, settlement
  oracle/       VENUE_WEIGHTED_TWAP_V1 and deterministic simulated venue adapters
```

`@jet/shared` is the contract spine. Domain types, REST response shapes, WebSocket events, branded integer units, orders, trades, positions, and oracle payloads are defined there and imported by every other package.

The API process owns the active `MarketSession`. That session holds the active market config/status, CLOB, market core, oracle instance, recent-trades ring buffer, and known users. The server is authoritative for market status, countdown, order book, balances, positions, oracle snapshots, and final resolution.

REST is used for commands and one-shot snapshots:

- `GET /markets/current`
- `POST /markets/start-demo`
- `GET /markets/:marketId`
- `GET /markets/:marketId/orderbook`
- `GET /markets/:marketId/trades`
- `GET /markets/:marketId/share-price-series`
- `GET /markets/:marketId/oracle-series`
- `GET /users/:userId`
- `GET /users/:userId/balance`
- `GET /users/:userId/positions`
- `GET /users/:userId/orders`
- `POST /orders`
- `POST /orders/:orderId/cancel`
- `POST /markets/:marketId/oracle/demo`
- `POST /markets/:marketId/oracle/demo-spike`

WebSocket is used for all live streams at `/ws`. Clients subscribe to typed channel strings:

- `market:<id>`
- `book:<id>`
- `trades:<id>`
- `oracle:<id>`
- `share:<id>`
- `user:<id>`

Public market data and user-specific state are intentionally separate channels.

## 3. CLOB / API Design

The CLOB is one canonical YES order book. Bids are BUY-YES orders sorted by price descending. Asks are SELL-YES orders sorted by price ascending. Orders at the same price keep insertion order, giving price-time priority.

The public order API accepts user-facing intent:

- `side`: `YES` or `NO`
- `action`: `BUY` or `SELL`
- `type`: currently `LIMIT`
- `priceCents`: integer 1..99, expressed in the selected side's terms
- `size`: positive integer shares
- `tif`: `GTC` or `IOC`

The CLOB normalizes every order into YES-book terms before matching:

```text
Buy  YES @ p -> bid YES @ p
Sell YES @ p -> ask YES @ p
Buy  NO  @ p -> ask YES @ 100 - p
Sell NO  @ p -> bid YES @ 100 - p
```

Matching produces raw `Match` records. `@jet/market-core` then classifies those into public trades and private fills based on the pre-trade signed positions of the two parties. Public trades are appended to a 100-item in-memory ring buffer and broadcast on `trades:<marketId>`.

The API validates the cheap boundary conditions that matter for the demo: integer prices in 1..99, positive integer sizes, supported side/action/type/TIF, matching market id, open market status, known order on cancel, and cancel ownership. It tracks resting-order reserves separately from settlement collateral and releases them on cancel, fill, and resolution cleanup. It does not implement authentication, signatures, fee accounting, persistence, or production risk limits.

## 4. Unified Market Structure

The app uses one signed-position ledger:

- `+N`: long N YES
- `-N`: long N NO
- `0`: flat

NO is not a separate book or token in the engine. It is the complement of YES: `NO price = 100 - YES price`.

Every execution is interpreted as:

> buyer buys YES from seller at YES price p

The fill kind is determined from the buyer and seller positions before the fill segment:

```text
buyer >= 0, seller <= 0 -> OPEN
buyer >= 0, seller >  0 -> TRANSFER_YES
buyer <  0, seller <= 0 -> TRANSFER_NO
buyer <  0, seller >  0 -> CLOSE
```

The four kinds drive collateral and open interest:

- `OPEN`: both parties increase exposure. The YES buyer pays `p * size`; the NO buyer pays `(100 - p) * size`; open interest increases.
- `TRANSFER_YES`: a YES position changes hands. Buyer pays seller `p * size`; open interest is unchanged.
- `TRANSFER_NO`: a NO position changes hands. Buyer receives `(100 - p) * size`; open interest is unchanged.
- `CLOSE`: a YES and NO cancel. Buyer receives `(100 - p) * size`; seller receives `p * size`; open interest decreases.

A single match can cross zero for one or both parties. The implementation splits the match at zero crossings into one or more segments before applying accounting. For example, a buyer moving from `-2` to `+3` on a 5-share YES buy is split into the first 2 shares reducing the NO position and the next 3 shares growing YES exposure.

The invariant is:

```text
total locked collateral == openInterest * $1
```

The demo exposes this as an "OI collateral share" per user. That display is a simplified allocation used to preserve the global invariant, not exact price-basis collateral for each trader. Resting-order reserves are shown separately as reserved funds. A production ledger should track the actual collateral basis paid by each side at each fill price.

This structure is better than dual YES/NO token books for the demo because it avoids fragmented liquidity and duplicated matching logic. Users can still trade YES and NO in the UI, but the engine only has one price ladder and one net position per user per market. Transfers and closes become accounting classifications rather than separate token flows across two books.

## 5. WebSocket / Realtime Design

REST is not used for live polling. The client opens `/ws`, subscribes to channels, and reduces server events into local UI state.

Client messages are JSON commands:

```json
{
  "type": "subscribe",
  "channels": [
    "market:btc-2m",
    "book:btc-2m",
    "trades:btc-2m",
    "oracle:btc-2m",
    "share_price:btc-2m",
    "user:demo:btc-2m"
  ]
}
```

`unsubscribe` uses the same channel shape. `ping` receives `pong` with server time.

Public channels:

- `market:<id>` sends `market_snapshot`, `market_status`, `countdown`, and `resolution`. The snapshot includes the market, current book, recent trades, latest oracle tick, latest YES share price, and countdown.
- `book:<id>` sends `orderbook_snapshot` and `orderbook_delta`.
- `trades:<id>` sends `trades_snapshot` and `trade`.
- `oracle:<id>` sends `oracle_series_snapshot` and `oracle_price`.
- `share_price:<id>` sends `share_price_snapshot` and `share_price` points for YES share trades, midpoints, and marks.

User channel:

- `user:<userId>:<id>` sends `balance_snapshot`, `position_snapshot`, `open_orders_snapshot`, `open_order`, `order_cancelled`, `fill`, `position_update`, `balance_update`, and `pnl_update`.

For migration compatibility, the server also accepts the legacy aliases `share:<id>` and `user:<userId>`.

BTC/USD oracle price and YES share price are separate streams. `oracle_price` carries the underlying BTC/USD input used by the oracle and resolution. `share_price` carries the traded prediction-market YES price in cents from 1 to 99; NO is always `100 - YES`.

On subscription, the server sends catch-up state where available. For market status it sends a rich snapshot, current status, countdown, and, if already resolved, the resolution. For the book it sends a fresh snapshot. For trades, oracle history, and share prices it sends snapshot events. For user state it sends current balance, position, and open orders. After those snapshots, clients reduce deltas and events.

Book snapshots and deltas carry a monotonic `seq`. Mutating order-book operations advance the sequence; snapshots report the current sequence and do not consume one. The web client applies deltas only when the next sequence is exactly `current + 1`; on a gap it unsubscribes and re-subscribes to force a fresh snapshot. On WebSocket reconnect, hooks re-subscribe and receive catch-up snapshots again.

Incoming WebSocket messages receive lightweight runtime validation. Invalid JSON, non-object messages, unknown message types, unsupported channels, and oversized subscription batches receive typed error events instead of mutating subscriptions. The server also uses heartbeat checks to clean up dead sockets.

The server clock is authoritative. `market_status` and `countdown` include `msRemaining`, `expiryMs`, and `serverTs`; the client renders those values instead of running its own market lifecycle.

## 6. Bot Design

There are two bot processes.

The market maker waits until an open market exists, subscribes to market/oracle/book/user channels, and quotes a symmetric ladder on the YES book as `market-maker-1`. It computes a fair YES probability from BTC distance to strike, time remaining, and a configurable volatility scale, then clamps that probability to `2..98` cents. Each tick it reconciles server-side open orders, cancels stale or duplicate levels, and tops up missing depth. Defaults are three levels per side sized `50 / 100 / 150`, a 5-cent base spread, 1-second requotes, and immediate requotes when fair value moves by at least 2 cents. It stops quoting when the market enters `resolving` or `resolved`.

The noisy taker process runs one swarm scheduler over multiple personas. Defaults are 75 takers named `taker-001` through `taker-075`, clamped to 50..100. Every 250..1500ms the scheduler chooses one persona, compares fair YES to the current book mid, and sends an IOC `BUY_YES` or `BUY_NO` order. `BUY_NO` uses the complement price and is normalized by the backend into a SELL-YES order, so it fills against YES bids. Each persona has a 20..35% contrarian probability, 0..2 cents of marketable slippage, and random 1..25 share sizes weighted toward small trades. Empty, stale, or crossed local books are skipped; crossed books trigger a fresh book snapshot.

All bot activity goes through the same `POST /orders` endpoint as the UI. Bots never write recent trades, order-book levels, or YES share-price chart points directly; those update only from backend CLOB matches and market-session broadcasts.

What is realistic:

- Bots react to the oracle/strike relationship.
- The market maker keeps depth around fair value.
- Takers cross the spread through IOC orders and make the trade feed move.
- Near expiry, takers become more conservative about bad prices.

What is fake:

- There is no inventory risk model, liquidation, hedging, fee model, exchange latency model, or persistent bot identity.
- The taker personas use `Math.random`, so their behavior is organic but not replayable.
- The market maker does not model adverse selection beyond a simple probability curve.

## 7. Oracle Design - VENUE_WEIGHTED_TWAP_V1

`VENUE_WEIGHTED_TWAP_V1` treats settlement as a short-duration benchmark problem, not a lookup of one price tick. BTC/USD is the oracle input; the YES/NO share price is the traded market price and never determines settlement.

### Why Naive Settlement Fails

For a 2-minute binary market, a single venue or single instant is the worst possible settlement surface. The payoff is discontinuous at the threshold: one cent above the strike pays YES, one cent below pays NO. If settlement uses one venue's last trade or one instant's top of book, an attacker does not need to move the real BTC/USD market for long. They only need to move the selected signal at the selected moment.

That is the Polymarket-style last-second manipulation problem: a short-duration market can be flipped by a late, localized price move if the resolution rule listens to a fragile venue/time pair. A January 2026 XRP example was reported as a trader buying "UP" shares and then making a late XRP spot purchase before settlement ([CoinDesk, Jan. 19, 2026](https://www.coindesk.com/markets/2026/01/19/polymarket-trader-nets-usd233-000-in-a-daring-weekend-move-in-xrp-markets-outsmarting-bots)); Polymarket's related XRP up/down markets also stated that settlement was based on a Chainlink XRP/USD data stream rather than general spot-market consensus ([example market](https://polymarket.com/event/xrp-updown-15m-1767474900)).

The implemented demo is designed around resistance to that failure mode. It makes an attacker move consensus across multiple venues and a meaningful fraction of the final window, while making bad venue data visible in the resolution payload.

### Why Existing Oracle Patterns Are Not Enough Here

UMA-style optimistic oracle resolution is too slow for this product shape. It is designed for dispute windows and human/governance escalation. That can work for slower markets, but it breaks the immediate resolution experience of a 2-minute trading demo. It also moves manipulation risk into dispute incentives and governance, which is outside this app.

A single Chainlink-style instant tick is better than a single exchange print because the upstream feed may already aggregate sources, but the instant still has timing risk. If the decisive market is "above $X at expiry", a one-tick read can still be unlucky or attacked around the boundary. The demo needs a short benchmark window, not just a better tick.

Long EMA smoothing solves the opposite problem. It dampens momentary spikes, but for a 2-minute market a long EMA can be stale enough to settle against a price users no longer recognize. The app needs a final-window reference that is responsive but robust.

### Methodology

The final settlement window is the last 15 seconds before expiry. Each venue contributes one mid-price TWAP over that window:

```text
mid = floor((bestBid + bestAsk) / 2)
```

The implementation uses stair-step TWAP. A quote at or before the window start fills from the start, then new quotes update the integral until expiry.

The demo's deterministic venue set currently includes:

- USD venues: `coinbase`, `kraken`, `bitstamp`
- USDT venues: `binance`, `okx`, with static basis adjustments in the simulator

The configured static weights are Coinbase 30%, Binance 30%, Kraken 20%, OKX 10%, and Bitstamp 10%. USD-first matters because the contract question is BTC/USD. USDT venues carry basis risk: BTC/USDT can diverge from BTC/USD during a USDT dislocation. In this demo, USDT venues are basis-adjusted and their quote currency is shown in the oracle panel; production should treat USDT sources more carefully than direct USD venues.

Final resolution:

1. Compute each venue's final-window mid-price TWAP.
2. Exclude missing, stale, crossed-book, and wide-spread venues.
3. Compute the median of remaining venue TWAPs.
4. Exclude any venue deviating by more than `max(25 bps, $100)` from that median.
5. Normalize the static weights over survivors.
6. Compute the weighted mean of surviving venue TWAPs.
7. Round to cents and compare against the threshold.

The live displayed BTC/oracle price uses the same methodology family but on latest venue mids: health gates, outlier rejection, static weight normalization, and a weighted aggregate. It is only an indicative reference. Final settlement uses the expiry-anchored 15-second TWAP.

### Exclusions

A venue can be excluded for:

- `MISSING`: no quote touching the final window.
- `STALE`: latest observable quote at window end is older than `ORACLE.staleMs`, currently 3 seconds.
- `CROSSED_BOOK`: bid is greater than or equal to ask.
- `WIDE_SPREAD`: spread TWAP exceeds `ORACLE.wideSpreadBps`, currently 15 bps.
- `OUTLIER`: deviation from the cross-venue median exceeds `max(25 bps, $100)`.

The config requires at least two valid venues. If fewer than two venues survive, the demo uses a deterministic simulated aggregate fallback from available TWAPs and marks `FALLBACK_SIMULATED_AGGREGATE`, `INSUFFICIENT_VALID_VENUES`, and `DISLOCATED` quality. That is intentional surfacing, not silent acceptance. Production should decide whether that state extends the window, pauses settlement, triggers a refund, or opens a dispute path.

### Dispersion, Confidence, And Circuit Breaker

The oracle has one main quality signal: cross-venue dispersion.

The same signal has three readouts:

- A venue with excessive deviation can be excluded.
- Residual dispersion becomes the output confidence band.
- Window-level dispersion becomes the circuit-breaker state.

The circuit-breaker states are configured in bps:

```text
NORMAL      < 5 bps
ELEVATED   >= 5 bps
STRESSED   >= 12 bps
DISLOCATED >= 25 bps
```

`confidenceBps` is output-only. It is not an aggregation weight. Venue influence comes only from the documented static weights, which are normalized after exclusions and included in the final resolution payload.

The confidence label is:

- `HIGH` in normal conditions.
- `MEDIUM` when dispersion is elevated.
- `LOW` when dispersion is stressed/dislocated or the resolution price is near the threshold.

Near-threshold confidence is output-only too. It flags that the binary outcome is close to the oracle's uncertainty band, but it does not change the rule.

### Threshold Rule

The market question says "above $X", so the resolution rule is strict:

```text
YES iff resolutionPriceCents > thresholdCents
otherwise NO
```

A tie or exact threshold resolves to NO. If the final price is within the confidence band of the threshold, the market still resolves by the strict rule and marks confidence LOW.

### Determinism And Auditability

Resolution is built by a pure function over:

- market config,
- venue adapters,
- settlement timestamp,
- oracle config.

The output is a full `VenueWeightedTwapResolution` object. It includes the required methodology shape:

```json
{
  "market_id": "btc-above-100000",
  "expiry_ts": 1710000000,
  "threshold": 100000,
  "resolution_price": 100123.42,
  "outcome": "YES",
  "method": "VENUE_WEIGHTED_TWAP_V1",
  "sources_used": ["coinbase", "binance", "kraken"],
  "sources_excluded": [{ "venue": "okx", "reason": "STALE" }]
}
```

The app also carries audit/display fields:

- method and rule version,
- threshold and expiry timestamp,
- window definition,
- per-venue final-window TWAPs,
- static weights and normalized weights,
- resolution price and outcome,
- confidence and dispersion state,
- quality flags,
- sources used,
- sources excluded with reasons and outlier deviations,
- `inputHash`.

`sourcesUsed` means a venue contributed to the final weighted TWAP. `sourcesExcluded` records every venue removed by health or outlier checks.

`inputHash` is a SHA-256 hash of canonical resolution-affecting inputs. It covers every sample fetched for settlement replay, including the stale lead-in interval from `windowStart - staleMs` through `windowEnd`, plus venue IDs and quote currencies, market ID, threshold, expiry timestamp, rule version, oracle config values, and the effective aggregation method. Samples and metadata are sorted before hashing so adapter/sample ordering does not change the hash.

### Manipulation Demo

The `NEAR_EXPIRY_SPIKE` scenario replaces the simulated Binance adapter with one that spikes +1500 bps in the final 5 seconds. The oracle tests assert that Binance is excluded as an outlier and that the outcome remains driven by surviving venue consensus.

The `SUBTLE_DISLOCATION` scenario moves one venue roughly 20 bps near expiry across the final window. It is meant to show a less cartoonish stress case: one venue can create visible dispersion or outlier exclusions, but the final cleaned weighted TWAP remains deterministic and auditable.

The web controls call `POST /markets/:marketId/oracle/demo` with either `NEAR_EXPIRY_SPIKE` or `SUBTLE_DISLOCATION`. The legacy `POST /markets/:marketId/oracle/demo-spike` route remains as a compatibility wrapper for the spike scenario. The response type allows an optional `attackCostEstimate`, and the UI can display one, but the current API path does not populate that estimate. The built demo is therefore about venue exclusion, weight normalization, final-window TWAP, and replay transparency, not a measured or simulated liquidity-cost calculation.

### Production Improvements

The production version should add real venue adapters with authenticated data capture, durable raw sample storage, replay tooling, monitoring for stale/crossed/wide data, explicit USDT basis handling, a documented action for DISLOCATED states, independent rule-version governance, and external audits of the resolution implementation. For real money, settlement should also have a signed input log and a dispute process around data availability or adapter failure.

## 8. Frontend / Product Decisions

The frontend is a single dense market page rather than a landing page. It prioritizes the trading loop:

- Market question, strike, status, countdown, and WebSocket status at the top.
- Primary YES share-price / implied-probability chart with current YES/NO prices and best bid/ask.
- Compact BTC/USD oracle reference chart with the strike line.
- Trade ticket for YES/NO BUY/SELL limit orders.
- Account panel with available cash, reserved order funds, OI collateral share, position, average entry, and unrealized PnL.
- YES book ladder showing YES and complementary NO prices.
- Recent trades with side, price, size, and fill kind.
- Oracle panel with method, final-window countdown, live indicative price, dispersion, confidence, venue health, forming weighted TWAP, final resolution, quality flags, sources used/excluded, per-venue TWAPs, normalized weights, input hash, and user PnL.

The primary chart's live price is the traded YES share price, not BTC/USD. The BTC/USD reference chart and oracle panel are separate because BTC is the underlying oracle input, while YES shares are the market being traded. During the final 15 seconds, the oracle snapshot can include `formingResolution`, and the panel shows the forming weighted TWAP separately; final settlement still uses the final-window benchmark, not the share chart.

The main tradeoff is simplicity. The UI shows the real mechanics that exist, but avoids features the backend does not support: deposits, auth, wallet connection, persistence, fees, and production risk limits.

## 9. Known Simplifications

- In-memory only; no database or durable replay store.
- Fake balances and unauthenticated string user ids.
- No wallet, signature, custody, or on-chain settlement flow.
- Simulated venue feeds are implemented; live exchange adapters are future work.
- OI collateral share is a simplified display, not exact per-fill collateral basis.
- No fee, liquidation, margin, or production risk system.
- Bots are intentionally approximate local liquidity.
- `DISLOCATED` still resolves by the strict demo rule. Production should define pause, extension, refund, or dispute behavior.

## 10. Future Production Considerations

The current app is an in-memory local demo. A production version would need:

- Persistence for markets, orders, trades, balances, positions, raw oracle samples, WebSocket replay, and resolutions.
- Authentication and per-user authorization.
- Client order signatures or authenticated sessions.
- Balance reservation for resting orders, risk checks, order limits, self-trade policy, and abuse controls.
- Durable sequencing and replay for book deltas and user events.
- Real exchange adapters, adapter health monitoring, clock synchronization, and raw input archival.
- Explicit oracle incident handling for DISLOCATED markets.
- Fees, settlement accounting, withdrawals, and reconciliation.
- On-chain settlement or a custody ledger, depending on the product direction.
- Operational monitoring, alerting, dashboards, and deterministic replay tools for incidents.

Those are intentionally out of scope for this repo. The demo focuses on the market mechanics, realtime feel, and oracle design.
