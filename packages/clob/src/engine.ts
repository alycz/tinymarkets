import type {
  CanonicalOrder,
  Match,
  OrderBookDelta,
  OrderBookDeltaChange,
  OrderBookSnapshot,
  PlaceOrderRequest,
} from '@jet/shared';
import { shares, timestampMs } from '@jet/shared';
import type { MarketId, OrderId, PriceCents } from '@jet/shared';
import { OrderBook } from './book';
import { makeIdGen } from './ids';
import type { IdGen } from './ids';
import { normalize } from './normalize';

type TouchKey = string; // `${side}:${price}` — composite to avoid BID/ASK collision at same price
type TouchEntry = { side: 'BID' | 'ASK'; price: PriceCents };

export class Clob {
  private readonly book: OrderBook;
  private readonly marketId: MarketId;
  private readonly idGen: IdGen;
  private readonly now: () => number;
  private readonly matchBufferSize: number;
  private seq = 0;
  private readonly matchBuffer: Match[] = [];

  constructor(
    marketId: MarketId,
    opts?: { now?: () => number; matchBufferSize?: number; idGen?: IdGen },
  ) {
    this.marketId = marketId;
    this.book = new OrderBook();
    this.now = opts?.now ?? Date.now;
    this.matchBufferSize = opts?.matchBufferSize ?? 100;
    this.idGen = opts?.idGen ?? makeIdGen();
  }

  private nextSeq(): number {
    return ++this.seq;
  }

  private buildDelta(touched: Map<TouchKey, TouchEntry>): OrderBookDelta {
    const seq = this.nextSeq();
    const ts = timestampMs(this.now());
    const changes: OrderBookDeltaChange[] = [];
    for (const { side, price } of touched.values()) {
      const bookSide = side === 'BID' ? 'BUY' : 'SELL';
      const sz = this.book.getLevelSize(bookSide, price);
      changes.push({ side, yesPriceCents: price, size: shares(sz) });
    }
    return { marketId: this.marketId, changes, seq, ts };
  }

  private pushMatch(m: Match): void {
    this.matchBuffer.push(m);
    if (this.matchBuffer.length > this.matchBufferSize) {
      this.matchBuffer.shift();
    }
  }

  placeOrder(req: PlaceOrderRequest): {
    order: CanonicalOrder;
    matches: Match[];
    delta: OrderBookDelta;
  } {
    const ts = this.now();
    const order = normalize(req, this.idGen, ts);
    const matches: Match[] = [];
    const touched = new Map<TouchKey, TouchEntry>();

    if (order.yesAction === 'BUY') {
      while (order.remaining > 0) {
        const bestAsk = this.book.bestAsk();
        if (!bestAsk || bestAsk.yesPriceCents > order.yesPriceCents) break;

        const fillSize = Math.min(order.remaining, bestAsk.remaining) as typeof order.remaining;
        const tradePrice = bestAsk.yesPriceCents;

        const match: Match = {
          tradeId: this.idGen.nextTradeId(),
          marketId: this.marketId,
          yesPriceCents: tradePrice,
          size: fillSize,
          makerOrderId: bestAsk.orderId,
          takerOrderId: order.orderId,
          takerSide: req.side,
          ts: timestampMs(ts),
        };
        matches.push(match);
        this.pushMatch(match);
        touched.set(`ASK:${tradePrice}`, { side: 'ASK', price: tradePrice });

        this.book.decrementHead('SELL', fillSize);
        order.remaining = (order.remaining - fillSize) as typeof order.remaining;
      }
    } else {
      while (order.remaining > 0) {
        const bestBid = this.book.bestBid();
        if (!bestBid || bestBid.yesPriceCents < order.yesPriceCents) break;

        const fillSize = Math.min(order.remaining, bestBid.remaining) as typeof order.remaining;
        const tradePrice = bestBid.yesPriceCents;

        const match: Match = {
          tradeId: this.idGen.nextTradeId(),
          marketId: this.marketId,
          yesPriceCents: tradePrice,
          size: fillSize,
          makerOrderId: bestBid.orderId,
          takerOrderId: order.orderId,
          takerSide: req.side,
          ts: timestampMs(ts),
        };
        matches.push(match);
        this.pushMatch(match);
        touched.set(`BID:${tradePrice}`, { side: 'BID', price: tradePrice });

        this.book.decrementHead('BUY', fillSize);
        order.remaining = (order.remaining - fillSize) as typeof order.remaining;
      }
    }

    if (order.remaining === 0) {
      order.status = 'FILLED';
    } else if (order.tif === 'GTC') {
      order.status = matches.length > 0 ? 'PARTIALLY_FILLED' : 'OPEN';
      this.book.addRest(order);
      const restSide = order.yesAction === 'BUY' ? 'BID' : 'ASK';
      touched.set(`${restSide}:${order.yesPriceCents}`, { side: restSide, price: order.yesPriceCents });
    } else {
      // IOC: drop remainder
      order.status = matches.length > 0 ? 'PARTIALLY_FILLED' : 'CANCELLED';
    }

    return { order, matches, delta: this.buildDelta(touched) };
  }

  cancel(orderId: OrderId): { ok: boolean; delta: OrderBookDelta } {
    const order = this.book.cancel(orderId);
    if (!order) {
      const seq = this.nextSeq();
      const ts = timestampMs(this.now());
      return { ok: false, delta: { marketId: this.marketId, changes: [], seq, ts } };
    }
    const touched = new Map<TouchKey, TouchEntry>();
    const side = order.yesAction === 'BUY' ? 'BID' : 'ASK';
    touched.set(`${side}:${order.yesPriceCents}`, { side, price: order.yesPriceCents });
    return { ok: true, delta: this.buildDelta(touched) };
  }

  snapshot(): OrderBookSnapshot {
    return this.book.snapshot(this.marketId, this.nextSeq(), this.now());
  }

  recentMatches(limit = 100): Match[] {
    const buf = this.matchBuffer;
    return limit >= buf.length ? [...buf] : buf.slice(-limit);
  }
}
