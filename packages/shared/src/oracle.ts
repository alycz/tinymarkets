import type { Side } from './orders';
import type { Bps, MarketId, TimestampMs, UsdCents } from './units';

/** Vetted venues. USD-quoted first (mirrors CME constituents); USDT-quoted carry basis risk. */
export type VenueId =
  | 'coinbase' | 'kraken' | 'bitstamp' | 'gemini' | 'lmax' | 'itbit'   // USD
  | 'binance' | 'okx' | 'bybit';                                       // USDT (basis-adjusted, lower confidence)

export type QuoteCurrency = 'USD' | 'USDT';

/** A raw top-of-book sample from a single venue, in integer USD cents. */
export interface VenueQuote {
  venue: VenueId;
  quote: QuoteCurrency;
  /** Already basis-adjusted to USD if the venue is USDT-quoted. */
  bidCents: UsdCents;
  askCents: UsdCents;
  ts: TimestampMs;
}

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
export type DemoMode = 'simulated' | 'live' | 'hybrid';
export type OracleDemoScenario = 'NEAR_EXPIRY_SPIKE' | 'SUBTLE_DISLOCATION';
export type ResolutionQualityFlag =
  | 'INSUFFICIENT_VALID_VENUES'
  | 'HIGH_DISPERSION'
  | 'NEAR_THRESHOLD'
  | 'FALLBACK_SIMULATED_AGGREGATE';

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

/** Live BTC/USD oracle price. This is intentionally NOT the traded YES share price. */
export interface IndicativeSnapshot {
  marketId: MarketId;
  btcPriceCents: UsdCents;
  /** OUTPUT-only confidence band, derived from dispersion + venue count */
  confidenceBps: Bps;
  confidence: ConfidenceLevel;
  dispersionBps: Bps;
  dispersionState: DispersionState;
  venues: VenueHealth[];
  ts: TimestampMs;
  /** Present only while the final VENUE_WEIGHTED_TWAP_V1 window is forming; never settlement. */
  formingResolution?: FormingResolution;
}

export interface FormingResolutionVenue {
  venue: VenueId;
  twapCents: UsdCents | null;
  weight: number;
  normalizedWeight?: number;
  included: boolean;
  excludedReason?: VenueExclusionReason;
  deviationBps?: Bps;
}

/** Live, non-settlement preview of the final TWAP window as it forms. */
export interface FormingResolution {
  method: 'VENUE_WEIGHTED_TWAP_V1';
  window: {
    startTs: TimestampMs;
    endTs: TimestampMs;
    windowMs: number;
  };
  formingPriceCents: UsdCents;
  complete: boolean;
  elapsedMs: number;
  venues: FormingResolutionVenue[];
}

/**
 * VENUE_WEIGHTED_TWAP_V1 — deterministic BTC/USD settlement object.
 * Required snake_case fields match the methodology brief; camelCase cent fields are
 * audit/display helpers used by the local app.
 */
export interface VenueWeightedTwapResolution {
  market_id: MarketId;
  expiry_ts: TimestampMs;
  threshold: number;
  resolution_price: number;
  method: 'VENUE_WEIGHTED_TWAP_V1';
  sources_used: VenueId[];
  sources_excluded: { venue: VenueId; reason: VenueExclusionReason; deviationBps?: Bps }[];

  marketId: MarketId;
  ruleVersion: string;
  thresholdCents: UsdCents;
  expiryTs: TimestampMs;
  window: {
    startTs: TimestampMs;
    endTs: TimestampMs;
    windowMs: number;
  };
  venueInput: 'mid_price_twap';
  venueAggregation: 'weighted_mean_after_outlier_rejection';
  venueTwaps: FormingResolutionVenue[];
  weights: { venue: VenueId; weight: number }[];
  normalizedWeights: { venue: VenueId; weight: number }[];
  resolutionPriceCents: UsdCents;
  /** 'YES' iff resolutionPriceCents > thresholdCents, else 'NO' */
  outcome: Side;
  tieRule: 'YES requires resolutionPrice > threshold';
  confidenceBps: Bps;
  /** LOW when the resolution price lands within the confidence band of the threshold */
  confidence: ConfidenceLevel;
  dispersionState: DispersionState;
  qualityFlags: ResolutionQualityFlag[];
  sourcesUsed: VenueId[];
  sourcesExcluded: { venue: VenueId; reason: VenueExclusionReason; deviationBps?: Bps }[];
  /** sha256 of canonical resolution-affecting inputs — anyone can replay and verify */
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
