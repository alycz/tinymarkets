import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oddsPriceCents } from '@jet/shared';
import type { ApiErrorCode, PlaceOrderResponse } from '@jet/shared';
import type { ApiClient } from '../mm/api-client.js';
import type { TokenBucket } from '../takers/rate-limiter.js';
import { TakerBot } from '../takers/taker.js';

function response(code: ApiErrorCode): PlaceOrderResponse {
  return {
    ok: false,
    error: {
      code,
      message: code,
    },
  } as PlaceOrderResponse;
}

function makeBot(result: PlaceOrderResponse, onMarketInvalid = vi.fn()): {
  api: Pick<ApiClient, 'placeOrder'>;
  bot: TakerBot;
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
    bot: new TakerBot(
      api as unknown as ApiClient,
      'market-1',
      {
        userId: 'taker-test',
        handle: 'test',
        lean: 1,
        fade: 0,
        sizeScale: 1,
        intervalMs: 250,
      },
      bucket as unknown as TokenBucket,
      () => ({
        fair: oddsPriceCents(90),
        msRemaining: 60_000,
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

describe('TakerBot market lifecycle', () => {
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
    const { api, bot, onMarketInvalid } = makeBot(response('UNKNOWN_MARKET'));

    bot.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(api.placeOrder).toHaveBeenCalledTimes(1);
    expect(onMarketInvalid).toHaveBeenCalledTimes(1);
  });

  it('stops and notifies the parent on MARKET_NOT_OPEN', async () => {
    const { api, bot, onMarketInvalid } = makeBot(response('MARKET_NOT_OPEN'));

    bot.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(api.placeOrder).toHaveBeenCalledTimes(1);
    expect(onMarketInvalid).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying and does not notify the parent on other order errors', async () => {
    const { api, bot, onMarketInvalid } = makeBot(response('INSUFFICIENT_BALANCE'));

    bot.start();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(250);

    expect(api.placeOrder).toHaveBeenCalledTimes(2);
    expect(onMarketInvalid).not.toHaveBeenCalled();

    bot.stop();
  });
});
