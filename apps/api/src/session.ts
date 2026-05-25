import { MARKET } from '@jet/config';
import {
  type CanonicalOrder,
  type Balance,
  type DemoScenarioResponse,
  type DemoSpikeResponse,
  type DemoMode,
  type Fill,
  type IndicativeSnapshot,
  type MarketConfig,
  type MarketId,
  type MarketState,
  type OrderBookSnapshot,
  type OrderId,
  type PlaceOrderRequest,
  type Position,
  type PriceCents,
  type SharePriceMetrics,
  type SharePricePoint,
  type SignedShares,
  type Trade,
  type UserId,
  type UserResolutionEvent,
  type VenueWeightedTwapResolution,
  type UserSnapshot,
  noPriceCents,
  oddsPriceCents,
  shares,
  signedShares,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { ApiError } from '@jet/shared';
import { Clob } from '@jet/clob';
import { MarketCore } from '@jet/market-core';
import { VenueWeightedTwapOracle } from '@jet/oracle';
import type { ScenarioName } from '@jet/oracle';
import type { OracleDemoScenario } from '@jet/shared';
import type { Broadcaster } from './broadcasts.js';

type OkResult<T> = { ok: true } & T;
type ErrResult = { ok: false; error: ApiError };
type Result<T> = OkResult<T> | ErrResult;
type OrderReserve = { userId: UserId; centsPerShare: number; remainingCents: number };

function err(code: ApiError['code'], message: string): ErrResult {
  return { ok: false, error: { code, message } };
}

export class MarketSession {
  private clob: Clob | null = null;
  private marketCore: MarketCore | null = null;
  private oracle: VenueWeightedTwapOracle;
  private status: MarketState['status'] | null = null;
  private expiryMs: number | null = null;
  private openedAtMs: number | null = null;
  private config: MarketConfig | null = null;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private resolveTimeout: ReturnType<typeof setTimeout> | null = null;

  private tradeRing: Trade[] = [];
  private readonly tradeRingCap = 100;
  private oracleSeries: IndicativeSnapshot[] = [];
  private readonly oracleSeriesCap = 600;
  private sharePriceSeries: SharePricePoint[] = [];
  private readonly sharePriceSeriesCap = 600;
  private orderReserves = new Map<OrderId, OrderReserve>();

  private knownUsers = new Set<UserId>();
  private lastResolution: VenueWeightedTwapResolution | null = null;
  private lastUserResolutions = new Map<UserId, UserResolutionEvent>();
  private broadcaster: Broadcaster | null = null;

  constructor(opts?: { oracleScenario?: ScenarioName; seed?: number; demoMode?: DemoMode }) {
    this.oracle = new VenueWeightedTwapOracle({
      scenario: opts?.oracleScenario ?? 'HONEST',
      seed: opts?.seed ?? 12345,
      demoMode: opts?.demoMode ?? 'simulated',
    });

    this.oracle.onSnapshot((snap) => {
      this.pushOracleSnapshot(snap);
      this.broadcaster?.oraclePrice(snap);
    });
  }

  setBroadcaster(b: Broadcaster): void {
    this.broadcaster = b;
  }

  startDemo(): MarketState {
    this.destroy();

    const now = Date.now();
    const marketId: MarketId = `btc-2m-${now}`;
    const expiry = now + MARKET.durationMs;

    this.config = {
      marketId,
      question: 'Will BTC be above $100,000 in 2 minutes?',
      thresholdCents: usdCents(10_000_000),
      durationMs: MARKET.durationMs,
    };

    this.clob = new Clob(marketId);
    this.marketCore = new MarketCore(this.config);
    this.status = 'open';
    this.expiryMs = expiry;
    this.openedAtMs = now;
    this.tradeRing = [];
    this.oracleSeries = [];
    this.sharePriceSeries = [];
    this.orderReserves = new Map();
    this.knownUsers = new Set();
    this.lastResolution = null;
    this.lastUserResolutions = new Map();

    this.oracle.start(marketId, this.config, timestampMs(expiry));
    this.recordAndBroadcastSharePrice(this.buildMarkSharePricePoint(timestampMs(now)));
    this.tickInterval = setInterval(() => this.tick(), 1000);

    const state = this.buildMarketState();
    this.broadcaster?.marketSnapshot(state, this.buildMarketSnapshotParts());
    return state;
  }

  destroy(): void {
    this.clearTimers();
    this.oracle.stop();
    this.clob = null;
    this.marketCore = null;
    this.status = null;
    this.expiryMs = null;
    this.openedAtMs = null;
    this.config = null;
    this.orderReserves = new Map();
    this.lastUserResolutions = new Map();
  }

  getMarketId(): MarketId | null {
    return this.config?.marketId ?? null;
  }

  getMarketState(): MarketState | null {
    if (!this.config || this.status === null || this.expiryMs === null || this.openedAtMs === null) {
      return null;
    }
    return this.buildMarketState();
  }

  getOracleSnapshot(): IndicativeSnapshot | null {
    return this.oracle.getLatestSnapshot();
  }

  getOrderBookSnapshot(): OrderBookSnapshot | null {
    return this.clob?.snapshot() ?? null;
  }

  getRecentTrades(limit = 100): Trade[] {
    const ring = this.tradeRing;
    return limit >= ring.length ? [...ring] : ring.slice(-limit);
  }

  getSharePriceSeries(limit = 600): SharePricePoint[] {
    const ring = this.sharePriceSeries;
    return limit >= ring.length ? [...ring] : ring.slice(-limit);
  }

  getLatestSharePrice(): SharePricePoint | null {
    return this.sharePriceSeries.at(-1) ?? null;
  }

  getOracleSeries(limit = 600): IndicativeSnapshot[] {
    const ring = this.oracleSeries;
    return limit >= ring.length ? [...ring] : ring.slice(-limit);
  }

  getUserSnapshot(userId: UserId): UserSnapshot | null {
    if (!this.marketCore || !this.clob || !this.config) return null;
    return {
      userId,
      balance: this.marketCore.getBalance(userId),
      positions: [this.marketCore.getPosition(userId)],
      openOrders: this.clob.openOrdersFor(userId),
    };
  }

  getLastResolution(): VenueWeightedTwapResolution | null {
    return this.lastResolution;
  }

  getLastUserResolution(userId: UserId): UserResolutionEvent | null {
    return this.lastUserResolutions.get(userId) ?? null;
  }

  resolveActiveMarket(): Result<{ resolution: VenueWeightedTwapResolution; market: MarketState }> {
    if (!this.config || !this.marketCore) {
      return err('UNKNOWN_MARKET', 'No active market');
    }
    if (this.status === 'resolved' && this.lastResolution) {
      return { ok: true, resolution: this.lastResolution, market: this.buildMarketState() };
    }
    if (this.status === 'open') {
      this.status = 'resolving';
      this.cleanupRestingOrdersForResolution();
      this.broadcaster?.marketStatus(this.buildMarketState());
    }

    this.resolveMarket();
    if (!this.lastResolution) {
      return err('UNKNOWN_MARKET', 'Resolution failed');
    }
    return { ok: true, resolution: this.lastResolution, market: this.buildMarketState() };
  }

  armDemoScenario(marketId: MarketId, scenario: OracleDemoScenario): Result<DemoScenarioResponse> {
    if (!this.config || this.status === null) {
      return err('UNKNOWN_MARKET', 'No active market');
    }
    if (this.config.marketId !== marketId) {
      return err('UNKNOWN_MARKET', 'Market ID does not match active market');
    }
    if (this.status === 'resolved') {
      return err('MARKET_NOT_OPEN', 'Market is already resolved');
    }
    if (!this.oracle.armScenario(scenario)) {
      return err('UNKNOWN_MARKET', 'Oracle is not active for this market');
    }
    return { ok: true, scenario };
  }

  armDemoSpike(marketId: MarketId): Result<DemoSpikeResponse> {
    return this.armDemoScenario(marketId, 'NEAR_EXPIRY_SPIKE') as Result<DemoSpikeResponse>;
  }

  placeOrder(req: PlaceOrderRequest): Result<{
    order: CanonicalOrder;
    fills: Fill[];
    remainingOpenOrder?: CanonicalOrder;
    balance: Balance;
    position: Position;
  }> {
    if (!this.clob || !this.marketCore || !this.config) {
      return err('UNKNOWN_MARKET', 'No active market');
    }
    if (req.marketId !== this.config.marketId) {
      return err('UNKNOWN_MARKET', 'Market ID does not match active market');
    }
    if (this.status !== 'open') {
      return err('MARKET_NOT_OPEN', `Market is ${this.status ?? 'not started'}`);
    }

    const centsPerShare = orderReserveCentsPerShare(req);
    const totalReserveCents = centsPerShare * (req.size as number);
    if (!this.marketCore.reserveForOrder(req.userId, usdCents(totalReserveCents))) {
      return err('INSUFFICIENT_BALANCE', 'Insufficient available balance for order reserve');
    }

    let placed: ReturnType<Clob['placeOrder']>;
    try {
      placed = this.clob.placeOrder(req);
    } catch (error) {
      this.marketCore.releaseOrderReserve(req.userId, usdCents(totalReserveCents));
      throw error;
    }

    const { order, matches, delta } = placed;
    const remainingReserveCents =
      order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED'
        ? centsPerShare * (order.remaining as number)
        : 0;
    const releasedReserveCents = totalReserveCents - remainingReserveCents;
    if (releasedReserveCents > 0) {
      this.marketCore.releaseOrderReserve(req.userId, usdCents(releasedReserveCents));
    }
    if (remainingReserveCents > 0) {
      this.orderReserves.set(order.orderId, {
        userId: req.userId,
        centsPerShare,
        remainingCents: remainingReserveCents,
      });
    }

    this.broadcaster?.bookDelta(delta);

    const now = timestampMs(Date.now());
    const allFills: Fill[] = [];
    const affectedUsers = new Set<UserId>();

    for (const match of matches) {
      this.releaseMakerReserveForMatch(match.makerOrderId, match.size as number);
      const { trade, fills } = this.marketCore.applyMatch(match, now);
      this.pushTrade(trade);
      this.broadcaster?.trade(trade);
      this.recordAndBroadcastSharePrice({
        marketId: this.config.marketId,
        ts: now,
        yesPriceCents: trade.yesPriceCents,
        noPriceCents: noPriceCents(trade.yesPriceCents),
        source: 'trade',
        tradeId: trade.tradeId,
        volume: trade.size,
        ...this.currentBestPrices(),
      }, { force: true });

      for (const fill of fills) {
        this.broadcaster?.userFill(fill.userId, fill);
        affectedUsers.add(fill.userId);
        this.knownUsers.add(fill.userId);
        allFills.push(fill);
      }
    }

    for (const userId of affectedUsers) {
      const bal = this.marketCore.getBalance(userId);
      const pos = this.marketCore.getPosition(userId);
      this.broadcaster?.userBalance(userId, bal);
      this.broadcaster?.userPosition(userId, pos);
      this.broadcaster?.userOpenOrders(userId, this.clob.openOrdersFor(userId));
    }

    this.recordAndBroadcastSharePrice(this.buildMarkSharePricePoint(now));
    this.broadcaster?.userOpenOrders(req.userId, this.clob.openOrdersFor(req.userId));

    return {
      ok: true,
      order,
      fills: allFills.filter((f) => f.userId === req.userId),
      ...(
        order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED'
          ? { remainingOpenOrder: order }
          : {}
      ),
      balance: this.marketCore.getBalance(req.userId),
      position: this.marketCore.getPosition(req.userId),
    };
  }

  cancelOrder(orderId: OrderId, userId: UserId): Result<{ orderId: OrderId }> {
    if (!this.clob || !this.config || !this.marketCore) {
      return err('UNKNOWN_MARKET', 'No active market');
    }

    const existing = this.clob.getOrder(orderId);
    if (!existing) {
      return err('UNKNOWN_ORDER', 'Order not found');
    }
    if (existing.userId !== userId) {
      return err('NOT_ORDER_OWNER', 'Order belongs to a different user');
    }

    const { ok, delta } = this.clob.cancel(orderId);
    if (!ok) {
      return err('UNKNOWN_ORDER', 'Order not found');
    }

    this.releaseOrderReserve(orderId);
    this.broadcaster?.bookDelta(delta);
    this.recordAndBroadcastSharePrice(this.buildMarkSharePricePoint(timestampMs(Date.now())));
    this.broadcaster?.userOrderCancelled(userId, orderId, this.clob.openOrdersFor(userId));
    this.broadcaster?.userBalance(userId, this.marketCore.getBalance(userId));
    return { ok: true, orderId };
  }

  // ── private ──────────────────────────────────────────────────────────────

  private buildMarketState(): MarketState {
    const now = Date.now();
    const msRemaining = Math.max(0, this.expiryMs! - now);
    const oi = this.marketCore?.getOpenInterest() ?? shares(0);
    return {
      config: this.config!,
      status: this.status!,
      openedAtMs: timestampMs(this.openedAtMs!),
      expiryMs: timestampMs(this.expiryMs!),
      msRemaining,
      openInterest: oi,
      ...(this.lastResolution ? { resolution: this.lastResolution } : {}),
    };
  }

  private buildMarketSnapshotParts(): {
    orderbook: OrderBookSnapshot | null;
    recentTrades: Trade[];
    oracle: IndicativeSnapshot | null;
    sharePrice: SharePricePoint | null;
  } {
    return {
      orderbook: this.getOrderBookSnapshot(),
      recentTrades: this.getRecentTrades(),
      oracle: this.getOracleSnapshot(),
      sharePrice: this.getLatestSharePrice(),
    };
  }

  private pushTrade(trade: Trade): void {
    this.tradeRing.push(trade);
    if (this.tradeRing.length > this.tradeRingCap) {
      this.tradeRing.shift();
    }
  }

  private pushOracleSnapshot(snapshot: IndicativeSnapshot): void {
    this.oracleSeries.push(snapshot);
    if (this.oracleSeries.length > this.oracleSeriesCap) {
      this.oracleSeries.shift();
    }
  }

  private pushSharePrice(point: SharePricePoint): void {
    this.sharePriceSeries.push(point);
    if (this.sharePriceSeries.length > this.sharePriceSeriesCap) {
      this.sharePriceSeries.shift();
    }
  }

  private recordAndBroadcastSharePrice(point: SharePricePoint, opts?: { force?: boolean }): void {
    if (!this.validateSharePricePoint(point)) return;
    if (!opts?.force && !this.shouldAppendSharePricePoint(point)) return;
    this.pushSharePrice(point);
    this.broadcaster?.sharePrice(point);
  }

  private validateSharePricePoint(point: SharePricePoint): boolean {
    const validSource = point.source === 'trade' || point.source === 'mid' || point.source === 'mark';
    const yes = point.yesPriceCents as number;
    const no = point.noPriceCents as number;
    const bestBid = point.bestBid as number | undefined;
    const bestAsk = point.bestAsk as number | undefined;
    const validPrice = (value: number | undefined) =>
      value === undefined || (Number.isInteger(value) && value >= 1 && value <= 99);

    if (
      !validSource ||
      !Number.isInteger(yes) ||
      yes < 1 ||
      yes > 99 ||
      !Number.isInteger(no) ||
      no !== 100 - yes ||
      !validPrice(bestBid) ||
      !validPrice(bestAsk)
    ) {
      console.warn('Rejected invalid YES share price point; possible BTC/oracle leak', point);
      return false;
    }

    return true;
  }

  private shouldAppendSharePricePoint(point: SharePricePoint): boolean {
    const prev = this.sharePriceSeries.at(-1);
    if (!prev) return true;
    if (point.source === 'trade') return true;

    const changed =
      prev.source !== point.source ||
      prev.yesPriceCents !== point.yesPriceCents ||
      prev.noPriceCents !== point.noPriceCents ||
      prev.bestBid !== point.bestBid ||
      prev.bestAsk !== point.bestAsk;

    if (changed) return true;
    return (point.ts as number) - (prev.ts as number) >= 1000;
  }

  private currentBestPrices(): { bestBid?: PriceCents; bestAsk?: PriceCents } {
    const snap = this.clob?.snapshot();
    const bestBid = snap?.bids[0]?.yesPriceCents;
    const bestAsk = snap?.asks[0]?.yesPriceCents;
    return {
      ...(bestBid !== undefined ? { bestBid } : {}),
      ...(bestAsk !== undefined ? { bestAsk } : {}),
    };
  }

  private buildMarkSharePricePoint(ts: ReturnType<typeof timestampMs>): SharePricePoint {
    const best = this.currentBestPrices();
    const lastTrade = this.tradeRing.at(-1)?.yesPriceCents;
    const source = best.bestBid !== undefined && best.bestAsk !== undefined ? 'mid' : 'mark';
    const rawPrice =
      best.bestBid !== undefined && best.bestAsk !== undefined
        ? Math.round(((best.bestBid as number) + (best.bestAsk as number)) / 2)
        : lastTrade !== undefined
        ? (lastTrade as number)
        : best.bestBid !== undefined
        ? (best.bestBid as number)
        : best.bestAsk !== undefined
        ? (best.bestAsk as number)
        : this.oracleFairMarkPrice();
    const yesPriceCents = oddsPriceCents(Math.min(99, Math.max(1, rawPrice)));
    return {
      marketId: this.config!.marketId,
      ts,
      yesPriceCents,
      noPriceCents: noPriceCents(yesPriceCents),
      source,
      ...best,
    };
  }

  private oracleFairMarkPrice(): number {
    const snap = this.oracle.getLatestSnapshot();
    if (!snap || !this.config || !this.expiryMs) return 50;

    const msRemaining = Math.max(250, this.expiryMs - Date.now());
    const relDistance =
      ((snap.btcPriceCents as number) - (this.config.thresholdCents as number)) /
      (this.config.thresholdCents as number);
    const sigma = 0.0015 * Math.sqrt(msRemaining / this.config.durationMs);
    const probability = 1 / (1 + Math.exp(-relDistance / Math.max(0.0001, sigma)));
    return Math.round(100 * probability);
  }

  private tick(): void {
    if (!this.config || !this.expiryMs || this.status === 'resolved') return;

    const msRemaining = Math.max(0, this.expiryMs - Date.now());

    if (msRemaining <= 0 && this.status === 'open') {
      this.status = 'resolving';
      this.cleanupRestingOrdersForResolution();
      const state = this.buildMarketState();
      this.broadcaster?.marketStatus(state);
      this.resolveTimeout = setTimeout(() => this.resolveMarket(), 2000);
      return;
    }

    if (this.status === 'open') {
      this.recordAndBroadcastSharePrice(this.buildMarkSharePricePoint(timestampMs(Date.now())));
    }

    const state = this.buildMarketState();
    this.broadcaster?.marketStatus(state);
  }

  private resolveMarket(): void {
    if (!this.config || !this.marketCore) return;

    const resolution = this.oracle.buildResolution(this.config, timestampMs(this.expiryMs ?? Date.now()));
    const now = timestampMs(Date.now());

    // Snapshot net positions BEFORE resolve() zeros them
    const preResolveNets = new Map<UserId, SignedShares>();
    for (const uid of this.marketCore.knownUserIds()) {
      preResolveNets.set(uid, this.marketCore.getPosition(uid).net);
    }

    const { payouts, realizedPnlCents } = this.marketCore.resolve(resolution.outcome, now);

    this.status = 'resolved';
    this.lastResolution = resolution;

    const state = this.buildMarketState();
    this.broadcaster?.marketStatus(state);
    this.broadcaster?.marketResolved(state, resolution);

    for (const [userId, pnlCents] of realizedPnlCents) {
      const bal = this.marketCore.getBalance(userId);
      const pos = this.marketCore.getPosition(userId);
      const netAtResolution = preResolveNets.get(userId) ?? signedShares(0);
      const userResolution: UserResolutionEvent = {
        type: 'pnl_update',
        marketId: this.config.marketId,
        userId,
        outcome: resolution.outcome,
        netAtResolution,
        payoutCents: payouts.get(userId) ?? usdCents(0),
        pnlCents,
      };

      this.lastUserResolutions.set(userId, userResolution);
      this.broadcaster?.userResolution(userId, userResolution);
      this.broadcaster?.userBalance(userId, bal);
      this.broadcaster?.userPosition(userId, pos);
      this.broadcaster?.userOpenOrders(userId, this.clob?.openOrdersFor(userId) ?? []);
    }

    this.clearTimers();
    this.oracle.stop();
  }

  private clearTimers(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.resolveTimeout) {
      clearTimeout(this.resolveTimeout);
      this.resolveTimeout = null;
    }
  }

  private cleanupRestingOrdersForResolution(): void {
    if (!this.marketCore || !this.clob) return;

    const affectedUsers = new Set<UserId>();
    for (const reserve of this.orderReserves.values()) {
      this.marketCore.releaseOrderReserve(reserve.userId, usdCents(reserve.remainingCents));
      affectedUsers.add(reserve.userId);
    }
    this.orderReserves.clear();

    const { delta } = this.clob.clearOpenOrders();
    if (delta) {
      this.broadcaster?.bookDelta(delta);
    }

    const snapshot = this.clob.snapshot();
    this.broadcaster?.bookSnapshot(snapshot);
    this.recordAndBroadcastSharePrice(this.buildMarkSharePricePoint(timestampMs(Date.now())));

    for (const userId of affectedUsers) {
      this.broadcaster?.userBalance(userId, this.marketCore.getBalance(userId));
      this.broadcaster?.userOpenOrders(userId, this.clob.openOrdersFor(userId));
    }
  }

  private releaseMakerReserveForMatch(orderId: OrderId, size: number): void {
    const reserve = this.orderReserves.get(orderId);
    if (!reserve || !this.marketCore) return;
    const releaseCents = Math.min(reserve.remainingCents, reserve.centsPerShare * size);
    if (releaseCents <= 0) return;
    this.marketCore.releaseOrderReserve(reserve.userId, usdCents(releaseCents));
    reserve.remainingCents -= releaseCents;
    if (reserve.remainingCents <= 0) {
      this.orderReserves.delete(orderId);
    }
  }

  private releaseOrderReserve(orderId: OrderId): void {
    const reserve = this.orderReserves.get(orderId);
    if (!reserve || !this.marketCore) return;
    this.marketCore.releaseOrderReserve(reserve.userId, usdCents(reserve.remainingCents));
    this.orderReserves.delete(orderId);
  }
}

function orderReserveCentsPerShare(req: PlaceOrderRequest): number {
  const { action, price } = orderDisplay(req);
  const odds = price as number;
  return action === 'BUY' ? odds : 100 - odds;
}

function orderDisplay(req: PlaceOrderRequest): { action: 'BUY' | 'SELL'; price: PriceCents } {
  if (req.intent && req.price !== undefined) {
    return {
      action: req.intent === 'BUY_YES' || req.intent === 'BUY_NO' ? 'BUY' : 'SELL',
      price: req.price,
    };
  }
  if (req.action && req.oddsPriceCents !== undefined) {
    return { action: req.action, price: req.oddsPriceCents };
  }
  throw new RangeError('Order must include either intent/price or side/action/oddsPriceCents');
}
