/**
 * Numeric primitives + identifiers for the exchange.
 *
 * LOCKED DECISION: money and sizes are ALWAYS integers, never floats.
 * Float drift on balances is exactly the class of bug that silently breaks
 * an exchange. We *brand* the scalar types so the compiler refuses to let us
 * mix, e.g., a 1..99 market price with a USD-cents balance — they are both
 * "numbers" but live on completely different scales.
 *
 * Validate once at the trust boundary (the constructors below), then trust
 * the branded type internally.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ---- money / size scalars -------------------------------------------------

/** Whole US-dollar cents. $100,123.42 -> 10_012_342. Balances, BTC/oracle price, notional. */
export type UsdCents = Brand<number, 'UsdCents'>;

/** A YES market price in integer cents, 1..99. NO price = 100 - YES price. */
export type PriceCents = Brand<number, 'PriceCents'>;

/** A non-negative whole number of contracts/shares (a magnitude). */
export type Shares = Brand<number, 'Shares'>;

/** A SIGNED position in YES contracts. +N long YES, -N short YES (= long N NO), 0 flat. */
export type SignedShares = Brand<number, 'SignedShares'>;

/** Basis points. 1 bp = 0.01%. Spreads, dispersion, deviations. */
export type Bps = Brand<number, 'Bps'>;

/** Unix epoch milliseconds. The SERVER clock is the single source of truth. */
export type TimestampMs = Brand<number, 'TimestampMs'>;

// ---- identifiers (kept here so type files don't form import cycles) -------

export type MarketId = string;
export type UserId = string;
export type OrderId = string;
export type TradeId = string;

// ---- constants ------------------------------------------------------------

export const MIN_PRICE_CENTS = 1 as PriceCents;
export const MAX_PRICE_CENTS = 99 as PriceCents;
/** Winning side pays $1.00 per share at resolution. */
export const PAYOUT_CENTS = 100 as UsdCents;

// ---- constructors / guards (validate at the boundary) ---------------------

export function usdCents(n: number): UsdCents {
  if (!Number.isInteger(n)) throw new RangeError(`usdCents must be an integer, got ${n}`);
  return n as UsdCents;
}

export function priceCents(n: number): PriceCents {
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new RangeError(`priceCents must be an integer 1..99, got ${n}`);
  }
  return n as PriceCents;
}

export function shares(n: number): Shares {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`shares must be a non-negative integer, got ${n}`);
  return n as Shares;
}

export function signedShares(n: number): SignedShares {
  if (!Number.isInteger(n)) throw new RangeError(`signedShares must be an integer, got ${n}`);
  return n as SignedShares;
}

export function bps(n: number): Bps {
  return n as Bps;
}

export function timestampMs(n: number): TimestampMs {
  return n as TimestampMs;
}

/** NO price is the complement of the YES price: NO = 100 - YES. */
export function noPriceCents(yes: PriceCents): PriceCents {
  return (100 - yes) as PriceCents;
}

export function isValidPriceCents(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 99;
}
