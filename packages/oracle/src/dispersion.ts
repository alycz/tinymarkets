import {
  type Bps,
  type ConfidenceLevel,
  type DispersionState,
  type UsdCents,
  bps,
} from '@jet/shared';
import type { OracleConfig } from './oracle-config.js';

/** Bucket the cross-venue MAD-bps into a dispersion regime. */
export function classifyDispersion(madBps: number, oracleCfg: OracleConfig): DispersionState {
  if (madBps >= oracleCfg.dispersion.dislocatedBps) return 'DISLOCATED';
  if (madBps >= oracleCfg.dispersion.stressedBps) return 'STRESSED';
  if (madBps >= oracleCfg.dispersion.elevatedBps) return 'ELEVATED';
  return 'NORMAL';
}

/**
 * Derive the output-only confidence band.
 *
 * `confidenceBps` is derived from residual survivor dispersion and optional window variance.
 * `confidence` is LOW on too few survivors, stressed/dislocated dispersion, or near-threshold
 * resolution; MEDIUM on minimum survivor count or elevated variance; HIGH otherwise.
 *
 * `thresholdCents` is optional: omit for indicative snapshots where there's no strike.
 */
export function deriveConfidence(
  dispersionBps: Bps,
  dispersionState: DispersionState,
  oracleCfg: OracleConfig,
  survivorCount: number,
  partitionVarianceBps: Bps,
  resolutionPriceCents?: UsdCents,
  thresholdCents?: UsdCents,
): { confidenceBps: Bps; confidence: ConfidenceLevel } {
  const confBpsValue = Math.max(
    1,
    Math.round(Math.max(dispersionBps, partitionVarianceBps, oracleCfg.outlierBpsFloor)),
  );
  const confidenceBpsVal = bps(confBpsValue);

  const thresholdBandCents = thresholdCents !== undefined
    ? Math.round((thresholdCents * confBpsValue) / 10_000)
    : 0;
  const nearThreshold =
    resolutionPriceCents !== undefined &&
    thresholdCents !== undefined &&
    Math.abs(resolutionPriceCents - thresholdCents) <= thresholdBandCents;

  let confidence: ConfidenceLevel;
  if (
    survivorCount < oracleCfg.minVenues ||
    dispersionState === 'STRESSED' ||
    dispersionState === 'DISLOCATED' ||
    nearThreshold
  ) {
    confidence = 'LOW';
  } else if (
    survivorCount === oracleCfg.minVenues ||
    dispersionState === 'ELEVATED' ||
    partitionVarianceBps >= oracleCfg.dispersion.elevatedBps
  ) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'HIGH';
  }

  return { confidenceBps: confidenceBpsVal, confidence };
}
