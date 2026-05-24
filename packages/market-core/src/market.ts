import type {
  Balance, Fill, MarketConfig, MarketState, MarketStatus,
  Match, Position, Side, Trade,
} from '@jet/shared';
import type { PriceCents, Shares, TimestampMs, UsdCents, UserId } from '@jet/shared';
import { priceCents, shares, signedShares, timestampMs, usdCents } from '@jet/shared';
import { MARKET } from '@jet/config';
import { classifyKind, splitMatch } from './classify';
import { applySegment } from './applyMatch';
import { markToMarket } from './mtm';
import { settle } from './resolve';
import type { ResolveResult } from './resolve';

export class MarketCore {
  private readonly config: MarketConfig;
  private status: MarketStatus = 'open';
  private readonly openedAtMs: TimestampMs;
  private readonly expiryMs: TimestampMs;
  private readonly startingBalanceCents: UsdCents;

  private oi = 0; // open interest in whole shares
  private lastPrice: PriceCents | undefined;

  private readonly balances = new Map<UserId, Balance>();
  private readonly positions = new Map<UserId, Position>();
  private resolvedResult: ResolveResult | undefined;

  constructor(config: MarketConfig, opts?: { startingBalanceCents?: UsdCents }) {
    this.config = config;
    this.startingBalanceCents = opts?.startingBalanceCents ?? usdCents(MARKET.startingBalanceCents);
    this.openedAtMs = timestampMs(Date.now());
    this.expiryMs = timestampMs((this.openedAtMs as number) + config.durationMs);
  }

  getBalance(userId: UserId): Balance {
    let bal = this.balances.get(userId);
    if (!bal) {
      bal = { userId, availableCents: this.startingBalanceCents, lockedCents: usdCents(0) };
      this.balances.set(userId, bal);
    }
    return bal;
  }

  getPosition(userId: UserId): Position {
    let pos = this.positions.get(userId);
    if (!pos) {
      pos = {
        userId,
        marketId: this.config.marketId,
        net: signedShares(0),
        avgEntryPriceCents: priceCents(50),
      };
      this.positions.set(userId, pos);
    }
    return pos;
  }

  getOpenInterest(): Shares {
    return shares(this.oi);
  }

  getLastTradePriceCents(): PriceCents | undefined {
    return this.lastPrice;
  }

  getMarketState(): MarketState {
    const now = Date.now();
    return {
      config: this.config,
      status: this.status,
      openedAtMs: this.openedAtMs,
      expiryMs: this.expiryMs,
      msRemaining: Math.max(0, (this.expiryMs as number) - now),
      openInterest: shares(this.oi),
    };
  }

  applyMatch(match: Match, now: TimestampMs): { trade: Trade; fills: Fill[] } {
    if (this.status !== 'open') {
      throw new Error(`Cannot apply match: market status is ${this.status}`);
    }

    const isTakerBuyer = match.takerYesAction === 'BUY';
    const buyerUserId: UserId = isTakerBuyer ? match.takerUserId : match.makerUserId;
    const sellerUserId: UserId = isTakerBuyer ? match.makerUserId : match.takerUserId;
    const buyerOrderId = isTakerBuyer ? match.takerOrderId : match.makerOrderId;
    const sellerOrderId = isTakerBuyer ? match.makerOrderId : match.takerOrderId;

    const buyerBal = this.getBalance(buyerUserId);
    const sellerBal = this.getBalance(sellerUserId);
    const buyerPos = this.getPosition(buyerUserId);
    const sellerPos = this.getPosition(sellerUserId);

    const segments = splitMatch(buyerPos.net, sellerPos.net, match.size);
    const fills: Fill[] = [];
    let oiDelta = 0;

    for (const segment of segments) {
      const result = applySegment({
        segment,
        tradeId: match.tradeId,
        buyerOrderId,
        sellerOrderId,
        buyerUserId,
        sellerUserId,
        yesPriceCents: match.yesPriceCents,
        ts: now,
        buyerBalance: buyerBal,
        sellerBalance: sellerBal,
        buyerPosition: buyerPos,
        sellerPosition: sellerPos,
      });
      fills.push(result.buyerFill, result.sellerFill);
      oiDelta += result.openInterestDelta;
    }

    this.oi += oiDelta;
    this.lastPrice = match.yesPriceCents;

    // MTM: recompute lockedCents for all holders at the new price
    markToMarket(this.positions, this.balances, match.yesPriceCents);

    const firstKind = segments[0]!.kind;
    const trade: Trade = {
      tradeId: match.tradeId,
      marketId: match.marketId,
      yesPriceCents: match.yesPriceCents,
      size: match.size,
      kind: firstKind,
      takerSide: isTakerBuyer ? 'YES' : 'NO',
      ts: now,
    };

    return { trade, fills };
  }

  resolve(outcome: Side, _now: TimestampMs): ResolveResult {
    if (this.resolvedResult) return this.resolvedResult;

    this.status = 'resolved';
    this.resolvedResult = settle(outcome, this.positions, this.balances, this.startingBalanceCents);
    this.oi = 0;
    this.lastPrice = priceCents(outcome === 'YES' ? 99 : 1);
    return this.resolvedResult;
  }
}
