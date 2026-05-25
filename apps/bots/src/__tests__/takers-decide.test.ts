import { describe, expect, it } from 'vitest';
import { oddsPriceCents } from '@jet/shared';
import { decide, isCrossedBook } from '../takers/decide.js';
import type { TakerPersona } from '../takers/persona.js';

function persona(overrides: Partial<TakerPersona> = {}): TakerPersona {
  return {
    userId: 'taker-001',
    handle: 'taker001',
    contrarianRatio: 0,
    maxSlippageCents: 1,
    ...overrides,
  };
}

describe('taker decide', () => {
  it('buys YES when fair is above the current mid', () => {
    const decision = decide({
      fair: oddsPriceCents(65),
      persona: persona(),
      bestBid: oddsPriceCents(48),
      bestAsk: oddsPriceCents(52),
      rng: () => 0,
    });

    expect(decision).toMatchObject({
      intent: 'BUY_YES',
      price: oddsPriceCents(52),
    });
  });

  it('buys NO at the complement price when fair is below the current mid', () => {
    const decision = decide({
      fair: oddsPriceCents(35),
      persona: persona(),
      bestBid: oddsPriceCents(48),
      bestAsk: oddsPriceCents(52),
      rng: () => 0,
    });

    expect(decision).toMatchObject({
      intent: 'BUY_NO',
      price: oddsPriceCents(52),
    });
  });

  it('can take the contrarian side', () => {
    const decision = decide({
      fair: oddsPriceCents(65),
      persona: persona({ contrarianRatio: 1 }),
      bestBid: oddsPriceCents(48),
      bestAsk: oddsPriceCents(52),
      rng: () => 0,
    });

    expect(decision?.intent).toBe('BUY_NO');
  });

  it('uses marketable slippage for BUY_NO complements', () => {
    const values = [0.9, 0.9, 0];
    const decision = decide({
      fair: oddsPriceCents(35),
      persona: persona({ maxSlippageCents: 2 }),
      bestBid: oddsPriceCents(48),
      bestAsk: oddsPriceCents(52),
      rng: () => values.shift() ?? 0,
    });

    expect(decision).toMatchObject({
      intent: 'BUY_NO',
      price: oddsPriceCents(54),
    });
  });

  it('skips empty or crossed books', () => {
    expect(decide({
      fair: oddsPriceCents(65),
      persona: persona(),
      bestBid: null,
      bestAsk: oddsPriceCents(52),
    })).toBeNull();
    expect(decide({
      fair: oddsPriceCents(65),
      persona: persona(),
      bestBid: oddsPriceCents(52),
      bestAsk: oddsPriceCents(52),
    })).toBeNull();
    expect(isCrossedBook(oddsPriceCents(53), oddsPriceCents(52))).toBe(true);
  });
});
