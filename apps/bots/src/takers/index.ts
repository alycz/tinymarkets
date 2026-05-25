import {
  bookChannel,
  marketChannel,
  oracleChannel,
  oddsPriceCents,
} from '@jet/shared';
import type { MarketState, PriceCents, UsdCents } from '@jet/shared';
import { ApiClient } from '../lib/api-client.js';
import { fairYesProbCents } from '../lib/pricing.js';
import { BookTracker } from './book-tracker.js';
import { loadConfig } from './config.js';
import type { TakersConfig } from './config.js';
import { buildPersonas } from './persona.js';
import { TokenBucket } from './rate-limiter.js';
import { TakerSwarm } from './taker.js';
import { WsClient } from './ws-client.js';

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
  config: TakersConfig,
  market: MarketState,
  registerStop: (stop: () => void) => void,
): Promise<void> {
  const marketId = market.config.marketId;
  const strikeCents = market.config.thresholdCents;
  const msTotal = market.config.durationMs;
  const book = new BookTracker();
  const bucket = new TokenBucket(config.rateLimitTps);

  let fair: PriceCents = oddsPriceCents(50);
  let msRemaining = market.msRemaining;
  let marketOpen = true;
  let stopped = false;
  let guardTimer: ReturnType<typeof setInterval> | null = null;
  let resolveMarket: (() => void) | null = null;

  const done = new Promise<void>(resolve => {
    resolveMarket = resolve;
  });
  const finish = (): void => {
    if (stopped) return;
    stopped = true;
    marketOpen = false;
    if (guardTimer !== null) {
      clearInterval(guardTimer);
      guardTimer = null;
    }
    resolveMarket?.();
  };
  registerStop(finish);

  const ws = new WsClient(config.wsUrl, {
    onOracle: (event) => {
      const btc = event.snapshot.btcPriceCents as UsdCents;
      fair = fairYesProbCents({
        btcCents: btc,
        strikeCents,
        msRemaining,
        msTotal,
        volatilityScaleCents: config.volatilityScaleCents,
      });
    },
    onMarketStatus: (event) => {
      msRemaining = event.msRemaining;
      if (event.status !== 'open') {
        finish();
      }
    },
    onBookSnapshot: (event) => {
      book.applySnapshot(event.book);
    },
    onBookDelta: (event) => {
      book.applyDelta(event.delta);
    },
    onMarketResolved: () => {
      finish();
    },
  });

  ws.subscribe([
    oracleChannel(marketId),
    marketChannel(marketId),
    bookChannel(marketId),
  ]);
  ws.connect();

  guardTimer = setInterval(() => {
    void api.getCurrentMarket()
      .then(current => {
        if (!current || current.status !== 'open' || current.config.marketId !== marketId) {
          console.warn(`[takers] active market ${marketId} disappeared/changed — stopping takers and returning to wait loop`);
          finish();
        }
      })
      .catch(err => {
        console.warn('[takers] market guard error:', err);
      });
  }, 2_000);

  const personas = buildPersonas(config);
  const swarm = new TakerSwarm(
    api,
    marketId,
    personas,
    config,
    bucket,
    () => ({
      fair,
      bestPrices: book.bestPrices(),
      marketOpen: marketOpen && !book.isStale(5_000),
    }),
    finish,
    () => {
      book.reset();
      ws.refresh([bookChannel(marketId)]);
    },
  );

  swarm.start();
  console.log(`[takers] market ${marketId} open — started ${personas.length} taker personas`);

  await done;

  finish();
  swarm.stop();
  ws.destroy();
  book.reset();
  console.log(`[takers] market ${marketId} closed — stopped takers`);
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
    console.log('[takers] waiting for an open market...');
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
  console.error('[takers] fatal:', err);
  process.exit(1);
});
