import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  Balance,
  Fill,
  IndicativeSnapshot,
  MarketState,
  OrderBookDelta,
  OrderBookSnapshot,
  Position,
  RampResolution,
  Trade,
  UserId,
  UserResolutionEvent,
} from '@jet/shared';
import { priceCents, shares } from '@jet/shared';
import { MarketSession } from '../session.js';
import type { Broadcaster } from '../broadcasts.js';

// ── stub broadcaster ────────────────────────────────────────────────────────

type BookDeltaCall = OrderBookDelta;
type TradeCall = Trade;
type UserFillCall = { userId: UserId; fill: Fill };
type UserBalanceCall = { userId: UserId; balance: Balance };
type UserPositionCall = { userId: UserId; position: Position };
type MarketStatusCall = MarketState;
type MarketResolvedCall = { state: MarketState; resolution: RampResolution };
type UserResolutionCall = { userId: UserId; event: Omit<UserResolutionEvent, 'type'> };

function makeStubBroadcaster() {
  const bookDeltas: BookDeltaCall[] = [];
  const trades: TradeCall[] = [];
  const userFills: UserFillCall[] = [];
  const userBalances: UserBalanceCall[] = [];
  const userPositions: UserPositionCall[] = [];
  const marketStatuses: MarketStatusCall[] = [];
  const marketResolveds: MarketResolvedCall[] = [];
  const userResolutions: UserResolutionCall[] = [];

  const broadcaster = {
    bookDelta(d: OrderBookDelta) { bookDeltas.push(d); },
    bookSnapshot(_b: OrderBookSnapshot) {},
    trade(t: Trade) { trades.push(t); },
    userFill(userId: UserId, fill: Fill) { userFills.push({ userId, fill }); },
    userBalance(userId: UserId, balance: Balance) { userBalances.push({ userId, balance }); },
    userPosition(userId: UserId, position: Position) { userPositions.push({ userId, position }); },
    marketStatus(s: MarketState) { marketStatuses.push(s); },
    marketResolved(state: MarketState, resolution: RampResolution) { marketResolveds.push({ state, resolution }); },
    userResolution(userId: UserId, event: Omit<UserResolutionEvent, 'type'>) { userResolutions.push({ userId, event }); },
    oraclePrice(_snap: IndicativeSnapshot) {},
  };

  return {
    broadcaster: broadcaster as unknown as Broadcaster,
    bookDeltas,
    trades,
    userFills,
    userBalances,
    userPositions,
    marketStatuses,
    marketResolveds,
    userResolutions,
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
      priceCents: priceCents(60),
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
      priceCents: priceCents(60),
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

  it('cancel: wrong userId returns NOT_ORDER_OWNER', () => {
    session.startDemo();
    const marketId = session.getMarketId()!;

    const { order } = session.placeOrder({
      userId: 'userA' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'BUY' as const,
      type: 'LIMIT' as const,
      priceCents: priceCents(55),
      size: shares(5),
      tif: 'GTC' as const,
    }) as { ok: true; order: import('@jet/shared').CanonicalOrder; fills: Fill[] };

    const bad = session.cancelOrder(order.orderId, 'userB' as UserId);
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.error.code).toBe('NOT_ORDER_OWNER');

    const good = session.cancelOrder(order.orderId, 'userA' as UserId);
    expect(good.ok).toBe(true);
  });

  it('resolution path: emits resolving -> resolved -> market:resolved + user events', async () => {
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
      priceCents: priceCents(60),
      size: shares(5),
      tif: 'GTC' as const,
    });
    session.placeOrder({
      userId: 'userB' as UserId,
      marketId,
      side: 'YES' as const,
      action: 'SELL' as const,
      type: 'LIMIT' as const,
      priceCents: priceCents(60),
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

    // market:resolved with a RampResolution
    expect(stub.marketResolveds).toHaveLength(1);
    expect(stub.marketResolveds[0]!.resolution).toBeDefined();
    expect(stub.marketResolveds[0]!.resolution.method).toBe('RAMP_V1');
    expect(stub.marketResolveds[0]!.resolution.outcome).toMatch(/^(YES|NO)$/);

    // user:resolution for userA and userB (the holders)
    expect(stub.userResolutions.length).toBeGreaterThan(0);
    const resolvedUserIds = stub.userResolutions.map((r) => r.userId);
    expect(resolvedUserIds).toContain('userA');
    expect(resolvedUserIds).toContain('userB');
  });
});
