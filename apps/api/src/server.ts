import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { WebSocket } from 'ws';
import { createMarketsRoutes } from './routes/markets.js';
import { createOrdersRoutes } from './routes/orders.js';
import { createUsersRoutes } from './routes/users.js';
import { handleMessage } from './ws/handler.js';
import type { WsManager } from './ws/manager.js';
import type { MarketSession } from './session.js';

const WEB_ORIGIN = process.env['WEB_ORIGIN'];

export async function buildServer(session: MarketSession, manager: WsManager) {
  const server = Fastify({ logger: true });

  const corsOptions =
    WEB_ORIGIN && WEB_ORIGIN !== '*'
      ? { origin: WEB_ORIGIN.split(',') }
      : { origin: true };

  server.register(cors, corsOptions);
  server.register(websocket);
  server.register(createMarketsRoutes(session));
  server.register(createOrdersRoutes(session));
  server.register(createUsersRoutes(session));

  // WS route must be inside a nested plugin so @fastify/websocket's onRoute hook applies
  server.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket: WebSocket, _req) => {
      manager.addConnection(socket);
      socket.on('message', (data) => handleMessage(socket, data, manager));
      socket.on('close', () => manager.removeConnection(socket));
      socket.on('error', () => manager.removeConnection(socket));
    });
  });

  return server;
}
