import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ClientMessage,
  MarketStatus,
  MarketResponse,
  IndicativeSnapshot,
  VenueWeightedTwapResolution,
  TimestampMs,
  Shares,
  Result,
} from '@jet/shared';
import { marketChannel, oracleChannel } from '@jet/shared';
import type { WsEventEnvelope, WsStatus } from './useWebSocket.js';

export function useMarket(
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  events: WsEventEnvelope[],
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
  const lastProcessedSeqRef = useRef(0);

  const applyMarket = useCallback((market: MarketResponse['market'], nextServerTs?: TimestampMs): void => {
    const isResolved = market.status === 'resolved' || market.resolution != null;
    setMarketStatus(isResolved ? 'resolved' : market.status);
    setMsRemaining(isResolved ? 0 : market.msRemaining);
    if (nextServerTs !== undefined) setServerTs(nextServerTs);
    setExpiryMs(market.expiryMs);
    setOpenInterest(market.openInterest);
    if (market.resolution) setResolution(market.resolution);
  }, []);

  const refreshResolvedMarket = useCallback(async (id: string): Promise<void> => {
    try {
      const res = await fetch(`${apiUrl}/markets/current`);
      if (!res.ok) return;
      const data = (await res.json()) as Result<MarketResponse>;
      if (!data.ok || data.market.config.marketId !== id) return;
      applyMarket(data.market);
    } catch {
      // The direct resolution event remains the primary path; this is only a fallback.
    }
  }, [apiUrl, applyMarket]);

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
    if (!marketId) return;

    let resolvedSeen = resolution != null || marketStatus === 'resolved';

    for (const { seq, event } of events) {
      if (seq <= lastProcessedSeqRef.current) continue;
      lastProcessedSeqRef.current = seq;

      switch (event.type) {
        case 'market_snapshot':
          if (event.market.config.marketId === marketId) {
            applyMarket(event.market, event.serverTs);
            if (event.market.resolution) {
              setResolution(event.market.resolution);
            } else if (!resolvedSeen) {
              setResolution(null);
            }
            setOracleSnapshot(event.oracle);
            if (event.market.resolution) resolvedSeen = true;
          }
          break;
        case 'market_status':
          if (event.marketId === marketId) {
            if (event.status === 'resolved') {
              resolvedSeen = true;
              setMarketStatus('resolved');
              setMsRemaining(0);
            } else {
              setMarketStatus(event.status);
              setMsRemaining(event.msRemaining);
            }
            setServerTs(event.serverTs);
            setExpiryMs(event.expiryMs);
          }
          break;
        case 'countdown':
          if (event.marketId === marketId) {
            setMsRemaining(resolvedSeen ? 0 : event.msRemaining);
            setServerTs(event.serverTs);
            setExpiryMs(event.expiryMs);
          }
          break;
        case 'oracle_price':
          if (event.marketId === marketId) {
            setOracleSnapshot(event.tick);
          }
          break;
        case 'resolution':
          if (event.marketId === marketId) {
            resolvedSeen = true;
            setResolution(event.resolution);
            setMarketStatus('resolved');
            setMsRemaining(0);
          }
          break;
      }
    }
  }, [events, marketId, marketStatus, resolution, applyMarket]);

  useEffect(() => {
    if (!marketId || resolution != null) return;
    if (marketStatus !== 'resolving' && msRemaining > 0) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await refreshResolvedMarket(marketId);
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [marketId, marketStatus, msRemaining, resolution, refreshResolvedMarket]);

  return { marketStatus, msRemaining, serverTs, expiryMs, openInterest, oracleSnapshot, resolution };
}
