import { describe, expect, it } from 'vitest';
import { ORACLE } from '@jet/config';
import {
  type MarketConfig,
  type QuoteCurrency,
  type TimestampMs,
  type VenueId,
  type VenueQuote,
  timestampMs,
  usdCents,
} from '@jet/shared';
import { inputHashFromResolutionInputs } from '../src/hash.js';
import { resolveMarket } from '../src/resolve.js';
import type { VenueAdapter } from '../src/venue-adapter.js';

const MARKET_START_MS = 1_700_000_000_000;
const NOW = timestampMs(MARKET_START_MS + 120_000);
const WINDOW_START = timestampMs(NOW - ORACLE.windowMs);
const CONFIG: MarketConfig = {
  marketId: 'audit-market',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('resolution input hash auditability', () => {
  it('identical settlement inputs produce identical inputHash', () => {
    const adapters1 = standardAdapters();
    const adapters2 = standardAdapters();

    const r1 = resolveMarket({ config: CONFIG, adapters: adapters1, now: NOW, oracleCfg: ORACLE });
    const r2 = resolveMarket({ config: CONFIG, adapters: adapters2, now: NOW, oracleCfg: ORACLE });

    expect(r1.inputHash).toBe(r2.inputHash);
  });

  it('lead-in samples used for TWAP replay are included in inputHash', () => {
    const base = resolveMarket({
      config: CONFIG,
      adapters: standardAdapters({ leadInMidCents: 10_000_000 }),
      now: NOW,
      oracleCfg: ORACLE,
    });
    const changed = resolveMarket({
      config: CONFIG,
      adapters: standardAdapters({ leadInMidCents: 10_001_000 }),
      now: NOW,
      oracleCfg: ORACLE,
    });

    expect(base.inputHash).not.toBe(changed.inputHash);
  });

  it('threshold, ruleVersion, config, and aggregation method affect inputHash', () => {
    const adapters = standardAdapters();
    const base = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    const thresholdChanged = resolveMarket({
      config: { ...CONFIG, thresholdCents: usdCents(10_000_001) },
      adapters,
      now: NOW,
      oracleCfg: ORACLE,
    });
    const ruleChanged = resolveMarket({
      config: CONFIG,
      adapters,
      now: NOW,
      oracleCfg: { ...ORACLE, ruleVersion: 'ramp-v1.test' },
    });
    const configChanged = resolveMarket({
      config: CONFIG,
      adapters,
      now: NOW,
      oracleCfg: { ...ORACLE, staleMs: ORACLE.staleMs + 1 },
    });
    const aggregationChanged = resolveMarket({
      config: CONFIG,
      adapters,
      now: NOW,
      oracleCfg: ORACLE,
      partitionAggregation: 'mean',
    });

    expect(base.inputHash).not.toBe(thresholdChanged.inputHash);
    expect(base.inputHash).not.toBe(ruleChanged.inputHash);
    expect(base.inputHash).not.toBe(configChanged.inputHash);
    expect(base.inputHash).not.toBe(aggregationChanged.inputHash);
  });

  it('sample ordering does not affect canonical inputHash', () => {
    const samples = [
      makeQuote('coinbase', 'USD', WINDOW_START - 1_000, 10_000_000),
      makeQuote('kraken', 'USD', WINDOW_START + 1_000, 10_000_100),
      makeQuote('binance', 'USDT', WINDOW_START + 2_000, 10_000_200),
    ];
    const venues = [
      { venueId: 'kraken' as VenueId, quote: 'USD' as QuoteCurrency },
      { venueId: 'binance' as VenueId, quote: 'USDT' as QuoteCurrency },
      { venueId: 'coinbase' as VenueId, quote: 'USD' as QuoteCurrency },
    ];
    const h1 = inputHashFromResolutionInputs({
      samples,
      venues,
      config: CONFIG,
      expiryTs: NOW,
      oracleCfg: ORACLE,
      partitionAggregation: 'median',
    });
    const h2 = inputHashFromResolutionInputs({
      samples: [...samples].reverse(),
      venues: [...venues].reverse(),
      config: CONFIG,
      expiryTs: NOW,
      oracleCfg: ORACLE,
      partitionAggregation: 'median',
    });

    expect(h1).toBe(h2);
  });
});

describe('settlement quality flags', () => {
  it('strict above-threshold rule resolves equality to NO and flags near-threshold quality', () => {
    const result = resolveMarket({
      config: CONFIG,
      adapters: [
        new LeadInAdapter('coinbase', 'USD', CONFIG.thresholdCents, CONFIG.thresholdCents),
        new LeadInAdapter('kraken', 'USD', CONFIG.thresholdCents, CONFIG.thresholdCents),
        new LeadInAdapter('bitstamp', 'USD', CONFIG.thresholdCents, CONFIG.thresholdCents),
        new LeadInAdapter('gemini', 'USD', CONFIG.thresholdCents, CONFIG.thresholdCents),
        new LeadInAdapter('binance', 'USDT', CONFIG.thresholdCents, CONFIG.thresholdCents),
      ],
      now: NOW,
      oracleCfg: ORACLE,
    });

    expect(result.resolutionPriceCents).toBe(CONFIG.thresholdCents);
    expect(result.outcome).toBe('NO');
    expect(result.qualityFlags).toContain('NEAR_THRESHOLD');
  });

  it('insufficient valid venues still resolves deterministically but marks DISLOCATED quality', () => {
    const result = resolveMarket({
      config: CONFIG,
      adapters: [
        new LeadInAdapter('coinbase', 'USD', 10_000_000, 10_000_000),
        new LeadInAdapter('kraken', 'USD', 10_000_010, 10_000_010),
      ],
      now: NOW,
      oracleCfg: ORACLE,
    });

    expect(result.resolutionPriceCents).toBeGreaterThan(0);
    expect(result.dispersionState).toBe('DISLOCATED');
    expect(result.qualityFlags).toContain('INSUFFICIENT_VALID_VENUES');
    expect(result.qualityFlags).toContain('HIGH_DISPERSION');
  });
});

function standardAdapters(opts?: { leadInMidCents?: number; steadyMidCents?: number }): VenueAdapter[] {
  const steady = opts?.steadyMidCents ?? 10_000_000;
  const lead = opts?.leadInMidCents ?? steady;
  return [
    new LeadInAdapter('coinbase', 'USD', lead, steady),
    new LeadInAdapter('kraken', 'USD', lead + 2, steady + 2),
    new LeadInAdapter('bitstamp', 'USD', lead + 4, steady + 4),
    new LeadInAdapter('gemini', 'USD', lead + 6, steady + 6),
    new LeadInAdapter('binance', 'USDT', lead + 8, steady + 8),
  ];
}

class LeadInAdapter implements VenueAdapter {
  constructor(
    readonly venueId: VenueId,
    readonly quote: QuoteCurrency,
    private readonly leadInMidCents: number,
    private readonly steadyMidCents: number,
  ) {}

  samplesBetween(from: TimestampMs, to: TimestampMs): VenueQuote[] {
    return this.allQuotes().filter(q => q.ts >= from && q.ts <= to);
  }

  latestAt(ts: TimestampMs): VenueQuote | null {
    return this.allQuotes()
      .filter(q => q.ts <= ts)
      .sort((a, b) => b.ts - a.ts)[0] ?? null;
  }

  private allQuotes(): VenueQuote[] {
    const quotes: VenueQuote[] = [
      makeQuote(this.venueId, this.quote, WINDOW_START - 1_000, this.leadInMidCents),
    ];
    for (let ts = WINDOW_START + 2_500; ts <= NOW; ts += 2_500) {
      quotes.push(makeQuote(this.venueId, this.quote, ts, this.steadyMidCents));
    }
    return quotes;
  }
}

function makeQuote(
  venue: VenueId,
  quote: QuoteCurrency,
  ts: number,
  midCents: number,
): VenueQuote {
  return {
    venue,
    quote,
    bidCents: usdCents(midCents - 50),
    askCents: usdCents(midCents + 50),
    ts: timestampMs(ts),
  };
}
