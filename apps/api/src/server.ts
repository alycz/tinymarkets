import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import type { WebSocket } from 'ws';
import { createMarketsRoutes } from './routes/markets.js';
import { handleMessage } from './ws/handler.js';
import type { WsManager } from './ws/manager.js';
import type { MarketMachine } from './market-machine.js';

export async function buildServer(machine: MarketMachine, manager: WsManager) {
  const server = Fastify({ logger: true });

  server.register(cors, { origin: true });
  server.register(websocket);
  server.register(createMarketsRoutes(machine));

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
