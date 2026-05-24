import { useState, useEffect } from 'react';
import type { IndicativeSnapshot, TimestampMs, UsdCents } from '@jet/shared';

export interface PricePoint {
  ts: TimestampMs;
  priceCents: UsdCents;
}

export function usePriceHistory(oracleSnapshot: IndicativeSnapshot | null): PricePoint[] {
  const [history, setHistory] = useState<PricePoint[]>([]);

  useEffect(() => {
    if (!oracleSnapshot) return;
    setHistory((prev) => {
      const next = [...prev, { ts: oracleSnapshot.ts, priceCents: oracleSnapshot.priceCents }];
      return next.slice(-600);
    });
  }, [oracleSnapshot]);

  return history;
}
