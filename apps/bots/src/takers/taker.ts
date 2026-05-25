import type { MarketId, PlaceOrderRequest, PriceCents } from '@jet/shared';
import type { ApiClient } from '../mm/api-client.js';
import { decide } from './decide.js';
import type { BestPrices } from './book-tracker.js';
import type { TakerPersona } from './persona.js';
import type { TokenBucket } from './rate-limiter.js';

export interface TakerState {
  fair: PriceCents;
  msRemaining: number;
  bestPrices: BestPrices;
  marketOpen: boolean;
}

export class TakerBot {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly api: ApiClient,
    private readonly marketId: MarketId,
    private readonly persona: TakerPersona,
    private readonly bucket: TokenBucket,
    private readonly getState: () => TakerState,
    private readonly onMarketInvalid: () => void = () => {},
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
    const jitter = 0.5 + Math.random();
    const delayMs = Math.max(250, Math.round(this.persona.intervalMs * jitter));
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      if (this.stopped) return;
      const state = this.getState();
      if (!state.marketOpen) return;

      const decision = decide({
        fair: state.fair,
        persona: this.persona,
        bestBid: state.bestPrices.bestBid,
        bestAsk: state.bestPrices.bestAsk,
        msRemaining: state.msRemaining,
      });
      if (!decision) return;
      if (!this.bucket.tryTake()) return;

      const req: PlaceOrderRequest = {
        userId: this.persona.userId,
        marketId: this.marketId,
        intent: decision.side === 'YES' ? 'BUY_YES' : 'BUY_NO',
        price: decision.oddsPriceCents,
        type: 'LIMIT',
        size: decision.size,
        tif: 'IOC',
        clientOrderId: `${this.persona.userId}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      };

      const result = await this.api.placeOrder(req);
      if (!result.ok) {
        if (result.error.code === 'UNKNOWN_MARKET' || result.error.code === 'MARKET_NOT_OPEN') {
          console.warn(`[taker:${this.persona.userId}] market invalid (${result.error.code}) — stopping current market loop`);
          this.stop();
          this.onMarketInvalid();
          return;
        }

        console.error(`[taker:${this.persona.userId}] order rejected:`, result.error.message);
      }
    } catch (err) {
      console.error(`[taker:${this.persona.userId}] tick error:`, err);
    } finally {
      this.scheduleNext();
    }
  }
}
