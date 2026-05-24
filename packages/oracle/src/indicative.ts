import { ORACLE } from '@jet/config';
import {
  type Bps,
  type IndicativeSnapshot,
  type MarketId,
  type TimestampMs,
  type UsdCents,
  type VenueHealth,
  bps,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import { classifyDispersion, deriveConfidence } from './dispersion.js';
import { computeMad, computeMedian } from './math.js';

export interface BuildIndicativeParams {
  marketId: MarketId;
  adapters: readonly VenueAdapter[];
  now: TimestampMs;
  oracleCfg: typeof ORACLE;
}

/** Build the live indicative price snapshot — equal-weight median of healthy venue mids. */
export function buildIndicative({
  marketId,
  adapters,
  now,
  oracleCfg,
}: BuildIndicativeParams): IndicativeSnapshot {
  const venues: VenueHealth[] = [];
  const healthyMids: number[] = [];

  for (const adapter of adapters) {
    const latest = adapter.latestAt(now);

    if (!latest) {
      venues.push({
        venue: adapter.venueId,
        quote: adapter.quote,
        midCents: null,
        spreadBps: bps(0),
        lastUpdateMs: now,
        healthy: false,
        excludedReason: 'MISSING',
      });
      continue;
    }

    const age = now - latest.ts;
    if (age > oracleCfg.staleMs) {
      venues.push({
        venue: adapter.venueId,
        quote: adapter.quote,
        midCents: null,
        spreadBps: bps(0),
        lastUpdateMs: latest.ts,
        healthy: false,
        excludedReason: 'STALE',
      });
      continue;
    }

    if (latest.bidCents >= latest.askCents) {
      venues.push({
        venue: adapter.venueId,
        quote: adapter.quote,
        midCents: null,
        spreadBps: bps(0),
        lastUpdateMs: latest.ts,
        healthy: false,
        excludedReason: 'CROSSED_BOOK',
      });
      continue;
    }

    const mid = Math.round((latest.bidCents + latest.askCents) / 2);
    const spread = latest.askCents - latest.bidCents;
    const spreadBpsValue = mid > 0 ? Math.round((spread / mid) * 10_000) : 0;

    if (spreadBpsValue > oracleCfg.wideSpreadBps) {
      venues.push({
        venue: adapter.venueId,
        quote: adapter.quote,
        midCents: usdCents(mid),
        spreadBps: bps(spreadBpsValue),
        lastUpdateMs: latest.ts,
        healthy: false,
        excludedReason: 'WIDE_SPREAD',
      });
      continue;
    }

    venues.push({
      venue: adapter.venueId,
      quote: adapter.quote,
      midCents: usdCents(mid),
      spreadBps: bps(spreadBpsValue),
      lastUpdateMs: latest.ts,
      healthy: true,
    });
    healthyMids.push(mid);
  }

  const priceCents = usdCents(healthyMids.length > 0 ? computeMedian(healthyMids) : 10_000_000);
  const madBpsValue = healthyMids.length > 1
    ? Math.round((computeMad(healthyMids, computeMedian(healthyMids)) / (computeMedian(healthyMids) || 1)) * 10_000)
    : 0;
  const dispersionBpsBranded = bps(madBpsValue);
  const dispersionState = classifyDispersion(madBpsValue, oracleCfg);
  const { confidenceBps, confidence } = deriveConfidence(
    dispersionBpsBranded,
    dispersionState,
    oracleCfg,
  );

  return {
    marketId,
    priceCents,
    confidenceBps,
    confidence,
    dispersionBps: dispersionBpsBranded,
    dispersionState,
    venues,
    ts: now,
  };
}
