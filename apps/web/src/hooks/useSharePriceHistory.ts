import { useEffect, useState } from 'react';
import type { ClientMessage, Result, ServerEvent, SharePricePoint, SharePriceSeriesResponse } from '@jet/shared';
import { sharePriceChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useSharePriceHistory(
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): SharePricePoint[] {
  const [history, setHistory] = useState<SharePricePoint[]>([]);

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
    if (!lastEvent || !marketId) return;
    if (lastEvent.type === 'share_price_snapshot' && lastEvent.marketId === marketId) {
      setHistory(lastEvent.points.slice(-600));
      return;
    }
    if (lastEvent.type !== 'share_price' || lastEvent.point.marketId !== marketId) return;
    setHistory((prev) => [...prev, lastEvent.point].slice(-600));
  }, [lastEvent, marketId]);

  return history;
}
