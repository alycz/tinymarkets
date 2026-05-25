import type { Balance, Position, Side } from '@jet/shared';
import type { UserId, UsdCents } from '@jet/shared';
import { usdCents, PAYOUT_CENTS } from '@jet/shared';

export interface ResolveResult {
  payouts: ReadonlyMap<UserId, UsdCents>;
  realizedPnlCents: ReadonlyMap<UserId, number>;
}

/**
 * Pure settlement: for each holder, move locked collateral to available (winners)
 * or zero it (losers). Returns per-user payouts and realized PnL.
 *
 * After resolution: Σ lockedSettlementCollateralCents == 0 == openInterest × PAYOUT_CENTS. ✓
 */
export function settle(
  outcome: Side,
  positions: Map<UserId, Position>,
  balances: Map<UserId, Balance>,
  startingBalanceCents: UsdCents,
): ResolveResult {
  const payouts = new Map<UserId, UsdCents>();
  const realizedPnlCents = new Map<UserId, number>();

  for (const [userId, pos] of positions) {
    const net = pos.net as number;
    if (net === 0) continue;

    const bal = balances.get(userId);
    if (!bal) continue;

    const isWinner =
      (outcome === 'YES' && net > 0) ||
      (outcome === 'NO' && net < 0);

    const payout = isWinner ? usdCents(Math.abs(net) * (PAYOUT_CENTS as number)) : usdCents(0);
    payouts.set(userId, payout);

    bal.availableBalanceCents = usdCents((bal.availableBalanceCents as number) + (payout as number));
    bal.lockedSettlementCollateralCents = usdCents(0);
    pos.net = 0 as typeof pos.net;

    const finalWealth = (bal.availableBalanceCents as number) + (bal.reservedForOrdersCents as number);
    const pnl = finalWealth - (startingBalanceCents as number);
    bal.realizedPnlCents = pnl;
    realizedPnlCents.set(userId, pnl);
  }

  // Zero out remaining balances (users who never traded have pnl = 0)
  for (const [userId, bal] of balances) {
    if (!realizedPnlCents.has(userId)) {
      const pnl =
        (bal.availableBalanceCents as number) +
        (bal.reservedForOrdersCents as number) +
        (bal.lockedSettlementCollateralCents as number) -
        (startingBalanceCents as number);
      bal.realizedPnlCents = pnl;
      realizedPnlCents.set(userId, pnl);
    }
  }

  return { payouts, realizedPnlCents };
}
