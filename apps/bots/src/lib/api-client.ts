import type {
  CancelOrderResponse,
  MarketResponse,
  MarketState,
  OrderBookResponse,
  PlaceOrderRequest,
  PlaceOrderResponse,
  UserOrdersResponse,
} from '@jet/shared';
import type { Result } from '@jet/shared';

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async getCurrentMarket(): Promise<MarketState | null> {
    try {
      const res = await fetch(`${this.baseUrl}/markets/current`);
      const body = (await res.json()) as Result<MarketResponse>;
      if (!body.ok) return null;
      return body.market;
    } catch (err) {
      console.error('[api] getCurrentMarket error:', err);
      return null;
    }
  }

  async getOrderBook(marketId: string): Promise<OrderBookResponse['book'] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/markets/${encodeURIComponent(marketId)}/orderbook`);
      const body = (await res.json()) as Result<OrderBookResponse>;
      if (!body.ok) return null;
      return body.book;
    } catch (err) {
      console.error('[api] getOrderBook error:', err);
      return null;
    }
  }

  async placeOrder(req: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return (await res.json()) as PlaceOrderResponse;
  }

  async cancelOrder(orderId: string, userId: string): Promise<CancelOrderResponse> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return (await res.json()) as CancelOrderResponse;
  }

  async getOpenOrders(userId: string): Promise<UserOrdersResponse['orders']> {
    try {
      const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(userId)}/orders`);
      const body = (await res.json()) as Result<UserOrdersResponse>;
      if (!body.ok) return [];
      return body.orders;
    } catch (err) {
      console.error('[api] getOpenOrders error:', err);
      return [];
    }
  }
}
