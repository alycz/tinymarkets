import type {
  Balance, Fill, MarketConfig, MarketState, MarketStatus,
  Match, Position, Side, Trade,
} from '@jet/shared';
import type { PriceCents, Shares, TimestampMs, UsdCents, UserId } from '@jet/shared';
import { oddsPriceCents, shares, signedShares, timestampMs, usdCents } from '@jet/shared';
import { MARKET } from '@jet/config';
import { splitMatch } from './classify';
import { applySegment } from './applyMatch';
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
      bal = {
        userId,
        availableBalanceCents: this.startingBalanceCents,
        reservedForOrdersCents: usdCents(0),
        lockedSettlementCollateralCents: usdCents(0),
        realizedPnlCents: 0,
      };
      this.balances.set(userId, bal);
    }
    return bal;
  }

  reserveForOrder(userId: UserId, amount: UsdCents): boolean {
    const bal = this.getBalance(userId);
    const cents = amount as number;
    if ((bal.availableBalanceCents as number) < cents) return false;
    bal.availableBalanceCents = usdCents((bal.availableBalanceCents as number) - cents);
    bal.reservedForOrdersCents = usdCents((bal.reservedForOrdersCents as number) + cents);
    return true;
  }

  releaseOrderReserve(userId: UserId, amount: UsdCents): void {
    const bal = this.getBalance(userId);
    const cents = amount as number;
    if (cents <= 0) return;
    if ((bal.reservedForOrdersCents as number) < cents) {
      throw new Error(`Cannot release ${cents}c reserve for ${userId}: only ${bal.reservedForOrdersCents}c reserved`);
    }
    bal.reservedForOrdersCents = usdCents((bal.reservedForOrdersCents as number) - cents);
    bal.availableBalanceCents = usdCents((bal.availableBalanceCents as number) + cents);
  }

  getPosition(userId: UserId): Position {
    let pos = this.positions.get(userId);
    if (!pos) {
      pos = {
        userId,
        marketId: this.config.marketId,
        net: signedShares(0),
        avgEntryPriceCents: oddsPriceCents(50),
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
    this.recomputeSettlementCollateral();

    const firstKind = segments[0]!.kind;
    const trade: Trade = {
      tradeId: match.tradeId,
      marketId: match.marketId,
      yesPriceCents: match.yesPriceCents,
      size: match.size,
      kind: firstKind,
      takerSide: match.takerSide,
      ts: now,
    };

    return { trade, fills };
  }

  knownUserIds(): UserId[] {
    return Array.from(this.positions.keys());
  }

  resolve(outcome: Side, _now: TimestampMs): ResolveResult {
    if (this.resolvedResult) return this.resolvedResult;

    this.status = 'resolved';
    this.resolvedResult = settle(outcome, this.positions, this.balances, this.startingBalanceCents);
    this.oi = 0;
    this.lastPrice = oddsPriceCents(outcome === 'YES' ? 99 : 1);
    return this.resolvedResult;
  }

  private recomputeSettlementCollateral(): void {
    for (const [userId, pos] of this.positions) {
      const bal = this.getBalance(userId);
      bal.lockedSettlementCollateralCents = usdCents(Math.abs(pos.net as number) * 50);
    }
  }
}
