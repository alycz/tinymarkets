import { buildServer } from './server.js';
import { MarketSession } from './session.js';
import { Broadcaster } from './broadcasts.js';
import { WsManager } from './ws/manager.js';

const HOST = process.env['HOST'] ?? '0.0.0.0';
const PORT = requirePort();

const session = new MarketSession();
const manager = new WsManager();
const broadcaster = new Broadcaster(manager);

session.setBroadcaster(broadcaster);
manager.setSession(session);

const server = await buildServer(session, manager);
const address = await server.listen({ host: HOST, port: PORT });
console.log(`API listening at ${address}`);

async function shutdown() {
  await server.close();
  session.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

function requirePort(): number {
  const raw = process.env['PORT'];
  if (!raw) {
    throw new Error('PORT is required');
  }
  const port = parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got ${raw}`);
  }
  return port;
}
