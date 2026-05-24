import { MARKET, ORACLE } from '@jet/config';
import { timestampMs, usdCents } from '@jet/shared';
import { makeRandomWalkPath } from './base-path.js';
import { SimulatedVenue } from './simulated-venue.js';
import type { VenueAdapter } from './venue-adapter.js';

export type ScenarioName =
  | 'HONEST'
  | 'NEAR_EXPIRY_SPIKE'
  | 'STALE_VENUE'
  | 'CROSSED_BOOK'
  | 'WIDE_SPREAD';

export interface ScenarioResult {
  adapters: VenueAdapter[];
  seed: number;
  marketStartMs: number;
}

const START_CENTS = 10_000_000; // $100,000.00
const PATH_DURATION_MS = MARKET.durationMs + 60_000; // market + 60s buffer
const SAMPLE_INTERVAL_MS = 500; // venues produce quotes every 500ms

export function buildScenario(
  name: ScenarioName,
  seed: number,
  marketStartMs: number,
): ScenarioResult {
  const basePath = makeRandomWalkPath(seed, START_CENTS, PATH_DURATION_MS);
  const expiryMs = marketStartMs + MARKET.durationMs;
  const windowStart = expiryMs - ORACLE.windowMs; // last 30s

  switch (name) {
    case 'HONEST':
      return {
        adapters: buildHonestVenues(seed, basePath, marketStartMs),
        seed,
        marketStartMs,
      };

    case 'NEAR_EXPIRY_SPIKE': {
      // Final partition of the settlement window
      const lastPartitionStart = windowStart + (ORACLE.partitionCount - 1) * ORACLE.partitionSeconds * 1000;
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      // Replace binance with a spiked version (+1500 bps in the last partition)
      const spikedBinance = new SimulatedVenue({
        venueId: 'binance',
        quote: 'USDT',
        seed: seed ^ 5,
        noiseBps: 4,
        spreadBps: 3,
        latencyMs: 150,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
        basisAdjustmentBps: 5,
        spike: {
          startMs: lastPartitionStart,
          durationMs: ORACLE.partitionSeconds * 1000,
          amplitudeBps: 1_500,
        },
      });
      return {
        adapters: [...adapters.slice(0, 4), spikedBinance],
        seed,
        marketStartMs,
      };
    }

    case 'STALE_VENUE': {
      // itbit has 5s latency > staleMs (3s)
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const staleItbit = new SimulatedVenue({
        venueId: 'itbit',
        quote: 'USD',
        seed: seed ^ 6,
        noiseBps: 4,
        spreadBps: 4,
        latencyMs: 5_000, // > ORACLE.staleMs (3000)
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
      });
      return {
        adapters: [...adapters.slice(0, 4), staleItbit],
        seed,
        marketStartMs,
      };
    }

    case 'CROSSED_BOOK': {
      // lmax has bid >= ask for the last partition
      const lastPartitionStart = windowStart + (ORACLE.partitionCount - 1) * ORACLE.partitionSeconds * 1000;
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const crossedLmax = new SimulatedVenue({
        venueId: 'lmax',
        quote: 'USD',
        seed: seed ^ 7,
        noiseBps: 3,
        spreadBps: 2,
        latencyMs: 100,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
        crossedBookAt: {
          startMs: lastPartitionStart,
          durationMs: ORACLE.partitionSeconds * 1000,
        },
      });
      return {
        adapters: [...adapters.slice(0, 4), crossedLmax],
        seed,
        marketStartMs,
      };
    }

    case 'WIDE_SPREAD': {
      // gemini has spreadBps: 20 > wideSpreadBps (15)
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const wideGemini = new SimulatedVenue({
        venueId: 'gemini',
        quote: 'USD',
        seed: seed ^ 4,
        noiseBps: 3,
        spreadBps: 20, // > ORACLE.wideSpreadBps (15)
        latencyMs: 100,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
      });
      return {
        adapters: [adapters[0]!, adapters[1]!, adapters[2]!, wideGemini, adapters[4]!],
        seed,
        marketStartMs,
      };
    }
  }
}

function buildHonestVenues(
  seed: number,
  basePath: ReturnType<typeof makeRandomWalkPath>,
  marketStartMs: number,
): SimulatedVenue[] {
  return [
    new SimulatedVenue({
      venueId: 'coinbase',
      quote: 'USD',
      seed: seed ^ 1,
      noiseBps: 3,
      spreadBps: 2,
      latencyMs: 100,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
    }),
    new SimulatedVenue({
      venueId: 'kraken',
      quote: 'USD',
      seed: seed ^ 2,
      noiseBps: 4,
      spreadBps: 3,
      latencyMs: 150,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
    }),
    new SimulatedVenue({
      venueId: 'bitstamp',
      quote: 'USD',
      seed: seed ^ 3,
      noiseBps: 5,
      spreadBps: 4,
      latencyMs: 200,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
    }),
    new SimulatedVenue({
      venueId: 'gemini',
      quote: 'USD',
      seed: seed ^ 4,
      noiseBps: 3,
      spreadBps: 3,
      latencyMs: 100,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
    }),
    new SimulatedVenue({
      venueId: 'binance',
      quote: 'USDT',
      seed: seed ^ 5,
      noiseBps: 4,
      spreadBps: 3,
      latencyMs: 150,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
      basisAdjustmentBps: 5,
    }),
  ];
}
