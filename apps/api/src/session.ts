import { MARKET } from '@jet/config';
import {
  type CanonicalOrder,
  type DemoSpikeResponse,
  type Fill,
  type IndicativeSnapshot,
  type MarketConfig,
  type MarketId,
  type MarketState,
  type OrderBookSnapshot,
  type OrderId,
  type PlaceOrderRequest,
  type RampResolution,
  type SignedShares,
  type Trade,
  type UserId,
  type UserSnapshot,
  shares,
  signedShares,
  timestampMs,
  usdCents,
} from '@jet/shared';
import type { ApiError } from '@jet/shared';
import { Clob } from '@jet/clob';
import { MarketCore } from '@jet/market-core';
import { RampOracle } from '@jet/oracle';
import type { ScenarioName } from '@jet/oracle';
import type { Broadcaster } from './broadcasts.js';

type OkResult<T> = { ok: true } & T;
type ErrResult = { ok: false; error: ApiError };
type Result<T> = OkResult<T> | ErrResult;

function err(code: ApiError['code'], message: string): ErrResult {
  return { ok: false, error: { code, message } };
}

export class MarketSession {
  private clob: Clob | null = null;
  private marketCore: MarketCore | null = null;
  private oracle: RampOracle;
  private status: MarketState['status'] | null = null;
  private expiryMs: number | null = null;
  private openedAtMs: number | null = null;
  private config: MarketConfig | null = null;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private resolveTimeout: ReturnType<typeof setTimeout> | null = null;

  private tradeRing: Trade[] = [];
  private readonly tradeRingCap = 100;

  private knownUsers = new Set<UserId>();
  private lastResolution: RampResolution | null = null;
  private broadcaster: Broadcaster | null = null;

  constructor(opts?: { oracleScenario?: ScenarioName; seed?: number }) {
    this.oracle = new RampOracle({
      scenario: opts?.oracleScenario ?? 'HONEST',
      seed: opts?.seed ?? 12345,
    });

    this.oracle.onSnapshot((snap) => {
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
    this.knownUsers = new Set();
    this.lastResolution = null;

    this.oracle.start(marketId, this.config, timestampMs(expiry));
    this.tickInterval = setInterval(() => this.tick(), 1000);

    return this.buildMarketState();
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

  getUserSnapshot(userId: UserId): UserSnapshot | null {
    if (!this.marketCore || !this.clob || !this.config) return null;
    return {
      userId,
      balance: this.marketCore.getBalance(userId),
      positions: [this.marketCore.getPosition(userId)],
      openOrders: this.clob.openOrdersFor(userId),
    };
  }

  getLastResolution(): RampResolution | null {
    return this.lastResolution;
  }

  armDemoSpike(marketId: MarketId): Result<DemoSpikeResponse> {
    if (!this.config || this.status === null) {
      return err('UNKNOWN_MARKET', 'No active market');
    }
    if (this.config.marketId !== marketId) {
      return err('UNKNOWN_MARKET', 'Market ID does not match active market');
    }
    if (this.status === 'resolved') {
      return err('MARKET_NOT_OPEN', 'Market is already resolved');
    }
    if (!this.oracle.armScenario('NEAR_EXPIRY_SPIKE')) {
      return err('UNKNOWN_MARKET', 'Oracle is not active for this market');
    }
    return { ok: true, scenario: 'NEAR_EXPIRY_SPIKE' };
  }

  placeOrder(req: PlaceOrderRequest): Result<{ order: CanonicalOrder; fills: Fill[] }> {
    if (!this.clob || !this.marketCore || !this.config) {
      return err('UNKNOWN_MARKET', 'No active market');
    }
    if (req.marketId !== this.config.marketId) {
      return err('UNKNOWN_MARKET', 'Market ID does not match active market');
    }
    if (this.status !== 'open') {
      return err('MARKET_NOT_OPEN', `Market is ${this.status ?? 'not started'}`);
    }

    const { order, matches, delta } = this.clob.placeOrder(req);
    this.broadcaster?.bookDelta(delta);

    const now = timestampMs(Date.now());
    const allFills: Fill[] = [];
    const affectedUsers = new Set<UserId>();

    for (const match of matches) {
      const { trade, fills } = this.marketCore.applyMatch(match, now);
      this.pushTrade(trade);
      this.broadcaster?.trade(trade);

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
    }

    return {
      ok: true,
      order,
      fills: allFills.filter((f) => f.userId === req.userId),
    };
  }

  cancelOrder(orderId: OrderId, userId: UserId): Result<{ orderId: OrderId }> {
    if (!this.clob || !this.config) {
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

    this.broadcaster?.bookDelta(delta);
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

  private pushTrade(trade: Trade): void {
    this.tradeRing.push(trade);
    if (this.tradeRing.length > this.tradeRingCap) {
      this.tradeRing.shift();
    }
  }

  private tick(): void {
    if (!this.config || !this.expiryMs || this.status === 'resolved') return;

    const msRemaining = Math.max(0, this.expiryMs - Date.now());

    if (msRemaining <= 0 && this.status === 'open') {
      this.status = 'resolving';
      const state = this.buildMarketState();
      this.broadcaster?.marketStatus(state);
      this.resolveTimeout = setTimeout(() => this.resolveMarket(), 2000);
      return;
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

    const { realizedPnlCents } = this.marketCore.resolve(resolution.outcome, now);

    this.status = 'resolved';
    this.lastResolution = resolution;

    const state = this.buildMarketState();
    this.broadcaster?.marketStatus(state);
    this.broadcaster?.marketResolved(state, resolution);

    for (const [userId, pnlCents] of realizedPnlCents) {
      const bal = this.marketCore.getBalance(userId);
      const pos = this.marketCore.getPosition(userId);
      const netAtResolution = preResolveNets.get(userId) ?? signedShares(0);

      this.broadcaster?.userResolution(userId, {
        marketId: this.config.marketId,
        outcome: resolution.outcome,
        netAtResolution,
        payoutCents: usdCents(Math.max(0, bal.availableCents as number)),
        pnlCents,
      });
      this.broadcaster?.userBalance(userId, bal);
      this.broadcaster?.userPosition(userId, pos);
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
}
