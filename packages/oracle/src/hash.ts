import { createHash } from 'node:crypto';
import type { MarketConfig, QuoteCurrency, TimestampMs, VenueId, VenueQuote } from '@jet/shared';
import type { OracleConfig, PartitionAggregation } from './oracle-config.js';

/**
 * Canonical deterministic hash of the input samples.
 * Sort order: ts asc, then venue asc, quote asc, bidCents asc, then askCents asc.
 * Serialized as compact JSON array-of-arrays for reproducibility across machines.
 */
export function inputHashFromSamples(samples: readonly VenueQuote[]): string {
  const sorted = [...samples].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.venue !== b.venue) return a.venue < b.venue ? -1 : 1;
    if (a.quote !== b.quote) return a.quote < b.quote ? -1 : 1;
    if (a.bidCents !== b.bidCents) return a.bidCents - b.bidCents;
    return a.askCents - b.askCents;
  });

  const canonical = sorted.map(q => [q.ts, q.venue, q.quote, q.bidCents, q.askCents]);
  const json = JSON.stringify(canonical);
  const hash = createHash('sha256').update(json).digest('hex');
  return `sha256:${hash}`;
}

export interface ResolutionInputHashParams {
  samples: readonly VenueQuote[];
  venues: readonly { venueId: VenueId; quote: QuoteCurrency }[];
  config: MarketConfig;
  expiryTs: TimestampMs;
  oracleCfg: OracleConfig;
  partitionAggregation: PartitionAggregation;
}

export function inputHashFromResolutionInputs({
  samples,
  venues,
  config,
  expiryTs,
  oracleCfg,
  partitionAggregation,
}: ResolutionInputHashParams): string {
  const payload = {
    market: {
      marketId: config.marketId,
      thresholdCents: config.thresholdCents,
      expiryTs,
    },
    oracle: {
      method: oracleCfg.method,
      ruleVersion: oracleCfg.ruleVersion,
      windowMs: oracleCfg.windowMs,
      partitionSeconds: oracleCfg.partitionSeconds,
      partitionCount: oracleCfg.partitionCount,
      staleMs: oracleCfg.staleMs,
      wideSpreadBps: oracleCfg.wideSpreadBps,
      outlierBpsFloor: oracleCfg.outlierBpsFloor,
      madMultiple: oracleCfg.madMultiple,
      minVenues: oracleCfg.minVenues,
      venueInput: oracleCfg.venueInput,
      venueAggregation: oracleCfg.venueAggregation,
      partitionAggregation,
      dispersion: oracleCfg.dispersion,
    },
    venues: canonicalVenues(venues),
    samples: canonicalSamples(samples),
  };
  const json = stableStringify(payload);
  const hash = createHash('sha256').update(json).digest('hex');
  return `sha256:${hash}`;
}

function canonicalVenues(venues: readonly { venueId: VenueId; quote: QuoteCurrency }[]) {
  return [...venues]
    .sort((a, b) => {
      if (a.venueId !== b.venueId) return a.venueId < b.venueId ? -1 : 1;
      return a.quote < b.quote ? -1 : a.quote > b.quote ? 1 : 0;
    })
    .map(v => [v.venueId, v.quote]);
}

function canonicalSamples(samples: readonly VenueQuote[]) {
  return [...samples]
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.venue !== b.venue) return a.venue < b.venue ? -1 : 1;
      if (a.quote !== b.quote) return a.quote < b.quote ? -1 : 1;
      if (a.bidCents !== b.bidCents) return a.bidCents - b.bidCents;
      return a.askCents - b.askCents;
    })
    .map(q => [q.ts, q.venue, q.quote, q.bidCents, q.askCents]);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
