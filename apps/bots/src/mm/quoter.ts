import { shares } from '@jet/shared';
import type { PriceCents } from '@jet/shared';
import type { ApiClient } from './api-client.js';
import type { MmConfig } from './config.js';
import { buildQuoteLadder } from './pricing.js';

interface TrackedOrder {
  orderId: string;
  side: 'BID' | 'ASK';
  oddsPriceCents: PriceCents;
}

export class Quoter {
  // Keyed by "BID:<oddsPriceCents>" or "ASK:<oddsPriceCents>"
  private readonly orders = new Map<string, TrackedOrder>();
  private marketId = '';

  constructor(
    private readonly api: ApiClient,
    private readonly config: MmConfig,
  ) {}

  setMarketId(id: string): void {
    this.marketId = id;
  }

  onFill(orderId: string): void {
    for (const [key, tracked] of this.orders) {
      if (tracked.orderId === orderId) {
        this.orders.delete(key);
        break;
      }
    }
  }

  async tick(fairCents: PriceCents): Promise<void> {
    if (!this.marketId) return;

    const { levels, halfSpreadCents, levelStepCents, sizePerLevel, botUserId } = this.config;
    const targetLadder = buildQuoteLadder(fairCents, halfSpreadCents, levels, levelStepCents, sizePerLevel);
    const targetKeys = new Set(targetLadder.map(l => `${l.side}:${l.oddsPriceCents}`));

    // Cancel stale orders (not in the new target ladder)
    await Promise.all(
      [...this.orders.entries()]
        .filter(([key]) => !targetKeys.has(key))
        .map(([key, tracked]) =>
          this.api.cancelOrder(tracked.orderId, botUserId)
            .then(res => {
              if (res.ok || res.error.code === 'UNKNOWN_ORDER') {
                this.orders.delete(key);
              }
            })
            .catch(err => console.error(`[quoter] cancel failed for ${key}:`, err)),
        ),
    );

    // Place orders missing from our tracking
    await Promise.all(
      targetLadder
        .filter(level => !this.orders.has(`${level.side}:${level.oddsPriceCents}`))
        .map(level => {
          const key = `${level.side}:${level.oddsPriceCents}`;
          return this.api.placeOrder({
            userId: botUserId,
            marketId: this.marketId,
            intent: level.side === 'BID' ? 'BUY_YES' : 'SELL_YES',
            price: level.oddsPriceCents,
            type: 'LIMIT',
            size: shares(level.size),
            tif: 'GTC',
          })
            .then(res => {
              if (res.ok) {
                this.orders.set(key, {
                  orderId: res.order.orderId,
                  side: level.side,
                  oddsPriceCents: level.oddsPriceCents,
                });
              }
            })
            .catch(err => console.error(`[quoter] place failed for ${key}:`, err));
        }),
    );
  }

  async cancelAll(): Promise<void> {
    const { botUserId } = this.config;
    const entries = [...this.orders.entries()];
    await Promise.all(
      entries.map(([key, tracked]) =>
        this.api.cancelOrder(tracked.orderId, botUserId)
          .then(() => this.orders.delete(key))
          .catch(() => {}),
      ),
    );
    console.log(`[quoter] cancelled ${entries.length} orders`);
  }

  orderCount(): number {
    return this.orders.size;
  }
}
