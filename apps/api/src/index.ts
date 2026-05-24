import { buildServer } from './server.js';
import { MockOracle } from './mock-oracle.js';
import { MarketMachine } from './market-machine.js';
import { WsManager } from './ws/manager.js';
import { marketChannel, oracleChannel } from '@jet/shared';
import { makeMarketStatusEvent } from './events.js';

const API_HOST = process.env['API_HOST'] ?? '0.0.0.0';
const API_PORT = parseInt(process.env['API_PORT'] ?? '3001', 10);

const oracle = new MockOracle();
const machine = new MarketMachine(oracle);
const manager = new WsManager(
  () => machine.getCurrentState(),
  () => oracle.getLatestSnapshot(),
);

machine.onTick((state) => {
  manager.broadcast(marketChannel(state.config.marketId), makeMarketStatusEvent(state));
});

oracle.onSnapshot((snapshot) => {
  manager.broadcast(oracleChannel(snapshot.marketId), {
    type: 'oracle:price',
    snapshot,
  });
});

machine.onResolved((state, resolution) => {
  const ch = marketChannel(state.config.marketId);
  manager.broadcast(ch, makeMarketStatusEvent(state));
  manager.broadcast(ch, { type: 'market:resolved', resolution });
});

const server = await buildServer(machine, manager);
const address = await server.listen({ host: API_HOST, port: API_PORT });
console.log(`API listening at ${address}`);

async function shutdown() {
  await server.close();
  machine.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
