import { describe, expect, it } from 'vitest';
import { ORACLE } from '@jet/config';
import { type MarketConfig, timestampMs, usdCents } from '@jet/shared';
import { buildFormingResolution } from '../src/forming-resolution.js';
import { buildIndicative } from '../src/indicative.js';
import { resolveMarket } from '../src/resolve.js';
import { buildScenario } from '../src/scenarios.js';

const SEED = 42;
const MARKET_START_MS = 1_700_000_000_000;
const EXPIRY_TS = timestampMs(MARKET_START_MS + 120_000);
const CONFIG: MarketConfig = {
  marketId: 'test-btc-2m',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('indicative oracle transparency', () => {
  it('marks the live spiked venue as an OUTLIER while preserving its divergent mid', () => {
    const { adapters } = buildScenario('NEAR_EXPIRY_SPIKE', SEED, MARKET_START_MS);
    const snapshot = buildIndicative({
      marketId: CONFIG.marketId,
      adapters,
      now: timestampMs(MARKET_START_MS + 116_000),
      oracleCfg: ORACLE,
    });

    const binance = snapshot.venues.find(v => v.venue === 'binance');
    expect(binance).toBeDefined();
    expect(binance?.midCents).not.toBeNull();
    expect(binance?.healthy).toBe(false);
    expect(binance?.excludedReason).toBe('OUTLIER');
  });

  it('accumulates forming partitions only inside the final window', () => {
    const { adapters } = buildScenario('HONEST', SEED, MARKET_START_MS);

    const beforeWindow = buildFormingResolution({
      config: CONFIG,
      expiryTs: EXPIRY_TS,
      adapters,
      now: timestampMs(MARKET_START_MS + 89_000),
      oracleCfg: ORACLE,
    });
    expect(beforeWindow).toBeNull();

    const duringWindow = buildFormingResolution({
      config: CONFIG,
      expiryTs: EXPIRY_TS,
      adapters,
      now: timestampMs(MARKET_START_MS + 100_000),
      oracleCfg: ORACLE,
    });
    expect(duringWindow?.partitions).toHaveLength(2);
    expect(duringWindow?.partitions.every(p => p.complete)).toBe(true);
  });

  it('matches the final RampResolution partition median at expiry', () => {
    const { adapters } = buildScenario('NEAR_EXPIRY_SPIKE', SEED, MARKET_START_MS);
    const forming = buildFormingResolution({
      config: CONFIG,
      expiryTs: EXPIRY_TS,
      adapters,
      now: EXPIRY_TS,
      oracleCfg: ORACLE,
    });
    const resolved = resolveMarket({
      config: CONFIG,
      adapters,
      now: EXPIRY_TS,
      oracleCfg: ORACLE,
    });

    expect(forming?.partitions).toHaveLength(ORACLE.partitionCount);
    expect(forming?.formingPriceCents).toBe(resolved.resolutionPriceCents);
    expect(forming?.partitions.map(p => p.priceCents)).toEqual(
      resolved.partitions.map(p => p.priceCents),
    );
  });
});
