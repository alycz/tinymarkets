import type {
  Balance,
  Fill,
  IndicativeSnapshot,
  MarketState,
  OrderBookDelta,
  OrderBookSnapshot,
  Position,
  RampResolution,
  Trade,
  UserId,
  UserResolutionEvent,
} from '@jet/shared';
import {
  bookChannel,
  marketChannel,
  oracleChannel,
  tradesChannel,
  userChannel,
} from '@jet/shared';
import type { WsManager } from './ws/manager.js';
import { makeMarketStatusEvent } from './events.js';

export class Broadcaster {
  constructor(private mgr: WsManager) {}

  marketStatus(s: MarketState): void {
    this.mgr.broadcast(marketChannel(s.config.marketId), makeMarketStatusEvent(s));
  }

  marketResolved(s: MarketState, r: RampResolution): void {
    this.mgr.broadcast(marketChannel(s.config.marketId), {
      type: 'market:resolved',
      resolution: r,
    });
  }

  oraclePrice(snap: IndicativeSnapshot): void {
    this.mgr.broadcast(oracleChannel(snap.marketId), {
      type: 'oracle:price',
      snapshot: snap,
    });
  }

  bookDelta(d: OrderBookDelta): void {
    this.mgr.broadcast(bookChannel(d.marketId), {
      type: 'book:delta',
      delta: d,
    });
  }

  bookSnapshot(b: OrderBookSnapshot): void {
    this.mgr.broadcast(bookChannel(b.marketId), {
      type: 'book:snapshot',
      book: b,
    });
  }

  trade(t: Trade): void {
    this.mgr.broadcast(tradesChannel(t.marketId), {
      type: 'trade:created',
      trade: t,
    });
  }

  userBalance(userId: UserId, b: Balance): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'user:balance',
      balance: b,
    });
  }

  userPosition(userId: UserId, p: Position): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'user:position',
      position: p,
    });
  }

  userFill(userId: UserId, f: Fill): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'user:fill',
      fill: f,
    });
  }

  userResolution(
    userId: UserId,
    e: Omit<UserResolutionEvent, 'type'>,
  ): void {
    this.mgr.broadcast(userChannel(userId), {
      type: 'user:resolution',
      ...e,
    });
  }
}
