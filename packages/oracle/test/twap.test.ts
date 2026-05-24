import { describe, expect, it } from 'vitest';
import { midTwap } from '../src/twap.js';
import { type TimestampMs, type VenueQuote, usdCents, timestampMs } from '@jet/shared';

function makeQuote(ts: number, bid: number, ask: number): VenueQuote {
  return {
    venue: 'coinbase',
    quote: 'USD',
    bidCents: usdCents(bid),
    askCents: usdCents(ask),
    ts: timestampMs(ts),
  };
}

describe('midTwap', () => {
  it('returns null when no quotes', () => {
    expect(midTwap([], timestampMs(0), timestampMs(5000))).toBeNull();
  });

  it('constant mid → same value over the window', () => {
    const quotes = [
      makeQuote(0, 9_999_900, 10_000_100),     // mid = 10_000_000
      makeQuote(2500, 9_999_900, 10_000_100),   // mid = 10_000_000
    ];
    const result = midTwap(quotes, timestampMs(0), timestampMs(5000));
    expect(result).toBe(10_000_000);
  });

  it('one mid change mid-partition → correctly weighted', () => {
    // First half: mid = 10_000_000, second half: mid = 10_002_000
    // Expect: floor((10_000_000 * 2500 + 10_002_000 * 2500) / 5000) = floor(10_001_000) = 10_001_000
    const quotes = [
      makeQuote(0, 9_999_900, 10_000_100),        // mid = 10_000_000
      makeQuote(2500, 10_001_900, 10_002_100),     // mid = 10_002_000
    ];
    const result = midTwap(quotes, timestampMs(0), timestampMs(5000));
    expect(result).toBe(10_001_000);
  });

  it('fill-from-start: pre-partition quote fills from partitionStart', () => {
    // Quote at t=0, partition is [1000, 6000]
    // The pre-partition quote fills from t=1000
    const quotes = [
      makeQuote(0, 9_999_900, 10_000_100),     // mid = 10_000_000, before partition
      makeQuote(3500, 10_001_900, 10_002_100), // mid = 10_002_000, mid-partition
    ];
    // Duration: 1000→3500 = 2500ms at 10_000_000; 3500→6000 = 2500ms at 10_002_000
    const result = midTwap(quotes, timestampMs(1000), timestampMs(6000));
    expect(result).toBe(10_001_000);
  });

  it('quote exactly at partitionEnd is not included in TWAP', () => {
    const quotes = [
      makeQuote(0, 9_999_900, 10_000_100),     // mid = 10_000_000
      makeQuote(5000, 9_999_000, 10_001_000),  // exactly at end, should not change TWAP
    ];
    const result = midTwap(quotes, timestampMs(0), timestampMs(5000));
    expect(result).toBe(10_000_000);
  });
});
