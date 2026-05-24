import { ORACLE } from '@jet/config';
import {
  type Bps,
  type MarketConfig,
  type PartitionResult,
  type RampResolution,
  type Side,
  type TimestampMs,
  type UsdCents,
  type VenueExclusionReason,
  type VenueId,
  type VenueQuote,
  bps,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import type { PartitionVenueData, AggPartitionResult, ExclusionRecord } from './partition.js';
import { midTwap } from './twap.js';
import { aggregatePartition } from './partition.js';
import { classifyDispersion, deriveConfidence } from './dispersion.js';
import { inputHashFromSamples } from './hash.js';
import { computeMedian } from './math.js';

export interface ResolveMarketParams {
  config: MarketConfig;
  adapters: readonly VenueAdapter[];
  /** Settlement time — the oracle window is [now - windowMs, now]. */
  now: TimestampMs;
  oracleCfg: typeof ORACLE;
  /** Override partition aggregation; defaults to oracleCfg.partitionAggregation. */
  partitionAggregation?: 'median' | 'mean' | 'trimmed_mean';
}

function aggregatePartitionPrices(
  prices: readonly number[],
  method: 'median' | 'mean' | 'trimmed_mean',
): UsdCents {
  if (prices.length === 0) return usdCents(0);
  const sorted = [...prices].sort((a, b) => a - b);
  if (method === 'median') {
    return usdCents(computeMedian(prices));
  } else if (method === 'mean') {
    const sum = sorted.reduce((a, b) => a + b, 0);
    return usdCents(Math.floor(sum / sorted.length));
  } else {
    // trimmed_mean: drop lowest and highest, mean the rest
    const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
    const sum = trimmed.reduce((a, b) => a + b, 0);
    return usdCents(Math.floor(sum / trimmed.length));
  }
}

/**
 * Pure, replayable settlement function.
 * No Date.now() — clock is injected via `now`.
 */
export function resolveMarket({
  config,
  adapters,
  now,
  oracleCfg,
  partitionAggregation,
}: ResolveMarketParams): RampResolution {
  const windowMs = oracleCfg.windowMs;
  const windowEnd = now;
  const windowStart = timestampMs(windowEnd - windowMs);
  const partitionMs = oracleCfg.partitionSeconds * 1000;
  const partitionCount = oracleCfg.partitionCount;
  const aggMethod = partitionAggregation ?? oracleCfg.partitionAggregation;

  // Fetch all samples from window start minus stale lead-in for fill-from-start
  const leadTime = oracleCfg.staleMs;
  const allSamplesMap = new Map<VenueId, VenueQuote[]>();
  for (const adapter of adapters) {
    const samples = adapter.samplesBetween(
      timestampMs(windowStart - leadTime),
      windowEnd,
    );
    allSamplesMap.set(adapter.venueId, samples);
  }

  // Collect window-only samples for inputHash
  const windowSamples: VenueQuote[] = [];
  for (const adapter of adapters) {
    const s = adapter.samplesBetween(windowStart, windowEnd);
    windowSamples.push(...s);
  }
  const inputHash = inputHashFromSamples(windowSamples);

  const partitions: PartitionResult[] = [];
  const partitionMadBps: number[] = [];
  const allExclusionsByVenue = new Map<VenueId, { reason: VenueExclusionReason; deviationBps?: Bps }>();
  const allSurvivorVenues = new Set<VenueId>();

  for (let p = 0; p < partitionCount; p++) {
    const partitionStart = timestampMs(windowStart + p * partitionMs);
    const partitionEnd = timestampMs(partitionStart + partitionMs);

    const venueData = new Map<VenueId, PartitionVenueData>();
    for (const adapter of adapters) {
      const allSamples = allSamplesMap.get(adapter.venueId) ?? [];
      const twap = midTwap(allSamples, partitionStart, partitionEnd);
      const latestAtEnd = adapter.latestAt(partitionEnd);
      venueData.set(adapter.venueId, { twap, allSamples, latestAtEnd });
    }

    const agg = aggregatePartition(venueData, partitionStart, partitionEnd, oracleCfg);

    partitions.push({
      index: p + 1,
      startTs: partitionStart,
      endTs: partitionEnd,
      priceCents: agg.priceCents,
      validVenues: agg.validVenues,
      excludedVenues: agg.excludedVenues,
    });

    partitionMadBps.push(agg.madBps);

    // Track exclusions (first occurrence per venue wins)
    for (const excl of agg.exclusions) {
      if (!allExclusionsByVenue.has(excl.venue)) {
        allExclusionsByVenue.set(excl.venue, { reason: excl.reason, deviationBps: excl.deviationBps });
      }
    }

    // Track survivors
    for (const adapter of adapters) {
      if (!agg.exclusions.some(e => e.venue === adapter.venueId)) {
        allSurvivorVenues.add(adapter.venueId);
      }
    }
  }

  // Resolution price: aggregate partition prices
  const partitionPrices = partitions.map(p => p.priceCents);
  const resolutionPriceCents = aggregatePartitionPrices(partitionPrices, aggMethod);

  // Window-level dispersion: median of per-partition MAD bps
  const dispersionBpsValue = computeMedian(partitionMadBps);
  const dispersionBpsBranded = bps(dispersionBpsValue);
  const hasUnderservedPartition = partitions.some(p => p.validVenues < oracleCfg.minVenues);
  let dispersionState = classifyDispersion(dispersionBpsValue, oracleCfg);
  if (hasUnderservedPartition) dispersionState = 'DISLOCATED';

  const { confidenceBps, confidence } = deriveConfidence(
    dispersionBpsBranded,
    dispersionState,
    oracleCfg,
    resolutionPriceCents,
    config.thresholdCents,
  );

  const outcome: Side = resolutionPriceCents > config.thresholdCents ? 'YES' : 'NO';

  const sourcesExcluded = [...allExclusionsByVenue.entries()].map(([venue, e]) => ({
    venue,
    reason: e.reason,
    ...(e.deviationBps !== undefined ? { deviationBps: e.deviationBps } : {}),
  }));

  const sourcesUsed = adapters
    .map(a => a.venueId)
    .filter(v => allSurvivorVenues.has(v));

  return {
    marketId: config.marketId,
    method: 'RAMP_V1',
    ruleVersion: oracleCfg.ruleVersion,
    thresholdCents: config.thresholdCents,
    expiryTs: now,
    window: {
      startTs: windowStart,
      endTs: windowEnd,
      partitionSeconds: oracleCfg.partitionSeconds,
      partitionCount,
    },
    venueInput: 'mid_price_twap',
    venueAggregation: 'median',
    partitionAggregation: aggMethod,
    partitions,
    resolutionPriceCents,
    outcome,
    tieRule: 'YES requires resolutionPrice > threshold',
    confidenceBps,
    confidence,
    dispersionState,
    sourcesUsed,
    sourcesExcluded,
    inputHash,
  };
}
