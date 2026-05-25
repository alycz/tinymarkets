# Design Document

This app is a local 2-minute BTC binary prediction market demo. The important choices are the single canonical YES book, the signed-position ledger, server-authoritative realtime state, and the `RAMP_V1` oracle.

## 1. Product / Demo Overview

The product is a single local market:

> Will BTC/USD be above $100,000 in 2 minutes?

From the web app, a user can start a demo market, watch the server countdown, place YES or NO limit orders, see balances and signed positions update, follow the live order book and trades feed, and view the final resolution and personal PnL. The UI also exposes the oracle method, venue health, dispersion, confidence, forming final-window partitions, final sources used/excluded, and the replay input hash.

The app runs locally with:

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the API and web app. Liquidity is added by running the market maker and takers in separate terminals:

```bash
pnpm --filter @jet/bots dev
pnpm --filter @jet/bots dev:takers
```

What is real:

- The REST and WebSocket server.
- The in-memory CLOB and matching logic.
- The signed-position ledger and four fill classifications.
- The RAMP_V1 calculation over deterministic simulated venue quotes.
- The browser UI, WebSocket subscriptions, order entry, and settlement display.

What is simulated:

- BTC venue feeds are deterministic simulated adapters, not live exchange connections.
- Balances are fake demo cash.
- Users are unauthenticated string ids.
- Bots are local processes.
- There is no persistence, wallet, signature flow, custody, or on-chain settlement.

The manipulation demo is also simulated. Pressing `Arm Spike Demo` changes the oracle scenario to a near-expiry single-venue spike. The point is to show that this implementation resists that specific one-venue spike through median aggregation and outlier exclusion. It is not a claim that manipulation is impossible.

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
  oracle/       RAMP_V1 and deterministic simulated venue adapters
```

`@jet/shared` is the contract spine. Domain types, REST response shapes, WebSocket events, branded integer units, orders, trades, positions, and oracle payloads are defined there and imported by every other package.

The API process owns the active `MarketSession`. That session holds the active market config/status, CLOB, market core, oracle instance, recent-trades ring buffer, and known users. The server is authoritative for market status, countdown, order book, balances, positions, oracle snapshots, and final resolution.

REST is used for commands and one-shot snapshots:

- `GET /markets/current`
- `POST /markets/start-demo`
- `GET /markets/:marketId`
- `GET /markets/:marketId/orderbook`
- `GET /markets/:marketId/trades`
- `GET /users/:userId`
- `GET /users/:userId/positions`
- `POST /orders`
- `POST /orders/:orderId/cancel`
- `POST /markets/:marketId/oracle/demo-spike`

WebSocket is used for all live streams at `/ws`. Clients subscribe to typed channel strings:

- `market:<id>`
- `book:<id>`
- `trades:<id>`
- `oracle:<id>`
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

The API validates the cheap boundary conditions that matter for the demo: integer prices in 1..99, positive integer sizes, supported side/action/type/TIF, matching market id, open market status, known order on cancel, and cancel ownership. It does not implement authentication, signatures, fee accounting, persistence, risk limits, or conservative order reservation.

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

The demo exposes this as an "OI collateral share" per user. That display is a simplified allocation used to preserve the global invariant, not exact price-basis collateral for each trader. A production ledger should track the actual collateral basis paid by each side at each fill price.

This structure is better than dual YES/NO token books for the demo because it avoids fragmented liquidity and duplicated matching logic. Users can still trade YES and NO in the UI, but the engine only has one price ladder and one net position per user per market. Transfers and closes become accounting classifications rather than separate token flows across two books.

## 5. WebSocket / Realtime Design

REST is not used for live polling. The client opens `/ws`, subscribes to channels, and reduces server events into local UI state.

Public channels:

- `market:<id>` sends `market:status` and `market:resolved`.
- `book:<id>` sends `book:snapshot` and `book:delta`.
- `trades:<id>` sends `trade:created`.
- `oracle:<id>` sends `oracle:price`.

User channel:

- `user:<id>` sends `user:balance`, `user:position`, `user:fill`, and `user:resolution`.

On subscription, the server sends catch-up state where available. For market status it sends current status and, if already resolved, the resolution. For the book it sends a fresh snapshot. For trades it replays recent trades from the ring buffer. For oracle it sends the latest indicative snapshot. For user state it sends current balance and position.

Book snapshots and deltas carry a monotonic `seq`. The web client applies deltas only when the next sequence is exactly `current + 1`; on a gap it unsubscribes and re-subscribes to force a fresh snapshot. On WebSocket reconnect, hooks re-subscribe and receive catch-up snapshots again.

The server clock is authoritative. `market:status` includes `msRemaining`, `expiryMs`, and `serverTs`; the client renders those values instead of running its own market lifecycle.

## 6. Bot Design

There are two bot processes.

The market maker waits until an open market exists, subscribes to market/oracle/book/user channels, and quotes a symmetric ladder on the YES book. It computes a fair YES probability from the indicative BTC price, strike, time remaining, and a configurable base sigma. It then places bids and asks around that fair value, cancels stale levels, and requotes periodically or when oracle updates arrive. It stops quoting when the market enters `resolving` or `resolved`.

The noisy taker process starts multiple personas. Defaults are 30 takers, clamped to 1..100. Takers subscribe to the book, market, and oracle channels, track best bid/ask, compute the same fair YES probability, and occasionally submit IOC BUY orders. They lean YES when fair YES is higher and NO when fair YES is lower, with random persona lean, optional fading behavior, small sizes, jittered intervals, and a global token-bucket rate limit.

What is realistic:

- Bots react to the oracle/strike relationship.
- The market maker keeps depth around fair value.
- Takers cross the spread through IOC orders and make the trade feed move.
- Near expiry, takers become more conservative about bad prices.

What is fake:

- There is no inventory risk model, liquidation, hedging, fee model, exchange latency model, or persistent bot identity.
- The taker personas use `Math.random`, so their behavior is organic but not replayable.
- The market maker does not model adverse selection beyond a simple probability curve.

## 7. Oracle Design - RAMP_V1

`RAMP_V1` means Robust Adaptive Multi-venue Price oracle. It treats settlement as a short-duration benchmark problem, not a lookup of one price tick.

### Why Naive Settlement Fails

For a 2-minute binary market, a single venue or single instant is the worst possible settlement surface. The payoff is discontinuous at the threshold: one cent above the strike pays YES, one cent below pays NO. If settlement uses one venue's last trade or one instant's top of book, an attacker does not need to move the real BTC/USD market for long. They only need to move the selected signal at the selected moment.

That is the Polymarket-style last-second manipulation problem: a short-duration market can be flipped by a late, localized price move if the resolution rule listens to a fragile venue/time pair. A January 2026 XRP example was reported as a trader buying "UP" shares and then making a late XRP spot purchase before settlement ([CoinDesk, Jan. 19, 2026](https://www.coindesk.com/markets/2026/01/19/polymarket-trader-nets-usd233-000-in-a-daring-weekend-move-in-xrp-markets-outsmarting-bots)); Polymarket's related XRP up/down markets also stated that settlement was based on a Chainlink XRP/USD data stream rather than general spot-market consensus ([example market](https://polymarket.com/event/xrp-updown-15m-1767474900)).

The implemented demo is designed around resistance to that failure mode. It makes an attacker move consensus across multiple venues and a meaningful fraction of the final window, while making bad venue data visible in the resolution payload.

### Why Existing Oracle Patterns Are Not Enough Here

UMA-style optimistic oracle resolution is too slow for this product shape. It is designed for dispute windows and human/governance escalation. That can work for slower markets, but it breaks the immediate resolution experience of a 2-minute trading demo. It also moves manipulation risk into dispute incentives and governance, which is outside this app.

A single Chainlink-style instant tick is better than a single exchange print because the upstream feed may already aggregate sources, but the instant still has timing risk. If the decisive market is "above $X at expiry", a one-tick read can still be unlucky or attacked around the boundary. The demo needs a short benchmark window, not just a better tick.

Long EMA smoothing solves the opposite problem. It dampens momentary spikes, but for a 2-minute market a long EMA can be stale enough to settle against a price users no longer recognize. The app needs a final-window reference that is responsive but robust.

### Methodology

The final settlement window is the last 30 seconds before expiry, split into six 5-second partitions. Within each partition, each venue contributes a mid-price TWAP:

```text
mid = floor((bestBid + bestAsk) / 2)
```

The implementation uses stair-step TWAP. A quote at or before the partition start fills from the start, then new quotes update the integral until partition end.

The demo's deterministic venue set currently includes:

- USD venues: `coinbase`, `kraken`, `bitstamp`, `gemini`
- USDT venue: `binance`, with a static basis adjustment in the simulator

The type system and config also name more intended USD/USDT venues, but the built scenario uses five simulated venues. USD-first matters because the contract question is BTC/USD. A USDT venue carries basis risk: BTC/USDT can diverge from BTC/USD during a USDT dislocation. In this demo, the USDT venue is basis-adjusted and its quote currency is shown in the oracle panel; production should treat USDT sources more carefully than direct USD venues.

For each 5-second partition:

1. Compute each venue's mid-price TWAP.
2. Exclude unhealthy venues.
3. Compute the equal-weight median of surviving venue TWAPs.

Across the six partitions:

1. Collect the six partition prices.
2. Use the median of those partition prices as the final resolution price.

The median across partitions is deliberate. CME-style reference rates often use means because they are measuring an average traded price over a window. This app is doing binary threshold classification under adversarial timing. A mean gives every spiked partition linear influence. A median requires an attacker to move a majority of the partition prices, not only a late tail of the window.

The tests include a case where two high final partitions flip a mean above the threshold while the median remains below it. That is the intended divergence from a mean-based benchmark.

### Exclusions

A venue can be excluded for:

- `MISSING`: no quote touching the partition.
- `STALE`: latest observable quote at partition end is older than `ORACLE.staleMs`, currently 3 seconds.
- `CROSSED_BOOK`: bid is greater than or equal to ask.
- `WIDE_SPREAD`: spread TWAP exceeds `ORACLE.wideSpreadBps`, currently 15 bps.
- `OUTLIER`: deviation from the cross-venue median exceeds `max(10 bps, 3 * MAD)`.

MAD is median absolute deviation among candidate venue TWAPs. Using MAD makes the outlier rule adapt to current cross-venue dispersion instead of relying only on a fixed band.

The config requires at least three valid venues. In the current implementation, a partition with too few valid venues is still priced from available data, but the window-level resolution is marked `DISLOCATED`. Production should decide whether that state extends the window, pauses settlement, or triggers a refund/dispute path.

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

`confidenceBps` is output-only. It is not an aggregation weight. That is important: a weighted scheme is gameable if an attacker can make a controlled venue look tight, fast, and "confident" to buy extra influence. A median cannot be bought that way. A venue either survives inclusion checks and gets one vote in the ordering, or it is excluded.

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

The output is a full `RampResolution` object:

- method and rule version,
- threshold and expiry timestamp,
- window definition,
- partition prices and venue counts,
- resolution price and outcome,
- confidence and dispersion state,
- sources used,
- sources excluded with reasons and outlier deviations,
- `inputHash`.

`inputHash` is a SHA-256 hash of canonical sorted input samples. Samples are sorted by timestamp, venue, bid, and ask, then serialized into compact JSON. That makes a resolution replayable from the same input samples and rule version.

### Manipulation Demo

The `NEAR_EXPIRY_SPIKE` scenario replaces the simulated Binance adapter with one that spikes +1500 bps in the last 5-second partition. The oracle tests assert that Binance is excluded as an outlier and that the outcome matches the honest baseline for that scenario.

The web button `Arm Spike Demo` calls `POST /markets/:marketId/oracle/demo-spike`. The response type allows an optional `attackCostEstimate`, and the UI can display one, but the current API path does not populate that estimate. The built demo is therefore about venue exclusion, partitioning, and replay transparency, not a measured or simulated liquidity-cost calculation.

### Production Improvements

The production version should add real venue adapters with authenticated data capture, durable raw sample storage, replay tooling, monitoring for stale/crossed/wide data, explicit USDT basis handling, a documented action for DISLOCATED states, independent rule-version governance, and external audits of the resolution implementation. For real money, settlement should also have a signed input log and a dispute process around data availability or adapter failure.

## 8. Frontend / Product Decisions

The frontend is a single dense market page rather than a landing page. It prioritizes the trading loop:

- Market question, strike, status, countdown, and WebSocket status at the top.
- BTC/USD indicative chart with a toggleable strike line.
- Trade ticket for YES/NO BUY/SELL limit orders.
- Account panel with available cash, reserved order funds, OI collateral share, position, average entry, and unrealized PnL.
- YES book ladder showing YES and complementary NO prices.
- Recent trades with side, price, size, and fill kind.
- Oracle panel with method, final-window countdown, live indicative price, dispersion, confidence, venue health, forming resolution partitions, final resolution, sources used/excluded, input hash, and user PnL.

The chart's live price is the indicative oracle price, not the settlement price. During the final 30 seconds, the oracle snapshot can include `formingResolution`, and the panel shows the forming partition median separately. This split is intentional: users need a responsive displayed price for trading, but settlement uses the final-window benchmark.

The main tradeoff is simplicity. The UI shows the real mechanics that exist, but avoids features the backend does not support: order history, deposits, auth, wallet connection, persistence, fees, and risk limits.

## 9. Future Production Considerations

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
