import { useState, useEffect } from 'react';
import type { IndicativeSnapshot, OracleSeriesResponse, Result, TimestampMs, UsdCents } from '@jet/shared';

export interface PricePoint {
  ts: TimestampMs;
  btcPriceCents: UsdCents;
}

export function usePriceHistory(
  marketId: string | null,
  apiUrl: string,
  oracleSnapshot: IndicativeSnapshot | null,
): PricePoint[] {
  const [history, setHistory] = useState<PricePoint[]>([]);

  useEffect(() => {
    setHistory([]);
    if (!marketId) return;
    let cancelled = false;
    fetch(`${apiUrl}/markets/${marketId}/oracle-series`)
      .then((res) => res.json())
      .then((data: Result<OracleSeriesResponse>) => {
        if (cancelled || !data.ok) return;
        setHistory(data.snapshots.map((snap) => ({
          ts: snap.ts,
          btcPriceCents: snap.btcPriceCents,
        })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiUrl, marketId]);

  useEffect(() => {
    if (!oracleSnapshot) return;
    setHistory((prev) => {
      const next = [...prev, { ts: oracleSnapshot.ts, btcPriceCents: oracleSnapshot.btcPriceCents }];
      return next.slice(-600);
    });
  }, [oracleSnapshot]);

  return history;
}
