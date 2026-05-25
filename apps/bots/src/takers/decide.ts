import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, oddsPriceCents, shares } from '@jet/shared';
import type { OrderIntent, PriceCents, Shares } from '@jet/shared';
import type { TakerPersona } from './persona.js';

export interface DecisionInput {
  fair: PriceCents;
  persona: TakerPersona;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  rng?: () => number;
}

export type TakerDecision =
  | {
      intent: 'BUY_YES';
      price: PriceCents;
      size: Shares;
    }
  | {
      intent: 'BUY_NO';
      price: PriceCents;
      size: Shares;
    };

export function decide(input: DecisionInput): TakerDecision | null {
  const { bestBid, bestAsk } = input;
  if (bestBid === null || bestAsk === null) return null;
  if ((bestBid as number) >= (bestAsk as number)) return null;

  const rng = input.rng ?? Math.random;
  const mid = ((bestBid as number) + (bestAsk as number)) / 2;
  const signalIntent: OrderIntent = (input.fair as number) >= mid ? 'BUY_YES' : 'BUY_NO';
  const intent = rng() < input.persona.contrarianRatio
    ? opposite(signalIntent)
    : signalIntent;
  const slippage = Math.floor(rng() * (input.persona.maxSlippageCents + 1));
  const size = randomSmallSize(rng);

  if (intent === 'BUY_YES') {
    return {
      intent,
      price: clampPrice((bestAsk as number) + slippage),
      size,
    };
  }

  return {
    intent,
    price: clampPrice(100 - (bestBid as number) + slippage),
    size,
  };
}

export function isCrossedBook(bestBid: PriceCents | null, bestAsk: PriceCents | null): boolean {
  return bestBid !== null && bestAsk !== null && (bestBid as number) >= (bestAsk as number);
}

function opposite(intent: OrderIntent): 'BUY_YES' | 'BUY_NO' {
  return intent === 'BUY_YES' ? 'BUY_NO' : 'BUY_YES';
}

function randomSmallSize(rng: () => number): Shares {
  const weighted = 1 + Math.floor(Math.pow(rng(), 1.8) * 25);
  return shares(Math.min(25, Math.max(1, weighted)));
}

function clampPrice(raw: number): PriceCents {
  return oddsPriceCents(Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, Math.round(raw))));
}
