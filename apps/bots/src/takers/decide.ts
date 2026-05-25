import {
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  oddsPriceCents,
  shares,
} from '@jet/shared';
import type { Action, PriceCents, Shares, Side } from '@jet/shared';
import type { TakerPersona } from './persona.js';

export interface DecisionInput {
  fair: PriceCents;
  persona: TakerPersona;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  msRemaining: number;
  rng?: () => number;
}

export interface TakerDecision {
  side: Side;
  action: Action;
  oddsPriceCents: PriceCents;
  size: Shares;
}

const DEFAULT_MAX_ADVERSE_CENTS = 8;
const NEAR_EXPIRY_MAX_ADVERSE_CENTS = 2;
const NEAR_EXPIRY_MS = 20_000;
const FADE_SUPPRESSION_MS = 15_000;
const CLEAR_WINNER_DISTANCE = 35;

export function decide(input: DecisionInput): TakerDecision | null {
  const rng = input.rng ?? Math.random;
  const fadeSuppressed = isFadeSuppressed(input.persona, input.fair, input.msRemaining);
  const side = chooseSide(input.fair, input.persona, fadeSuppressed, rng);
  if (side === null) return null;

  const price = crossingPrice(side, input.bestBid, input.bestAsk, rng);
  if (price === null) return null;
  if (!passesFairGate(side, price, input.fair, input.msRemaining)) return null;

  return {
    side,
    action: 'BUY',
    oddsPriceCents: price,
    size: shares(input.persona.sizeScale),
  };
}

export function isFadeSuppressed(
  persona: TakerPersona,
  fair: PriceCents,
  msRemaining: number,
): boolean {
  return persona.fade > 0 && msRemaining < FADE_SUPPRESSION_MS && Math.abs(fair - 50) > CLEAR_WINNER_DISTANCE;
}

function chooseSide(
  fair: PriceCents,
  persona: TakerPersona,
  fadeSuppressed: boolean,
  rng: () => number,
): Side | null {
  if (persona.fade > 0 && !fadeSuppressed) {
    return rng() < 0.5 ? 'YES' : 'NO';
  }

  const fade = fadeSuppressed ? 0 : persona.fade;
  const pYes = clamp((fair / 100) * persona.lean - fade, 0, 1);
  const pNo = clamp(((100 - fair) / 100) * persona.lean - fade, 0, 1);
  const total = pYes + pNo;
  if (total <= 0) return null;

  return rng() < pYes / total ? 'YES' : 'NO';
}

function crossingPrice(
  side: Side,
  bestBid: PriceCents | null,
  bestAsk: PriceCents | null,
  rng: () => number,
): PriceCents | null {
  if (side === 'YES') {
    if (bestAsk === null) return null;
    return clampPrice(bestAsk + jitter(rng));
  }

  if (bestBid === null) return null;
  return clampPrice(100 - bestBid + jitter(rng));
}

function passesFairGate(
  side: Side,
  price: PriceCents,
  fair: PriceCents,
  msRemaining: number,
): boolean {
  const maxAdverse = msRemaining < NEAR_EXPIRY_MS
    ? NEAR_EXPIRY_MAX_ADVERSE_CENTS
    : DEFAULT_MAX_ADVERSE_CENTS;
  const sideFair = side === 'YES' ? fair : 100 - fair;
  return price <= sideFair + maxAdverse;
}

function jitter(rng: () => number): number {
  return rng() < 0.5 ? 0 : 1;
}

function clampPrice(raw: number): PriceCents {
  return oddsPriceCents(Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, Math.round(raw))));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
