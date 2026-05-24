import type { UsdCents } from '@jet/shared';
import { makeRng } from './prng.js';

/**
 * A deterministic BTC price path indexed by elapsed milliseconds from market start.
 * Pre-rolled at 100ms resolution so all venues share the same underlying truth.
 */
export type BasePathFn = (elapsedMs: number) => UsdCents;

/**
 * Pre-rolls a random walk BTC price path.
 * @param seed - deterministic seed
 * @param startCents - starting BTC price in USD cents
 * @param durationMs - total path duration to pre-roll (should be market duration + buffer)
 */
export function makeRandomWalkPath(
  seed: number,
  startCents: number,
  durationMs: number,
): BasePathFn {
  const resolution = 100; // 100ms buckets
  const nBuckets = Math.ceil(durationMs / resolution) + 600; // 60s headroom
  const path = new Int32Array(nBuckets);
  path[0] = startCents;
  const rng = makeRng(seed);
  for (let i = 1; i < nBuckets; i++) {
    // ~$5/s drift = 500 cents/s = 50 cents/100ms bucket
    const delta = Math.round((rng() - 0.5) * 100);
    path[i] = (path[i - 1] ?? startCents) + delta;
  }
  return (elapsedMs: number): UsdCents => {
    const bucket = Math.max(0, Math.min(Math.round(elapsedMs / resolution), path.length - 1));
    return (path[bucket] ?? startCents) as UsdCents;
  };
}
