import { describe, expect, it } from 'vitest';
import { ORACLE } from '@jet/config';
import { type MarketConfig, timestampMs, usdCents } from '@jet/shared';
import { buildScenario } from '../src/scenarios.js';
import { resolveMarket } from '../src/resolve.js';

const SEED = 42;
const MARKET_START_MS = 1_700_000_000_000;
const NOW = timestampMs(MARKET_START_MS + 120_000);
const CONFIG: MarketConfig = {
  marketId: 'subtle-dislocation',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('SUBTLE_DISLOCATION', () => {
  it('single-venue subtle dislocation is deterministic and does not flip honest consensus', () => {
    const { adapters: honestAdapters } = buildScenario('HONEST', SEED, MARKET_START_MS);
    const { adapters: subtleAdapters } = buildScenario('SUBTLE_DISLOCATION', SEED, MARKET_START_MS);
    const { adapters: repeatedSubtleAdapters } = buildScenario('SUBTLE_DISLOCATION', SEED, MARKET_START_MS);

    const honest = resolveMarket({ config: CONFIG, adapters: honestAdapters, now: NOW, oracleCfg: ORACLE });
    const subtle = resolveMarket({ config: CONFIG, adapters: subtleAdapters, now: NOW, oracleCfg: ORACLE });
    const repeated = resolveMarket({ config: CONFIG, adapters: repeatedSubtleAdapters, now: NOW, oracleCfg: ORACLE });

    expect(subtle).toEqual(repeated);
    expect(subtle.outcome).toBe(honest.outcome);
    expect(
      subtle.sourcesExcluded.some(e => e.venue === 'binance' && e.reason === 'OUTLIER') ||
        subtle.confidence !== 'HIGH' ||
        subtle.qualityFlags.includes('HIGH_DISPERSION'),
    ).toBe(true);

    const binanceUsage = subtle.sourceUsage.find(s => s.venue === 'binance');
    expect(binanceUsage).toBeDefined();
    expect((binanceUsage?.partitionsUsed ?? 0) + (binanceUsage?.partitionsExcluded ?? 0)).toBe(ORACLE.partitionCount);
  });
});
