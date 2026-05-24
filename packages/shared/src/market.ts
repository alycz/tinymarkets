import type { RampResolution } from './oracle';
import type { MarketId, Shares, TimestampMs, UsdCents } from './units';

export type MarketStatus =
  | 'open'       // accepting orders
  | 'resolving'  // expired; orders disabled; oracle computing the final window
  | 'resolved';  // settled; outcome + PnL final

export interface MarketConfig {
  marketId: MarketId;
  /** e.g. "Will BTC be above $100,000 in 2 minutes?" */
  question: string;
  /** strike / threshold in USD cents, e.g. $100,000 -> 10_000_000 */
  thresholdCents: UsdCents;
  /** market duration; locked at 2 minutes */
  durationMs: number;
}

export interface MarketState {
  config: MarketConfig;
  status: MarketStatus;
  openedAtMs: TimestampMs;
  expiryMs: TimestampMs;
  /** server-authoritative ms remaining; clients RENDER this, never run their own clock */
  msRemaining: number;
  /** total YES contracts outstanding */
  openInterest: Shares;
  /** present once status === 'resolved' */
  resolution?: RampResolution;
}
