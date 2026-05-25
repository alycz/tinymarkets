import type { MarketId, PriceCents, Shares, TimestampMs, TradeId } from './units';

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
  tradeId?: TradeId;
  volume?: Shares;
}

export interface SharePriceMetrics {
  latestYesPrice: PriceCents;
  latestNoPrice: PriceCents;
  bestBid?: PriceCents;
  bestAsk?: PriceCents;
  spread?: PriceCents;
  mid?: PriceCents;
  lastTradePrice?: PriceCents;
  volumeLastMinute: Shares;
  priceChangeSinceOpen: number;
  highYesPrice: PriceCents;
  lowYesPrice: PriceCents;
}
