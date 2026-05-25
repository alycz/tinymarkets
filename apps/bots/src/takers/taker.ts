import type { MarketId, PlaceOrderRequest, PriceCents } from '@jet/shared';
import type { ApiClient } from '../mm/api-client.js';
import type { TakersConfig } from './config.js';
import { decide, isCrossedBook } from './decide.js';
import type { BestPrices } from './book-tracker.js';
import type { TakerPersona } from './persona.js';
import type { TokenBucket } from './rate-limiter.js';

export interface TakerState {
  fair: PriceCents;
  bestPrices: BestPrices;
  marketOpen: boolean;
}

export class TakerSwarm {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly api: ApiClient,
    private readonly marketId: MarketId,
    private readonly personas: TakerPersona[],
    private readonly config: TakersConfig,
    private readonly bucket: TokenBucket,
    private readonly getState: () => TakerState,
    private readonly onMarketInvalid: () => void = () => {},
    private readonly onBookInvalid: () => void = () => {},
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const delayMs = randomInt(this.config.minIntervalMs, this.config.maxIntervalMs);
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      if (this.stopped) return;
      const state = this.getState();
      if (!state.marketOpen) return;
      if (isCrossedBook(state.bestPrices.bestBid, state.bestPrices.bestAsk)) {
        console.warn('[takers] crossed local book detected; requesting fresh book snapshot', state.bestPrices);
        this.onBookInvalid();
        return;
      }

      const persona = this.personas[Math.floor(Math.random() * this.personas.length)];
      if (!persona) return;
      const decision = decide({
        fair: state.fair,
        persona,
        bestBid: state.bestPrices.bestBid,
        bestAsk: state.bestPrices.bestAsk,
      });
      if (!decision) return;
      if (!this.bucket.tryTake()) return;

      const req: PlaceOrderRequest = {
        userId: persona.userId,
        marketId: this.marketId,
        intent: decision.intent,
        price: decision.price,
        type: 'LIMIT',
        size: decision.size,
        tif: 'IOC',
        clientOrderId: `${persona.userId}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      };

      const result = await this.api.placeOrder(req);
      if (!result.ok) {
        if (result.error.code === 'UNKNOWN_MARKET' || result.error.code === 'MARKET_NOT_OPEN') {
          console.warn(`[takers] market invalid (${result.error.code}) — stopping current market loop`);
          this.stop();
          this.onMarketInvalid();
          return;
        }

        console.error(`[takers:${persona.userId}] order rejected:`, result.error.message);
      }
    } catch (err) {
      console.error('[takers] swarm tick error:', err);
    } finally {
      this.scheduleNext();
    }
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
