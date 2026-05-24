import type { Side } from './orders';
import type { MarketId, OrderId, PriceCents, Shares, SignedShares, TimestampMs, TradeId, UsdCents, UserId } from './units';

/**
 * Raw fill event produced by the CLOB. Carries no kind — T3 (market-core)
 * classifies the TradeKind from pre-trade signed positions and builds Trade/Fill.
 */
export interface Match {
  tradeId: TradeId;
  marketId: MarketId;
  /** execution price (= resting/maker YES price) */
  yesPriceCents: PriceCents;
  size: Shares;
  makerOrderId: OrderId;
  makerUserId: UserId;
  takerOrderId: OrderId;
  takerUserId: UserId;
  /** taker's YES-book action: BUY = bought YES, SELL = sold YES */
  takerYesAction: 'BUY' | 'SELL';
  /** aggressor's chosen side, for UI activity feed */
  takerSide: Side;
  ts: TimestampMs;
}

/**
 * Unified Market Structure: every fill is normalized as
 * "buyer buys YES from seller at price p", then classified by the two
 * parties' PRE-trade signed positions. The kind drives open-interest and
 * collateral movement (a single fill that crosses zero for a party is split).
 */
export type TradeKind =
  | 'OPEN'         // both increase exposure -> OI up, new collateral enters
  | 'TRANSFER_YES' // a YES position changes hands -> OI unchanged
  | 'TRANSFER_NO'  // a short/NO position changes hands -> OI unchanged
  | 'CLOSE';       // a YES and a NO cancel -> OI down, collateral released

/** Public trade print (recent-trades feed). */
export interface Trade {
  tradeId: TradeId;
  marketId: MarketId;
  /** canonical YES price the trade executed at */
  yesPriceCents: PriceCents;
  size: Shares;
  kind: TradeKind;
  /** side from the aggressor's perspective, for the activity feed (Above/Below) */
  takerSide: Side;
  ts: TimestampMs;
}

/** Private fill notification for a single user/order. */
export interface Fill {
  tradeId: TradeId;
  orderId: OrderId;
  userId: UserId;
  yesAction: 'BUY' | 'SELL';
  yesPriceCents: PriceCents;
  size: Shares;
  kind: TradeKind;
  /** the user's signed position AFTER applying this fill */
  positionAfter: SignedShares;
  /** the user's cash balance AFTER applying this fill */
  balanceAfter: UsdCents;
  ts: TimestampMs;
}
