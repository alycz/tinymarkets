import {
  type CountdownEvent,
  type MarketSnapshotEvent,
  type MarketState,
  type MarketStatusEvent,
  type OrderBookSnapshot,
  type IndicativeSnapshot,
  type SharePricePoint,
  type Trade,
  timestampMs,
} from '@jet/shared';

export function makeMarketStatusEvent(state: MarketState): MarketStatusEvent {
  return {
    type: 'market_status',
    marketId: state.config.marketId,
    status: state.status,
    expiryMs: state.expiryMs,
    msRemaining: state.msRemaining,
    serverTs: timestampMs(Date.now()),
  };
}

export function makeCountdownEvent(state: MarketState): CountdownEvent {
  return {
    type: 'countdown',
    marketId: state.config.marketId,
    expiryMs: state.expiryMs,
    msRemaining: state.msRemaining,
    serverTs: timestampMs(Date.now()),
  };
}

export function makeMarketSnapshotEvent(
  state: MarketState,
  opts?: {
    orderbook?: OrderBookSnapshot | null;
    recentTrades?: Trade[];
    oracle?: IndicativeSnapshot | null;
    sharePrice?: SharePricePoint | null;
  },
): MarketSnapshotEvent {
  return {
    type: 'market_snapshot',
    market: state,
    orderbook: opts?.orderbook ?? null,
    recentTrades: opts?.recentTrades ?? [],
    oracle: opts?.oracle ?? null,
    sharePrice: opts?.sharePrice ?? null,
    countdownMs: state.msRemaining,
    serverTs: timestampMs(Date.now()),
  };
}
