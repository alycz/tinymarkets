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
import type { VenueAdapter } from '../src/venue-adapter.js';
import { resolveMarket } from '../src/resolve.js';
import { buildScenario } from '../src/scenarios.js';
import { buildIndicative } from '../src/indicative.js';

const MARKET_START_MS = 1_700_000_000_000;
const NOW = timestampMs(MARKET_START_MS + 120_000);
const WINDOW_START = timestampMs(NOW - ORACLE.windowMs);
const CONFIG: MarketConfig = {
  marketId: 'btc-above-100000',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('VENUE_WEIGHTED_TWAP_V1', () => {
  it('resolves normal venue agreement with normalized static weights', () => {
    const adapters = [
      fixed('coinbase', 'USD', 10_000_000),
      fixed('binance', 'USDT', 10_010_000),
      fixed('kraken', 'USD', 10_020_000),
      fixed('okx', 'USDT', 9_990_000),
      fixed('bitstamp', 'USD', 10_000_000),
    ];

    const result = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    expect(result.method).toBe('VENUE_WEIGHTED_TWAP_V1');
    expect(result.market_id).toBe(CONFIG.marketId);
    expect(result.threshold).toBe(100_000);
    expect(result.sources_used).toEqual(['coinbase', 'binance', 'kraken', 'okx', 'bitstamp']);
    expect(result.sources_excluded).toEqual([]);
    expect(result.normalizedWeights).toEqual([
      { venue: 'coinbase', weight: 0.3 },
      { venue: 'binance', weight: 0.3 },
      { venue: 'kraken', weight: 0.2 },
      { venue: 'okx', weight: 0.1 },
      { venue: 'bitstamp', weight: 0.1 },
    ]);
    expect(result.resolutionPriceCents).toBe(10_006_000);
    expect(result.resolution_price).toBe(100_060);
  });

  it('excludes stale, crossed, wide, missing, and outlier venues with reasons', () => {
    const stale = fixed('binance', 'USDT', 10_000_000, { latestTs: timestampMs(NOW - 4_000) });
    const crossed = fixed('kraken', 'USD', 10_000_000, { crossed: true });
    const wide = fixed('okx', 'USDT', 10_000_000, { spreadBps: 20 });
    const missing = missingAdapter('bitstamp', 'USD');
    const outlier = fixed('coinbase', 'USD', 11_500_000);
    const honest = fixed('gemini', 'USD', 10_000_000);
    const honest2 = fixed('itbit', 'USD', 10_000_100);

    const result = resolveMarket({
      config: CONFIG,
      adapters: [outlier, stale, crossed, wide, missing, honest, honest2],
      now: NOW,
      oracleCfg: {
        ...ORACLE,
        weights: { coinbase: 0.3, gemini: 0.4, itbit: 0.3 },
      },
    });

    expect(result.sourcesExcluded.find(e => e.venue === 'binance')?.reason).toBe('STALE');
    expect(result.sourcesExcluded.find(e => e.venue === 'kraken')?.reason).toBe('CROSSED_BOOK');
    expect(result.sourcesExcluded.find(e => e.venue === 'okx')?.reason).toBe('WIDE_SPREAD');
    expect(result.sourcesExcluded.find(e => e.venue === 'bitstamp')?.reason).toBe('MISSING');
    expect(result.sourcesExcluded.find(e => e.venue === 'coinbase')?.reason).toBe('OUTLIER');
    expect(result.sourcesUsed).toEqual(['gemini', 'itbit']);
  });

  it('uses fallback simulated aggregate when fewer than two venues survive', () => {
    const result = resolveMarket({
      config: CONFIG,
      adapters: [
        fixed('coinbase', 'USD', 10_000_000),
        missingAdapter('binance', 'USDT'),
        missingAdapter('kraken', 'USD'),
      ],
      now: NOW,
      oracleCfg: ORACLE,
    });

    expect(result.sourcesUsed).toEqual(['coinbase']);
    expect(result.qualityFlags).toContain('FALLBACK_SIMULATED_AGGREGATE');
    expect(result.qualityFlags).toContain('INSUFFICIENT_VALID_VENUES');
    expect(result.resolutionPriceCents).toBe(10_000_000);
  });

  it('resolves exact threshold ties to NO', () => {
    const adapters = [
      fixed('coinbase', 'USD', 10_000_000),
      fixed('binance', 'USDT', 10_000_000),
      fixed('kraken', 'USD', 10_000_000),
    ];

    const result = resolveMarket({ config: CONFIG, adapters, now: NOW, oracleCfg: ORACLE });

    expect(result.resolutionPriceCents).toBe(CONFIG.thresholdCents);
    expect(result.outcome).toBe('NO');
    expect(result.tieRule).toBe('YES requires resolutionPrice > threshold');
  });

  it('is deterministic for the same seed and inputs', () => {
    const { adapters: a1 } = buildScenario('HONEST', 42, MARKET_START_MS);
    const { adapters: a2 } = buildScenario('HONEST', 42, MARKET_START_MS);

    const r1 = resolveMarket({ config: CONFIG, adapters: a1, now: NOW, oracleCfg: ORACLE });
    const r2 = resolveMarket({ config: CONFIG, adapters: a2, now: NOW, oracleCfg: ORACLE });

    expect(r1.inputHash).toBe(r2.inputHash);
    expect(r1.resolutionPriceCents).toBe(r2.resolutionPriceCents);
    expect(r1.venueTwaps).toEqual(r2.venueTwaps);
  });

  it('streams live indicative weighted aggregate and forming TWAP preview', () => {
    const { adapters } = buildScenario('HONEST', 7, MARKET_START_MS);
    const snapshot = buildIndicative({
      marketId: CONFIG.marketId,
      config: CONFIG,
      expiryTs: NOW,
      adapters,
      now: timestampMs(NOW - 5_000),
      oracleCfg: ORACLE,
    });

    expect(snapshot.btcPriceCents).toBeGreaterThan(0);
    expect(snapshot.formingResolution?.method).toBe('VENUE_WEIGHTED_TWAP_V1');
    expect(snapshot.formingResolution?.window.windowMs).toBe(15_000);
    expect(snapshot.formingResolution?.venues.length).toBe(5);
  });
});

interface FixedOptions {
  latestTs?: TimestampMs;
  crossed?: boolean;
  spreadBps?: number;
}

function fixed(
  venueId: VenueId,
  quote: QuoteCurrency,
  midCents: number,
  opts: FixedOptions = {},
): VenueAdapter {
  const spreadBps = opts.spreadBps ?? 2;
  const halfSpread = Math.max(1, Math.round((midCents * spreadBps) / 20_000));
  const bidCents = opts.crossed ? midCents + halfSpread : midCents - halfSpread;
  const askCents = opts.crossed ? midCents - halfSpread : midCents + halfSpread;
  const quoteAt = (ts: TimestampMs): VenueQuote => ({
    venue: venueId,
    quote,
    bidCents: usdCents(bidCents),
    askCents: usdCents(askCents),
    ts,
  });
  return {
    venueId,
    quote,
    samplesBetween(from: TimestampMs, to: TimestampMs): VenueQuote[] {
      return [WINDOW_START, timestampMs(WINDOW_START + 5_000), timestampMs(WINDOW_START + 10_000), to]
        .filter(ts => ts >= from && ts <= to)
        .map(ts => quoteAt(ts));
    },
    latestAt(_ts: TimestampMs): VenueQuote | null {
      return quoteAt(opts.latestTs ?? NOW);
    },
  };
}

function missingAdapter(venueId: VenueId, quote: QuoteCurrency): VenueAdapter {
  return {
    venueId,
    quote,
    samplesBetween: () => [],
    latestAt: () => null,
  };
}
