import {
  marketChannel,
  bookChannel,
  oracleChannel,
  userChannel,
  oddsPriceCents,
} from '@jet/shared';
import type { MarketState, PriceCents, UsdCents } from '@jet/shared';
import { loadConfig } from './config.js';
import type { MmConfig } from './config.js';
import { ApiClient } from '../lib/api-client.js';
import { WsClient } from './ws-client.js';
import { Quoter } from './quoter.js';
import { fairYesProbCents } from '../lib/pricing.js';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForOpenMarket(
  api: ApiClient,
  isShuttingDown: () => boolean,
): Promise<MarketState | null> {
  let market = await api.getCurrentMarket();
  while (!isShuttingDown() && (!market || market.status !== 'open')) {
    await sleep(1_000);
    market = await api.getCurrentMarket();
  }
  return isShuttingDown() ? null : market;
}

async function runMarket(
  api: ApiClient,
  config: MmConfig,
  market: MarketState,
  registerStop: (stop: () => void) => void,
): Promise<void> {
  const quoter = new Quoter(api, config);

  const marketId = market.config.marketId;
  const strikeCents = market.config.thresholdCents;
  const msTotal = market.config.durationMs;
  quoter.setMarketId(marketId);
  console.log(
    `[mm] market ${marketId} open — strike ${strikeCents}c, duration ${msTotal}ms`,
  );

  let currentFair: PriceCents = oddsPriceCents(50);
  let lastQuotedFair: PriceCents | null = null;
  let msRemaining = market.msRemaining;
  const recentOraclePrices: number[] = [];
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let guardTimer: ReturnType<typeof setInterval> | null = null;
  const activeTicks = new Set<Promise<void>>();
  let resolveMarket: (() => void) | null = null;

  const done = new Promise<void>(resolve => {
    resolveMarket = resolve;
  });

  const finish = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (guardTimer !== null) {
      clearInterval(guardTimer);
      guardTimer = null;
    }
    resolveMarket?.();
  };
  registerStop(finish);

  const doTick = (): void => {
    if (stopped) return;
    if (activeTicks.size > 0) return;
    const tick = quoter.tick(currentFair, {
        recentVolatilityCents: recentVolatility(recentOraclePrices),
        msRemaining,
        msTotal,
      })
      .then(() => undefined)
      .catch(err => console.error('[mm] tick error:', err))
      .finally(() => {
        activeTicks.delete(tick);
      });
    activeTicks.add(tick);
    lastQuotedFair = currentFair;
  };

  const ws = new WsClient(config.wsUrl, {
    onOracle: (event) => {
      const btc = event.snapshot.btcPriceCents as UsdCents;
      recentOraclePrices.push(btc as number);
      if (recentOraclePrices.length > 12) recentOraclePrices.shift();
      const nextFair = fairYesProbCents({
        btcCents: btc,
        strikeCents,
        msRemaining,
        msTotal,
        volatilityScaleCents: config.volatilityScaleCents,
      });
      currentFair = nextFair;
      if (
        lastQuotedFair === null ||
        Math.abs((nextFair as number) - (lastQuotedFair as number)) >= config.requoteFairMoveCents
      ) {
        doTick();
      }
    },
    onMarketStatus: (event) => {
      msRemaining = event.msRemaining;
      if (event.status !== 'open') {
        console.log(`[mm] market ${event.status} — stopping quotes`);
        finish();
      }
    },
    onUserFill: (event) => {
      quoter.onFill(event.fill.orderId);
    },
    onMarketResolved: () => {
      finish();
    },
  });

  ws.subscribe([
    oracleChannel(marketId),
    marketChannel(marketId),
    bookChannel(marketId),
    userChannel(config.botUserId, marketId),
  ]);
  ws.connect();

  guardTimer = setInterval(() => {
    void api.getCurrentMarket()
      .then(current => {
        if (!current || current.status !== 'open' || current.config.marketId !== marketId) {
          console.warn(`[mm] active market ${marketId} disappeared/changed — stopping quotes and waiting for next market`);
          finish();
        }
      })
      .catch(err => {
        console.warn('[mm] market guard error:', err);
      });
  }, 2_000);

  // Heartbeat: requote even when oracle is quiet
  timer = setInterval(doTick, config.requoteMs);

  await done;

  finish();
  ws.destroy();
  await Promise.allSettled([...activeTicks]);
  try {
    await quoter.cancelAll();
  } catch (err) {
    console.warn('[mm] cancelAll skipped/failed during market cleanup:', err);
  }
  console.log(`[mm] market ${marketId} closed — stopped quotes`);
}

function recentVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  return Math.max(...prices) - Math.min(...prices);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new ApiClient(config.apiBaseUrl);
  let shuttingDown = false;
  let stopActiveMarket: (() => void) | null = null;

  const shutdown = (): void => {
    shuttingDown = true;
    stopActiveMarket?.();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!shuttingDown) {
    console.log('[mm] waiting for an open market...');
    const market = await waitForOpenMarket(api, () => shuttingDown);
    if (!market) break;
    await runMarket(api, config, market, stop => {
      stopActiveMarket = stop;
    });
    stopActiveMarket = null;
    if (!shuttingDown) await sleep(1_000);
  }
}

main().catch(err => {
  console.error('[mm] fatal:', err);
  process.exit(1);
});
