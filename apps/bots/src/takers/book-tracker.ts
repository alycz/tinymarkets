import type {
  OrderBookDelta,
  OrderBookSnapshot,
  PriceCents,
  Shares,
} from '@jet/shared';

export interface BestPrices {
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
}

export class BookTracker {
  private marketId: string | null = null;
  private seq = 0;
  private lastUpdateMs = 0;
  private readonly bids = new Map<number, Shares>();
  private readonly asks = new Map<number, Shares>();

  reset(): void {
    this.marketId = null;
    this.seq = 0;
    this.lastUpdateMs = 0;
    this.bids.clear();
    this.asks.clear();
  }

  applySnapshot(snapshot: OrderBookSnapshot): void {
    this.marketId = snapshot.marketId;
    this.seq = snapshot.seq;
    this.lastUpdateMs = snapshot.ts as number;
    this.bids.clear();
    this.asks.clear();

    for (const level of snapshot.bids) {
      if (level.size > 0) this.bids.set(level.yesPriceCents, level.size);
    }
    for (const level of snapshot.asks) {
      if (level.size > 0) this.asks.set(level.yesPriceCents, level.size);
    }
  }

  applyDelta(delta: OrderBookDelta): void {
    if (this.marketId !== delta.marketId) return;
    if (delta.seq <= this.seq) return;
    this.seq = delta.seq;
    this.lastUpdateMs = delta.ts as number;

    for (const change of delta.changes) {
      const levels = change.side === 'BID' ? this.bids : this.asks;
      if (change.size === 0) {
        levels.delete(change.yesPriceCents);
      } else {
        levels.set(change.yesPriceCents, change.size);
      }
    }
  }

  bestPrices(): BestPrices {
    return {
      bestBid: maxKey(this.bids),
      bestAsk: minKey(this.asks),
    };
  }

  isStale(maxAgeMs: number, nowMs = Date.now()): boolean {
    return this.lastUpdateMs === 0 || nowMs - this.lastUpdateMs > maxAgeMs;
  }
}

function maxKey(map: Map<number, Shares>): PriceCents | null {
  let best: number | null = null;
  for (const price of map.keys()) {
    best = best === null ? price : Math.max(best, price);
  }
  return best as PriceCents | null;
}

function minKey(map: Map<number, Shares>): PriceCents | null {
  let best: number | null = null;
  for (const price of map.keys()) {
    best = best === null ? price : Math.min(best, price);
  }
  return best as PriceCents | null;
}
