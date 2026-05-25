import { MARKET, ORACLE } from '@jet/config';
import { timestampMs, usdCents } from '@jet/shared';
import { makeRandomWalkPath } from './base-path.js';
import { SimulatedVenue } from './simulated-venue.js';
import type { VenueAdapter } from './venue-adapter.js';

export type ScenarioName =
  | 'HONEST'
  | 'NEAR_EXPIRY_SPIKE'
  | 'SUBTLE_DISLOCATION'
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
const SAMPLE_INTERVAL_MS = 1_000; // venues produce quotes every 1s

export function buildScenario(
  name: ScenarioName,
  seed: number,
  marketStartMs: number,
): ScenarioResult {
  const basePath = makeRandomWalkPath(seed, START_CENTS, PATH_DURATION_MS);
  const expiryMs = marketStartMs + MARKET.durationMs;
  const windowStart = expiryMs - ORACLE.windowMs; // final TWAP window

  switch (name) {
    case 'HONEST':
      return {
        adapters: buildHonestVenues(seed, basePath, marketStartMs),
        seed,
        marketStartMs,
      };

    case 'NEAR_EXPIRY_SPIKE': {
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      // Replace binance with a spiked version (+1500 bps in the final 5s)
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
          startMs: expiryMs - 5_000,
          durationMs: 5_000,
          amplitudeBps: 1_500,
        },
      });
      return {
        adapters: [adapters[0]!, spikedBinance, adapters[2]!, adapters[3]!, adapters[4]!],
        seed,
        marketStartMs,
      };
    }

    case 'SUBTLE_DISLOCATION': {
      const dislocationStart = windowStart + 5_000;
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const dislocatedBinance = new SimulatedVenue({
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
          startMs: dislocationStart,
          durationMs: 10_000,
          amplitudeBps: 22,
        },
      });
      return {
        adapters: [adapters[0]!, dislocatedBinance, adapters[2]!, adapters[3]!, adapters[4]!],
        seed,
        marketStartMs,
      };
    }

    case 'STALE_VENUE': {
      // okx has 5s latency > staleMs (3s)
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const staleOkx = new SimulatedVenue({
        venueId: 'okx',
        quote: 'USDT',
        seed: seed ^ 6,
        noiseBps: 4,
        spreadBps: 4,
        latencyMs: 5_000, // > ORACLE.staleMs (3000)
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
        basisAdjustmentBps: 4,
      });
      return {
        adapters: [adapters[0]!, adapters[1]!, adapters[2]!, staleOkx, adapters[4]!],
        seed,
        marketStartMs,
      };
    }

    case 'CROSSED_BOOK': {
      // bitstamp has bid >= ask for the final 5s
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const crossedBitstamp = new SimulatedVenue({
        venueId: 'bitstamp',
        quote: 'USD',
        seed: seed ^ 7,
        noiseBps: 3,
        spreadBps: 2,
        latencyMs: 100,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
        crossedBookAt: {
          startMs: expiryMs - 5_000,
          durationMs: 5_000,
        },
      });
      return {
        adapters: [adapters[0]!, adapters[1]!, adapters[2]!, adapters[3]!, crossedBitstamp],
        seed,
        marketStartMs,
      };
    }

    case 'WIDE_SPREAD': {
      // kraken has spreadBps: 20 > wideSpreadBps (15)
      const adapters = buildHonestVenues(seed, basePath, marketStartMs);
      const wideKraken = new SimulatedVenue({
        venueId: 'kraken',
        quote: 'USD',
        seed: seed ^ 2,
        noiseBps: 3,
        spreadBps: 20, // > ORACLE.wideSpreadBps (15)
        latencyMs: 100,
        sampleIntervalMs: SAMPLE_INTERVAL_MS,
        basePath,
        marketStartMs,
      });
      return {
        adapters: [adapters[0]!, adapters[1]!, wideKraken, adapters[3]!, adapters[4]!],
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
      venueId: 'okx',
      quote: 'USDT',
      seed: seed ^ 4,
      noiseBps: 4,
      spreadBps: 3,
      latencyMs: 100,
      sampleIntervalMs: SAMPLE_INTERVAL_MS,
      basePath,
      marketStartMs,
      basisAdjustmentBps: 4,
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
  ];
}
