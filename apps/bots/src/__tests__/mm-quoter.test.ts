import { describe, expect, it, vi } from 'vitest';
import { oddsPriceCents, shares, timestampMs } from '@jet/shared';
import type { CanonicalOrder } from '@jet/shared';
import { Quoter } from '../mm/quoter.js';
import type { ApiClient } from '../mm/api-client.js';
import type { MmConfig } from '../mm/config.js';

const config: MmConfig = {
  apiBaseUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3001/ws',
  botUserId: 'market-maker-1',
  levelSizes: [50],
  baseSpreadCents: 5,
  requoteMs: 1000,
  requoteFairMoveCents: 2,
  volatilityScaleCents: 50_000,
};

describe('market maker quoter reconciliation', () => {
  it('cancels stale levels and tops up missing target depth', async () => {
    const api = {
      getOpenOrders: vi.fn<Pick<ApiClient, 'getOpenOrders'>['getOpenOrders']>().mockResolvedValue([
        order({ orderId: 'kept-bid', yesAction: 'BUY', yesPriceCents: 48, remaining: 40 }),
        order({ orderId: 'stale-ask', yesAction: 'SELL', yesPriceCents: 80, remaining: 50 }),
      ]),
      cancelOrder: vi.fn<Pick<ApiClient, 'cancelOrder'>['cancelOrder']>().mockResolvedValue({ ok: true, orderId: 'stale-ask' }),
      placeOrder: vi.fn<Pick<ApiClient, 'placeOrder'>['placeOrder']>().mockResolvedValue({
        ok: true,
        order: order({ orderId: 'new', yesAction: 'BUY', yesPriceCents: 48, remaining: 10 }),
        fills: [],
        balance: {} as never,
        position: {} as never,
      }),
    };
    const quoter = new Quoter(api as unknown as ApiClient, config);
    quoter.setMarketId('market-1');

    const stats = await quoter.tick(oddsPriceCents(50), {
      recentVolatilityCents: 0,
      msRemaining: 60_000,
      msTotal: 120_000,
    });

    expect(stats).toEqual({ cancelled: 1, placed: 2 });
    expect(api.cancelOrder).toHaveBeenCalledWith('stale-ask', 'market-maker-1');
    expect(api.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'BUY_YES',
      price: oddsPriceCents(48),
      size: shares(10),
      tif: 'GTC',
    }));
    expect(api.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'SELL_YES',
      price: oddsPriceCents(53),
      size: shares(50),
      tif: 'GTC',
    }));
  });
});

function order(overrides: {
  orderId: string;
  yesAction: CanonicalOrder['yesAction'];
  yesPriceCents: number;
  remaining: number;
}): CanonicalOrder {
  return {
    orderId: overrides.orderId,
    userId: 'market-maker-1',
    marketId: 'market-1',
    yesAction: overrides.yesAction,
    yesPriceCents: oddsPriceCents(overrides.yesPriceCents),
    size: shares(overrides.remaining),
    remaining: shares(overrides.remaining),
    tif: 'GTC',
    status: 'OPEN',
    createdAtMs: timestampMs(Date.now()),
    display: {
      side: 'YES',
      action: overrides.yesAction,
      oddsPriceCents: oddsPriceCents(overrides.yesPriceCents),
    },
  };
}
