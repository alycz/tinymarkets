import type { MarketId, PriceCents, TimestampMs } from './units';

export type SharePriceSource = 'trade' | 'mid' | 'mark';

/** YES share market data. BTC/USD oracle price is intentionally separate. */
export interface SharePricePoint {
  marketId: MarketId;
  ts: TimestampMs;
  yesPriceCents: PriceCents;
  noPriceCents: PriceCents;
  source: SharePriceSource;
  bestBid?: PriceCents;
  bestAsk?: PriceCents;
}
