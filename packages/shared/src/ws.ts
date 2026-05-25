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
 *   channels:  market:<id>  book:<id>  trades:<id>  oracle:<id>  share:<id>  user:<id>
 */

export const CHANNEL_KINDS = ['market', 'book', 'trades', 'oracle', 'share', 'user'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** A channel string, e.g. "book:btc-2m" or "user:demo". */
export type Channel = `${ChannelKind}:${string}`;

export const marketChannel = (id: MarketId): Channel => `market:${id}`;
export const bookChannel = (id: MarketId): Channel => `book:${id}`;
export const tradesChannel = (id: MarketId): Channel => `trades:${id}`;
export const oracleChannel = (id: MarketId): Channel => `oracle:${id}`;
export const shareChannel = (id: MarketId): Channel => `share:${id}`;
export const userChannel = (id: UserId): Channel => `user:${id}`;

export function parseChannel(c: Channel): { kind: ChannelKind; id: string } {
  const idx = c.indexOf(':');
  return { kind: c.slice(0, idx) as ChannelKind, id: c.slice(idx + 1) };
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
export interface OraclePriceEvent { type: 'oracle_price'; snapshot: IndicativeSnapshot; }
export interface SharePriceSnapshotEvent {
  type: 'share_price_snapshot';
  marketId: MarketId;
  points: SharePricePoint[];
  latest: SharePricePoint | null;
}
export interface SharePriceEvent { type: 'share_price'; point: SharePricePoint; }
export interface BookSnapshotEvent { type: 'orderbook_snapshot'; book: OrderBookSnapshot; }
export interface BookDeltaEvent { type: 'orderbook_delta'; delta: OrderBookDelta; }
export interface TradeCreatedEvent { type: 'trade'; trade: Trade; }
/** Public, auditable resolution: the full VENUE_WEIGHTED_TWAP_V1 object for the transparency panel. */
export interface MarketResolvedEvent { type: 'resolution'; resolution: VenueWeightedTwapResolution; }

// ---- server -> client: user-specific --------------------------------------

export interface UserBalanceEvent { type: 'balance_update'; balance: Balance; }
export interface UserPositionEvent { type: 'position_update'; position: Position; }
export interface UserOpenOrdersEvent {
  type: 'open_order';
  userId: UserId;
  openOrders: CanonicalOrder[];
}
export interface UserOrderCancelledEvent {
  type: 'order_cancelled';
  userId: UserId;
  orderId: string;
  openOrders: CanonicalOrder[];
}
export interface UserFillEvent { type: 'fill'; fill: Fill; }
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
  | SharePriceSnapshotEvent
  | SharePriceEvent
  | BookSnapshotEvent
  | BookDeltaEvent
  | TradeCreatedEvent
  | MarketResolvedEvent
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
