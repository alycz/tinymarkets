import type { Balance, Position } from '@jet/shared';
import type { PriceCents, UserId } from '@jet/shared';
import { usdCents } from '@jet/shared';

/**
 * Deprecated compatibility helper. Settlement collateral is no longer marked to market;
 * MarketCore recomputes it from open interest after each fill.
 */
export function markToMarket(
  positions: Map<UserId, Position>,
  balances: Map<UserId, Balance>,
  _priceCents: PriceCents,
): void {
  for (const [userId, pos] of positions) {
    const bal = balances.get(userId);
    if (!bal) continue;
    bal.lockedSettlementCollateralCents = usdCents(Math.abs(pos.net as number) * 50);
  }
}
