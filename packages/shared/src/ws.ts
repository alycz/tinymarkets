import type { IndicativeSnapshot, VenueWeightedTwapResolution } from './oracle';
import type { OrderBookDelta, OrderBookSnapshot } from './orderbook';
import type { CanonicalOrder } from './orders';
import type { SharePricePoint } from './share-price';
import type { Trade, Fill } from './trades';
import type { Balance, Position } from './positions';
import type { MarketState, MarketStatus } from './market';
import type { MarketId, SignedShares, TimestampMs, UsdCents, UserId } from './units';
import type { Side as OutcomeSide } from './orders';

/**
 * Real-time protocol. Public market data and user-specific data are SEPARATE
 * channels, so a client subscribes only to what it needs and user data never
 * leaks onto the public stream.
 *
 *   channels:  market:<marketId>  book:<marketId>  trades:<marketId>
 *              oracle:<marketId>  share_price:<marketId>
 *              user:<userId>:<marketId>
 *
 * Compatibility aliases accepted by the demo server:
 *   share:<marketId>  user:<userId>
 */

export const CHANNEL_KINDS = ['market', 'book', 'trades', 'oracle', 'share_price', 'share', 'user'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** A channel string, e.g. "book:btc-2m" or "user:demo:btc-2m". */
export type Channel = `${ChannelKind}:${string}`;

export const marketChannel = (id: MarketId): Channel => `market:${id}`;
export const bookChannel = (id: MarketId): Channel => `book:${id}`;
export const tradesChannel = (id: MarketId): Channel => `trades:${id}`;
export const oracleChannel = (id: MarketId): Channel => `oracle:${id}`;
export const sharePriceChannel = (id: MarketId): Channel => `share_price:${id}`;
/** Legacy alias. Prefer sharePriceChannel for new clients. */
export const shareChannel = (id: MarketId): Channel => `share:${id}`;
export const userChannel = (id: UserId, marketId?: MarketId): Channel =>
  marketId === undefined ? `user:${id}` : `user:${id}:${marketId}`;

export interface ParsedChannel {
  kind: ChannelKind;
  id: string;
  userId?: UserId;
  marketId?: MarketId;
  isLegacyAlias: boolean;
}

export function parseChannel(c: Channel): ParsedChannel {
  const idx = c.indexOf(':');
  const kind = c.slice(0, idx) as ChannelKind;
  const id = c.slice(idx + 1);

  if (kind === 'user') {
    const scopedIdx = id.lastIndexOf(':');
    if (scopedIdx > 0 && scopedIdx < id.length - 1) {
      return {
        kind,
        id,
        userId: id.slice(0, scopedIdx) as UserId,
        marketId: id.slice(scopedIdx + 1) as MarketId,
        isLegacyAlias: false,
      };
    }
    return { kind, id, userId: id as UserId, isLegacyAlias: true };
  }

  return {
    kind,
    id,
    marketId: id as MarketId,
    isLegacyAlias: kind === 'share',
  };
}

// ---- client -> server -----------------------------------------------------

export interface SubscribeMessage { type: 'subscribe'; channels: Channel[]; }
export interface UnsubscribeMessage { type: 'unsubscribe'; channels: Channel[]; }
export interface PingMessage { type: 'ping'; ts?: TimestampMs; }

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

// ---- server -> client: public market data --------------------------------

export interface MarketSnapshotEvent {
  type: 'market_snapshot';
  market: MarketState;
  orderbook: OrderBookSnapshot | null;
  recentTrades: Trade[];
  oracle: IndicativeSnapshot | null;
  sharePrice: SharePricePoint | null;
  countdownMs: number;
  serverTs: TimestampMs;
}
export interface MarketStatusEvent {
  type: 'market_status';
  marketId: MarketId;
  status: MarketStatus;
  expiryMs: TimestampMs;
  msRemaining: number;
  serverTs: TimestampMs;
}
export interface CountdownEvent {
  type: 'countdown';
  marketId: MarketId;
  expiryMs: TimestampMs;
  msRemaining: number;
  serverTs: TimestampMs;
}
export interface OraclePriceEvent {
  type: 'oracle_price';
  marketId: MarketId;
  tick: IndicativeSnapshot;
  /** Compatibility alias. Prefer tick. */
  snapshot: IndicativeSnapshot;
}
export interface OracleSeriesSnapshotEvent {
  type: 'oracle_series_snapshot';
  marketId: MarketId;
  snapshots: IndicativeSnapshot[];
  ts: TimestampMs;
}
export interface SharePriceSnapshotEvent {
  type: 'share_price_snapshot';
  marketId: MarketId;
  points: SharePricePoint[];
  latest: SharePricePoint | null;
  ts: TimestampMs;
}
export interface SharePriceEvent {
  type: 'share_price';
  marketId: MarketId;
  point: SharePricePoint;
}
export interface BookSnapshotEvent {
  type: 'orderbook_snapshot';
  marketId: MarketId;
  bids: OrderBookSnapshot['bids'];
  asks: OrderBookSnapshot['asks'];
  seq: number;
  ts: TimestampMs;
  /** Compatibility nested payload. */
  book: OrderBookSnapshot;
}
export interface BookDeltaEvent {
  type: 'orderbook_delta';
  marketId: MarketId;
  changes: OrderBookDelta['changes'];
  bidsChanged: OrderBookDelta['changes'];
  asksChanged: OrderBookDelta['changes'];
  seq: number;
  ts: TimestampMs;
  /** Compatibility nested payload. */
  delta: OrderBookDelta;
}
export interface TradesSnapshotEvent {
  type: 'trades_snapshot';
  marketId: MarketId;
  trades: Trade[];
  ts: TimestampMs;
}
export interface TradeCreatedEvent {
  type: 'trade';
  marketId: MarketId;
  trade: Trade;
}
/** Public, auditable resolution: the full VENUE_WEIGHTED_TWAP_V1 object for the transparency panel. */
export interface MarketResolvedEvent {
  type: 'resolution';
  marketId: MarketId;
  resolution: VenueWeightedTwapResolution;
}

// ---- server -> client: user-specific --------------------------------------

export interface UserBalanceSnapshotEvent {
  type: 'balance_snapshot';
  userId: UserId;
  marketId: MarketId;
  balance: Balance;
}
export interface UserPositionSnapshotEvent {
  type: 'position_snapshot';
  userId: UserId;
  marketId: MarketId;
  position: Position;
}
export interface UserOpenOrdersSnapshotEvent {
  type: 'open_orders_snapshot';
  userId: UserId;
  marketId: MarketId;
  openOrders: CanonicalOrder[];
}
export interface UserBalanceEvent {
  type: 'balance_update';
  userId: UserId;
  marketId: MarketId;
  balance: Balance;
}
export interface UserPositionEvent {
  type: 'position_update';
  userId: UserId;
  marketId: MarketId;
  position: Position;
}
export interface UserOpenOrdersEvent {
  type: 'open_order';
  userId: UserId;
  marketId: MarketId;
  openOrders: CanonicalOrder[];
}
export interface UserOrderCancelledEvent {
  type: 'order_cancelled';
  userId: UserId;
  marketId: MarketId;
  orderId: string;
  openOrders: CanonicalOrder[];
}
export interface UserFillEvent {
  type: 'fill';
  marketId: MarketId;
  userId: UserId;
  orderId: string;
  tradeId: string;
  yesPriceCents: Fill['yesPriceCents'];
  size: Fill['size'];
  side: Fill['yesAction'];
  ts: TimestampMs;
  fill: Fill;
}
export interface UserResolutionEvent {
  type: 'pnl_update';
  marketId: MarketId;
  userId: UserId;
  outcome: OutcomeSide;
  netAtResolution: SignedShares;
  payoutCents: UsdCents;
  pnlCents: number; // signed; realized PnL for the market
}

// ---- server -> client: control --------------------------------------------

export interface SubscribedEvent { type: 'subscribed'; channels: Channel[]; }
export interface PongEvent { type: 'pong'; ts: TimestampMs; }
export interface ErrorEvent { type: 'error'; code: string; message: string; }

export type ServerEvent =
  | MarketSnapshotEvent
  | MarketStatusEvent
  | CountdownEvent
  | OraclePriceEvent
  | OracleSeriesSnapshotEvent
  | SharePriceSnapshotEvent
  | SharePriceEvent
  | BookSnapshotEvent
  | BookDeltaEvent
  | TradesSnapshotEvent
  | TradeCreatedEvent
  | MarketResolvedEvent
  | UserBalanceSnapshotEvent
  | UserPositionSnapshotEvent
  | UserOpenOrdersSnapshotEvent
  | UserBalanceEvent
  | UserPositionEvent
  | UserOpenOrdersEvent
  | UserOrderCancelledEvent
  | UserFillEvent
  | UserResolutionEvent
  | SubscribedEvent
  | PongEvent
  | ErrorEvent;

export type ServerEventType = ServerEvent['type'];
