import type {
  Balance,
  Fill,
  IndicativeSnapshot,
  MarketState,
  OrderBookDelta,
  OrderBookSnapshot,
  Position,
  SharePricePoint,
  Trade,
  CanonicalOrder,
  OrderId,
  UserId,
  UserResolutionEvent,
  VenueWeightedTwapResolution,
  MarketId,
  ServerEvent,
} from '@jet/shared';
import {
  bookChannel,
  marketChannel,
  oracleChannel,
  shareChannel,
  sharePriceChannel,
  tradesChannel,
  userChannel,
} from '@jet/shared';
import type { WsManager } from './ws/manager.js';
import { makeCountdownEvent, makeMarketSnapshotEvent, makeMarketStatusEvent } from './events.js';

export class Broadcaster {
  private activeMarketId: MarketId | null = null;

  constructor(private mgr: WsManager) {}

  marketStatus(s: MarketState): void {
    this.activeMarketId = s.config.marketId;
    this.mgr.broadcast(marketChannel(s.config.marketId), makeMarketStatusEvent(s));
    this.mgr.broadcast(marketChannel(s.config.marketId), makeCountdownEvent(s));
  }

  marketSnapshot(
    s: MarketState,
    opts?: {
      orderbook?: OrderBookSnapshot | null;
      recentTrades?: Trade[];
      oracle?: IndicativeSnapshot | null;
      sharePrice?: SharePricePoint | null;
    },
  ): void {
    this.activeMarketId = s.config.marketId;
    this.mgr.broadcast(marketChannel(s.config.marketId), makeMarketSnapshotEvent(s, opts));
  }

  marketResolved(s: MarketState, r: VenueWeightedTwapResolution): void {
    this.activeMarketId = s.config.marketId;
    this.mgr.broadcast(marketChannel(s.config.marketId), {
      type: 'resolution',
      marketId: s.config.marketId,
      resolution: r,
    });
  }

  oraclePrice(snap: IndicativeSnapshot): void {
    this.activeMarketId = snap.marketId;
    this.mgr.broadcast(oracleChannel(snap.marketId), {
      type: 'oracle_price',
      marketId: snap.marketId,
      tick: snap,
      snapshot: snap,
    });
  }

  sharePrice(point: SharePricePoint): void {
    this.activeMarketId = point.marketId;
    const event = {
      type: 'share_price',
      marketId: point.marketId,
      point,
    } satisfies ServerEvent;
    this.mgr.broadcast(sharePriceChannel(point.marketId), event);
    this.mgr.broadcast(shareChannel(point.marketId), event);
  }

  bookDelta(d: OrderBookDelta): void {
    this.activeMarketId = d.marketId;
    this.mgr.broadcast(bookChannel(d.marketId), {
      type: 'orderbook_delta',
      marketId: d.marketId,
      changes: d.changes,
      bidsChanged: d.changes.filter((change) => change.side === 'BID'),
      asksChanged: d.changes.filter((change) => change.side === 'ASK'),
      seq: d.seq,
      ts: d.ts,
      delta: d,
    });
  }

  bookSnapshot(b: OrderBookSnapshot): void {
    this.activeMarketId = b.marketId;
    this.mgr.broadcast(bookChannel(b.marketId), {
      type: 'orderbook_snapshot',
      marketId: b.marketId,
      bids: b.bids,
      asks: b.asks,
      seq: b.seq,
      ts: b.ts,
      book: b,
    });
  }

  trade(t: Trade): void {
    this.activeMarketId = t.marketId;
    this.mgr.broadcast(tradesChannel(t.marketId), {
      type: 'trade',
      marketId: t.marketId,
      trade: t,
    });
  }

  userBalance(userId: UserId, b: Balance): void {
    const marketId = this.activeMarketId;
    if (!marketId) return;
    this.broadcastUser(userId, marketId, {
      type: 'balance_update',
      userId,
      marketId,
      balance: b,
    });
  }

  userPosition(userId: UserId, p: Position): void {
    this.broadcastUser(userId, p.marketId, {
      type: 'position_update',
      userId,
      marketId: p.marketId,
      position: p,
    });
  }

  userOpenOrders(userId: UserId, openOrders: CanonicalOrder[]): void {
    const marketId = openOrders[0]?.marketId ?? this.activeMarketId;
    if (!marketId) return;
    this.broadcastUser(userId, marketId, {
      type: 'open_order',
      userId,
      marketId,
      openOrders,
    });
  }

  userOrderCancelled(userId: UserId, orderId: OrderId, openOrders: CanonicalOrder[]): void {
    const marketId = openOrders[0]?.marketId ?? this.activeMarketId;
    if (!marketId) return;
    this.broadcastUser(userId, marketId, {
      type: 'order_cancelled',
      userId,
      marketId,
      orderId,
      openOrders,
    });
  }

  userFill(userId: UserId, f: Fill): void {
    const marketId = this.activeMarketId;
    if (!marketId) return;
    this.broadcastUser(userId, marketId, {
      type: 'fill',
      marketId,
      userId,
      orderId: f.orderId,
      tradeId: f.tradeId,
      yesPriceCents: f.yesPriceCents,
      size: f.size,
      side: f.yesAction,
      ts: f.ts,
      fill: f,
    });
  }

  userResolution(
    userId: UserId,
    e: Omit<UserResolutionEvent, 'type'>,
  ): void {
    this.broadcastUser(userId, e.marketId, {
      type: 'pnl_update',
      ...e,
    });
  }

  private broadcastUser(userId: UserId, marketId: MarketId, event: ServerEvent): void {
    this.mgr.broadcast(userChannel(userId, marketId), event);
    this.mgr.broadcast(userChannel(userId), event);
  }
}
