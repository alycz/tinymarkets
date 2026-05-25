import {
  type CountdownEvent,
  type MarketSnapshotEvent,
  type MarketState,
  type MarketStatusEvent,
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

export function makeMarketSnapshotEvent(state: MarketState): MarketSnapshotEvent {
  return {
    type: 'market_snapshot',
    market: state,
    serverTs: timestampMs(Date.now()),
  };
}
