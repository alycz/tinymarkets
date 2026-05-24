import { createHash } from 'node:crypto';
import type { VenueQuote } from '@jet/shared';

/**
 * Canonical deterministic hash of the input samples.
 * Sort order: ts asc, then venue asc, then bidCents asc, then askCents asc.
 * Serialized as compact JSON array-of-arrays for reproducibility across machines.
 */
export function inputHashFromSamples(samples: readonly VenueQuote[]): string {
  const sorted = [...samples].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.venue !== b.venue) return a.venue < b.venue ? -1 : 1;
    if (a.bidCents !== b.bidCents) return a.bidCents - b.bidCents;
    return a.askCents - b.askCents;
  });

  const canonical = sorted.map(q => [q.ts, q.venue, q.bidCents, q.askCents]);
  const json = JSON.stringify(canonical);
  const hash = createHash('sha256').update(json).digest('hex');
  return `sha256:${hash}`;
}
