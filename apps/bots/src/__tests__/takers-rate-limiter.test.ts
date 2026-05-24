import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../takers/rate-limiter.js';

describe('taker token bucket', () => {
  it('caps refill throughput to TPS over a two second window after the initial burst', () => {
    const bucket = new TokenBucket(4, 4, 0);

    for (let i = 0; i < 4; i++) {
      expect(bucket.tryTake(0)).toBe(true);
    }
    expect(bucket.tryTake(0)).toBe(false);

    let accepted = 0;
    for (let now = 1; now <= 2_000; now += 10) {
      if (bucket.tryTake(now)) accepted++;
    }

    expect(accepted).toBeGreaterThanOrEqual(7);
    expect(accepted).toBeLessThanOrEqual(8);
  });

  it('refill resumes after drain', () => {
    const bucket = new TokenBucket(2, 2, 0);

    expect(bucket.tryTake(0)).toBe(true);
    expect(bucket.tryTake(0)).toBe(true);
    expect(bucket.tryTake(0)).toBe(false);
    expect(bucket.tryTake(500)).toBe(true);
    expect(bucket.tryTake(500)).toBe(false);
    expect(bucket.tryTake(1_000)).toBe(true);
  });
});
