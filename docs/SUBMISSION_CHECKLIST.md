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
- Trades, fills, balance, reserved funds, signed position, and PnL update.
- `Arm Spike Demo` works.
- `Arm Subtle Demo` works.
- Final resolution shows outcome, reference price, payout, realized PnL, sources used/excluded, source usage, quality flags, and input hash.

## Documentation Verification

- `README.md` gives a clear reviewer quickstart.
- `docs/DEMO_SCRIPT.md` describes the intended click path.
- `docs/DESIGN.md` explains `RAMP_V1` deeply and matches the code.
- `DEPLOY.md` separates hosted env requirements from local defaults.
- Known simplifications are explicit and framed as local-demo tradeoffs.
