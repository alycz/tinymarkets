import {
  type QuoteCurrency,
  type TimestampMs,
  type UsdCents,
  type VenueId,
  type VenueQuote,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { BasePathFn } from './base-path.js';
import type { VenueAdapter } from './venue-adapter.js';
import { makeRng } from './prng.js';

export interface SpikeConfig {
  /** Absolute timestamp when the spike begins. */
  startMs: number;
  durationMs: number;
  /** Additive price offset as bps of the current mid. Positive = up. */
  amplitudeBps: number;
}

export interface CrossedBookConfig {
  startMs: number;
  durationMs: number;
}

export interface SimulatedVenueConfig {
  venueId: VenueId;
  quote: QuoteCurrency;
  /** Per-venue noise seed; combined with tick index for determinism. */
  seed: number;
  /** Symmetric noise amplitude in bps (±). */
  noiseBps: number;
  /** Bid-ask spread in bps. */
  spreadBps: number;
  /** Simulated observation latency in ms — latestAt returns the tick from ts-latencyMs. */
  latencyMs: number;
  /** How frequently the venue produces quotes, in ms. */
  sampleIntervalMs: number;
  /** Shared underlying BTC price path (indexed by elapsed ms from marketStartMs). */
  basePath: BasePathFn;
  /** Absolute time of market start — anchors tick indices to real timestamps. */
  marketStartMs: number;
  /** Static USDT/USD basis adjustment in bps (applied before returning quote). */
  basisAdjustmentBps?: number;
  /** Optional price spike for NEAR_EXPIRY_SPIKE scenario. */
  spike?: SpikeConfig;
  /** Optional crossed-book period for CROSSED_BOOK scenario. */
  crossedBookAt?: CrossedBookConfig;
}

/**
 * Generates deterministic top-of-book quotes from a seed + shared base path.
 * Every quote derives solely from (seed, venueId, tick_index) — no shared mutable RNG state.
 */
export class SimulatedVenue implements VenueAdapter {
  readonly venueId: VenueId;
  readonly quote: QuoteCurrency;
  private readonly cfg: SimulatedVenueConfig;
  private readonly venueHash: number;

  constructor(cfg: SimulatedVenueConfig) {
    this.venueId = cfg.venueId;
    this.quote = cfg.quote;
    this.cfg = cfg;
    this.venueHash = cfg.venueId
      .split('')
      .reduce((acc, c) => (Math.imul(acc, 31) + c.charCodeAt(0)) | 0, 0);
  }

  samplesBetween(from: TimestampMs, to: TimestampMs): VenueQuote[] {
    const { marketStartMs, sampleIntervalMs } = this.cfg;
    if (to < marketStartMs) return [];
    const firstTick = Math.max(
      0,
      Math.ceil((from - marketStartMs) / sampleIntervalMs),
    );
    const lastTick = Math.floor((to - marketStartMs) / sampleIntervalMs);
    const quotes: VenueQuote[] = [];
    for (let i = firstTick; i <= lastTick; i++) {
      const ts = timestampMs(marketStartMs + i * sampleIntervalMs);
      if (ts >= from && ts <= to) {
        quotes.push(this.quoteAtTick(i, ts));
      }
    }
    return quotes;
  }

  latestAt(ts: TimestampMs): VenueQuote | null {
    const { marketStartMs, sampleIntervalMs, latencyMs } = this.cfg;
    const effectiveTs = ts - latencyMs;
    if (effectiveTs < marketStartMs) return null;
    const tickIndex = Math.floor((effectiveTs - marketStartMs) / sampleIntervalMs);
    const sampleTs = timestampMs(marketStartMs + tickIndex * sampleIntervalMs);
    return this.quoteAtTick(tickIndex, sampleTs);
  }

  private quoteAtTick(i: number, ts: TimestampMs): VenueQuote {
    const { basePath, marketStartMs, noiseBps, spreadBps, basisAdjustmentBps, spike, crossedBookAt } = this.cfg;
    const elapsed = ts - marketStartMs;
    const baseMid = basePath(elapsed);

    // Per-(venue,tick) RNG: no shared state
    const rng = makeRng(((this.cfg.seed * 2654435761) ^ this.venueHash ^ (i * 1000003)) >>> 0);
    const noise = Math.round((baseMid * noiseBps) / 10_000 * (rng() * 2 - 1));
    let mid = baseMid + noise;

    // Spike overlay
    if (spike && ts >= spike.startMs && ts < spike.startMs + spike.durationMs) {
      mid = Math.round(mid * (1 + spike.amplitudeBps / 10_000));
    }

    // USDT basis adjustment
    if (basisAdjustmentBps) {
      mid = Math.round(mid * (1 + basisAdjustmentBps / 10_000));
    }

    // Crossed-book period: deliberately invert bid/ask
    if (crossedBookAt && ts >= crossedBookAt.startMs && ts < crossedBookAt.startMs + crossedBookAt.durationMs) {
      const halfSpread = Math.max(1, Math.round((mid * spreadBps) / 20_000));
      return {
        venue: this.venueId,
        quote: this.quote,
        bidCents: usdCents(mid + halfSpread),  // bid > ask → crossed
        askCents: usdCents(mid - halfSpread),
        ts,
      };
    }

    const halfSpread = Math.max(1, Math.round((mid * spreadBps) / 20_000));
    return {
      venue: this.venueId,
      quote: this.quote,
      bidCents: usdCents(mid - halfSpread),
      askCents: usdCents(mid + halfSpread),
      ts,
    };
  }
}
