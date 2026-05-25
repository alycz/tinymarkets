# Submission Checklist

Run this before handing off the repo.

## Local Verification

- `pnpm install` works from a fresh clone.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm dev` starts API and web with no env exports.
- `http://localhost:5173` loads the market page.
- `Start Demo Market` creates a 2-minute market.

## Demo Verification

- `pnpm dev:bots` starts the market maker and takers.
- `pnpm demo` starts API, web, market maker, and takers together.
- Market maker quotes both sides of the book.
- Takers create recent trade flow.
- User can place YES and NO orders.
- BUY YES below the ask rests as an open order.
- BUY YES at or above the ask fills immediately.
- BUY NO crosses by complement logic through the canonical YES book, not a separate NO book.
- Trades, fills, balance, reserved funds, signed position, and PnL update.
- YES share-price chart remains in the 1-99 cent range and is visually separate from the BTC/oracle reference chart.
- Recent trades come from CLOB fills, not synthetic bot writes.
- `Arm Spike Demo` works.
- `Arm Subtle Demo` works.
- At expiry, trading is disabled, open orders are cancelled, and bots stop until a new market opens.
- Final resolution shows outcome, reference price, payout, realized PnL, sources used/excluded, per-venue TWAPs, normalized weights, quality flags, and input hash.

## Documentation Verification

- `README.md` gives a clear reviewer quickstart.
- `docs/DEMO_SCRIPT.md` describes the intended click path.
- `docs/DESIGN.md` explains `VENUE_WEIGHTED_TWAP_V1` deeply and matches the code.
- `BUILD_PLAN.md` is treated as historical context where it conflicts with `VENUE_WEIGHTED_TWAP_V1`.
- `DEPLOY.md` separates hosted env requirements from local defaults.
- Known simplifications are explicit and framed as local-demo tradeoffs.
