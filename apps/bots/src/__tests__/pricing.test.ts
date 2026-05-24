import { describe, it, expect } from 'vitest';
import { usdCents, priceCents, MIN_PRICE_CENTS, MAX_PRICE_CENTS } from '@jet/shared';
import { fairYesProbCents, buildQuoteLadder } from '../mm/pricing.js';

const BASE_SIGMA = 0.005;
const MS_TOTAL = 120_000;
const STRIKE = usdCents(10_000_000); // $100,000

describe('fairYesProbCents', () => {
  it('returns 50 when BTC equals strike at any time', () => {
    expect(fairYesProbCents(STRIKE, STRIKE, 60_000, MS_TOTAL, BASE_SIGMA)).toBe(50);
    expect(fairYesProbCents(STRIKE, STRIKE, 10_000, MS_TOTAL, BASE_SIGMA)).toBe(50);
    expect(fairYesProbCents(STRIKE, STRIKE, 1, MS_TOTAL, BASE_SIGMA)).toBe(50);
  });

  it('is monotonic: higher BTC → higher or equal YES price', () => {
    const btcPrices = [9_800_000, 9_900_000, 10_000_000, 10_100_000, 10_200_000].map(usdCents);
    const fairs = btcPrices.map(p => fairYesProbCents(p, STRIKE, 60_000, MS_TOTAL, BASE_SIGMA));
    for (let i = 1; i < fairs.length; i++) {
      expect(fairs[i]!).toBeGreaterThanOrEqual(fairs[i - 1]!);
    }
  });

  it('always clamps output to 1..99', () => {
    const veryHigh = usdCents(STRIKE * 10);
    const veryLow = usdCents(Math.round(STRIKE * 0.1));
    expect(fairYesProbCents(veryHigh, STRIKE, 60_000, MS_TOTAL, BASE_SIGMA)).toBeLessThanOrEqual(99);
    expect(fairYesProbCents(veryLow, STRIKE, 60_000, MS_TOTAL, BASE_SIGMA)).toBeGreaterThanOrEqual(1);
  });

  it('converges to 99 when BTC >1% above strike near expiry', () => {
    const btcAbove = usdCents(Math.round(STRIKE * 1.02));
    expect(fairYesProbCents(btcAbove, STRIKE, 100, MS_TOTAL, BASE_SIGMA)).toBe(99);
  });

  it('converges to 1 when BTC >1% below strike near expiry', () => {
    const btcBelow = usdCents(Math.round(STRIKE * 0.98));
    expect(fairYesProbCents(btcBelow, STRIKE, 100, MS_TOTAL, BASE_SIGMA)).toBe(1);
  });
});

describe('buildQuoteLadder', () => {
  it('all prices stay within 1..99 walls', () => {
    // Normal case
    const levels = buildQuoteLadder(priceCents(50), 2, 5, 1, 20);
    for (const level of levels) {
      expect(level.priceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.priceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('all prices stay within 1..99 walls near the floor', () => {
    const levels = buildQuoteLadder(priceCents(2), 2, 5, 1, 20);
    for (const level of levels) {
      expect(level.priceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.priceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('all prices stay within 1..99 walls near the ceiling', () => {
    const levels = buildQuoteLadder(priceCents(98), 2, 5, 1, 20);
    for (const level of levels) {
      expect(level.priceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.priceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('bids are below fair and asks are above fair', () => {
    const fair = priceCents(50);
    const levels = buildQuoteLadder(fair, 2, 5, 1, 20);
    const bids = levels.filter(l => l.side === 'BID');
    const asks = levels.filter(l => l.side === 'ASK');
    for (const b of bids) expect(b.priceCents).toBeLessThan(fair);
    for (const a of asks) expect(a.priceCents).toBeGreaterThan(fair);
  });

  it('no duplicate prices within a side (deduplicates clamped levels)', () => {
    // fair=2 causes bid levels to clamp to 1, producing duplicates that should collapse
    const levels = buildQuoteLadder(priceCents(2), 2, 5, 1, 20);
    const bidPrices = levels.filter(l => l.side === 'BID').map(l => l.priceCents);
    const askPrices = levels.filter(l => l.side === 'ASK').map(l => l.priceCents);
    expect(new Set(bidPrices).size).toBe(bidPrices.length);
    expect(new Set(askPrices).size).toBe(askPrices.length);
  });
});
