import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, oddsPriceCents } from '@jet/shared';
import type { PriceCents, UsdCents } from '@jet/shared';

const MIN_FAIR_CENTS = 2;
const MAX_FAIR_CENTS = 98;

export interface FairValueInput {
  btcCents: UsdCents;
  strikeCents: UsdCents;
  msRemaining: number;
  msTotal: number;
  volatilityScaleCents: number;
}

/**
 * Maps BTC oracle context into a YES probability price.
 *
 * The model follows the product spec: distance from strike is divided by a
 * configurable volatility scale, then amplified as expiry approaches.
 */
export function fairYesProbCents(input: FairValueInput): PriceCents {
  const distance = (input.btcCents as number) - (input.strikeCents as number);
  const timeRemainingSec = Math.max(input.msRemaining / 1_000, 1);
  const totalSec = Math.max(input.msTotal / 1_000, 1);
  const timeFactor = Math.sqrt(totalSec / timeRemainingSec);
  const scale = Math.max(1, input.volatilityScaleCents);
  const z = (distance / scale) * timeFactor;
  const probability = 1 / (1 + Math.exp(-z));
  return oddsPriceCents(clampInt(Math.round(100 * probability), MIN_FAIR_CENTS, MAX_FAIR_CENTS));
}

export interface QuoteLevel {
  side: 'BID' | 'ASK';
  oddsPriceCents: PriceCents;
  size: number;
}

export interface QuoteLevelSpec {
  offsetCents: number;
  size: number;
}

export interface SpreadInput {
  baseSpreadCents: number;
  recentVolatilityCents: number;
  msRemaining: number;
  msTotal: number;
}

export function dynamicSpreadCents(input: SpreadInput): number {
  const base = Math.max(3, input.baseSpreadCents);
  const progress = 1 - clamp(input.msRemaining / Math.max(1, input.msTotal), 0, 1);
  const timeComponent = progress > 0.8 ? 1 : 0;
  const volatilityComponent = Math.min(4, Math.round(input.recentVolatilityCents / 10_000));
  return clampInt(base + timeComponent + volatilityComponent, 3, 12);
}

export function buildLevelSpecs(spreadCents: number, sizes: number[]): QuoteLevelSpec[] {
  const halfSpread = Math.max(2, spreadCents / 2);
  const step = Math.max(2, Math.round(spreadCents / 2));
  return sizes.map((size, index) => ({
    offsetCents: halfSpread + index * step,
    size,
  }));
}

/**
 * Builds a bid/ask ladder around the canonical YES fair value.
 *
 * Duplicate clamped wall levels are collapsed per side, and any level that
 * would cross the opposite side is dropped.
 */
export function buildQuoteLadder(fair: PriceCents, levelSpecs: QuoteLevelSpec[]): QuoteLevel[] {
  const result: QuoteLevel[] = [];
  const bidsSeen = new Set<number>();
  const asksSeen = new Set<number>();

  for (const spec of levelSpecs) {
    const bid = clampInt(Math.round((fair as number) - spec.offsetCents), MIN_PRICE_CENTS, MAX_PRICE_CENTS);
    const ask = clampInt(Math.round((fair as number) + spec.offsetCents), MIN_PRICE_CENTS, MAX_PRICE_CENTS);

    if (bid < ask && !bidsSeen.has(bid)) {
      bidsSeen.add(bid);
      result.push({ side: 'BID', oddsPriceCents: oddsPriceCents(bid), size: spec.size });
    }
    if (ask > bid && !asksSeen.has(ask)) {
      asksSeen.add(ask);
      result.push({ side: 'ASK', oddsPriceCents: oddsPriceCents(ask), size: spec.size });
    }
  }

  return result;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
