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
});
