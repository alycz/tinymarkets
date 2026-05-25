import { describe, expect, it } from 'vitest';
import { oddsPriceCents } from '@jet/shared';
import { decide } from '../takers/decide.js';
import type { TakerPersona } from '../takers/persona.js';

function persona(overrides: Partial<TakerPersona> = {}): TakerPersona {
  return {
    userId: 'taker-test',
    handle: 'test',
    lean: 1,
    fade: 0,
    sizeScale: 1,
    intervalMs: 3_000,
    ...overrides,
  };
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('taker decide', () => {
  it('strongly favors BUY YES when fair is high', () => {
    const rng = lcg(7);
    let yes = 0;
    let no = 0;

    for (let i = 0; i < 10_000; i++) {
      const decision = decide({
        fair: oddsPriceCents(85),
        persona: persona(),
        bestBid: oddsPriceCents(84),
        bestAsk: oddsPriceCents(86),
        msRemaining: 60_000,
        rng,
      });

      if (decision?.side === 'YES') yes++;
      if (decision?.side === 'NO') no++;
    }

    expect(yes).toBeGreaterThan(no * 4);
  });

  it('rejects BUY NO near expiry when YES fair is decisive', () => {
    const decision = decide({
      fair: oddsPriceCents(98),
      persona: persona(),
      bestBid: oddsPriceCents(20),
      bestAsk: oddsPriceCents(98),
      msRemaining: 5_000,
      rng: () => 0.99,
    });

    expect(decision).toBeNull();
  });

  it('skips forced BUY YES when there is no ask to take', () => {
    const decision = decide({
      fair: oddsPriceCents(85),
      persona: persona(),
      bestBid: oddsPriceCents(84),
      bestAsk: null,
      msRemaining: 60_000,
      rng: () => 0,
    });

    expect(decision).toBeNull();
  });

  it('suppresses fade personas when near-expiry fair has a clear winner', () => {
    const decision = decide({
      fair: oddsPriceCents(98),
      persona: persona({ fade: 0.15 }),
      bestBid: oddsPriceCents(20),
      bestAsk: oddsPriceCents(98),
      msRemaining: 5_000,
      rng: () => 0.97,
    });

    expect(decision?.side).toBe('YES');
  });
});
