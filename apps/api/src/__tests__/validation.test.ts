import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';
import { Broadcaster } from '../broadcasts.js';
import { MarketSession } from '../session.js';
import { WsManager } from '../ws/manager.js';

describe('REST boundary validation', () => {
  const originalCorsOrigin = process.env['CORS_ORIGIN'];
  let session: MarketSession;
  let manager: WsManager;
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    delete process.env['CORS_ORIGIN'];
    session = new MarketSession();
    manager = new WsManager({ heartbeatMs: 60_000 });
    const broadcaster = new Broadcaster(manager);
    session.setBroadcaster(broadcaster);
    manager.setSession(session);
    server = await buildServer(session, manager);
  });

  afterEach(async () => {
    await server.close();
    session.destroy();
    manager.destroy();
    if (originalCorsOrigin === undefined) {
      delete process.env['CORS_ORIGIN'];
    } else {
      process.env['CORS_ORIGIN'] = originalCorsOrigin;
    }
  });

  it('uses local CORS defaults when CORS_ORIGIN is unset', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejects invalid place-order ids and accepts valid orders', async () => {
    const market = session.startDemo();

    const invalidUser = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'bad user',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: 55,
        size: 1,
      },
    });
    expect(invalidUser.statusCode).toBe(400);
    expect(invalidUser.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const invalidClientOrderId = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: 55,
        size: 1,
        clientOrderId: 'bad client order',
      },
    });
    expect(invalidClientOrderId.statusCode).toBe(400);
    expect(invalidClientOrderId.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const valid = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: 55,
        size: 1,
        clientOrderId: 'client-1',
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toMatchObject({ ok: true });

    const validIntent = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'userB',
        marketId: market.config.marketId,
        intent: 'BUY_NO',
        price: 40,
        type: 'LIMIT',
        size: 2,
        clientOrderId: 'client-2',
      },
    });
    expect(validIntent.statusCode).toBe(200);
    expect(validIntent.json()).toMatchObject({
      ok: true,
      order: {
        yesAction: 'SELL',
        yesPriceCents: 60,
        display: { side: 'NO', action: 'BUY', oddsPriceCents: 40 },
      },
      balance: { userId: 'userB' },
      position: { userId: 'userB' },
    });

    const conflicting = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'userC',
        marketId: market.config.marketId,
        intent: 'BUY_YES',
        price: 55,
        side: 'NO',
        action: 'BUY',
        oddsPriceCents: 45,
        type: 'LIMIT',
        size: 1,
      },
    });
    expect(conflicting.statusCode).toBe(400);
    expect(conflicting.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('rejects invalid route ids for market, user, and cancel endpoints', async () => {
    session.startDemo();

    const invalidMarket = await server.inject({ method: 'GET', url: '/markets/bad%20market' });
    expect(invalidMarket.statusCode).toBe(400);
    expect(invalidMarket.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const invalidUser = await server.inject({ method: 'GET', url: '/users/bad%20user' });
    expect(invalidUser.statusCode).toBe(400);
    expect(invalidUser.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const invalidCancelUser = await server.inject({
      method: 'POST',
      url: '/orders/order-1/cancel',
      payload: { userId: 'bad user' },
    });
    expect(invalidCancelUser.statusCode).toBe(400);
    expect(invalidCancelUser.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const invalidOrderId = await server.inject({
      method: 'POST',
      url: '/orders/bad%20order/cancel',
      payload: { userId: 'userA' },
    });
    expect(invalidOrderId.statusCode).toBe(400);
    expect(invalidOrderId.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('serves share/oracle series and exact user snapshot endpoints', async () => {
    const market = session.startDemo();

    await server.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: 55,
        size: 1,
      },
    });

    const shareSeries = await server.inject({
      method: 'GET',
      url: `/markets/${market.config.marketId}/share-price-series`,
    });
    expect(shareSeries.statusCode).toBe(200);
    expect(shareSeries.json()).toMatchObject({
      ok: true,
      marketId: market.config.marketId,
      latest: expect.objectContaining({ marketId: market.config.marketId }),
    });
    expect(shareSeries.json().points.length).toBeGreaterThan(0);

    const mark = await server.inject({
      method: 'GET',
      url: `/markets/${market.config.marketId}/mark`,
    });
    expect(mark.statusCode).toBe(200);
    expect(mark.json()).toMatchObject({
      ok: true,
      marketId: market.config.marketId,
      latest: expect.objectContaining({ marketId: market.config.marketId }),
      metrics: expect.objectContaining({
        latestYesPrice: expect.any(Number),
        latestNoPrice: expect.any(Number),
        volumeLastMinute: expect.any(Number),
      }),
    });

    const oracleSeries = await server.inject({
      method: 'GET',
      url: `/markets/${market.config.marketId}/oracle-series`,
    });
    expect(oracleSeries.statusCode).toBe(200);
    expect(oracleSeries.json()).toMatchObject({ ok: true });
    expect(oracleSeries.json().snapshots.length).toBeGreaterThan(0);

    const balance = await server.inject({ method: 'GET', url: '/users/userA/balance' });
    expect(balance.statusCode).toBe(200);
    expect(balance.json()).toMatchObject({ ok: true, balance: { userId: 'userA' } });

    const orders = await server.inject({ method: 'GET', url: '/users/userA/orders' });
    expect(orders.statusCode).toBe(200);
    expect(orders.json()).toMatchObject({ ok: true });
    expect(orders.json().orders).toHaveLength(1);
  });
});
