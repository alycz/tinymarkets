/**
 * @jet/config — tunable parameters in one place.
 * Values are plain numbers with documented units; consumers brand them via @jet/shared
 * constructors at use. Kept dependency-free so it type-checks standalone.
 */

export const MARKET = {
  /** locked: 2-minute markets */
  durationMs: 120_000,
  /** demo cash per user: $1,000 -> cents */
  startingBalanceCents: 100_000,
} as const;

export const ORACLE = {
  method: 'RAMP_V1',
  ruleVersion: 'ramp-v1.0.0',
  /** live indicative feed refresh */
  sampleIntervalMs: 1_000,
  /** final settlement window: last 30s ... */
  windowMs: 30_000,
  /** ... split into six 5s partitions */
  partitionCount: 6,
  partitionSeconds: 5,
  /** within-venue input + aggregation (locked decisions) */
  venueInput: 'mid_price_twap',
  venueAggregation: 'median',
  partitionAggregation: 'median', // default; 'mean' / 'trimmed_mean' available for comparison
  /** venue exclusion thresholds */
  staleMs: 3_000,
  wideSpreadBps: 15,
  /** outlier rule: exclude beyond max(floor, madMultiple * MAD) bps from cross-venue median */
  outlierBpsFloor: 10,
  madMultiple: 3,
  minVenues: 3,
  /** dispersion regime thresholds (bps), anchored to observed data */
  dispersion: { elevatedBps: 5, stressedBps: 12, dislocatedBps: 25 },
} as const;

export const VENUES = {
  /** USD-quoted: settle directly (mirrors CME constituents) */
  usd: ['coinbase', 'kraken', 'bitstamp', 'gemini', 'lmax', 'itbit'],
  /** USDT-quoted: admit only with USDT/USD basis adjustment + lower confidence */
  usdt: ['binance', 'okx', 'bybit'],
} as const;
