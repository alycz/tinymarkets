import { describe, expect, it } from 'vitest';
import { buildScenario } from '../src/scenarios.js';
import { resolveMarket } from '../src/resolve.js';
import { ORACLE } from '@jet/config';
import { type MarketConfig, timestampMs, usdCents } from '@jet/shared';

const SEED = 42;
const MARKET_START_MS = 1_700_000_000_000;
const NOW = timestampMs(MARKET_START_MS + 120_000);

const CONFIG: MarketConfig = {
  marketId: 'test-btc-2m',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('NEAR_EXPIRY_SPIKE', () => {
  it('spike venue excluded with OUTLIER; outcome matches honest baseline', () => {
    const { adapters: honestAdapters } = buildScenario('HONEST', SEED, MARKET_START_MS);
    const { adapters: spikeAdapters } = buildScenario('NEAR_EXPIRY_SPIKE', SEED, MARKET_START_MS);

    const honestResult = resolveMarket({
      config: CONFIG,
      adapters: honestAdapters,
      now: NOW,
      oracleCfg: ORACLE,
    });
    const spikeResult = resolveMarket({
      config: CONFIG,
      adapters: spikeAdapters,
      now: NOW,
      oracleCfg: ORACLE,
    });

    // (a) spike venue (binance) is in sourcesExcluded with OUTLIER
    const outlierExcl = spikeResult.sourcesExcluded.find(e => e.reason === 'OUTLIER');
    expect(outlierExcl).toBeDefined();
    expect(outlierExcl?.venue).toBe('binance');
    expect(outlierExcl?.deviationBps).toBeGreaterThan(1_000);

    // (b) outcome is the same as honest baseline
    expect(spikeResult.outcome).toBe(honestResult.outcome);
  });
});
