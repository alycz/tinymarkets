import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HealthResponse, Result } from '@jet/shared';
import { buildServer } from '../server.js';
import { MarketSession } from '../session.js';
import { WsManager } from '../ws/manager.js';

describe('health route', () => {
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

  it('returns a host health-check payload', async () => {
    const server = await buildServer(session, new WsManager());

    const response = await server.inject({ method: 'GET', url: '/health' });
    const body = response.json<Result<HealthResponse>>();

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ ok: true, service: 'api' });

    await server.close();
  });
});
