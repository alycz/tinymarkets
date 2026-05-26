import { useState, useEffect } from 'react';
import type {
  ClientMessage,
  ServerEvent,
  MarketStatus,
  MarketResponse,
  IndicativeSnapshot,
  VenueWeightedTwapResolution,
  TimestampMs,
  Shares,
  Result,
} from '@jet/shared';
import { marketChannel, oracleChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useMarket(
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): {
  marketStatus: MarketStatus | null;
  msRemaining: number;
  serverTs: TimestampMs | null;
  expiryMs: TimestampMs | null;
  openInterest: Shares | null;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: VenueWeightedTwapResolution | null;
} {
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [msRemaining, setMsRemaining] = useState(0);
  const [serverTs, setServerTs] = useState<TimestampMs | null>(null);
  const [expiryMs, setExpiryMs] = useState<TimestampMs | null>(null);
  const [openInterest, setOpenInterest] = useState<Shares | null>(null);
  const [oracleSnapshot, setOracleSnapshot] = useState<IndicativeSnapshot | null>(null);
  const [resolution, setResolution] = useState<VenueWeightedTwapResolution | null>(null);

  const applyMarket = (market: MarketResponse['market'], nextServerTs?: TimestampMs): void => {
    setMarketStatus(market.status);
    setMsRemaining(market.msRemaining);
    if (nextServerTs !== undefined) setServerTs(nextServerTs);
    setExpiryMs(market.expiryMs);
    setOpenInterest(market.openInterest);
    if (market.resolution) setResolution(market.resolution);
  };

  const refreshResolvedMarket = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`${apiUrl}/markets/current`);
      if (!res.ok) return;
      const data = (await res.json()) as Result<MarketResponse>;
      if (!data.ok || data.market.config.marketId !== id) return;
      applyMarket(data.market);
    } catch {
      // The direct resolution event remains the primary path; this is only a fallback.
    }
  };

  // Reset state when marketId changes
  useEffect(() => {
    setMarketStatus(null);
    setMsRemaining(0);
    setServerTs(null);
    setExpiryMs(null);
    setOpenInterest(null);
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
          applyMarket(lastEvent.market, lastEvent.serverTs);
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
          if (lastEvent.status === 'resolved' && resolution === null) {
            void refreshResolvedMarket(marketId);
          }
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
          setMarketStatus('resolved');
          setMsRemaining(0);
        }
        break;
    }
  }, [lastEvent, marketId, resolution]);

  return { marketStatus, msRemaining, serverTs, expiryMs, openInterest, oracleSnapshot, resolution };
}
