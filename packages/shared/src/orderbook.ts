import type { MarketId, PriceCents, Shares, TimestampMs } from './units';

export interface OrderBookLevel {
  yesPriceCents: PriceCents;
  /** aggregate resting size at this price level */
  size: Shares;
}

export interface OrderBookSnapshot {
  marketId: MarketId;
  /** resting BUY-YES orders, sorted by price DESC */
  bids: OrderBookLevel[];
  /** resting SELL-YES orders, sorted by price ASC */
  asks: OrderBookLevel[];
  /** monotonically increasing; clients detect gaps and re-snapshot on reconnect */
  seq: number;
  ts: TimestampMs;
}

export interface OrderBookDeltaChange {
  side: 'BID' | 'ASK';
  yesPriceCents: PriceCents;
  /** new aggregate size at this level; size 0 means the level was removed */
  size: Shares;
}

export interface OrderBookDelta {
  marketId: MarketId;
  changes: OrderBookDeltaChange[];
  seq: number;
  ts: TimestampMs;
}
