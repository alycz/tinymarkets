# Demo Script

Use this path to show the intended reviewer experience end to end.

## 1. Start The App

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`, then click `Start Demo Market`.

Optional single-command mode:

```bash
pnpm demo
```

With `pnpm demo`, the bots start immediately and wait until the market is open.

## 2. Add Liquidity

If you started with `pnpm dev`, open a second terminal:

```bash
pnpm dev:bots
```

The market maker quotes both sides of the YES book. The taker process sends noisy IOC flow so trades and account updates move during the 2-minute market.

Default liquidity uses `market-maker-1` with three YES-book levels sized `50 / 100 / 150` and a 75-persona taker swarm (`taker-001` through `taker-075`). Takers submit normal `POST /orders` requests, including `BUY_NO` orders that the backend normalizes into SELL-YES orders at the complement price.

## 3. Show The Trading Loop

1. Observe the primary YES share-price chart and the separate BTC oracle reference price.
2. Observe the YES book moving as the market maker quotes.
3. Place a BUY YES order near the ask.
4. Place a BUY YES order below the ask and confirm it rests in open orders.
5. Place a BUY YES order at or above the ask and confirm it fills immediately instead of resting.
6. Place a BUY NO order against the bid and point out the complement mapping: buying NO at 38c sells YES at 62c.
7. Confirm the account panel updates available cash, reserved order funds, signed position, average entry, unrealized PnL, and OI collateral share.
8. Confirm recent trades update with trader, bought/sold side, side-specific price, size, and fill kind. These trades come from CLOB fills, not synthetic bot events.

## 4. Arm The Oracle Demo

Before expiry, click either:

- `Arm Spike Demo`: one simulated venue spikes near expiry.
- `Arm Subtle Demo`: one simulated venue drifts into a less obvious dislocation.

During the final 15 seconds, point out:

- The forming final-window weighted TWAP.
- The live indicative price remains separate from settlement.
- Dispersion and confidence update as venue quality changes.

## 5. Inspect Resolution

At resolution, inspect:

- Final `VENUE_WEIGHTED_TWAP_V1` reference price.
- Strict outcome rule: YES only if final price is above the strike.
- Trading is disabled, open orders are cancelled, and bots stop until a new market opens.
- User position at resolution.
- Actual payout and realized PnL.
- Sources used and excluded.
- Per-venue TWAPs and normalized weights.
- Quality flags and dispersion state.
- Replay `inputHash`.

The intended story is that a single stressed venue is either excluded or made visible through lower confidence/dispersion flags, while the final cleaned weighted-TWAP benchmark remains deterministic and auditable.

## 6. Restart

Click `Start Demo Market` again to begin a fresh 2-minute market. Bots keep waiting and resume quoting once the new market opens.
