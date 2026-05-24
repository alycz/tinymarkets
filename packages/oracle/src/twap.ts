import type { TimestampMs, UsdCents, VenueQuote } from '@jet/shared';

/**
 * Stair-step TWAP of mid = floor((bid+ask)/2) for a venue over [startTs, endTs].
 *
 * The last quote at or before startTs "fills from startTs" (standard practice
 * to avoid gaps when a venue samples at intervals crossing the partition boundary).
 * Returns null if the venue has no quote with ts ≤ endTs.
 */
export function midTwap(
  quotes: readonly VenueQuote[],
  startTs: TimestampMs,
  endTs: TimestampMs,
): UsdCents | null {
  // All quotes up to (and including) endTs, sorted ascending
  const relevant = quotes.filter(q => q.ts <= endTs).sort((a, b) => a.ts - b.ts);
  if (relevant.length === 0) return null;

  // Build stair-step segments within [startTs, endTs]
  const segments: { fromTs: number; mid: number }[] = [];

  // Fill-from-start: last quote at or before startTs
  let fillQuote: VenueQuote | null = null;
  for (const q of relevant) {
    if (q.ts <= startTs) fillQuote = q;
  }
  if (fillQuote) {
    segments.push({
      fromTs: startTs,
      mid: Math.round((fillQuote.bidCents + fillQuote.askCents) / 2),
    });
  }

  // Quotes strictly inside (startTs, endTs)
  for (const q of relevant) {
    if (q.ts > startTs && q.ts < endTs) {
      segments.push({
        fromTs: q.ts,
        mid: Math.round((q.bidCents + q.askCents) / 2),
      });
    }
  }

  if (segments.length === 0) return null;

  // Stair-step integral: accumulate mid * duration_ms
  let sumMidMs = 0;
  let totalMs = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const toTs = segments[i + 1]?.fromTs ?? endTs;
    const duration = toTs - seg.fromTs;
    if (duration > 0) {
      sumMidMs += seg.mid * duration;
      totalMs += duration;
    }
  }

  if (totalMs === 0) return null;
  return Math.floor(sumMidMs / totalMs) as UsdCents;
}

/**
 * Same stair-step logic as midTwap, but for spread_bps = (ask-bid)/mid * 10_000.
 * Returns 0 if no segments.
 */
export function spreadTwap(
  quotes: readonly VenueQuote[],
  startTs: TimestampMs,
  endTs: TimestampMs,
): number {
  const relevant = quotes.filter(q => q.ts <= endTs).sort((a, b) => a.ts - b.ts);
  if (relevant.length === 0) return 0;

  const toSpreadBps = (q: VenueQuote): number => {
    const mid = (q.bidCents + q.askCents) / 2;
    return mid > 0 ? ((q.askCents - q.bidCents) / mid) * 10_000 : 0;
  };

  const segments: { fromTs: number; spreadBps: number }[] = [];

  let fillQuote: VenueQuote | null = null;
  for (const q of relevant) {
    if (q.ts <= startTs) fillQuote = q;
  }
  if (fillQuote) {
    segments.push({ fromTs: startTs, spreadBps: toSpreadBps(fillQuote) });
  }

  for (const q of relevant) {
    if (q.ts > startTs && q.ts < endTs) {
      segments.push({ fromTs: q.ts, spreadBps: toSpreadBps(q) });
    }
  }

  if (segments.length === 0) return 0;

  let sumSpreadMs = 0;
  let totalMs = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const toTs = segments[i + 1]?.fromTs ?? endTs;
    const duration = toTs - seg.fromTs;
    if (duration > 0) {
      sumSpreadMs += seg.spreadBps * duration;
      totalMs += duration;
    }
  }

  return totalMs > 0 ? sumSpreadMs / totalMs : 0;
}
