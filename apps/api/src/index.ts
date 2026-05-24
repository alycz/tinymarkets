import { buildServer } from './server.js';
import { MarketSession } from './session.js';
import { Broadcaster } from './broadcasts.js';
import { WsManager } from './ws/manager.js';

const API_HOST = process.env['API_HOST'] ?? '0.0.0.0';
const API_PORT = parseInt(process.env['API_PORT'] ?? '3001', 10);

const session = new MarketSession();
const manager = new WsManager();
const broadcaster = new Broadcaster(manager);

session.setBroadcaster(broadcaster);
manager.setSession(session);

const server = await buildServer(session, manager);
const address = await server.listen({ host: API_HOST, port: API_PORT });
console.log(`API listening at ${address}`);

async function shutdown() {
  await server.close();
  session.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
