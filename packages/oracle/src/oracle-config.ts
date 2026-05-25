export type PartitionAggregation = 'median' | 'mean' | 'trimmed_mean';

export interface OracleConfig {
  method: string;
  ruleVersion: string;
  sampleIntervalMs: number;
  windowMs: number;
  partitionCount: number;
  partitionSeconds: number;
  venueInput: 'mid_price_twap';
  venueAggregation: 'median';
  partitionAggregation: PartitionAggregation;
  staleMs: number;
  wideSpreadBps: number;
  outlierBpsFloor: number;
  madMultiple: number;
  minVenues: number;
  dispersion: {
    elevatedBps: number;
    stressedBps: number;
    dislocatedBps: number;
  };
}
