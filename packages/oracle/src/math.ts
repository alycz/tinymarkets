/** Internal integer math utilities for the oracle package. */

export const MILLICENTS_PER_CENT = 10;

/** Internal BTC oracle precision: USD millicents, rounded to cents only at DTO output. */
export type UsdMillicents = number;

export function centsToMillicents(cents: number): UsdMillicents {
  return cents * MILLICENTS_PER_CENT;
}

/** Single documented output rule: round USD millicents to cents, half up. */
export function roundMillicentsToCentsHalfUp(millicents: UsdMillicents): number {
  return Math.floor((millicents + MILLICENTS_PER_CENT / 2) / MILLICENTS_PER_CENT);
}

export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

export function computeMad(values: readonly number[], median: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map(v => Math.abs(v - median));
  return computeMedian(deviations);
}
