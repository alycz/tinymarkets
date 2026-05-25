import { useState, useEffect } from 'react';
import type {
  ClientMessage,
  ServerEvent,
  MarketStatus,
  IndicativeSnapshot,
  VenueWeightedTwapResolution,
  TimestampMs,
} from '@jet/shared';
import { marketChannel, oracleChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useMarket(
  marketId: string | null,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): {
  marketStatus: MarketStatus | null;
  msRemaining: number;
  serverTs: TimestampMs | null;
  expiryMs: TimestampMs | null;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: VenueWeightedTwapResolution | null;
} {
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [msRemaining, setMsRemaining] = useState(0);
  const [serverTs, setServerTs] = useState<TimestampMs | null>(null);
  const [expiryMs, setExpiryMs] = useState<TimestampMs | null>(null);
  const [oracleSnapshot, setOracleSnapshot] = useState<IndicativeSnapshot | null>(null);
  const [resolution, setResolution] = useState<VenueWeightedTwapResolution | null>(null);

  // Reset state when marketId changes
  useEffect(() => {
    setMarketStatus(null);
    setMsRemaining(0);
    setServerTs(null);
    setExpiryMs(null);
    setOracleSnapshot(null);
    setResolution(null);
  }, [marketId]);

  // Subscribe when WS connects or marketId changes
  useEffect(() => {
    if (!marketId || wsStatus !== 'connected') return;
    send({
      type: 'subscribe',
      channels: [marketChannel(marketId), oracleChannel(marketId)],
    });
  }, [marketId, wsStatus, send]);

  // Reduce incoming events into state
  useEffect(() => {
    if (!lastEvent || !marketId) return;

    switch (lastEvent.type) {
      case 'market_snapshot':
        if (lastEvent.market.config.marketId === marketId) {
          setMarketStatus(lastEvent.market.status);
          setMsRemaining(lastEvent.market.msRemaining);
          setServerTs(lastEvent.serverTs);
          setExpiryMs(lastEvent.market.expiryMs);
          setResolution(lastEvent.market.resolution ?? null);
          setOracleSnapshot(lastEvent.oracle);
        }
        break;
      case 'market_status':
        if (lastEvent.marketId === marketId) {
          setMarketStatus(lastEvent.status);
          setMsRemaining(lastEvent.msRemaining);
          setServerTs(lastEvent.serverTs);
          setExpiryMs(lastEvent.expiryMs);
        }
        break;
      case 'countdown':
        if (lastEvent.marketId === marketId) {
          setMsRemaining(lastEvent.msRemaining);
          setServerTs(lastEvent.serverTs);
          setExpiryMs(lastEvent.expiryMs);
        }
        break;
      case 'oracle_price':
        if (lastEvent.marketId === marketId) {
          setOracleSnapshot(lastEvent.tick);
        }
        break;
      case 'resolution':
        if (lastEvent.marketId === marketId) {
          setResolution(lastEvent.resolution);
        }
        break;
    }
  }, [lastEvent, marketId]);

  return { marketStatus, msRemaining, serverTs, expiryMs, oracleSnapshot, resolution };
}
