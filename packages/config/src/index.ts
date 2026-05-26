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
  /** local demo liquidity provider */
  marketMakerUserId: 'market-maker-1',
  /** demo cash for the market maker: $1,000,000 -> cents */
  marketMakerStartingBalanceCents: 100_000_000,
} as const;

export const ORACLE = {
  method: 'VENUE_WEIGHTED_TWAP_V1',
  ruleVersion: 'venue-weighted-twap-v1.0.0',
  /** live indicative feed refresh */
  sampleIntervalMs: 1_000,
  /** final settlement window: last 15s */
  windowMs: 15_000,
  /** within-venue input + aggregation (locked decisions) */
  venueInput: 'mid_price_twap',
  venueAggregation: 'weighted_mean_after_outlier_rejection',
  /** venue exclusion thresholds */
  staleMs: 3_000,
  wideSpreadBps: 15,
  /** outlier rule: exclude beyond max(25bps, $100) from cross-venue median */
  outlierBpsFloor: 25,
  outlierUsdCentsFloor: 10_000,
  minVenues: 2,
  weights: {
    coinbase: 0.30,
    binance: 0.30,
    kraken: 0.20,
    okx: 0.10,
    bitstamp: 0.10,
  },
  /** dispersion regime thresholds (bps), anchored to observed data */
  dispersion: { elevatedBps: 5, stressedBps: 12, dislocatedBps: 25 },
} as const;

export const VENUES = {
  /** USD-quoted: settle directly (mirrors CME constituents) */
  usd: ['coinbase', 'kraken', 'bitstamp', 'gemini', 'lmax', 'itbit'],
  /** USDT-quoted: admit only with USDT/USD basis adjustment + lower confidence */
  usdt: ['binance', 'okx', 'bybit'],
} as const;
