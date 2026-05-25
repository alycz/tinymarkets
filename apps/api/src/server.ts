import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { WebSocket } from 'ws';
import type { HealthResponse, Result } from '@jet/shared';
import { createMarketsRoutes } from './routes/markets.js';
import { createOrdersRoutes } from './routes/orders.js';
import { createUsersRoutes } from './routes/users.js';
import { handleMessage } from './ws/handler.js';
import type { WsManager } from './ws/manager.js';
import type { MarketSession } from './session.js';

export async function buildServer(session: MarketSession, manager: WsManager) {
  const server = Fastify({ logger: true });
  const allowedOrigins = parseCorsOrigins();

  server.register(cors, {
    origin(origin, cb) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        cb(null, true);
        return;
      }
      cb(new Error('Origin not allowed by CORS'), false);
    },
  });
  server.register(websocket);
  server.get('/health', async (_req, reply) => {
    const response: Result<HealthResponse> = { ok: true, service: 'api' };
    return reply.send(response);
  });
  server.register(createMarketsRoutes(session));
  server.register(createOrdersRoutes(session));
  server.register(createUsersRoutes(session));

  // WS route must be inside a nested plugin so @fastify/websocket's onRoute hook applies
  server.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
      if (!isAllowedOrigin(req.headers.origin, allowedOrigins)) {
        socket.close(1008, 'Origin not allowed');
        return;
      }
      manager.addConnection(socket);
      socket.on('message', (data) => handleMessage(socket, data, manager));
      socket.on('close', () => manager.removeConnection(socket));
      socket.on('error', () => manager.removeConnection(socket));
    });
  });

  return server;
}

function parseCorsOrigins(): Set<string> {
  const raw = process.env['CORS_ORIGIN'];
  if (!raw) {
    throw new Error('CORS_ORIGIN is required');
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must include at least one origin');
  }
  return new Set(origins);
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  return origin === undefined || allowedOrigins.has(origin);
}
