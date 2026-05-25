import {
  type FormingResolution,
  type FormingResolutionVenue,
  type MarketConfig,
  type TimestampMs,
  type VenueExclusionReason,
  type VenueId,
  bps,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import { midTwapMillicents, spreadTwap } from './twap.js';
import { computeMedian, roundMillicentsToCentsHalfUp, type UsdMillicents } from './math.js';
import type { OracleConfig } from './oracle-config.js';

export interface BuildFormingResolutionParams {
  config: MarketConfig;
  expiryTs: TimestampMs;
  adapters: readonly VenueAdapter[];
  now: TimestampMs;
  oracleCfg: OracleConfig;
}

interface Candidate {
  venue: VenueId;
  twapMillicents: UsdMillicents;
  weight: number;
}

/** Live, non-settlement preview of the final 15s weighted TWAP window. */
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
  const exclusions = new Map<VenueId, { reason: VenueExclusionReason; deviationBps?: number }>();
  const candidates: Candidate[] = [];
  const allCandidates: Candidate[] = [];

  for (const adapter of adapters) {
    const samples = adapter.samplesBetween(timestampMs(windowStart - oracleCfg.staleMs), boundedNow);
    const twap = midTwapMillicents(samples, windowStart, boundedNow);
    const latestAtEnd = adapter.latestAt(boundedNow);
    const weight = oracleCfg.weights[adapter.venueId] ?? 0;
    if (twap !== null) allCandidates.push({ venue: adapter.venueId, twapMillicents: twap, weight });

    if (twap === null) {
      exclusions.set(adapter.venueId, { reason: 'MISSING' });
      continue;
    }
    if (latestAtEnd === null || boundedNow - latestAtEnd.ts > oracleCfg.staleMs) {
      exclusions.set(adapter.venueId, { reason: 'STALE' });
      continue;
    }
    if (samples.some(q => q.ts >= windowStart && q.ts <= boundedNow && q.bidCents >= q.askCents)) {
      exclusions.set(adapter.venueId, { reason: 'CROSSED_BOOK' });
      continue;
    }
    if (spreadTwap(samples, windowStart, boundedNow) > oracleCfg.wideSpreadBps) {
      exclusions.set(adapter.venueId, { reason: 'WIDE_SPREAD' });
      continue;
    }
    candidates.push({ venue: adapter.venueId, twapMillicents: twap, weight });
  }

  const median = computeMedian(candidates.map(c => c.twapMillicents));
  const threshold = Math.max(
    (median * oracleCfg.outlierBpsFloor) / 10_000,
    oracleCfg.outlierUsdCentsFloor * 10,
  );
  const survivors: Candidate[] = [];
  for (const candidate of candidates) {
    const deviation = Math.abs(candidate.twapMillicents - median);
    const deviationBps = median > 0 ? Math.round((deviation / median) * 10_000) : 0;
    if (deviation > threshold) {
      exclusions.set(candidate.venue, { reason: 'OUTLIER', deviationBps });
    } else {
      survivors.push(candidate);
    }
  }

  const pricingCandidates = survivors.length >= oracleCfg.minVenues
    ? survivors
    : candidates.length > 0 ? candidates : allCandidates;
  if (pricingCandidates.length === 0) return null;

  const normalizedWeights = normalizeWeights(pricingCandidates);
  const normalizedByVenue = new Map(normalizedWeights.map(w => [w.venue, w.weight]));
  const includedVenues = new Set(pricingCandidates.map(c => c.venue));
  const price = weightedMean(pricingCandidates, normalizedWeights) ?? computeMedian(pricingCandidates.map(c => c.twapMillicents));
  const byVenue = new Map(allCandidates.map(c => [c.venue, c]));

  const venues: FormingResolutionVenue[] = adapters.map(adapter => {
    const candidate = byVenue.get(adapter.venueId);
    const exclusion = exclusions.get(adapter.venueId);
    return {
      venue: adapter.venueId,
      twapCents: candidate ? usdCents(roundMillicentsToCentsHalfUp(candidate.twapMillicents)) : null,
      weight: oracleCfg.weights[adapter.venueId] ?? 0,
      ...(normalizedByVenue.has(adapter.venueId) ? { normalizedWeight: normalizedByVenue.get(adapter.venueId)! } : {}),
      included: includedVenues.has(adapter.venueId),
      ...(exclusion ? { excludedReason: exclusion.reason } : {}),
      ...(exclusion?.deviationBps !== undefined ? { deviationBps: bps(exclusion.deviationBps) } : {}),
    };
  });

  return {
    method: 'VENUE_WEIGHTED_TWAP_V1',
    window: {
      startTs: windowStart,
      endTs: windowEnd,
      windowMs: oracleCfg.windowMs,
    },
    formingPriceCents: usdCents(roundMillicentsToCentsHalfUp(price)),
    complete: boundedNow >= windowEnd,
    elapsedMs: boundedNow - windowStart,
    venues,
  };
}

function normalizeWeights(candidates: readonly Candidate[]): { venue: VenueId; weight: number }[] {
  const positive = candidates.filter(c => c.weight > 0);
  const total = positive.reduce((sum, c) => sum + c.weight, 0);
  if (positive.length === 0 || total <= 0) {
    const equal = candidates.length > 0 ? 1 / candidates.length : 0;
    return candidates.map(c => ({ venue: c.venue, weight: equal }));
  }
  return positive.map(c => ({ venue: c.venue, weight: c.weight / total }));
}

function weightedMean(
  candidates: readonly Candidate[],
  normalizedWeights: readonly { venue: VenueId; weight: number }[],
): number | null {
  if (candidates.length === 0 || normalizedWeights.length === 0) return null;
  const byVenue = new Map(candidates.map(c => [c.venue, c.twapMillicents]));
  let sum = 0;
  let weightSum = 0;
  for (const weight of normalizedWeights) {
    const price = byVenue.get(weight.venue);
    if (price === undefined) continue;
    sum += price * weight.weight;
    weightSum += weight.weight;
  }
  return weightSum > 0 ? sum / weightSum : null;
}
