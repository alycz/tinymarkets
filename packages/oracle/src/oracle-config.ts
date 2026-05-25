import type { VenueId } from '@jet/shared';

export interface OracleConfig {
  method: string;
  ruleVersion: string;
  sampleIntervalMs: number;
  windowMs: number;
  venueInput: 'mid_price_twap';
  venueAggregation: 'weighted_mean_after_outlier_rejection';
  staleMs: number;
  wideSpreadBps: number;
  outlierBpsFloor: number;
  outlierUsdCentsFloor: number;
  minVenues: number;
  weights: Partial<Record<VenueId, number>>;
  dispersion: {
    elevatedBps: number;
    stressedBps: number;
    dislocatedBps: number;
  };
}
