/** Internal integer math utilities for the oracle package. */

export function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.floor(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  }
  return sorted[mid] ?? 0;
}

export function computeMad(values: readonly number[], median: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map(v => Math.abs(v - median));
  return computeMedian(deviations);
}
