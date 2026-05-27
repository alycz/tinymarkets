import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, Result, SharePricePoint, SharePriceSeriesResponse } from '@jet/shared';
import { sharePriceChannel } from '@jet/shared';
import type { WsEventEnvelope, WsStatus } from './useWebSocket.js';

export function useSharePriceHistory(
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  events: WsEventEnvelope[],
  wsStatus: WsStatus,
): SharePricePoint[] {
  const [history, setHistory] = useState<SharePricePoint[]>([]);
  const lastProcessedSeqRef = useRef(0);

  useEffect(() => {
    setHistory([]);
    if (!marketId) return;
    let cancelled = false;
    fetch(`${apiUrl}/markets/${marketId}/share-price-series`)
      .then((res) => res.json())
      .then((data: Result<SharePriceSeriesResponse>) => {
        if (cancelled || !data.ok) return;
        setHistory(data.points.slice(-600));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiUrl, marketId]);

  useEffect(() => {
    if (!marketId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [sharePriceChannel(marketId)] });
  }, [marketId, wsStatus, send]);

  useEffect(() => {
    if (!marketId) return;

    for (const { seq, event } of events) {
      if (seq <= lastProcessedSeqRef.current) continue;
      lastProcessedSeqRef.current = seq;

      if (event.type === 'share_price_snapshot' && event.marketId === marketId) {
        setHistory(event.points.slice(-600));
        continue;
      }
      if (event.type !== 'share_price' || event.point.marketId !== marketId) continue;
      setHistory((prev) => [...prev, event.point].slice(-600));
    }
  }, [events, marketId]);

  return history;
}
