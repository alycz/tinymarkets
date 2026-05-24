import { ORACLE } from '@jet/config';
import {
  type IndicativeSnapshot,
  type RampResolution,
  type VenueHealth,
  type MarketConfig,
  type MarketId,
  type PartitionResult,
  type UsdCents,
  type TimestampMs,
  usdCents,
  bps,
  timestampMs,
} from '@jet/shared';

type SnapshotCallback = (snapshot: IndicativeSnapshot) => void;

interface PriceSample {
  price: UsdCents;
  ts: TimestampMs;
}

export class MockOracle {
  private currentPriceCents: UsdCents = usdCents(10_000_000); // $100,000.00
  private marketId: MarketId | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private history: PriceSample[] = [];
  private callbacks: SnapshotCallback[] = [];
  private latestSnapshot: IndicativeSnapshot | null = null;

  onSnapshot(cb: SnapshotCallback): void {
    this.callbacks.push(cb);
  }

  start(marketId: MarketId): void {
    this.marketId = marketId;
    this.history = [];
    this.interval = setInterval(() => this.tick(), ORACLE.sampleIntervalMs);
    this.tick(); // emit immediately on start
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getLatestSnapshot(): IndicativeSnapshot | null {
    return this.latestSnapshot;
  }

  private tick(): void {
    if (!this.marketId) return;

    // Random walk: +/- $5 per tick, giving ~$50-150 drift over 2 minutes
    const delta = Math.round((Math.random() - 0.5) * 1000);
    this.currentPriceCents = usdCents(this.currentPriceCents + delta);
    const now = timestampMs(Date.now());
    this.history.push({ price: this.currentPriceCents, ts: now });
    if (this.history.length > 180) this.history.shift();

    const snapshot = this.buildSnapshot(now);
    this.latestSnapshot = snapshot;
    for (const cb of this.callbacks) cb(snapshot);
  }

  private buildSnapshot(now: TimestampMs): IndicativeSnapshot {
    const base = this.currentPriceCents;
    const venues: VenueHealth[] = [
      {
        venue: 'coinbase',
        quote: 'USD',
        midCents: usdCents(base + Math.round((Math.random() - 0.5) * 200)),
        spreadBps: bps(2),
        lastUpdateMs: now,
        healthy: true,
      },
      {
        venue: 'kraken',
        quote: 'USD',
        midCents: usdCents(base + Math.round((Math.random() - 0.5) * 200)),
        spreadBps: bps(3),
        lastUpdateMs: now,
        healthy: true,
      },
      {
        venue: 'bitstamp',
        quote: 'USD',
        midCents: usdCents(base + Math.round((Math.random() - 0.5) * 200)),
        spreadBps: bps(4),
        lastUpdateMs: now,
        healthy: true,
      },
      {
        venue: 'gemini',
        quote: 'USD',
        midCents: usdCents(base + Math.round((Math.random() - 0.5) * 200)),
        spreadBps: bps(3),
        lastUpdateMs: now,
        healthy: true,
      },
    ];

    return {
      marketId: this.marketId!,
      priceCents: base,
      confidenceBps: bps(3),
      confidence: 'HIGH',
      dispersionBps: bps(2),
      dispersionState: 'NORMAL',
      venues,
      ts: now,
    };
  }

  buildMockResolution(config: MarketConfig): RampResolution {
    const now = timestampMs(Date.now());
    const windowMs = 30_000;
    const windowStart = timestampMs(now - windowMs);

    // Use last ~30 samples, fall back to current price if history is short
    const samples = this.history.slice(-30);
    const partitionSize = Math.max(1, Math.floor(samples.length / 6));

    const partitions: PartitionResult[] = [];
    for (let i = 0; i < 6; i++) {
      const start = i * partitionSize;
      const slice = samples.slice(start, start + partitionSize);
      const prices: UsdCents[] = slice.length > 0
        ? slice.map(s => s.price)
        : [this.currentPriceCents];
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted[mid] ?? this.currentPriceCents;

      partitions.push({
        index: i + 1,
        startTs: timestampMs(windowStart + i * 5000),
        endTs: timestampMs(windowStart + (i + 1) * 5000),
        priceCents: usdCents(median),
        validVenues: 4,
        excludedVenues: 0,
      });
    }

    const sortedPartitionPrices = partitions.map(p => p.priceCents).sort((a, b) => a - b);
    const midIdx = Math.floor(sortedPartitionPrices.length / 2);
    const resolutionPriceCents = usdCents(sortedPartitionPrices[midIdx] ?? this.currentPriceCents);
    const outcome = resolutionPriceCents > config.thresholdCents ? 'YES' : 'NO';

    return {
      marketId: config.marketId,
      method: 'RAMP_V1',
      ruleVersion: 'ramp-v1.0.0',
      thresholdCents: config.thresholdCents,
      expiryTs: now,
      window: {
        startTs: windowStart,
        endTs: now,
        partitionSeconds: 5,
        partitionCount: 6,
      },
      venueInput: 'mid_price_twap',
      venueAggregation: 'median',
      partitionAggregation: 'median',
      partitions,
      resolutionPriceCents,
      outcome,
      tieRule: 'YES requires resolutionPrice > threshold',
      confidenceBps: bps(3),
      confidence: 'HIGH',
      dispersionState: 'NORMAL',
      sourcesUsed: ['coinbase', 'kraken', 'bitstamp', 'gemini'],
      sourcesExcluded: [],
      inputHash: `sha256:mock-${config.marketId}`,
    };
  }
}
