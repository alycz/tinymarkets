import {
  marketChannel,
  bookChannel,
  oracleChannel,
  userChannel,
  oddsPriceCents,
} from '@jet/shared';
import type { PriceCents, UsdCents } from '@jet/shared';
import { loadConfig } from './config.js';
import { ApiClient } from './api-client.js';
import { WsClient } from './ws-client.js';
import { Quoter } from './quoter.js';
import { fairYesProbCents } from './pricing.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new ApiClient(config.apiBaseUrl);
  const quoter = new Quoter(api, config);

  // Wait until an open market is available
  console.log('[mm] waiting for an open market...');
  let market = await api.getCurrentMarket();
  while (!market || market.status !== 'open') {
    await sleep(1_000);
    market = await api.getCurrentMarket();
  }

  const marketId = market.config.marketId;
  const strikeCents = market.config.thresholdCents;
  const msTotal = market.config.durationMs;
  quoter.setMarketId(marketId);
  console.log(
    `[mm] market ${marketId} open — strike ${strikeCents}c, duration ${msTotal}ms`,
  );

  let currentFair: PriceCents = oddsPriceCents(50);
  let msRemaining = market.msRemaining;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const doTick = (): void => {
    if (stopped) return;
    quoter.tick(currentFair).catch(err => console.error('[mm] tick error:', err));
  };

  const ws = new WsClient(config.wsUrl, {
    onOracle: (event) => {
      const btc = event.snapshot.btcPriceCents as UsdCents;
      currentFair = fairYesProbCents(btc, strikeCents, msRemaining, msTotal, config.baseSigma);
      doTick();
    },
    onMarketStatus: (event) => {
      msRemaining = event.msRemaining;
      if (event.status === 'resolving' || event.status === 'resolved') {
        stopped = true;
        if (timer !== null) clearInterval(timer);
        console.log(`[mm] market ${event.status} — stopping quotes`);
      }
    },
    onUserFill: (event) => {
      quoter.onFill(event.fill.orderId);
    },
    onMarketResolved: () => {
      stopped = true;
      if (timer !== null) clearInterval(timer);
    },
  });

  ws.subscribe([
    oracleChannel(marketId),
    marketChannel(marketId),
    bookChannel(marketId),
    userChannel(config.botUserId),
  ]);
  ws.connect();

  // Heartbeat: requote even when oracle is quiet
  timer = setInterval(doTick, config.requoteMs);

  const shutdown = async (): Promise<void> => {
    if (timer !== null) clearInterval(timer);
    ws.destroy();
    await quoter.cancelAll();
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch(err => {
  console.error('[mm] fatal:', err);
  process.exit(1);
});
