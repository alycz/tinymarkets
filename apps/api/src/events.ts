import { type MarketState, type MarketStatusEvent, timestampMs } from '@jet/shared';

export function makeMarketStatusEvent(state: MarketState): MarketStatusEvent {
  return {
    type: 'market:status',
    marketId: state.config.marketId,
    status: state.status,
    expiryMs: state.expiryMs,
    msRemaining: state.msRemaining,
    serverTs: timestampMs(Date.now()),
  };
}
