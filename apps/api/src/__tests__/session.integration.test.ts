import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  Balance,
  CanonicalOrder,
  Fill,
  IndicativeSnapshot,
  MarketId,
  MarketState,
  OrderBookDelta,
  OrderBookSnapshot,
  Position,
  SharePricePoint,
  Trade,
  UserId,
  UserResolutionEvent,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { oddsPriceCents, PAYOUT_CENTS, shares, timestampMs } from '@jet/shared';
import { MarketSession } from '../session.js';
import type { Broadcaster } from '../broadcasts.js';

// ── stub broadcaster ────────────────────────────────────────────────────────

type BookDeltaCall = OrderBookDelta;
type TradeCall = Trade;
type UserFillCall = { userId: UserId; fill: Fill };
type UserBalanceCall = { userId: UserId; balance: Balance };
type UserPositionCall = { userId: UserId; position: Position };
type MarketStatusCall = MarketState;
type MarketResolvedCall = { state: MarketState; resolution: VenueWeightedTwapResolution };
type UserResolutionCall = { userId: UserId; event: Omit<UserResolutionEvent, 'type'> };
type UserOpenOrdersCall = { userId: UserId; openOrders: CanonicalOrder[] };

function makeStubBroadcaster() {
  const bookDeltas: BookDeltaCall[] = [];
  const bookSnapshots: OrderBookSnapshot[] = [];
  const trades: TradeCall[] = [];
  const userFills: UserFillCall[] = [];
  const userBalances: UserBalanceCall[] = [];
  const userPositions: UserPositionCall[] = [];
  const marketStatuses: MarketStatusCall[] = [];
  const marketResolveds: MarketResolvedCall[] = [];
  const userResolutions: UserResolutionCall[] = [];
  const userOpenOrders: UserOpenOrdersCall[] = [];
  const oraclePrices: IndicativeSnapshot[] = [];
  const sharePrices: SharePricePoint[] = [];
  const marketSnapshots: MarketState[] = [];

  const broadcaster = {
    bookDelta(d: OrderBookDelta) { bookDeltas.push(d); },
    bookSnapshot(b: OrderBookSnapshot) { bookSnapshots.push(b); },
    trade(t: Trade) { trades.push(t); },
    sharePrice(p: SharePricePoint) { sharePrices.push(p); },
    userFill(userId: UserId, fill: Fill) { userFills.push({ userId, fill }); },
    userBalance(userId: UserId, balance: Balance) { userBalances.push({ userId, balance }); },
    userPosition(userId: UserId, position: Position) { userPositions.push({ userId, position }); },
    userOpenOrders(userId: UserId, openOrders: CanonicalOrder[]) { userOpenOrders.push({ userId, openOrders }); },
    userOrderCancelled(userId: UserId, _orderId: string, openOrders: CanonicalOrder[]) { userOpenOrders.push({ userId, openOrders }); },
    marketStatus(s: MarketState) { marketStatuses.push(s); },
    marketSnapshot(s: MarketState) { marketSnapshots.push(s); },
    marketResolved(state: MarketState, resolution: VenueWeightedTwapResolution) { marketResolveds.push({ state, resolution }); },
    userResolution(userId: UserId, event: Omit<UserResolutionEvent, 'type'>) { userResolutions.push({ userId, event }); },
    oraclePrice(snap: IndicativeSnapshot) { oraclePrices.push(snap); },
  };

  return {
    broadcaster: broadcaster as unknown as Broadcaster,
    bookDeltas,
    bookSnapshots,
    trades,
    userFills,
    userBalances,
    userPositions,
    marketStatuses,
    marketSnapshots,
    marketResolveds,
    userResolutions,
    userOpenOrders,
    oraclePrices,
    sharePrices,
  };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('MarketSession integration', () => {
  let session: MarketSession;
  let stub: ReturnType<typeof makeStubBroadcaster>;

  beforeEach(() => {
    session = new MarketSession();
    stub = makeStubBroadcaster();
    session.setBroadcaster(stub.broadcaster);
  });

  afterEach(() => {
    session.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('order placement: fill path emits expected broadcasts', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    // User A: GTC BUY YES @60 — rests
    const reqA = {
      userId: 'userA' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(10),
      tif: 'GTC' as const,
    };
    const resultA = session.placeOrder(reqA);
    expect(resultA.ok).toBe(true);

    // 1 bookDelta for resting order
    expect(stub.bookDeltas).toHaveLength(1);
    expect(stub.trades).toHaveLength(0);
    expect(stub.userFills).toHaveLength(0);

    // User B: IOC SELL YES @60 — crosses A's bid
    const reqB = {
      userId: 'userB' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(10),
      tif: 'IOC' as const,
    };
    const resultB = session.placeOrder(reqB);
    expect(resultB.ok).toBe(true);

    // 1 more bookDelta for the matched/taker order
    expect(stub.bookDeltas).toHaveLength(2);
    // 1 trade
    expect(stub.trades).toHaveLength(1);
    expect(stub.trades[0]!.yesPriceCents).toBe(60);
    expect(stub.trades[0]!.size).toBe(10);
    const tradePoint = stub.sharePrices.find((p) => p.source === 'trade' && p.yesPriceCents === 60);
    expect(tradePoint).toMatchObject({
      source: 'trade',
      yesPriceCents: 60,
      noPriceCents: 40,
      tradeId: stub.trades[0]!.tradeId,
      volume: 10,
    });
    // 2 fills (one per party)
    expect(stub.userFills).toHaveLength(2);
    const fillUserIds = stub.userFills.map((f) => f.userId);
    expect(fillUserIds).toContain('userA');
    expect(fillUserIds).toContain('userB');
    // 2 userBalance + 2 userPosition (one per affected user)
    expect(stub.userBalances).toHaveLength(2);
    expect(stub.userPositions).toHaveLength(2);

    // Check net signed positions: A bought YES (+10), B sold YES (-10)
    const posA = stub.userPositions.find((p) => p.userId === 'userA')!.position;
    const posB = stub.userPositions.find((p) => p.userId === 'userB')!.position;
    expect(posA.net).toBe(10);
    expect(posB.net).toBe(-10);
  });

  it('fills all four user-facing order intents through the canonical YES book', () => {
    const scenarios = [
      {
        maker: { userId: 'maker-sell', side: 'YES' as const, action: 'SELL' as const, price: 60 },
        taker: { userId: 'buy-yes', side: 'YES' as const, action: 'BUY' as const, price: 60 },
        expectedTakerNet: 10,
      },
      {
        maker: { userId: 'maker-buy', side: 'YES' as const, action: 'BUY' as const, price: 60 },
        taker: { userId: 'sell-yes', side: 'YES' as const, action: 'SELL' as const, price: 60 },
        expectedTakerNet: -10,
      },
      {
        maker: { userId: 'maker-buy-2', side: 'YES' as const, action: 'BUY' as const, price: 60 },
        taker: { userId: 'buy-no', side: 'NO' as const, action: 'BUY' as const, price: 40 },
        expectedTakerNet: -10,
      },
      {
        maker: { userId: 'maker-sell-2', side: 'YES' as const, action: 'SELL' as const, price: 60 },
        taker: { userId: 'sell-no', side: 'NO' as const, action: 'SELL' as const, price: 40 },
        expectedTakerNet: 10,
      },
    ];

    for (const scenario of scenarios) {
      session.startDemo();
      const marketId = session.getMarketId()!;
      session.placeOrder({
        userId: scenario.maker.userId as UserId,
        marketId,
        side: scenario.maker.side,
        action: scenario.maker.action,
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(scenario.maker.price),
        size: shares(10),
        tif: 'GTC',
      });
      const result = session.placeOrder({
        userId: scenario.taker.userId as UserId,
        marketId,
        side: scenario.taker.side,
        action: scenario.taker.action,
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(scenario.taker.price),
        size: shares(10),
        tif: 'IOC',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected order to fill');
      expect(result.fills).toHaveLength(1);
      expect(session.getUserSnapshot(scenario.taker.userId as UserId)!.positions[0]!.net).toBe(scenario.expectedTakerNet);
      expect(session.getRecentTrades(1)[0]!.yesPriceCents).toBe(60);
      expect(session.getSharePriceSeries().at(-2)?.source).toBe('trade');
    }
  });

  it('records mid and mark share-price points from the YES book without using oracle prices', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    session.placeOrder({
      userId: 'bidder' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(40),
      size: shares(10),
      tif: 'GTC' as const,
    });

    expect(session.getLatestSharePricePoint()).toMatchObject({
      source: 'mark',
      yesPriceCents: 40,
      noPriceCents: 60,
      bestBid: 40,
    });

    session.placeOrder({
      userId: 'seller' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(10),
      tif: 'GTC' as const,
    });

    expect(session.getLatestSharePricePoint()).toMatchObject({
      source: 'mid',
      yesPriceCents: 50,
      noPriceCents: 50,
      bestBid: 40,
      bestAsk: 60,
    });

    const metrics = session.getSharePriceMetrics();
    expect(metrics).toMatchObject({
      latestYesPrice: 50,
      latestNoPrice: 50,
      bestBid: 40,
      bestAsk: 60,
      spread: 20,
      mid: 50,
      volumeLastMinute: 0,
      highYesPrice: 50,
      lowYesPrice: 40,
    });
    expect(session.getSharePriceSeries().every((p) => p.yesPriceCents >= 1 && p.yesPriceCents <= 99)).toBe(true);
  });

  it('rejects invalid share-price points that look like BTC/oracle prices', () => {
    session.startDemo();
    const before = session.getSharePriceSeries().length;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unsafeSession = session as unknown as {
      recordAndBroadcastSharePrice(point: SharePricePoint): void;
    };

    unsafeSession.recordAndBroadcastSharePrice({
      marketId: session.getMarketId()!,
      ts: timestampMs(Date.now()),
      yesPriceCents: 10_000_000 as SharePricePoint['yesPriceCents'],
      noPriceCents: -9_999_900 as SharePricePoint['noPriceCents'],
      source: 'mark',
    });

    expect(session.getSharePriceSeries()).toHaveLength(before);
    expect(warn).toHaveBeenCalledWith(
      'Rejected invalid YES share price point; possible BTC/oracle leak',
      expect.objectContaining({ yesPriceCents: 10_000_000 }),
    );
    warn.mockRestore();
  });

  it('cancel: wrong userId returns NOT_ORDER_OWNER', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    const { order } = session.placeOrder({
      userId: 'userA' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(55),
      size: shares(5),
      tif: 'GTC' as const,
    }) as { ok: true; order: CanonicalOrder; fills: Fill[] };

    const bad = session.cancelOrder(order.orderId, 'userB' as UserId);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.error.code).toBe('NOT_ORDER_OWNER');

    const good = session.cancelOrder(order.orderId, 'userA' as UserId);
    expect(good.ok).toBe(true);
  });

  it('reserves resting orders separately from settlement collateral and releases on cancel/fill', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    const resting = session.placeOrder({
      userId: 'userA' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(10),
      tif: 'GTC' as const,
    }) as { ok: true; order: CanonicalOrder; fills: Fill[] };

    let balA = session.getUserSnapshot('userA' as UserId)!.balance;
    expect(balA.availableBalanceCents).toBe(100_000 - 600);
    expect(balA.reservedForOrdersCents).toBe(600);
    expect(balA.lockedSettlementCollateralCents).toBe(0);

    session.placeOrder({
      userId: 'userB' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(4),
      tif: 'IOC' as const,
    });

    balA = session.getUserSnapshot('userA' as UserId)!.balance;
    expect(balA.reservedForOrdersCents).toBe(60 * 6);
    expect(balA.lockedSettlementCollateralCents).toBe(50 * 4);

    const cancelled = session.cancelOrder(resting.order.orderId, 'userA' as UserId);
    expect(cancelled.ok).toBe(true);
    balA = session.getUserSnapshot('userA' as UserId)!.balance;
    expect(balA.reservedForOrdersCents).toBe(0);
    expect(balA.lockedSettlementCollateralCents).toBe(50 * 4);
  });

  it('rejects orders that cannot reserve full worst-case cost before mutating the book', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    const result = session.placeOrder({
      userId: 'underfunded' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(99),
      size: shares(2_000),
      tif: 'GTC' as const,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(session.getOrderBookSnapshot()!.bids).toHaveLength(0);
    expect(session.getUserSnapshot('underfunded' as UserId)!.balance.reservedForOrdersCents).toBe(0);
  });

  it('resolution cleanup releases resting order reserves and clears stale open orders', () => {
    vi.useFakeTimers();
    session.startDemo();
    const marketId = session.getMarketId()!;

    const placed = session.placeOrder({
      userId: 'restingUser' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(10),
      tif: 'GTC' as const,
    }) as { ok: true; order: CanonicalOrder; fills: Fill[] };

    let snap = session.getUserSnapshot('restingUser' as UserId)!;
    expect(snap.balance.availableBalanceCents).toBe(100_000 - 600);
    expect(snap.balance.reservedForOrdersCents).toBe(600);
    expect(snap.openOrders).toHaveLength(1);

    vi.advanceTimersByTime(2 * 60 * 1000 + 3000);

    snap = session.getUserSnapshot('restingUser' as UserId)!;
    expect(snap.balance.availableBalanceCents).toBe(100_000);
    expect(snap.balance.reservedForOrdersCents).toBe(0);
    expect(snap.openOrders).toHaveLength(0);
    expect(session.getOrderBookSnapshot()!.bids).toHaveLength(0);
    expect(session.getOrderBookSnapshot()!.asks).toHaveLength(0);

    expect(stub.bookDeltas).toContainEqual(
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({ side: 'BID', yesPriceCents: 60, size: 0 }),
        ]),
      }),
    );
    expect(stub.bookSnapshots.at(-1)?.bids).toHaveLength(0);
    expect(stub.bookSnapshots.at(-1)?.asks).toHaveLength(0);
    expect(session.cancelOrder(placed.order.orderId, 'restingUser' as UserId).ok).toBe(false);
  });

  it('user resolution events report actual payout, not final balance', () => {
    vi.useFakeTimers();
    session.startDemo();
    const marketId = session.getMarketId()!;

    session.placeOrder({
      userId: 'yesHolder' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(5),
      tif: 'GTC' as const,
    });
    session.placeOrder({
      userId: 'noHolder' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(5),
      tif: 'IOC' as const,
    });
    session.getUserSnapshot('observer' as UserId);

    vi.advanceTimersByTime(2 * 60 * 1000 + 3000);

    const yesEvent = stub.userResolutions.find((r) => r.userId === 'yesHolder')!.event;
    const noEvent = stub.userResolutions.find((r) => r.userId === 'noHolder')!.event;
    const observerEvent = stub.userResolutions.find((r) => r.userId === 'observer')!.event;
    const payout = (PAYOUT_CENTS as number) * 5;

    expect(yesEvent.netAtResolution).toBe(5);
    expect(noEvent.netAtResolution).toBe(-5);
    expect(observerEvent.netAtResolution).toBe(0);
    expect(observerEvent.payoutCents).toBe(0);
    expect(observerEvent.pnlCents).toBe(0);

    if (yesEvent.outcome === 'YES') {
      expect(yesEvent.payoutCents).toBe(payout);
      expect(noEvent.payoutCents).toBe(0);
      expect(session.getUserSnapshot('yesHolder' as UserId)!.balance.availableBalanceCents).toBe(100_000 - 60 * 5 + payout);
      expect(session.getUserSnapshot('noHolder' as UserId)!.balance.availableBalanceCents).toBe(100_000 - 40 * 5);
    } else {
      expect(yesEvent.payoutCents).toBe(0);
      expect(noEvent.payoutCents).toBe(payout);
      expect(session.getUserSnapshot('yesHolder' as UserId)!.balance.availableBalanceCents).toBe(100_000 - 60 * 5);
      expect(session.getUserSnapshot('noHolder' as UserId)!.balance.availableBalanceCents).toBe(100_000 - 40 * 5 + payout);
    }

    expect(yesEvent.payoutCents).not.toBe(session.getUserSnapshot('yesHolder' as UserId)!.balance.availableBalanceCents);
    expect(noEvent.payoutCents).not.toBe(session.getUserSnapshot('noHolder' as UserId)!.balance.availableBalanceCents);
  });

  it('resolution path: emits resolving -> resolved -> resolution + user events', async () => {
    vi.useFakeTimers();

    // Use a very short duration so we can advance timers
    const DURATION_MS = 500;
    // Temporarily override config by patching startDemo — here we just start and manually
    // advance the timers. The session uses MARKET.durationMs from config, so we fast-forward.
    session.startDemo();

    // Place a trade so there's a holder
    const marketId = session.getMarketId()!;
    session.placeOrder({
      userId: 'userA' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(5),
      tif: 'GTC' as const,
    });
    session.placeOrder({
      userId: 'userB' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      oddsPriceCents: oddsPriceCents(60),
      size: shares(5),
      tif: 'IOC' as const,
    });

    const statusesBefore = stub.marketStatuses.length;

    // Advance past the full 2-minute duration + the 2s resolve timeout
    vi.advanceTimersByTime(2 * 60 * 1000 + 3000);

    // Should have broadcast resolving status, then resolved status
    const statuses = stub.marketStatuses.slice(statusesBefore);
    const resolvingStatus = statuses.find((s) => s.status === 'resolving');
    const resolvedStatus = statuses.find((s) => s.status === 'resolved');
    expect(resolvingStatus).toBeDefined();
    expect(resolvedStatus).toBeDefined();

    // resolution with a VenueWeightedTwapResolution
    expect(stub.marketResolveds).toHaveLength(1);
    expect(stub.marketResolveds[0]!.resolution).toBeDefined();
    expect(stub.marketResolveds[0]!.resolution.method).toBe('VENUE_WEIGHTED_TWAP_V1');
    expect(stub.marketResolveds[0]!.resolution.outcome).toMatch(/^(YES|NO)$/);

    // pnl_update for userA and userB (the holders)
    expect(stub.userResolutions.length).toBeGreaterThan(0);
    const resolvedUserIds = stub.userResolutions.map((r) => r.userId);
    expect(resolvedUserIds).toContain('userA');
    expect(resolvedUserIds).toContain('userB');
  });

  it('demo spike control arms only the active unresolved market', () => {
    const noMarket = session.armDemoSpike('missing' as MarketId);
    expect(noMarket.ok).toBe(false);
    expect(noMarket.ok === false && noMarket.error.code).toBe('UNKNOWN_MARKET');

    session.startDemo();
    const marketId = session.getMarketId()!;

    const wrongMarket = session.armDemoSpike('other-market' as MarketId);
    expect(wrongMarket.ok).toBe(false);
    expect(wrongMarket.ok === false && wrongMarket.error.code).toBe('UNKNOWN_MARKET');

    const snapshotsBefore = stub.oraclePrices.length;
    const armed = session.armDemoSpike(marketId);
    expect(armed.ok).toBe(true);
    expect(armed.ok === true && armed.scenario).toBe('NEAR_EXPIRY_SPIKE');
    expect(stub.oraclePrices.length).toBeGreaterThan(snapshotsBefore);
  });

  it('demo spike control rejects resolved markets', () => {
    vi.useFakeTimers();
    session.startDemo();
    const marketId = session.getMarketId()!;

    vi.advanceTimersByTime(2 * 60 * 1000 + 3000);

    const result = session.armDemoSpike(marketId);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('MARKET_NOT_OPEN');
  });
});
