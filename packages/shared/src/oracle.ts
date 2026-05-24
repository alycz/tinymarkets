import type { Side } from './orders';
import type { Bps, MarketId, TimestampMs, UsdCents } from './units';

/** Vetted venues. USD-quoted first (mirrors CME constituents); USDT-quoted carry basis risk. */
export type VenueId =
  | 'coinbase' | 'kraken' | 'bitstamp' | 'gemini' | 'lmax' | 'itbit'   // USD
  | 'binance' | 'okx' | 'bybit';                                       // USDT (basis-adjusted, lower confidence)

export type QuoteCurrency = 'USD' | 'USDT';

export type VenueExclusionReason =
  | 'STALE'           // last update older than ORACLE.staleMs
  | 'MISSING'         // no quote
  | 'CROSSED_BOOK'    // bid >= ask
  | 'WIDE_SPREAD'     // spread exceeds ORACLE.wideSpreadBps
  | 'OUTLIER'         // deviation from cross-venue median > max(floor, k * MAD)
  | 'INSUFFICIENT_DATA';

/**
 * Dispersion regime, anchored to observed data (Kaiko: ~<5 bps normal weekday,
 * ~18 bps during the Jan-2026 XRP manipulation). One signal, three readouts:
 * it sets venue exclusion aggressiveness, the confidence band, and this state.
 */
export type DispersionState = 'NORMAL' | 'ELEVATED' | 'STRESSED' | 'DISLOCATED';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Per-venue health for the transparency panel. Drives include/exclude — NEVER weighting. */
export interface VenueHealth {
  venue: VenueId;
  quote: QuoteCurrency;
  /** venue mid in USD cents (USDT venues already basis-adjusted); null if missing/stale */
  midCents: UsdCents | null;
  spreadBps: Bps;
  lastUpdateMs: TimestampMs;
  healthy: boolean;
  excludedReason?: VenueExclusionReason;
}

/**
 * Live Indicative Price — what the user sees and (loosely) trades against.
 * Equal-weight median of healthy venue mids, refreshed ~1s.
 * This is intentionally NOT the settlement price.
 */
export interface IndicativeSnapshot {
  marketId: MarketId;
  priceCents: UsdCents;
  /** OUTPUT-only confidence band, derived from dispersion + venue count */
  confidenceBps: Bps;
  confidence: ConfidenceLevel;
  dispersionBps: Bps;
  dispersionState: DispersionState;
  venues: VenueHealth[];
  ts: TimestampMs;
}

/** One 5s slice of the final settlement window. */
export interface PartitionResult {
  index: number;          // 1..partitionCount
  startTs: TimestampMs;
  endTs: TimestampMs;
  /** equal-weight median of surviving venues' mid-price TWAPs for this slice */
  priceCents: UsdCents;
  validVenues: number;
  excludedVenues: number;
}

/**
 * RAMP_V1 — the deterministic, replayable settlement object.
 * Resolution price = median of the partition prices (not mean — robust to
 * clustered end-of-window spikes). inputHash makes it recomputable from logs.
 */
export interface RampResolution {
  marketId: MarketId;
  method: 'RAMP_V1';
  ruleVersion: string;
  thresholdCents: UsdCents;
  expiryTs: TimestampMs;
  window: {
    startTs: TimestampMs;
    endTs: TimestampMs;
    partitionSeconds: number; // 5
    partitionCount: number;   // 6
  };
  venueInput: 'mid_price_twap';
  venueAggregation: 'median';
  partitionAggregation: 'median' | 'mean' | 'trimmed_mean'; // median = default; others behind a flag for comparison
  partitions: PartitionResult[];
  resolutionPriceCents: UsdCents;
  /** 'YES' iff resolutionPriceCents > thresholdCents, else 'NO' */
  outcome: Side;
  tieRule: 'YES requires resolutionPrice > threshold';
  confidenceBps: Bps;
  /** LOW when the resolution price lands within the confidence band of the threshold */
  confidence: ConfidenceLevel;
  dispersionState: DispersionState;
  sourcesUsed: VenueId[];
  sourcesExcluded: { venue: VenueId; reason: VenueExclusionReason; deviationBps?: Bps }[];
  /** sha256 of the canonical input samples — anyone can replay and verify */
  inputHash: string;
}

/**
 * Illustrative manipulation-cost estimate (STRETCH).
 * Computed from SIMULATED book depth — illustrative, not a measured liquidity figure.
 */
export interface AttackCostEstimate {
  singleVenueCents: UsdCents;
  medianBasketCents: UsdCents;
  simulated: true;
}
