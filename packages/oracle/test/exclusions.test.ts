import { describe, expect, it } from 'vitest';
import { buildScenario } from '../src/scenarios.js';
import { resolveMarket } from '../src/resolve.js';
import { ORACLE } from '@jet/config';
import { type MarketConfig, timestampMs, usdCents } from '@jet/shared';

const SEED = 99;
const MARKET_START_MS = 1_700_000_000_000;
const NOW = timestampMs(MARKET_START_MS + 120_000);

const CONFIG: MarketConfig = {
  marketId: 'test-excl',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('venue exclusions', () => {
  it('STALE: high-latency venue excluded with STALE reason', () => {
    const { adapters } = buildScenario('STALE_VENUE', SEED, MARKET_START_MS);
    const result = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    const staleExcl = result.sourcesExcluded.find(e => e.reason === 'STALE');
    expect(staleExcl).toBeDefined();
    expect(staleExcl?.venue).toBe('itbit');
    // Remaining 4 venues still produce a valid resolution
    expect(result.resolutionPriceCents).toBeGreaterThan(0);
  });

  it('CROSSED_BOOK: venue with inverted book excluded with CROSSED_BOOK reason', () => {
    const { adapters } = buildScenario('CROSSED_BOOK', SEED, MARKET_START_MS);
    const result = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    const crossedExcl = result.sourcesExcluded.find(e => e.reason === 'CROSSED_BOOK');
    expect(crossedExcl).toBeDefined();
    expect(crossedExcl?.venue).toBe('lmax');
    expect(result.resolutionPriceCents).toBeGreaterThan(0);
  });

  it('WIDE_SPREAD: venue with >15 bps spread excluded with WIDE_SPREAD reason', () => {
    const { adapters } = buildScenario('WIDE_SPREAD', SEED, MARKET_START_MS);
    const result = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    const wideExcl = result.sourcesExcluded.find(e => e.reason === 'WIDE_SPREAD');
    expect(wideExcl).toBeDefined();
    expect(wideExcl?.venue).toBe('gemini');
    expect(result.resolutionPriceCents).toBeGreaterThan(0);
  });
});
