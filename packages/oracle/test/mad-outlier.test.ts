import { describe, expect, it } from 'vitest';
import { aggregatePartition } from '../src/partition.js';
import { ORACLE } from '@jet/config';
import {
  type VenueId,
  type VenueQuote,
  usdCents,
  timestampMs,
  bps,
} from '@jet/shared';
import type { PartitionVenueData } from '../src/partition.js';

const START = 1_700_000_000_000;
const PARTITION_START = timestampMs(START);
const PARTITION_END = timestampMs(START + 5000);

function makeVenueData(mid: number, ts = START + 2500): PartitionVenueData {
  const q: VenueQuote = {
    venue: 'coinbase',
    quote: 'USD',
    bidCents: usdCents(mid - 50),
    askCents: usdCents(mid + 50),
    ts: timestampMs(ts),
  };
  return {
    twap: usdCents(mid),
    allSamples: [q],
    latestAtEnd: { ...q, ts: timestampMs(START + 4500) },
  };
}

describe('MAD outlier rule', () => {
  it('4 clustered + 1 far → far one excluded', () => {
    const venues = new Map<VenueId, PartitionVenueData>([
      ['coinbase', makeVenueData(10_000_000)],
      ['kraken', makeVenueData(10_000_100)],
      ['bitstamp', makeVenueData(9_999_900)],
      ['gemini', makeVenueData(10_000_050)],
      ['binance', makeVenueData(11_500_000)], // +1500 bps outlier
    ]);
    const result = aggregatePartition(venues, PARTITION_START, PARTITION_END, ORACLE);
    const outlierExcl = result.exclusions.find(e => e.venue === 'binance');
    expect(outlierExcl).toBeDefined();
    expect(outlierExcl?.reason).toBe('OUTLIER');
    expect(outlierExcl?.deviationBps).toBeGreaterThan(1000);
    expect(result.validVenues).toBe(4);
  });

  it('all 5 clustered → none excluded by outlier rule', () => {
    const venues = new Map<VenueId, PartitionVenueData>([
      ['coinbase', makeVenueData(10_000_000)],
      ['kraken', makeVenueData(10_000_100)],
      ['bitstamp', makeVenueData(9_999_900)],
      ['gemini', makeVenueData(10_000_050)],
      ['binance', makeVenueData(10_000_200)],
    ]);
    const result = aggregatePartition(venues, PARTITION_START, PARTITION_END, ORACLE);
    const outlierExcls = result.exclusions.filter(e => e.reason === 'OUTLIER');
    expect(outlierExcls).toHaveLength(0);
    expect(result.validVenues).toBe(5);
  });

  it('tight cluster invokes outlierBpsFloor instead of madMultiple*MAD', () => {
    // All venues within 1 bps — MAD ≈ 0, so threshold = max(10, 3*0) = 10 bps
    // A venue at 5 bps deviation should NOT be excluded (5 < 10)
    const mid = 10_000_000;
    const venues = new Map<VenueId, PartitionVenueData>([
      ['coinbase', makeVenueData(mid)],
      ['kraken', makeVenueData(mid + 1)],
      ['bitstamp', makeVenueData(mid - 1)],
      ['gemini', makeVenueData(mid + 2)],
      ['binance', makeVenueData(mid + 500)], // ~5 bps from median, < outlierBpsFloor (10 bps)
    ]);
    const result = aggregatePartition(venues, PARTITION_START, PARTITION_END, ORACLE);
    const outlierExcls = result.exclusions.filter(e => e.reason === 'OUTLIER');
    expect(outlierExcls).toHaveLength(0);
    expect(result.validVenues).toBe(5);
  });
});
