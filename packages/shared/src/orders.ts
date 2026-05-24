import type { MarketId, OrderId, PriceCents, Shares, TimestampMs, UserId } from './units';

/** Outcome side as shown in the UI. Internally everything normalizes to the YES book. */
export type Side = 'YES' | 'NO';

/** Whether the user wants to acquire (BUY) or shed (SELL) the chosen side. */
export type Action = 'BUY' | 'SELL';

export type OrderType = 'LIMIT';

/** GTC rests on the book; IOC fills what it can immediately and cancels the rest. */
export type TimeInForce = 'GTC' | 'IOC';

export type OrderStatus =
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

/** What the user submits, expressed in their chosen side's terms. */
export interface PlaceOrderRequest {
  userId: UserId;
  marketId: MarketId;
  side: Side;
  action: Action;
  type: OrderType;
  /** limit price in the chosen side's cents (a YES price if side=YES, a NO price if side=NO) */
  priceCents: PriceCents;
  size: Shares;
  tif?: TimeInForce;
  clientOrderId?: string;
}

/**
 * Internal canonical order — the Unified Market Structure normalization.
 * There is ONE book (the YES book). User intent maps to it as:
 *
 *   Buy  YES @ p   ->  BID on YES book @ p
 *   Sell YES @ p   ->  ASK on YES book @ p
 *   Buy  NO  @ p   ->  ASK on YES book @ (100 - p)   (selling YES at the complement)
 *   Sell NO  @ p   ->  BID on YES book @ (100 - p)   (buying  YES at the complement)
 */
export interface CanonicalOrder {
  orderId: OrderId;
  userId: UserId;
  marketId: MarketId;
  /** BUY = bid on the YES book, SELL = ask on the YES book */
  yesAction: Action;
  yesPriceCents: PriceCents;
  size: Shares;
  remaining: Shares;
  tif: TimeInForce;
  status: OrderStatus;
  createdAtMs: TimestampMs;
  /** echo of how the user expressed the order, for faithful UI display */
  display: { side: Side; action: Action; priceCents: PriceCents };
}
