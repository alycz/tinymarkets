import {
  type FormingResolution,
  type MarketConfig,
  type TimestampMs,
  type VenueId,
  type VenueQuote,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import type { PartitionVenueData } from './partition.js';
import { midTwapMillicents } from './twap.js';
import { aggregatePartition } from './partition.js';
import { computeMedian, roundMillicentsToCentsHalfUp, type UsdMillicents } from './math.js';
import type { OracleConfig } from './oracle-config.js';

export interface BuildFormingResolutionParams {
  config: MarketConfig;
  expiryTs: TimestampMs;
  adapters: readonly VenueAdapter[];
  now: TimestampMs;
  oracleCfg: OracleConfig;
}

/**
 * Non-settlement preview of the final window.
 * Uses the same partition aggregation as resolveMarket, bounded by current server time.
 */
export function buildFormingResolution({
  expiryTs,
  adapters,
  now,
  oracleCfg,
}: BuildFormingResolutionParams): FormingResolution | null {
  const windowEnd = expiryTs;
  const windowStart = timestampMs(windowEnd - oracleCfg.windowMs);
  if (now <= windowStart) return null;

  const boundedNow = timestampMs(Math.min(now, windowEnd));
  const partitionMs = oracleCfg.partitionSeconds * 1000;
  const leadTime = oracleCfg.staleMs;

  const allSamplesMap = new Map<VenueId, VenueQuote[]>();
  for (const adapter of adapters) {
    const samples = adapter.samplesBetween(
      timestampMs(windowStart - leadTime),
      boundedNow,
    );
    allSamplesMap.set(adapter.venueId, samples);
  }

  const partitions = [];
  const partitionPriceMillicents: UsdMillicents[] = [];
  for (let p = 0; p < oracleCfg.partitionCount; p++) {
    const partitionStart = timestampMs(windowStart + p * partitionMs);
    if (partitionStart >= boundedNow) break;

    const fullPartitionEnd = timestampMs(partitionStart + partitionMs);
    const partitionEnd = timestampMs(Math.min(fullPartitionEnd, boundedNow));

    const venueData = new Map<VenueId, PartitionVenueData>();
    for (const adapter of adapters) {
      const allSamples = allSamplesMap.get(adapter.venueId) ?? [];
      const twap = midTwapMillicents(allSamples, partitionStart, partitionEnd);
      const latestAtEnd = adapter.latestAt(partitionEnd);
      venueData.set(adapter.venueId, { twap, allSamples, latestAtEnd });
    }

    const agg = aggregatePartition(venueData, partitionStart, partitionEnd, oracleCfg);
    partitionPriceMillicents.push(agg.btcPriceMillicents);
    partitions.push({
      index: p + 1,
      startTs: partitionStart,
      endTs: partitionEnd,
      btcPriceCents: agg.btcPriceCents,
      validVenues: agg.validVenues,
      excludedVenues: agg.excludedVenues,
      complete: fullPartitionEnd <= boundedNow,
    });
  }

  if (partitions.length === 0) return null;

  return {
    method: 'RAMP_V1',
    window: {
      startTs: windowStart,
      endTs: windowEnd,
      partitionSeconds: oracleCfg.partitionSeconds,
      partitionCount: oracleCfg.partitionCount,
    },
    formingPriceCents: usdCents(roundMillicentsToCentsHalfUp(computeMedian(partitionPriceMillicents))),
    partitions,
  };
}
