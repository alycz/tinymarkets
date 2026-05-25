import {
  type Bps,
  type FormingResolutionVenue,
  type MarketConfig,
  type ResolutionQualityFlag,
  type Side,
  type TimestampMs,
  type UsdCents,
  type VenueExclusionReason,
  type VenueId,
  type VenueQuote,
  type VenueWeightedTwapResolution,
  bps,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import { midTwapMillicents, spreadTwap } from './twap.js';
import { classifyDispersion, deriveConfidence } from './dispersion.js';
import { inputHashFromResolutionInputs } from './hash.js';
import {
  computeMad,
  computeMedian,
  roundMillicentsToCentsHalfUp,
  type UsdMillicents,
} from './math.js';
import type { OracleConfig } from './oracle-config.js';

export interface ResolveMarketParams {
  config: MarketConfig;
  adapters: readonly VenueAdapter[];
  /** Settlement time; the oracle window is [now - windowMs, now]. */
  now: TimestampMs;
  oracleCfg: OracleConfig;
}

interface VenueCandidate {
  venue: VenueId;
  twapMillicents: UsdMillicents;
  twapCents: UsdCents;
  staticWeight: number;
}

interface ExclusionRecord {
  venue: VenueId;
  reason: VenueExclusionReason;
  deviationBps?: Bps;
}

/**
 * Pure, replayable settlement function.
 * No Date.now() - clock is injected via `now`.
 */
export function resolveMarket({
  config,
  adapters,
  now,
  oracleCfg,
}: ResolveMarketParams): VenueWeightedTwapResolution {
  const windowEnd = now;
  const windowStart = timestampMs(windowEnd - oracleCfg.windowMs);
  const leadTime = oracleCfg.staleMs;

  const allSamplesMap = new Map<VenueId, VenueQuote[]>();
  for (const adapter of adapters) {
    const samples = adapter.samplesBetween(timestampMs(windowStart - leadTime), windowEnd);
    allSamplesMap.set(adapter.venueId, samples);
  }

  const inputSamples = [...allSamplesMap.values()].flat();
  const inputHash = inputHashFromResolutionInputs({
    samples: inputSamples,
    venues: adapters.map(adapter => ({ venueId: adapter.venueId, quote: adapter.quote })),
    config,
    expiryTs: now,
    oracleCfg,
  });

  const exclusions = new Map<VenueId, ExclusionRecord>();
  const healthCandidates: VenueCandidate[] = [];
  const allTwapCandidates: VenueCandidate[] = [];

  for (const adapter of adapters) {
    const allSamples = allSamplesMap.get(adapter.venueId) ?? [];
    const twap = midTwapMillicents(allSamples, windowStart, windowEnd);
    const latestAtEnd = adapter.latestAt(windowEnd);
    const staticWeight = oracleCfg.weights[adapter.venueId] ?? 0;

    if (twap !== null) {
      allTwapCandidates.push({
        venue: adapter.venueId,
        twapMillicents: twap,
        twapCents: usdCents(roundMillicentsToCentsHalfUp(twap)),
        staticWeight,
      });
    }

    if (twap === null) {
      exclusions.set(adapter.venueId, { venue: adapter.venueId, reason: 'MISSING' });
      continue;
    }
    if (latestAtEnd === null || windowEnd - latestAtEnd.ts > oracleCfg.staleMs) {
      exclusions.set(adapter.venueId, { venue: adapter.venueId, reason: 'STALE' });
      continue;
    }
    const hasCrossed = allSamples.some(
      q => q.ts >= windowStart && q.ts <= windowEnd && q.bidCents >= q.askCents,
    );
    if (hasCrossed) {
      exclusions.set(adapter.venueId, { venue: adapter.venueId, reason: 'CROSSED_BOOK' });
      continue;
    }
    const windowSpread = spreadTwap(allSamples, windowStart, windowEnd);
    if (windowSpread > oracleCfg.wideSpreadBps) {
      exclusions.set(adapter.venueId, { venue: adapter.venueId, reason: 'WIDE_SPREAD' });
      continue;
    }

    healthCandidates.push({
      venue: adapter.venueId,
      twapMillicents: twap,
      twapCents: usdCents(roundMillicentsToCentsHalfUp(twap)),
      staticWeight,
    });
  }

  const medianTwap = computeMedian(healthCandidates.map(c => c.twapMillicents));
  const outlierThresholdMillicents = Math.max(
    (medianTwap * oracleCfg.outlierBpsFloor) / 10_000,
    oracleCfg.outlierUsdCentsFloor * 10,
  );
  const survivors: VenueCandidate[] = [];
  for (const candidate of healthCandidates) {
    const deviation = Math.abs(candidate.twapMillicents - medianTwap);
    const deviationBps = medianTwap > 0 ? Math.round((deviation / medianTwap) * 10_000) : 0;
    if (deviation > outlierThresholdMillicents) {
      exclusions.set(candidate.venue, {
        venue: candidate.venue,
        reason: 'OUTLIER',
        deviationBps: bps(deviationBps),
      });
    } else {
      survivors.push(candidate);
    }
  }

  const fallback = survivors.length < oracleCfg.minVenues;
  const pricingCandidates = fallback
    ? (healthCandidates.length > 0 ? healthCandidates : allTwapCandidates)
    : survivors;
  const normalizedWeights = normalizeWeights(pricingCandidates);
  const weightedMillicents = weightedMeanMillicents(pricingCandidates, normalizedWeights);
  const fallbackMedian = computeMedian(pricingCandidates.map(c => c.twapMillicents));
  const resolutionMillicents = weightedMillicents ?? fallbackMedian;
  const resolutionPriceCents = usdCents(roundMillicentsToCentsHalfUp(resolutionMillicents));
  const outcome: Side = resolutionPriceCents > config.thresholdCents ? 'YES' : 'NO';

  const survivorValues = pricingCandidates.map(c => c.twapMillicents);
  const dispersionBpsValue =
    survivorValues.length > 1 && resolutionMillicents > 0
      ? Math.round((computeMad(survivorValues, computeMedian(survivorValues)) / resolutionMillicents) * 10_000)
      : 0;
  let dispersionState = classifyDispersion(dispersionBpsValue, oracleCfg);
  if (fallback) dispersionState = 'DISLOCATED';

  const { confidenceBps, confidence } = deriveConfidence(
    bps(dispersionBpsValue),
    dispersionState,
    oracleCfg,
    survivors.length,
    bps(0),
    resolutionPriceCents,
    config.thresholdCents,
  );

  const thresholdBandCents = Math.round((config.thresholdCents * confidenceBps) / 10_000);
  const qualityFlags: ResolutionQualityFlag[] = [];
  if (fallback) qualityFlags.push('FALLBACK_SIMULATED_AGGREGATE');
  if (survivors.length < oracleCfg.minVenues) qualityFlags.push('INSUFFICIENT_VALID_VENUES');
  if (dispersionState !== 'NORMAL') qualityFlags.push('HIGH_DISPERSION');
  if (Math.abs(resolutionPriceCents - config.thresholdCents) <= thresholdBandCents) {
    qualityFlags.push('NEAR_THRESHOLD');
  }

  const normalizedByVenue = new Map(normalizedWeights.map(w => [w.venue, w.weight]));
  const includedVenues = new Set(pricingCandidates.map(c => c.venue));
  const venueTwaps: FormingResolutionVenue[] = adapters.map(adapter => {
    const candidate = allTwapCandidates.find(c => c.venue === adapter.venueId);
    const exclusion = exclusions.get(adapter.venueId);
    return {
      venue: adapter.venueId,
      twapCents: candidate?.twapCents ?? null,
      weight: oracleCfg.weights[adapter.venueId] ?? 0,
      ...(normalizedByVenue.has(adapter.venueId) ? { normalizedWeight: normalizedByVenue.get(adapter.venueId)! } : {}),
      included: includedVenues.has(adapter.venueId),
      ...(exclusion ? { excludedReason: exclusion.reason } : {}),
      ...(exclusion?.deviationBps !== undefined ? { deviationBps: exclusion.deviationBps } : {}),
    };
  });

  const sourcesUsed = pricingCandidates.map(c => c.venue);
  const sourcesExcluded = [...exclusions.values()];
  const threshold = centsToUsd(config.thresholdCents);
  const resolutionPrice = centsToUsd(resolutionPriceCents);

  return {
    market_id: config.marketId,
    expiry_ts: now,
    threshold,
    resolution_price: resolutionPrice,
    outcome,
    method: 'VENUE_WEIGHTED_TWAP_V1',
    sources_used: sourcesUsed,
    sources_excluded: sourcesExcluded,

    marketId: config.marketId,
    ruleVersion: oracleCfg.ruleVersion,
    thresholdCents: config.thresholdCents,
    expiryTs: now,
    window: {
      startTs: windowStart,
      endTs: windowEnd,
      windowMs: oracleCfg.windowMs,
    },
    venueInput: 'mid_price_twap',
    venueAggregation: 'weighted_mean_after_outlier_rejection',
    venueTwaps,
    weights: adapters.map(adapter => ({
      venue: adapter.venueId,
      weight: oracleCfg.weights[adapter.venueId] ?? 0,
    })),
    normalizedWeights,
    resolutionPriceCents,
    tieRule: 'YES requires resolutionPrice > threshold',
    confidenceBps,
    confidence,
    dispersionState,
    qualityFlags,
    sourcesUsed,
    sourcesExcluded,
    inputHash,
  };
}

function normalizeWeights(candidates: readonly VenueCandidate[]): { venue: VenueId; weight: number }[] {
  const positive = candidates.filter(c => c.staticWeight > 0);
  const total = positive.reduce((sum, c) => sum + c.staticWeight, 0);
  if (positive.length === 0 || total <= 0) {
    const equal = candidates.length > 0 ? 1 / candidates.length : 0;
    return candidates.map(c => ({ venue: c.venue, weight: equal }));
  }
  return positive.map(c => ({ venue: c.venue, weight: c.staticWeight / total }));
}

function weightedMeanMillicents(
  candidates: readonly VenueCandidate[],
  normalizedWeights: readonly { venue: VenueId; weight: number }[],
): UsdMillicents | null {
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

function centsToUsd(cents: UsdCents): number {
  return Math.round((cents as number)) / 100;
}
