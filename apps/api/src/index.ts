import { buildServer } from './server.js';
import { MarketSession } from './session.js';
import { Broadcaster } from './broadcasts.js';
import { WsManager } from './ws/manager.js';
import type { DemoMode } from '@jet/shared';

const HOST = process.env['HOST'] ?? '0.0.0.0';
const PORT = readPort();
const DEMO_MODE = readDemoMode();

const session = new MarketSession({ demoMode: DEMO_MODE });
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

function readDemoMode(): DemoMode {
  const raw = process.env['DEMO_MODE'] ?? 'simulated';
  if (raw === 'simulated' || raw === 'live' || raw === 'hybrid') return raw;
  throw new Error(`DEMO_MODE must be simulated, live, or hybrid; got ${raw}`);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

function readPort(): number {
  const raw = process.env['PORT'] ?? '3001';
  const port = parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got ${raw}`);
  }
  return port;
}
