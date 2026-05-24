import { MARKET } from '@jet/config';
import {
  type MarketState,
  type MarketConfig,
  type RampResolution,
  type MarketId,
  usdCents,
  shares,
  timestampMs,
} from '@jet/shared';
import { MockOracle } from './mock-oracle.js';

type TickCallback = (state: MarketState) => void;
type ResolvedCallback = (state: MarketState, resolution: RampResolution) => void;

export class MarketMachine {
  private state: MarketState | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private resolveTimeout: ReturnType<typeof setTimeout> | null = null;
  private tickCallbacks: TickCallback[] = [];
  private resolvedCallbacks: ResolvedCallback[] = [];

  constructor(private oracle: MockOracle) {}

  onTick(cb: TickCallback): void {
    this.tickCallbacks.push(cb);
  }

  onResolved(cb: ResolvedCallback): void {
    this.resolvedCallbacks.push(cb);
  }

  getCurrentState(): MarketState | null {
    return this.state;
  }

  startDemo(): MarketState {
    this.clearTimers();
    this.oracle.stop();

    const now = timestampMs(Date.now());
    const marketId: MarketId = `btc-2m-${Date.now()}`;
    const expiry = timestampMs(now + MARKET.durationMs);

    const config: MarketConfig = {
      marketId,
      question: 'Will BTC be above $100,000 in 2 minutes?',
      thresholdCents: usdCents(10_000_000), // $100,000
      durationMs: MARKET.durationMs,
    };

    this.state = {
      config,
      status: 'open',
      openedAtMs: now,
      expiryMs: expiry,
      msRemaining: MARKET.durationMs,
      openInterest: shares(0),
    };

    this.oracle.start(marketId);
    this.tickInterval = setInterval(() => this.tick(), 1000);

    return this.state;
  }

  private tick(): void {
    if (!this.state || this.state.status === 'resolved') return;

    // Wall-clock subtraction avoids drift over 120 ticks
    this.state.msRemaining = Math.max(0, this.state.expiryMs - Date.now());

    if (this.state.msRemaining <= 0 && this.state.status === 'open') {
      this.state.status = 'resolving';
      this.resolveTimeout = setTimeout(() => this.resolve(), 2000);
    }

    for (const cb of this.tickCallbacks) cb(this.state);
  }

  private resolve(): void {
    if (!this.state) return;

    const resolution = this.oracle.buildMockResolution(this.state.config);
    this.state.status = 'resolved';
    this.state.resolution = resolution;

    for (const cb of this.resolvedCallbacks) cb(this.state, resolution);

    this.clearTimers();
    this.oracle.stop();
  }

  private clearTimers(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.resolveTimeout) {
      clearTimeout(this.resolveTimeout);
      this.resolveTimeout = null;
    }
  }

  destroy(): void {
    this.clearTimers();
    this.oracle.stop();
  }
}
