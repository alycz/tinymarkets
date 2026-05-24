import { ORACLE } from '@jet/config';
import {
  type IndicativeSnapshot,
  type MarketConfig,
  type MarketId,
  type RampResolution,
  timestampMs,
} from '@jet/shared';
import type { VenueAdapter } from './venue-adapter.js';
import { buildScenario, type ScenarioName } from './scenarios.js';
import { buildIndicative } from './indicative.js';
import { resolveMarket } from './resolve.js';

type SnapshotCallback = (snapshot: IndicativeSnapshot) => void;

export interface RampOracleConfig {
  scenario: ScenarioName;
  seed: number;
  clock?: { now(): number };
}

/**
 * Drop-in replacement for MockOracle.
 * Uses the real RAMP_V1 settlement methodology with deterministic simulated venues.
 */
export class RampOracle {
  private marketId: MarketId | null = null;
  private adapters: VenueAdapter[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private callbacks: SnapshotCallback[] = [];
  private latestSnapshot: IndicativeSnapshot | null = null;

  constructor(private readonly cfg: RampOracleConfig) {}

  onSnapshot(cb: SnapshotCallback): void {
    this.callbacks.push(cb);
  }

  start(marketId: MarketId): void {
    this.marketId = marketId;
    const marketStartMs = this.now();
    const { adapters } = buildScenario(this.cfg.scenario, this.cfg.seed, marketStartMs);
    this.adapters = adapters;
    this.interval = setInterval(() => this.tick(), ORACLE.sampleIntervalMs);
    this.tick();
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

  buildResolution(config: MarketConfig): RampResolution {
    return resolveMarket({
      config,
      adapters: this.adapters,
      now: timestampMs(this.now()),
      oracleCfg: ORACLE,
    });
  }

  private now(): number {
    return this.cfg.clock?.now() ?? Date.now();
  }

  private tick(): void {
    if (!this.marketId || this.adapters.length === 0) return;
    const snapshot = buildIndicative({
      marketId: this.marketId,
      adapters: this.adapters,
      now: timestampMs(this.now()),
      oracleCfg: ORACLE,
    });
    this.latestSnapshot = snapshot;
    for (const cb of this.callbacks) cb(snapshot);
  }
}
