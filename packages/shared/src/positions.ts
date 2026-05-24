import type { CanonicalOrder } from './orders';
import type { MarketId, PriceCents, SignedShares, UsdCents, UserId } from './units';

export interface Balance {
  userId: UserId;
  /** free cash available to trade, USD cents */
  availableCents: UsdCents;
  /** cash locked as collateral behind open orders + open positions, USD cents */
  lockedCents: UsdCents;
}

export interface Position {
  userId: UserId;
  marketId: MarketId;
  /** signed YES contracts: + long YES, - long NO, 0 flat */
  net: SignedShares;
  /** volume-weighted average entry (YES terms) for unrealized-PnL display */
  avgEntryPriceCents: PriceCents;
}

export interface UserSnapshot {
  userId: UserId;
  balance: Balance;
  positions: Position[];
  openOrders: CanonicalOrder[];
}

/**
 * INVARIANT (must hold at all times):
 *   total collateral locked across all users == openInterest * PAYOUT_CENTS
 * Collateral only moves when open interest changes (OPEN / CLOSE), never on transfers.
 */
