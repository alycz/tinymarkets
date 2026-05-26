import { shares } from '@jet/shared';
import type { CanonicalOrder, PriceCents } from '@jet/shared';
import type { ApiClient } from '../lib/api-client.js';
import type { MmConfig } from './config.js';
import { buildLevelSpecs, buildQuoteLadder, dynamicSpreadCents } from '../lib/pricing.js';

type QuoteSide = 'BID' | 'ASK';

interface ReconcileStats {
  cancelled: number;
  placed: number;
}

export class Quoter {
  private marketId = '';

  constructor(
    private readonly api: ApiClient,
    private readonly config: MmConfig,
  ) {}

  setMarketId(id: string): void {
    this.marketId = id;
  }

  onFill(_orderId: string): void {
    // Reconciliation on the next tick reads the server truth.
  }

  async tick(
    fairCents: PriceCents,
    opts: { recentVolatilityCents: number; msRemaining: number; msTotal: number },
  ): Promise<ReconcileStats> {
    if (!this.marketId) return { cancelled: 0, placed: 0 };

    const spread = dynamicSpreadCents({
      baseSpreadCents: this.config.baseSpreadCents,
      recentVolatilityCents: opts.recentVolatilityCents,
      msRemaining: opts.msRemaining,
      msTotal: opts.msTotal,
    });
    const levelSpecs = buildLevelSpecs(spread, this.config.levelSizes);
    const targetLadder = buildQuoteLadder(fairCents, levelSpecs).map((level) => ({
      ...level,
      size: this.jitterSize(level.size),
      maxSize: this.maxJitterSize(level.size),
    }));
    const targets = new Map(targetLadder.map((level) => [levelKey(level.side, level.oddsPriceCents), level]));
    const openOrders = (await this.api.getOpenOrders(this.config.botUserId))
      .filter((order) => order.marketId === this.marketId)
      .filter((order) => order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED');

    let cancelled = 0;
    let placed = 0;
    const usableByKey = new Map<string, CanonicalOrder[]>();

    for (const order of openOrders) {
      const side = order.yesAction === 'BUY' ? 'BID' : 'ASK';
      const key = levelKey(side, order.yesPriceCents);
      if (!targets.has(key)) {
        if (await this.cancel(order.orderId)) cancelled++;
        continue;
      }
      const orders = usableByKey.get(key) ?? [];
      orders.push(order);
      usableByKey.set(key, orders);
    }

    for (const [key, target] of targets) {
      const existing = (usableByKey.get(key) ?? [])
        .sort((a, b) => (a.createdAtMs as number) - (b.createdAtMs as number));
      let keptSize = 0;

      for (const order of existing) {
        const remaining = order.remaining as number;
        if (keptSize >= target.maxSize) {
          if (await this.cancel(order.orderId)) cancelled++;
          continue;
        }
        if (keptSize + remaining <= target.maxSize) {
          keptSize += remaining;
          continue;
        }
        if (await this.cancel(order.orderId)) cancelled++;
      }

      const missingSize = target.size - keptSize;
      if (missingSize > 0) {
        const ok = await this.place(target.side, target.oddsPriceCents, missingSize);
        if (ok) placed++;
      }
    }

    return { cancelled, placed };
  }

  async cancelAll(): Promise<void> {
    const openOrders = await this.api.getOpenOrders(this.config.botUserId);
    const entries = openOrders.filter((order) => !this.marketId || order.marketId === this.marketId);
    await Promise.all(entries.map((order) => this.cancel(order.orderId)));
    console.log(`[quoter] cancelled ${entries.length} orders`);
  }

  async orderCount(): Promise<number> {
    const openOrders = await this.api.getOpenOrders(this.config.botUserId);
    return openOrders.filter((order) => !this.marketId || order.marketId === this.marketId).length;
  }

  private async place(side: QuoteSide, oddsPriceCents: PriceCents, size: number): Promise<boolean> {
    try {
      const result = await this.api.placeOrder({
        userId: this.config.botUserId,
        marketId: this.marketId,
        intent: side === 'BID' ? 'BUY_YES' : 'SELL_YES',
        price: oddsPriceCents,
        type: 'LIMIT',
        size: shares(size),
        tif: 'GTC',
      });
      if (!result.ok) {
        console.warn(`[quoter] place rejected ${side}:${oddsPriceCents}: ${result.error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[quoter] place failed ${side}:${oddsPriceCents}:`, err);
      return false;
    }
  }

  private jitterSize(baseSize: number): number {
    const min = this.config.sizeJitterMin;
    const max = this.config.sizeJitterMax;
    const factor = max > min ? min + Math.random() * (max - min) : min;
    return Math.max(1, Math.round(baseSize * factor));
  }

  private maxJitterSize(baseSize: number): number {
    return Math.max(1, Math.round(baseSize * this.config.sizeJitterMax));
  }

  private async cancel(orderId: string): Promise<boolean> {
    try {
      const result = await this.api.cancelOrder(orderId, this.config.botUserId);
      return result.ok || result.error.code === 'UNKNOWN_ORDER';
    } catch (err) {
      console.error(`[quoter] cancel failed ${orderId}:`, err);
      return false;
    }
  }
}

function levelKey(side: QuoteSide, price: PriceCents): string {
  return `${side}:${price as number}`;
}
