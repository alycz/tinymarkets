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
import { aggregatePartition, type PartitionVenueData } from '../src/partition.js';
import { inputHashFromSamples } from '../src/hash.js';
import { computeMedian, roundMillicentsToCentsHalfUp } from '../src/math.js';
import { resolveMarket } from '../src/resolve.js';
import type { VenueAdapter } from '../src/venue-adapter.js';

const START = 1_700_000_000_000;
const WINDOW_START = START + 90_000;
const EXPIRY = timestampMs(START + 120_000);

const CONFIG: MarketConfig = {
  marketId: 'precision-market',
  question: 'Will BTC be above $100,000?',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

describe('oracle precision and even-count medians', () => {
  it('averages the middle pair for even-count medians', () => {
    expect(computeMedian([4, 1, 2, 3])).toBe(2.5);
  });

  it('rounds millicents to cents half up only at output', () => {
    expect(roundMillicentsToCentsHalfUp(10_000_004)).toBe(1_000_000);
    expect(roundMillicentsToCentsHalfUp(10_000_005)).toBe(1_000_001);
  });

  it('uses the same even-count median rule for surviving venues in a partition', () => {
    const venues = new Map<VenueId, PartitionVenueData>([
      ['coinbase', makeVenueData(10_000_000)],
      ['kraken', makeVenueData(10_000_002)],
      ['bitstamp', makeVenueData(10_000_004)],
      ['gemini', makeVenueData(10_000_006)],
    ]);

    const result = aggregatePartition(
      venues,
      timestampMs(WINDOW_START),
      timestampMs(WINDOW_START + 5_000),
      ORACLE,
    );

    expect(result.validVenues).toBe(4);
    expect(result.btcPriceCents).toBe(10_000_003);
  });

  it('resolves the six-partition median as the average of the 3rd and 4th sorted partitions', () => {
    const partitionPrices = [
      10_000_000,
      10_000_010,
      10_000_020,
      10_000_040,
      10_000_050,
      10_000_060,
    ];
    const adapters: VenueAdapter[] = ['coinbase', 'kraken', 'bitstamp', 'gemini'].map(
      (venue) => new PartitionPriceAdapter(venue as VenueId, partitionPrices, 0),
    );

    const result = resolveMarket({
      config: CONFIG,
      adapters,
      now: EXPIRY,
      oracleCfg: ORACLE,
    });

    expect(result.partitions.map(p => p.btcPriceCents)).toEqual(partitionPrices);
    expect(result.resolutionPriceCents).toBe(10_000_030);
  });

  it('inputHash includes canonical quote currency, bid, and ask fields', () => {
    const base = makeQuote('coinbase', 'USD', 1000, 10_000_000);
    const quoteChanged = { ...base, quote: 'USDT' as QuoteCurrency };
    const askChanged = { ...base, askCents: usdCents((base.askCents as number) + 1) };

    expect(inputHashFromSamples([base])).not.toBe(inputHashFromSamples([quoteChanged]));
    expect(inputHashFromSamples([base])).not.toBe(inputHashFromSamples([askChanged]));
  });
});

function makeVenueData(midCents: number): PartitionVenueData {
  const q = makeQuote('coinbase', 'USD', WINDOW_START + 4_000, midCents);
  return {
    twap: midCents * 10,
    allSamples: [q],
    latestAtEnd: q,
  };
}

function makeQuote(venue: VenueId, quote: QuoteCurrency, ts: number, midCents: number): VenueQuote {
  return {
    venue,
    quote,
    bidCents: usdCents(midCents - 50),
    askCents: usdCents(midCents + 50),
    ts: timestampMs(ts),
  };
}

class PartitionPriceAdapter implements VenueAdapter {
  readonly quote = 'USD' as const;

  constructor(
    readonly venueId: VenueId,
    private readonly prices: readonly number[],
    private readonly offsetCents: number,
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
    return this.prices.flatMap((price, index) => {
      const partitionStart = WINDOW_START + index * ORACLE.partitionSeconds * 1000;
      const mid = price + this.offsetCents;
      return [
        makeQuote(this.venueId, this.quote, partitionStart, mid),
        makeQuote(this.venueId, this.quote, partitionStart + 4_000, mid),
      ];
    });
  }
}
