import { describe, expect, it } from 'vitest';
import { resolveMarket } from '../src/resolve.js';
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

// Custom adapter that returns a fixed mid for ALL times
class FixedMidAdapter implements VenueAdapter {
  readonly venueId: VenueId;
  readonly quote: QuoteCurrency = 'USD';
  constructor(venueId: VenueId, private readonly midCents: number) {
    this.venueId = venueId;
  }
  samplesBetween(from: TimestampMs, to: TimestampMs): VenueQuote[] {
    const quotes: VenueQuote[] = [];
    const interval = 500;
    const start = Math.ceil(from / interval) * interval;
    for (let ts = start; ts <= to; ts += interval) {
      quotes.push(this.makeQuote(timestampMs(ts)));
    }
    return quotes;
  }
  latestAt(ts: TimestampMs): VenueQuote | null {
    return this.makeQuote(timestampMs(Math.floor(ts / 500) * 500));
  }
  private makeQuote(ts: TimestampMs): VenueQuote {
    return {
      venue: this.venueId,
      quote: 'USD',
      bidCents: usdCents(this.midCents - 50),
      askCents: usdCents(this.midCents + 50),
      ts,
    };
  }
}

// Adapter that uses LOW price for partitions 1-4, HIGH price for partitions 5-6
class TimedPriceAdapter implements VenueAdapter {
  readonly venueId: VenueId;
  readonly quote: QuoteCurrency = 'USD';
  constructor(
    venueId: VenueId,
    private readonly lowMid: number,
    private readonly highMid: number,
    private readonly switchTs: TimestampMs,
  ) {
    this.venueId = venueId;
  }
  samplesBetween(from: TimestampMs, to: TimestampMs): VenueQuote[] {
    const quotes: VenueQuote[] = [];
    const interval = 500;
    const start = Math.ceil(from / interval) * interval;
    for (let ts = start; ts <= to; ts += interval) {
      quotes.push(this.makeQuote(timestampMs(ts)));
    }
    return quotes;
  }
  latestAt(ts: TimestampMs): VenueQuote | null {
    return this.makeQuote(timestampMs(Math.floor(ts / 500) * 500));
  }
  private makeQuote(ts: TimestampMs): VenueQuote {
    const mid = ts >= this.switchTs ? this.highMid : this.lowMid;
    return {
      venue: this.venueId,
      quote: 'USD',
      bidCents: usdCents(mid - 50),
      askCents: usdCents(mid + 50),
      ts,
    };
  }
}

describe('median vs mean partition aggregation', () => {
  it('2-partition spike: median → NO, mean → YES', () => {
    const MARKET_START_MS = 1_700_000_000_000;
    const NOW = timestampMs(MARKET_START_MS + 120_000);
    const THRESHOLD = 10_000_000; // $100,000

    // Partitions 1-4: $99,000 (below threshold)
    // Partitions 5-6: $102,500 (above threshold, >2.5% up)
    const LOW = 9_900_000;   // $99,000
    const HIGH = 10_250_000; // $102,500

    // Switch after 4 partitions: windowStart + 4 * 5000ms = NOW - 30000 + 20000 = NOW - 10000
    const WINDOW_START = timestampMs(NOW - ORACLE.windowMs);
    const SWITCH_TS = timestampMs(WINDOW_START + 4 * ORACLE.partitionSeconds * 1000);

    const venues: VenueId[] = ['coinbase', 'kraken', 'bitstamp', 'gemini', 'binance'];
    const adapters: VenueAdapter[] = venues.map(v =>
      new TimedPriceAdapter(v, LOW, HIGH, SWITCH_TS),
    );

    const config: MarketConfig = {
      marketId: 'test-median-mean',
      question: 'Will BTC be above $100,000?',
      thresholdCents: usdCents(THRESHOLD),
      durationMs: 120_000,
    };

    const medianResult = resolveMarket({
      config,
      adapters,
      now: NOW,
      oracleCfg: ORACLE,
      partitionAggregation: 'median',
    });

    const meanResult = resolveMarket({
      config,
      adapters,
      now: NOW,
      oracleCfg: ORACLE,
      partitionAggregation: 'mean',
    });

    // Median of [low,low,low,low,high,high] = low < threshold → NO
    expect(medianResult.outcome).toBe('NO');
    expect(medianResult.resolutionPriceCents).toBeLessThan(THRESHOLD);

    // Mean of 4*9900000 + 2*10250000 = 60200000/6 ≈ 10033333 > threshold → YES
    expect(meanResult.outcome).toBe('YES');
    expect(meanResult.resolutionPriceCents).toBeGreaterThan(THRESHOLD);
  });
});
