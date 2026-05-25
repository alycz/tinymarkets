import { describe, it, expect } from 'vitest';
import { usdCents, oddsPriceCents, MIN_PRICE_CENTS, MAX_PRICE_CENTS } from '@jet/shared';
import { buildLevelSpecs, buildQuoteLadder, fairYesProbCents } from '../mm/pricing.js';

const VOL_SCALE = 50_000;
const MS_TOTAL = 120_000;
const STRIKE = usdCents(10_000_000); // $100,000

function fair(btc: ReturnType<typeof usdCents>, msRemaining: number) {
  return fairYesProbCents({
    btcCents: btc,
    strikeCents: STRIKE,
    msRemaining,
    msTotal: MS_TOTAL,
    volatilityScaleCents: VOL_SCALE,
  });
}

describe('fairYesProbCents', () => {
  it('returns 50 when BTC equals strike at any time', () => {
    expect(fair(STRIKE, 60_000)).toBe(50);
    expect(fair(STRIKE, 10_000)).toBe(50);
    expect(fair(STRIKE, 1)).toBe(50);
  });

  it('is monotonic: higher BTC → higher or equal YES price', () => {
    const btcPrices = [9_800_000, 9_900_000, 10_000_000, 10_100_000, 10_200_000].map(usdCents);
    const fairs = btcPrices.map(p => fair(p, 60_000));
    for (let i = 1; i < fairs.length; i++) {
      expect(fairs[i]!).toBeGreaterThanOrEqual(fairs[i - 1]!);
    }
  });

  it('always clamps output to 2..98', () => {
    const veryHigh = usdCents(STRIKE * 10);
    const veryLow = usdCents(Math.round(STRIKE * 0.1));
    expect(fair(veryHigh, 60_000)).toBe(98);
    expect(fair(veryLow, 60_000)).toBe(2);
  });

  it('converges toward 98 when BTC is far above strike near expiry', () => {
    const btcAbove = usdCents(Math.round(STRIKE * 1.02));
    expect(fair(btcAbove, 100)).toBe(98);
  });

  it('converges toward 2 when BTC is far below strike near expiry', () => {
    const btcBelow = usdCents(Math.round(STRIKE * 0.98));
    expect(fair(btcBelow, 100)).toBe(2);
  });

  it('becomes more sensitive as expiry approaches', () => {
    const btcAbove = usdCents(Math.round(STRIKE + 25_000));
    expect(fair(btcAbove, 5_000)).toBeGreaterThan(fair(btcAbove, 90_000));
  });
});

describe('buildQuoteLadder', () => {
  it('all prices stay within 1..99 walls', () => {
    // Normal case
    const levels = buildQuoteLadder(oddsPriceCents(50), buildLevelSpecs(5, [50, 100, 150]));
    for (const level of levels) {
      expect(level.oddsPriceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.oddsPriceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('all prices stay within 1..99 walls near the floor', () => {
    const levels = buildQuoteLadder(oddsPriceCents(2), buildLevelSpecs(5, [50, 100, 150]));
    for (const level of levels) {
      expect(level.oddsPriceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.oddsPriceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('all prices stay within 1..99 walls near the ceiling', () => {
    const levels = buildQuoteLadder(oddsPriceCents(98), buildLevelSpecs(5, [50, 100, 150]));
    for (const level of levels) {
      expect(level.oddsPriceCents).toBeGreaterThanOrEqual(MIN_PRICE_CENTS);
      expect(level.oddsPriceCents).toBeLessThanOrEqual(MAX_PRICE_CENTS);
    }
  });

  it('bids are below fair and asks are above fair', () => {
    const fair = oddsPriceCents(50);
    const levels = buildQuoteLadder(fair, buildLevelSpecs(5, [50, 100, 150]));
    const bids = levels.filter(l => l.side === 'BID');
    const asks = levels.filter(l => l.side === 'ASK');
    for (const b of bids) expect(b.oddsPriceCents).toBeLessThan(fair);
    for (const a of asks) expect(a.oddsPriceCents).toBeGreaterThan(fair);
  });

  it('emits configured level sizes', () => {
    const levels = buildQuoteLadder(oddsPriceCents(50), buildLevelSpecs(5, [50, 100, 150]));
    expect(levels.filter(l => l.side === 'BID').map(l => l.size)).toEqual([50, 100, 150]);
    expect(levels.filter(l => l.side === 'ASK').map(l => l.size)).toEqual([50, 100, 150]);
  });

  it('no duplicate prices within a side (deduplicates clamped levels)', () => {
    // fair=2 causes bid levels to clamp to 1, producing duplicates that should collapse
    const levels = buildQuoteLadder(oddsPriceCents(2), buildLevelSpecs(5, [50, 100, 150]));
    const bidPrices = levels.filter(l => l.side === 'BID').map(l => l.oddsPriceCents);
    const askPrices = levels.filter(l => l.side === 'ASK').map(l => l.oddsPriceCents);
    expect(new Set(bidPrices).size).toBe(bidPrices.length);
    expect(new Set(askPrices).size).toBe(askPrices.length);
  });
});
