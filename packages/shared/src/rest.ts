import type { OrderBookSnapshot } from './orderbook';
import type { CanonicalOrder, PlaceOrderRequest } from './orders';
import type { Position, UserSnapshot } from './positions';
import type { Trade } from './trades';
import type { MarketState } from './market';
import type { Fill } from './trades';
import type { OrderId } from './units';

/**
 * REST surface — commands and one-shot snapshots. Live data flows over WS (see ws.ts).
 *
 *   GET  /markets/current
 *   GET  /markets/:marketId               -> MarketResponse
 *   GET  /markets/:marketId/orderbook     -> OrderBookResponse
 *   GET  /markets/:marketId/trades        -> TradesResponse
 *   GET  /users/:userId                   -> UserResponse
 *   GET  /users/:userId/positions         -> PositionsResponse
 *   POST /orders            (PlaceOrderRequest)        -> PlaceOrderResponse
 *   POST /orders/:orderId/cancel                       -> CancelOrderResponse
 *   POST /markets/start-demo                           -> StartDemoResponse
 */

export type ApiErrorCode =
  | 'VALIDATION'
  | 'INVALID_PRICE'
  | 'INVALID_SIZE'
  | 'MARKET_NOT_OPEN'
  | 'UNKNOWN_MARKET'
  | 'UNKNOWN_ORDER'
  | 'INSUFFICIENT_BALANCE'
  | 'NOT_ORDER_OWNER';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; error: ApiError };
export type Result<T> = Ok<T> | Err;

export interface MarketResponse { market: MarketState; }
export interface OrderBookResponse { book: OrderBookSnapshot; }
export interface TradesResponse { trades: Trade[]; }
export interface UserResponse { snapshot: UserSnapshot; }
export interface PositionsResponse { positions: Position[]; }
export interface StartDemoResponse { market: MarketState; }

export type { PlaceOrderRequest };
export type PlaceOrderResponse = Result<{ order: CanonicalOrder; fills: Fill[] }>;
export type CancelOrderResponse = Result<{ orderId: OrderId }>;
