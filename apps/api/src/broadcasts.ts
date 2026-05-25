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
} from '@jet/shared';
import {
  bookChannel,
  marketChannel,
  oracleChannel,
  shareChannel,
  tradesChannel,
  userChannel,
} from '@jet/shared';
import type { WsManager } from './ws/manager.js';
import { makeCountdownEvent, makeMarketSnapshotEvent, makeMarketStatusEvent } from './events.js';

export class Broadcaster {
  constructor(private mgr: WsManager) {}

  marketStatus(s: MarketState): void {
    this.mgr.broadcast(marketChannel(s.config.marketId), makeMarketStatusEvent(s));
    this.mgr.broadcast(marketChannel(s.config.marketId), makeCountdownEvent(s));
  }

  marketSnapshot(s: MarketState): void {
    this.mgr.broadcast(marketChannel(s.config.marketId), makeMarketSnapshotEvent(s));
  }

  marketResolved(s: MarketState, r: VenueWeightedTwapResolution): void {
    this.mgr.broadcast(marketChannel(s.config.marketId), {
      type: 'resolution',
      resolution: r,
    });
  }

  oraclePrice(snap: IndicativeSnapshot): void {
    this.mgr.broadcast(oracleChannel(snap.marketId), {
      type: 'oracle_price',
      snapshot: snap,
    });
  }

  sharePrice(point: SharePricePoint): void {
    this.mgr.broadcast(shareChannel(point.marketId), {
      type: 'share_price',
      point,
    });
  }

  bookDelta(d: OrderBookDelta): void {
    this.mgr.broadcast(bookChannel(d.marketId), {
      type: 'orderbook_delta',
      delta: d,
    });
  }

  bookSnapshot(b: OrderBookSnapshot): void {
    this.mgr.broadcast(bookChannel(b.marketId), {
      type: 'orderbook_snapshot',
      book: b,
    });
  }

  trade(t: Trade): void {
    this.mgr.broadcast(tradesChannel(t.marketId), {
      type: 'trade',
      trade: t,
    });
  }

  userBalance(userId: UserId, b: Balance): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'balance_update',
      balance: b,
    });
  }

  userPosition(userId: UserId, p: Position): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'position_update',
      position: p,
    });
  }

  userOpenOrders(userId: UserId, openOrders: CanonicalOrder[]): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'open_order',
      userId,
      openOrders,
    });
  }

  userOrderCancelled(userId: UserId, orderId: OrderId, openOrders: CanonicalOrder[]): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'order_cancelled',
      userId,
      orderId,
      openOrders,
    });
  }

  userFill(userId: UserId, f: Fill): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'fill',
      fill: f,
    });
  }

  userResolution(
    userId: UserId,
    e: Omit<UserResolutionEvent, 'type'>,
  ): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'pnl_update',
      ...e,
    });
  }
}
