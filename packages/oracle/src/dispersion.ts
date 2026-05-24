import {
  type Bps,
  type ConfidenceLevel,
  type DispersionState,
  type UsdCents,
  bps,
} from '@jet/shared';
import type { ORACLE } from '@jet/config';

type OracleCfg = typeof ORACLE;

/** Bucket the cross-venue MAD-bps into a dispersion regime. */
export function classifyDispersion(madBps: number, oracleCfg: OracleCfg): DispersionState {
  if (madBps >= oracleCfg.dispersion.dislocatedBps) return 'DISLOCATED';
  if (madBps >= oracleCfg.dispersion.stressedBps) return 'STRESSED';
  if (madBps >= oracleCfg.dispersion.elevatedBps) return 'ELEVATED';
  return 'NORMAL';
}

/**
 * Derive the output-only confidence band.
 *
 * `confidenceBps` = max(dispersionBps, outlierBpsFloor), minimum 1.
 * `confidence` = LOW if stressed/dislocated or resolution price near threshold;
 *                MEDIUM if elevated; HIGH otherwise.
 *
 * `thresholdCents` is optional: omit for indicative snapshots where there's no strike.
 */
export function deriveConfidence(
  dispersionBps: Bps,
  dispersionState: DispersionState,
  oracleCfg: OracleCfg,
  resolutionPriceCents?: UsdCents,
  thresholdCents?: UsdCents,
): { confidenceBps: Bps; confidence: ConfidenceLevel } {
  const confBpsValue = Math.max(1, Math.round(Math.max(dispersionBps, oracleCfg.outlierBpsFloor)));
  const confidenceBpsVal = bps(confBpsValue);

  const nearThreshold =
    resolutionPriceCents !== undefined &&
    thresholdCents !== undefined &&
    Math.abs(resolutionPriceCents - thresholdCents) <= confBpsValue;

  let confidence: ConfidenceLevel;
  if (dispersionState === 'STRESSED' || dispersionState === 'DISLOCATED' || nearThreshold) {
    confidence = 'LOW';
  } else if (dispersionState === 'ELEVATED') {
    confidence = 'MEDIUM';
  } else {
    confidence = 'HIGH';
  }

  return { confidenceBps: confidenceBpsVal, confidence };
}
