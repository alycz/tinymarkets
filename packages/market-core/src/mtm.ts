import type { Balance, Position } from '@jet/shared';
import type { PriceCents, UserId } from '@jet/shared';
import { usdCents } from '@jet/shared';

/**
 * Recompute lockedCents for every user at the given price.
 * long YES (net > 0): locked = net * p
 * long NO  (net < 0): locked = |net| * (100 - p)
 * flat     (net = 0): locked = 0
 */
export function markToMarket(
  positions: Map<UserId, Position>,
  balances: Map<UserId, Balance>,
  priceCents: PriceCents,
): void {
  const p = priceCents as number;
  for (const [userId, pos] of positions) {
    const bal = balances.get(userId);
    if (!bal) continue;
    const net = pos.net as number;
    if (net > 0) {
      bal.lockedCents = usdCents(net * p);
    } else if (net < 0) {
      bal.lockedCents = usdCents(-net * (100 - p));
    } else {
      bal.lockedCents = usdCents(0);
    }
  }
}
