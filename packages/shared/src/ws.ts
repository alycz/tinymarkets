import type { IndicativeSnapshot, RampResolution } from './oracle';
import type { OrderBookDelta, OrderBookSnapshot } from './orderbook';
import type { Trade, Fill } from './trades';
import type { Balance, Position } from './positions';
import type { MarketStatus } from './market';
import type { MarketId, SignedShares, TimestampMs, UsdCents, UserId } from './units';
import type { Side as OutcomeSide } from './orders';

/**
 * Real-time protocol. Public market data and user-specific data are SEPARATE
 * channels, so a client subscribes only to what it needs and user data never
 * leaks onto the public stream.
 *
 *   channels:  market:<id>  book:<id>  trades:<id>  oracle:<id>  user:<id>
 */

export const CHANNEL_KINDS = ['market', 'book', 'trades', 'oracle', 'user'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** A channel string, e.g. "book:btc-2m" or "user:demo". */
export type Channel = `${ChannelKind}:${string}`;

export const marketChannel = (id: MarketId): Channel => `market:${id}`;
export const bookChannel = (id: MarketId): Channel => `book:${id}`;
export const tradesChannel = (id: MarketId): Channel => `trades:${id}`;
export const oracleChannel = (id: MarketId): Channel => `oracle:${id}`;
export const userChannel = (id: UserId): Channel => `user:${id}`;

export function parseChannel(c: Channel): { kind: ChannelKind; id: string } {
  const idx = c.indexOf(':');
  return { kind: c.slice(0, idx) as ChannelKind, id: c.slice(idx + 1) };
}

// ---- client -> server -----------------------------------------------------

export interface SubscribeMessage { type: 'subscribe'; channels: Channel[]; }
export interface UnsubscribeMessage { type: 'unsubscribe'; channels: Channel[]; }
export interface PingMessage { type: 'ping'; ts: TimestampMs; }

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PingMessage;

// ---- server -> client: public market data --------------------------------

export interface MarketStatusEvent {
  type: 'market:status';
  marketId: MarketId;
  status: MarketStatus;
  expiryMs: TimestampMs;
  msRemaining: number;
  serverTs: TimestampMs;
}
export interface OraclePriceEvent { type: 'oracle:price'; snapshot: IndicativeSnapshot; }
export interface BookSnapshotEvent { type: 'book:snapshot'; book: OrderBookSnapshot; }
export interface BookDeltaEvent { type: 'book:delta'; delta: OrderBookDelta; }
export interface TradeCreatedEvent { type: 'trade:created'; trade: Trade; }
/** Public, auditable resolution: the full RAMP_V1 object for the transparency panel. */
export interface MarketResolvedEvent { type: 'market:resolved'; resolution: RampResolution; }

// ---- server -> client: user-specific --------------------------------------

export interface UserBalanceEvent { type: 'user:balance'; balance: Balance; }
export interface UserPositionEvent { type: 'user:position'; position: Position; }
export interface UserFillEvent { type: 'user:fill'; fill: Fill; }
export interface UserResolutionEvent {
  type: 'user:resolution';
  marketId: MarketId;
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
  | MarketStatusEvent
  | OraclePriceEvent
  | BookSnapshotEvent
  | BookDeltaEvent
  | TradeCreatedEvent
  | MarketResolvedEvent
  | UserBalanceEvent
  | UserPositionEvent
  | UserFillEvent
  | UserResolutionEvent
  | SubscribedEvent
  | PongEvent
  | ErrorEvent;

export type ServerEventType = ServerEvent['type'];
