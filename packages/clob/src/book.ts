import type {
  CanonicalOrder,
  OrderBookSnapshot,
  PriceCents,
} from '@jet/shared';
import { shares, timestampMs } from '@jet/shared';
import type { OrderId, UserId } from '@jet/shared';

interface PriceLevel {
  yesPriceCents: PriceCents;
  orders: CanonicalOrder[];
  /** running sum of order.remaining for all resting orders at this level */
  size: number;
}

export interface ClearedLevel {
  side: 'BUY' | 'SELL';
  yesPriceCents: PriceCents;
}

export interface ClearResult {
  orders: CanonicalOrder[];
  levels: ClearedLevel[];
}

/**
 * Single-market YES order book with price-time priority.
 * Bids sorted DESC, asks sorted ASC. Max 99 distinct price points — array is fine.
 */
export class OrderBook {
  private readonly bids: PriceLevel[] = [];
  private readonly asks: PriceLevel[] = [];
  private readonly orderIndex = new Map<OrderId, CanonicalOrder>();

  private levels(side: 'BUY' | 'SELL'): PriceLevel[] {
    return side === 'BUY' ? this.bids : this.asks;
  }

  bestBid(): CanonicalOrder | undefined {
    return this.bids[0]?.orders[0];
  }

  bestAsk(): CanonicalOrder | undefined {
    return this.asks[0]?.orders[0];
  }

  addRest(order: CanonicalOrder): void {
    const lvls = this.levels(order.yesAction);
    let level = lvls.find(l => l.yesPriceCents === order.yesPriceCents);
    if (!level) {
      level = { yesPriceCents: order.yesPriceCents, orders: [], size: 0 };
      lvls.push(level);
      if (order.yesAction === 'BUY') {
        lvls.sort((a, b) => b.yesPriceCents - a.yesPriceCents);
      } else {
        lvls.sort((a, b) => a.yesPriceCents - b.yesPriceCents);
      }
    }
    level.orders.push(order);
    level.size += order.remaining;
    this.orderIndex.set(order.orderId, order);
  }

  /** Reduce the head order at this side; remove it (and the level) when exhausted. */
  decrementHead(side: 'BUY' | 'SELL', sizeRemoved: number): void {
    const lvls = this.levels(side);
    const level = lvls[0];
    if (!level) return;
    const head = level.orders[0];
    if (!head) return;

    head.remaining = (head.remaining - sizeRemoved) as typeof head.remaining;
    level.size -= sizeRemoved;

    if (head.remaining === 0) {
      head.status = 'FILLED';
      level.orders.shift();
      this.orderIndex.delete(head.orderId);
    }
    if (level.orders.length === 0) {
      lvls.shift();
    }
  }

  /** O(n) cancel; orderIndex makes the level+price lookup O(1). */
  cancel(orderId: OrderId): CanonicalOrder | undefined {
    const order = this.orderIndex.get(orderId);
    if (!order) return undefined;
    const lvls = this.levels(order.yesAction);
    const levelIdx = lvls.findIndex(l => l.yesPriceCents === order.yesPriceCents);
    if (levelIdx === -1) return undefined;
    const level = lvls[levelIdx];
    if (!level) return undefined;
    const orderIdx = level.orders.findIndex(o => o.orderId === orderId);
    if (orderIdx === -1) return undefined;
    level.orders.splice(orderIdx, 1);
    level.size -= order.remaining;
    this.orderIndex.delete(orderId);
    if (level.orders.length === 0) {
      lvls.splice(levelIdx, 1);
    }
    order.status = 'CANCELLED';
    return order;
  }

  clear(): ClearResult {
    const orders = Array.from(this.orderIndex.values());
    const levels: ClearedLevel[] = [
      ...this.bids.map((level) => ({ side: 'BUY' as const, yesPriceCents: level.yesPriceCents })),
      ...this.asks.map((level) => ({ side: 'SELL' as const, yesPriceCents: level.yesPriceCents })),
    ];

    for (const order of orders) {
      order.status = 'CANCELLED';
    }

    this.bids.length = 0;
    this.asks.length = 0;
    this.orderIndex.clear();

    return { orders, levels };
  }

  getOrder(orderId: OrderId): CanonicalOrder | undefined {
    return this.orderIndex.get(orderId);
  }

  openOrdersFor(userId: UserId): CanonicalOrder[] {
    const result: CanonicalOrder[] = [];
    for (const order of this.orderIndex.values()) {
      if (order.userId === userId) result.push(order);
    }
    return result;
  }

  getLevelSize(side: 'BUY' | 'SELL', price: PriceCents): number {
    return this.levels(side).find(l => l.yesPriceCents === price)?.size ?? 0;
  }

  snapshot(marketId: string, seq: number, ts: number): OrderBookSnapshot {
    return {
      marketId,
      bids: this.bids.map(l => ({
        yesPriceCents: l.yesPriceCents,
        size: shares(l.size),
      })),
      asks: this.asks.map(l => ({
        yesPriceCents: l.yesPriceCents,
        size: shares(l.size),
      })),
      seq,
      ts: timestampMs(ts),
    };
  }
}
