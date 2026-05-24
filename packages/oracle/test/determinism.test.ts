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

describe('determinism', () => {
  it('same seed + scenario + clock → byte-identical RampResolution', () => {
    const { adapters: adapters1 } = buildScenario('HONEST', SEED, MARKET_START_MS);
    const { adapters: adapters2 } = buildScenario('HONEST', SEED, MARKET_START_MS);

    const r1 = resolveMarket({ config: CONFIG, adapters: adapters1, now: NOW, oracleCfg: ORACLE });
    const r2 = resolveMarket({ config: CONFIG, adapters: adapters2, now: NOW, oracleCfg: ORACLE });

    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.resolutionPriceCents).toBe(r2.resolutionPriceCents);
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.partitions).toEqual(r2.partitions);
    expect(r1.sourcesExcluded).toEqual(r2.sourcesExcluded);
  });

  it('different seed → different inputHash', () => {
    const { adapters: adapters1 } = buildScenario('HONEST', SEED, MARKET_START_MS);
    const { adapters: adapters2 } = buildScenario('HONEST', SEED + 1, MARKET_START_MS);

    const r1 = resolveMarket({ config: CONFIG, adapters: adapters1, now: NOW, oracleCfg: ORACLE });
    const r2 = resolveMarket({ config: CONFIG, adapters: adapters2, now: NOW, oracleCfg: ORACLE });

    expect(r1.inputHash).not.toBe(r2.inputHash);
  });
});
