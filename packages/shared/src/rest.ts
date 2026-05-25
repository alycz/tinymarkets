import type { OrderBookSnapshot } from './orderbook';
import type { CanonicalOrder, PlaceOrderRequest } from './orders';
import type { Balance, Position, UserSnapshot } from './positions';
import type { AttackCostEstimate, IndicativeSnapshot, OracleDemoScenario } from './oracle';
import type { SharePriceMetrics, SharePricePoint } from './share-price';
import type { Trade } from './trades';
import type { MarketState } from './market';
import type { Fill } from './trades';
import type { MarketId, OrderId } from './units';

/**
 * REST surface — commands and one-shot snapshots. Live data flows over WS (see ws.ts).
 *
 *   GET  /health
 *   GET  /markets/current
 *   GET  /markets/:marketId               -> MarketResponse
 *   GET  /markets/:marketId/orderbook     -> OrderBookResponse
 *   GET  /markets/:marketId/trades        -> TradesResponse
 *   GET  /markets/:marketId/share-price-series -> SharePriceSeriesResponse
 *   GET  /markets/:marketId/mark               -> SharePriceMarkResponse
 *   GET  /markets/:marketId/oracle-series -> OracleSeriesResponse
 *   GET  /users/:userId                   -> UserResponse
 *   GET  /users/:userId/balance           -> BalanceResponse
 *   GET  /users/:userId/positions         -> PositionsResponse
 *   GET  /users/:userId/orders            -> UserOrdersResponse
 *   POST /orders            (PlaceOrderRequest)        -> PlaceOrderResponse
 *   POST /orders/:orderId/cancel                       -> CancelOrderResponse
 *   POST /markets/start-demo                           -> StartDemoResponse
 *   POST /markets/:marketId/resolve                    -> forced local demo resolution
 *   POST /markets/:marketId/oracle/demo                -> DemoScenarioResponse
 *   POST /markets/:marketId/oracle/demo-spike          -> DemoSpikeResponse
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
export interface SharePriceSeriesResponse {
  marketId: MarketId;
  points: SharePricePoint[];
  latest: SharePricePoint | null;
}
export interface SharePriceMarkResponse {
  marketId: MarketId;
  latest: SharePricePoint | null;
  metrics: SharePriceMetrics | null;
}
export interface OracleSeriesResponse { snapshots: IndicativeSnapshot[]; }
export interface UserResponse { snapshot: UserSnapshot; }
export interface BalanceResponse { balance: Balance; }
export interface PositionsResponse { positions: Position[]; }
export interface UserOrdersResponse { orders: CanonicalOrder[]; }
export interface StartDemoResponse { market: MarketState; }
export interface DemoScenarioRequest {
  scenario: OracleDemoScenario;
}
export interface DemoScenarioResponse {
  scenario: OracleDemoScenario;
  attackCostEstimate?: AttackCostEstimate;
}
export interface DemoSpikeResponse {
  scenario: 'NEAR_EXPIRY_SPIKE';
  attackCostEstimate?: AttackCostEstimate;
}
export interface HealthResponse {
  service: 'api';
}

export type { PlaceOrderRequest };
export type PlaceOrderResponse = Result<{
  /** Canonical YES-book order created from the user-facing request. */
  order: CanonicalOrder;
  fills: Fill[];
  /** Present when a GTC order has resting quantity after matching. */
  remainingOpenOrder?: CanonicalOrder;
  balance: Balance;
  position: Position;
}>;
export type CancelOrderResponse = Result<{ orderId: OrderId }>;
