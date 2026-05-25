import {
  type IndicativeSnapshot,
  type MarketConfig,
  type MarketId,
  type TimestampMs,
  type VenueHealth,
  type VenueId,
  bps,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import { classifyDispersion, deriveConfidence } from './dispersion.js';
import {
  centsToMillicents,
  computeMad,
  computeMedian,
  roundMillicentsToCentsHalfUp,
} from './math.js';
import { buildFormingResolution } from './forming-resolution.js';
import type { OracleConfig } from './oracle-config.js';

export interface BuildIndicativeParams {
  marketId: MarketId;
  config?: MarketConfig;
  expiryTs?: TimestampMs;
  adapters: readonly VenueAdapter[];
  now: TimestampMs;
  oracleCfg: OracleConfig;
}

/** Build the live indicative price snapshot: cleaned weighted aggregate of healthy venue mids. */
export function buildIndicative({
  marketId,
  config,
  expiryTs,
  adapters,
  now,
  oracleCfg,
}: BuildIndicativeParams): IndicativeSnapshot {
  const venues: VenueHealth[] = [];
  const candidateMids: { venue: VenueId; midMillicents: number; index: number }[] = [];

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

    const midMillicents = centsToMillicents((latest.bidCents + latest.askCents) / 2);
    const mid = roundMillicentsToCentsHalfUp(midMillicents);
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
    candidateMids.push({ venue: adapter.venueId, midMillicents, index: venues.length - 1 });
  }

  const candidateValues = candidateMids.map(v => v.midMillicents);
  const crossVenueMedian = candidateValues.length > 0 ? computeMedian(candidateValues) : 0;
  const madBpsValue = candidateValues.length > 1
    ? Math.round((computeMad(candidateValues, crossVenueMedian) / (crossVenueMedian || 1)) * 10_000)
    : 0;
  const outlierThreshold = Math.max(oracleCfg.outlierBpsFloor, madBpsValue);
  const survivorMids: { venue: VenueId; midMillicents: number; weight: number }[] = [];

  for (const candidate of candidateMids) {
    const deviationBps = crossVenueMedian > 0
      ? Math.round((Math.abs(candidate.midMillicents - crossVenueMedian) / crossVenueMedian) * 10_000)
      : 0;
    const deviationMillicents = Math.abs(candidate.midMillicents - crossVenueMedian);
    const thresholdMillicents = Math.max(
      (crossVenueMedian * oracleCfg.outlierBpsFloor) / 10_000,
      oracleCfg.outlierUsdCentsFloor * 10,
    );
    if (deviationBps > outlierThreshold || deviationMillicents > thresholdMillicents) {
      const venue = venues[candidate.index]!;
      venues[candidate.index] = {
        ...venue,
        healthy: false,
        excludedReason: 'OUTLIER',
      };
    } else {
      survivorMids.push({
        venue: candidate.venue,
        midMillicents: candidate.midMillicents,
        weight: oracleCfg.weights[candidate.venue] ?? 0,
      });
    }
  }

  const weightedMid = weightedMean(survivorMids);
  const btcPriceCents = usdCents(
    roundMillicentsToCentsHalfUp(
      weightedMid !== null
        ? weightedMid
        : crossVenueMedian > 0
          ? crossVenueMedian
          : centsToMillicents(10_000_000),
    ),
  );
  const dispersionBpsBranded = bps(madBpsValue);
  const dispersionState = classifyDispersion(madBpsValue, oracleCfg);
  const { confidenceBps, confidence } = deriveConfidence(
    dispersionBpsBranded,
    dispersionState,
    oracleCfg,
    survivorMids.length,
    bps(0),
  );

  const formingResolution =
    config && expiryTs !== undefined
      ? buildFormingResolution({ config, expiryTs, adapters, now, oracleCfg }) ?? undefined
      : undefined;

  return {
    marketId,
    btcPriceCents,
    confidenceBps,
    confidence,
    dispersionBps: dispersionBpsBranded,
    dispersionState,
    venues,
    ts: now,
    ...(formingResolution ? { formingResolution } : {}),
  };
}

function weightedMean(values: readonly { midMillicents: number; weight: number }[]): number | null {
  if (values.length === 0) return null;
  const positive = values.filter(v => v.weight > 0);
  const source = positive.length > 0 ? positive : values;
  const equal = positive.length === 0;
  const total = source.reduce((sum, v) => sum + (equal ? 1 : v.weight), 0);
  if (total <= 0) return null;
  return source.reduce((sum, v) => sum + v.midMillicents * ((equal ? 1 : v.weight) / total), 0);
}
