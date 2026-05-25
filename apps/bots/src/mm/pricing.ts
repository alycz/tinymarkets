import { oddsPriceCents, MIN_PRICE_CENTS, MAX_PRICE_CENTS } from '@jet/shared';
import type { PriceCents, UsdCents } from '@jet/shared';

// Prevents sigma from collapsing to exactly zero at the final millisecond.
const SIGMA_FLOOR_MS = 250;

/**
 * Maps BTC indicative price and time-remaining to a YES fair-value in 1..99c.
 *
 * Uses a logistic CDF on relative distance from strike, with volatility
 * shrinking as expiry approaches (time-scaled sigma). Near expiry with BTC
 * clearly off-strike, the curve collapses to a near step-function (~1c / 99c).
 */
export function fairYesProbCents(
  btcCents: UsdCents,
  strikeCents: UsdCents,
  msRemaining: number,
  msTotal: number,
  baseSigma: number,
): PriceCents {
  const rel = (btcCents - strikeCents) / strikeCents;
  const sigma = baseSigma * Math.sqrt(Math.max(msRemaining, SIGMA_FLOOR_MS) / msTotal);
  const p = 1 / (1 + Math.exp(-rel / sigma));
  const yes = Math.round(100 * p);
  const clamped = Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, yes));
  return oddsPriceCents(clamped);
}

export interface QuoteLevel {
  side: 'BID' | 'ASK';
  oddsPriceCents: PriceCents;
  size: number;
}

/**
 * Builds a symmetric quote ladder around `fair`.
 *
 * Bid(k) = clamp(1, 99, fair - halfSpread - k * levelStep)
 * Ask(k) = clamp(1, 99, fair + halfSpread + k * levelStep)
 *
 * Duplicates from clamping at the 1/99 walls are collapsed so we never
 * over-quote at a single price level. Levels that would cross the other side
 * are dropped.
 *
 * Exposure cap (5 levels × 20 shares × 99c = $99 per side) fits well within
 * the $1,000 starting balance — no server-side top-up needed.
 */
export function buildQuoteLadder(
  fair: PriceCents,
  halfSpread: number,
  levels: number,
  levelStep: number,
  sizePerLevel: number,
): QuoteLevel[] {
  const result: QuoteLevel[] = [];
  const bidsSeen = new Set<number>();
  const asksSeen = new Set<number>();

  // Raw boundaries: bids must stay below the first ask, asks above the first bid.
  const rawMinAsk = fair + halfSpread;
  const rawMaxBid = fair - halfSpread;

  for (let k = 0; k < levels; k++) {
    const bidRaw = fair - halfSpread - k * levelStep;
    const askRaw = fair + halfSpread + k * levelStep;

    const bidClamped = Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, Math.round(bidRaw)));
    const askClamped = Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, Math.round(askRaw)));

    // Drop if this bid crossed into ask territory or is a duplicate
    if (bidClamped < rawMinAsk && !bidsSeen.has(bidClamped)) {
      bidsSeen.add(bidClamped);
      result.push({ side: 'BID', oddsPriceCents: oddsPriceCents(bidClamped), size: sizePerLevel });
    }

    // Drop if this ask crossed into bid territory or is a duplicate
    if (askClamped > rawMaxBid && !asksSeen.has(askClamped)) {
      asksSeen.add(askClamped);
      result.push({ side: 'ASK', oddsPriceCents: oddsPriceCents(askClamped), size: sizePerLevel });
    }
  }

  return result;
}
