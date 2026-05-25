import {
  type Bps,
  type MarketConfig,
  type PartitionResult,
  type RampResolution,
  type ResolutionQualityFlag,
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
import type { PartitionVenueData } from './partition.js';
import { midTwapMillicents } from './twap.js';
import { aggregatePartition } from './partition.js';
import { classifyDispersion, deriveConfidence } from './dispersion.js';
import { inputHashFromResolutionInputs } from './hash.js';
import { computeMedian, roundMillicentsToCentsHalfUp, type UsdMillicents } from './math.js';
import type { OracleConfig, PartitionAggregation } from './oracle-config.js';

export interface ResolveMarketParams {
  config: MarketConfig;
  adapters: readonly VenueAdapter[];
  /** Settlement time — the oracle window is [now - windowMs, now]. */
  now: TimestampMs;
  oracleCfg: OracleConfig;
  /** Override partition aggregation; defaults to oracleCfg.partitionAggregation. */
  partitionAggregation?: PartitionAggregation;
}

function aggregatePartitionPrices(
  prices: readonly UsdMillicents[],
  method: PartitionAggregation,
): UsdCents {
  if (prices.length === 0) return usdCents(0);
  const sorted = [...prices].sort((a, b) => a - b);
  let millicents: number;
  if (method === 'median') {
    millicents = computeMedian(prices);
  } else if (method === 'mean') {
    const sum = sorted.reduce((a, b) => a + b, 0);
    millicents = sum / sorted.length;
  } else {
    // trimmed_mean: drop lowest and highest, mean the rest
    const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
    const sum = trimmed.reduce((a, b) => a + b, 0);
    millicents = sum / trimmed.length;
  }
  return usdCents(roundMillicentsToCentsHalfUp(millicents));
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

  const inputSamples = [...allSamplesMap.values()].flat();
  const inputHash = inputHashFromResolutionInputs({
    samples: inputSamples,
    venues: adapters.map(adapter => ({ venueId: adapter.venueId, quote: adapter.quote })),
    config,
    expiryTs: now,
    oracleCfg,
    partitionAggregation: aggMethod,
  });

  const partitions: PartitionResult[] = [];
  const partitionPriceMillicents: UsdMillicents[] = [];
  const partitionMadBps: number[] = [];
  const allExclusionsByVenue = new Map<VenueId, { reason: VenueExclusionReason; deviationBps?: Bps }>();
  const allSurvivorVenues = new Set<VenueId>();
  const sourceUsageByVenue = new Map<VenueId, { partitionsUsed: number; partitionsExcluded: number }>();
  for (const adapter of adapters) {
    sourceUsageByVenue.set(adapter.venueId, { partitionsUsed: 0, partitionsExcluded: 0 });
  }

  for (let p = 0; p < partitionCount; p++) {
    const partitionStart = timestampMs(windowStart + p * partitionMs);
    const partitionEnd = timestampMs(partitionStart + partitionMs);

    const venueData = new Map<VenueId, PartitionVenueData>();
    for (const adapter of adapters) {
      const allSamples = allSamplesMap.get(adapter.venueId) ?? [];
      const twap = midTwapMillicents(allSamples, partitionStart, partitionEnd);
      const latestAtEnd = adapter.latestAt(partitionEnd);
      venueData.set(adapter.venueId, { twap, allSamples, latestAtEnd });
    }

    const agg = aggregatePartition(venueData, partitionStart, partitionEnd, oracleCfg);

    partitions.push({
      index: p + 1,
      startTs: partitionStart,
      endTs: partitionEnd,
      btcPriceCents: agg.btcPriceCents,
      validVenues: agg.validVenues,
      excludedVenues: agg.excludedVenues,
    });
    partitionPriceMillicents.push(agg.btcPriceMillicents);

    partitionMadBps.push(agg.madBps);

    // Track exclusions (first occurrence per venue wins)
    for (const excl of agg.exclusions) {
      if (!allExclusionsByVenue.has(excl.venue)) {
        allExclusionsByVenue.set(excl.venue, { reason: excl.reason, deviationBps: excl.deviationBps });
      }
    }

    const excludedThisPartition = new Set(agg.exclusions.map(e => e.venue));
    for (const adapter of adapters) {
      const usage = sourceUsageByVenue.get(adapter.venueId)!;
      if (excludedThisPartition.has(adapter.venueId)) {
        usage.partitionsExcluded += 1;
      } else {
        usage.partitionsUsed += 1;
        allSurvivorVenues.add(adapter.venueId);
      }
    }
  }

  // Resolution price: aggregate partition prices
  const resolutionPriceCents = aggregatePartitionPrices(partitionPriceMillicents, aggMethod);

  // Window-level dispersion: median of per-partition MAD bps
  const dispersionBpsValue = computeMedian(partitionMadBps);
  const dispersionBpsBranded = bps(dispersionBpsValue);
  const hasUnderservedPartition = partitions.some(p => p.validVenues < oracleCfg.minVenues);
  let dispersionState = classifyDispersion(dispersionBpsValue, oracleCfg);
  if (hasUnderservedPartition) dispersionState = 'DISLOCATED';

  const meanPartitionPrice = partitionPriceMillicents.reduce((sum, p) => sum + p, 0) / Math.max(1, partitionPriceMillicents.length);
  const partitionVarianceBps = meanPartitionPrice > 0
    ? Math.round(
        computeMedian(partitionPriceMillicents.map(p => Math.abs(p - meanPartitionPrice))) /
          meanPartitionPrice *
          10_000,
      )
    : 0;

  const { confidenceBps, confidence } = deriveConfidence(
    dispersionBpsBranded,
    dispersionState,
    oracleCfg,
    Math.min(...partitions.map(p => p.validVenues)),
    bps(partitionVarianceBps),
    resolutionPriceCents,
    config.thresholdCents,
  );

  const outcome: Side = resolutionPriceCents > config.thresholdCents ? 'YES' : 'NO';
  const thresholdBandCents = Math.round((config.thresholdCents * confidenceBps) / 10_000);
  const nearThreshold = Math.abs(resolutionPriceCents - config.thresholdCents) <= thresholdBandCents;
  const qualityFlags: ResolutionQualityFlag[] = [];
  if (hasUnderservedPartition) qualityFlags.push('INSUFFICIENT_VALID_VENUES');
  if (dispersionState !== 'NORMAL') qualityFlags.push('HIGH_DISPERSION');
  if (nearThreshold) qualityFlags.push('NEAR_THRESHOLD');

  const sourcesExcluded = [...allExclusionsByVenue.entries()].map(([venue, e]) => ({
    venue,
    reason: e.reason,
    ...(e.deviationBps !== undefined ? { deviationBps: e.deviationBps } : {}),
  }));

  const sourcesUsed = adapters
    .map(a => a.venueId)
    .filter(v => allSurvivorVenues.has(v));
  const sourceUsage = adapters.map(adapter => ({
    venue: adapter.venueId,
    partitionsUsed: sourceUsageByVenue.get(adapter.venueId)?.partitionsUsed ?? 0,
    partitionsExcluded: sourceUsageByVenue.get(adapter.venueId)?.partitionsExcluded ?? 0,
  }));

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
    qualityFlags,
    sourcesUsed,
    sourceUsage,
    sourcesExcluded,
    inputHash,
  };
}
