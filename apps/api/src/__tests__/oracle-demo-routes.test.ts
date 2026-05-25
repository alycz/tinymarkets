import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DemoScenarioResponse, Result, StartDemoResponse } from '@jet/shared';
import { buildServer } from '../server.js';
import { MarketSession } from '../session.js';
import { WsManager } from '../ws/manager.js';

describe('oracle demo routes', () => {
  const originalCorsOrigin = process.env['CORS_ORIGIN'];
  let session: MarketSession;

  beforeEach(() => {
    process.env['CORS_ORIGIN'] = 'https://web.example.com';
    session = new MarketSession();
  });

  afterEach(() => {
    session.destroy();
    if (originalCorsOrigin === undefined) {
      delete process.env['CORS_ORIGIN'];
    } else {
      process.env['CORS_ORIGIN'] = originalCorsOrigin;
    }
  });

  it('keeps the legacy demo-spike endpoint as a NEAR_EXPIRY_SPIKE wrapper', async () => {
    const server = await buildServer(session, new WsManager());
    const start = await server.inject({ method: 'POST', url: '/markets/start-demo' });
    const startBody = start.json<Result<StartDemoResponse>>();
    expect(startBody.ok).toBe(true);
    const marketId = startBody.ok ? startBody.market.config.marketId : '';

    const response = await server.inject({
      method: 'POST',
      url: `/markets/${marketId}/oracle/demo-spike`,
    });
    const body = response.json<Result<DemoScenarioResponse>>();

    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.ok === true && body.scenario).toBe('NEAR_EXPIRY_SPIKE');

    await server.close();
  });

  it('accepts generalized spike and subtle dislocation demo scenarios', async () => {
    const server = await buildServer(session, new WsManager());
    const start = await server.inject({ method: 'POST', url: '/markets/start-demo' });
    const startBody = start.json<Result<StartDemoResponse>>();
    expect(startBody.ok).toBe(true);
    const marketId = startBody.ok ? startBody.market.config.marketId : '';

    for (const scenario of ['NEAR_EXPIRY_SPIKE', 'SUBTLE_DISLOCATION'] as const) {
      const response = await server.inject({
        method: 'POST',
        url: `/markets/${marketId}/oracle/demo`,
        payload: { scenario },
      });
      const body = response.json<Result<DemoScenarioResponse>>();

      expect(response.statusCode).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.ok === true && body.scenario).toBe(scenario);
    }

    await server.close();
  });

  it('rejects unsupported generalized oracle demo scenarios', async () => {
    const server = await buildServer(session, new WsManager());
    const start = await server.inject({ method: 'POST', url: '/markets/start-demo' });
    const startBody = start.json<Result<StartDemoResponse>>();
    expect(startBody.ok).toBe(true);
    const marketId = startBody.ok ? startBody.market.config.marketId : '';

    const response = await server.inject({
      method: 'POST',
      url: `/markets/${marketId}/oracle/demo`,
      payload: { scenario: 'BAD_SCENARIO' },
    });
    const body = response.json<Result<DemoScenarioResponse>>();

    expect(response.statusCode).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.ok === false && body.error.code).toBe('VALIDATION');

    await server.close();
  });
});
