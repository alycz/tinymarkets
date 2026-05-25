import {
  type Bps,
  type TimestampMs,
  type UsdCents,
  type VenueExclusionReason,
  type VenueId,
  type VenueQuote,
  bps,
  usdCents,
} from '@jet/shared';
import {
  computeMad,
  computeMedian,
  roundMillicentsToCentsHalfUp,
  type UsdMillicents,
} from './math.js';
import { spreadTwap } from './twap.js';
import type { OracleConfig } from './oracle-config.js';

export interface PartitionVenueData {
  /** Stair-step TWAP of (bid+ask)/2 over the partition; null if venue has no live quote. */
  twap: UsdMillicents | null;
  /** All venue quotes up to partitionEnd (for spread/crossed-book checks + fill-from-start). */
  allSamples: VenueQuote[];
  /** Result of adapter.latestAt(partitionEnd) — used for STALE gate. */
  latestAtEnd: VenueQuote | null;
}

export interface ExclusionRecord {
  venue: VenueId;
  reason: VenueExclusionReason;
  deviationBps?: Bps;
}

export interface AggPartitionResult {
  btcPriceMillicents: UsdMillicents;
  btcPriceCents: UsdCents;
  validVenues: number;
  excludedVenues: number;
  exclusions: ExclusionRecord[];
  /** Cross-venue MAD in bps — used for window-level dispersion calculation. */
  madBps: Bps;
}

/**
 * Aggregate a single 5-second partition:
 * 1. Apply per-venue health gates (MISSING, STALE, CROSSED_BOOK, WIDE_SPREAD).
 * 2. Compute cross-venue median and MAD-based outlier exclusion.
 * 3. Return median price of survivors + exclusion records.
 */
export function aggregatePartition(
  venueData: Map<VenueId, PartitionVenueData>,
  partitionStart: TimestampMs,
  partitionEnd: TimestampMs,
  oracleCfg: OracleConfig,
): AggPartitionResult {
  const exclusions: ExclusionRecord[] = [];
  const validTwaps = new Map<VenueId, number>();

  for (const [venue, data] of venueData) {
    // MISSING: no live sample touching the partition
    if (data.twap === null) {
      exclusions.push({ venue, reason: 'MISSING' });
      continue;
    }

    // STALE: latest observable quote at partitionEnd is too old
    if (
      data.latestAtEnd === null ||
      partitionEnd - data.latestAtEnd.ts > oracleCfg.staleMs
    ) {
      exclusions.push({ venue, reason: 'STALE' });
      continue;
    }

    // CROSSED_BOOK: any sample in the partition has bid >= ask
    const hasCrossed = data.allSamples.some(
      q => q.ts >= partitionStart && q.ts <= partitionEnd && q.bidCents >= q.askCents,
    );
    if (hasCrossed) {
      exclusions.push({ venue, reason: 'CROSSED_BOOK' });
      continue;
    }

    // WIDE_SPREAD: TWAP-weighted spread bps over partition > threshold
    const wSpread = spreadTwap(data.allSamples, partitionStart, partitionEnd);
    if (wSpread > oracleCfg.wideSpreadBps) {
      exclusions.push({ venue, reason: 'WIDE_SPREAD' });
      continue;
    }

    validTwaps.set(venue, data.twap);
  }

  // --- Cross-venue MAD outlier rule ---
  const twapValues = [...validTwaps.values()];
  const crossVenueMedian = computeMedian(twapValues);
  const mad = computeMad(twapValues, crossVenueMedian);
  const madBpsValue = crossVenueMedian > 0
    ? Math.round((mad / crossVenueMedian) * 10_000)
    : 0;
  const outlierThreshold = Math.max(oracleCfg.outlierBpsFloor, oracleCfg.madMultiple * madBpsValue);

  const survivors = new Map<VenueId, number>();
  for (const [venue, twap] of validTwaps) {
    const devBps = crossVenueMedian > 0
      ? Math.round((Math.abs(twap - crossVenueMedian) / crossVenueMedian) * 10_000)
      : 0;
    if (devBps > outlierThreshold) {
      exclusions.push({ venue, reason: 'OUTLIER', deviationBps: bps(devBps) });
    } else {
      survivors.set(venue, twap);
    }
  }

  const survivorValues = [...survivors.values()];
  const btcPriceMillicents = survivorValues.length > 0
    ? computeMedian(survivorValues)
    : crossVenueMedian > 0 ? crossVenueMedian : 0;

  return {
    btcPriceMillicents,
    btcPriceCents: usdCents(roundMillicentsToCentsHalfUp(btcPriceMillicents)),
    validVenues: survivors.size,
    excludedVenues: exclusions.length,
    exclusions,
    madBps: bps(madBpsValue),
  };
}
