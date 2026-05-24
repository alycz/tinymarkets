import type {
  MarketState,
  PlaceOrderRequest,
  PlaceOrderResponse,
  CancelOrderResponse,
  MarketResponse,
} from '@jet/shared';
import type { Result } from '@jet/shared';

type CurrentMarketResult = Result<MarketResponse>;

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async getCurrentMarket(): Promise<MarketState | null> {
    try {
      const res = await fetch(`${this.baseUrl}/markets/current`);
      const body = (await res.json()) as CurrentMarketResult;
      if (!body.ok) return null;
      return body.market;
    } catch (err) {
      console.error('[api] getCurrentMarket error:', err);
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
}
