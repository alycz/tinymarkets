import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oddsPriceCents } from '@jet/shared';
import type { ApiErrorCode, PlaceOrderResponse } from '@jet/shared';
import type { ApiClient } from '../mm/api-client.js';
import type { TokenBucket } from '../takers/rate-limiter.js';
import { TakerSwarm } from '../takers/taker.js';
import type { TakersConfig } from '../takers/config.js';

function response(code: ApiErrorCode): PlaceOrderResponse {
  return {
    ok: false,
    error: {
      code,
      message: code,
    },
  } as PlaceOrderResponse;
}

const config: TakersConfig = {
  apiBaseUrl: 'http://localhost:3001',
  wsUrl: 'ws://localhost:3001/ws',
  numTakers: 75,
  rateLimitTps: 6,
  minIntervalMs: 250,
  maxIntervalMs: 250,
  volatilityScaleCents: 50_000,
  minContrarianRatio: 0.2,
  maxContrarianRatio: 0.35,
  userIdPrefix: 'taker',
};

function makeSwarm(result: PlaceOrderResponse, onMarketInvalid = vi.fn()): {
  api: Pick<ApiClient, 'placeOrder'>;
  swarm: TakerSwarm;
  onMarketInvalid: () => void;
} {
  const api = {
    placeOrder: vi.fn<Pick<ApiClient, 'placeOrder'>['placeOrder']>().mockResolvedValue(result),
  };
  const bucket = {
    tryTake: vi.fn<Pick<TokenBucket, 'tryTake'>['tryTake']>().mockReturnValue(true),
  };

  return {
    api,
    onMarketInvalid,
    swarm: new TakerSwarm(
      api as unknown as ApiClient,
      'market-1',
      [{
        userId: 'taker-001',
        handle: 'taker001',
        contrarianRatio: 0,
        maxSlippageCents: 0,
      }],
      config,
      bucket as unknown as TokenBucket,
      () => ({
        fair: oddsPriceCents(90),
        bestPrices: {
          bestBid: oddsPriceCents(40),
          bestAsk: oddsPriceCents(50),
        },
        marketOpen: true,
      }),
      onMarketInvalid,
    ),
  };
}

describe('TakerSwarm market lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops and notifies the parent on UNKNOWN_MARKET', async () => {
    const { api, swarm, onMarketInvalid } = makeSwarm(response('UNKNOWN_MARKET'));

    swarm.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(api.placeOrder).toHaveBeenCalledTimes(1);
    expect(onMarketInvalid).toHaveBeenCalledTimes(1);
  });

  it('stops and notifies the parent on MARKET_NOT_OPEN', async () => {
    const { api, swarm, onMarketInvalid } = makeSwarm(response('MARKET_NOT_OPEN'));

    swarm.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(api.placeOrder).toHaveBeenCalledTimes(1);
    expect(onMarketInvalid).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying and does not notify the parent on other order errors', async () => {
    const { api, swarm, onMarketInvalid } = makeSwarm(response('INSUFFICIENT_BALANCE'));

    swarm.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(250);

    expect(api.placeOrder).toHaveBeenCalledTimes(2);
    expect(onMarketInvalid).not.toHaveBeenCalled();

    swarm.stop();
  });
});
