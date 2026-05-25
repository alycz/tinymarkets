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

## 3. Show The Trading Loop

1. Observe the server countdown and live BTC indicative price.
2. Observe the YES book moving as the market maker quotes.
3. Place a BUY YES order near the ask.
4. Place a BUY NO order, or switch action/side to show the YES-book normalization.
5. Confirm the account panel updates available cash, reserved order funds, signed position, average entry, unrealized PnL, and OI collateral share.
6. Confirm recent trades update with side, price, size, and fill kind.

## 4. Arm The Oracle Demo

Before expiry, click either:

- `Arm Spike Demo`: one simulated venue spikes near expiry.
- `Arm Subtle Demo`: one simulated venue drifts into a less obvious dislocation.

During the final 30 seconds, point out:

- The forming final-window partitions.
- The live indicative price remains separate from settlement.
- Dispersion and confidence update as venue quality changes.

## 5. Inspect Resolution

At resolution, inspect:

- Final `RAMP_V1` reference price.
- Strict outcome rule: YES only if final price is above the strike.
- User position at resolution.
- Actual payout and realized PnL.
- Sources used and excluded.
- Source usage by partition.
- Quality flags and dispersion state.
- Replay `inputHash`.

The intended story is that a single stressed venue is either excluded or made visible through lower confidence/dispersion flags, while the final median-of-partitions benchmark remains deterministic and auditable.

## 6. Restart

Click `Start Demo Market` again to begin a fresh 2-minute market. Bots keep waiting and resume quoting once the new market opens.
