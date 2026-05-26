import { describe, it, expect } from 'vitest';
import { MarketCore } from '../src/market';
import type { MarketConfig, Match } from '@jet/shared';
import { oddsPriceCents, shares, timestampMs, usdCents, PAYOUT_CENTS } from '@jet/shared';

const cfg: MarketConfig = {
  marketId: 'mkt-res',
  question: 'Resolution test',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

let seq = 0;
function m(
  takerUserId: string,
  takerYesAction: 'BUY' | 'SELL',
  makerUserId: string,
  price: number,
  size: number,
): Match {
  seq++;
  return {
    tradeId: `r${seq}` as Match['tradeId'],
    marketId: 'mkt-res',
    takerYesAction,
    takerUserId,
    takerOrderId: `ot${seq}` as Match['takerOrderId'],
    makerUserId,
    makerOrderId: `om${seq}` as Match['makerOrderId'],
    takerSide: 'YES',
    yesPriceCents: oddsPriceCents(price),
    size: shares(size),
    ts: timestampMs(seq * 1000),
  };
}

function setupMarket() {
  seq = 0;
  const START = 100_000;
  const core = new MarketCore(cfg, { startingBalanceCents: usdCents(START) });
  const now = timestampMs(0);

  // alice +5 YES, bob -5 NO at price 40
  core.applyMatch(m('alice', 'BUY', 'bob', 40, 5), now);
  // carol +3 YES, dave -3 NO at price 60
  core.applyMatch(m('carol', 'BUY', 'dave', 60, 3), now);

  return { core, START };
}

describe('resolution', () => {
  it('keeps default balances while allowing per-user starting balance overrides', () => {
    const core = new MarketCore(cfg, {
      startingBalanceCents: usdCents(100_000),
      startingBalanceCentsForUser: (userId) =>
        userId === 'market-maker-1' ? usdCents(100_000_000) : usdCents(100_000),
    });

    expect(core.getBalance('demo-user').availableBalanceCents).toBe(100_000);
    expect(core.getBalance('taker-001').availableBalanceCents).toBe(100_000);
    expect(core.getBalance('market-maker-1').availableBalanceCents).toBe(100_000_000);
  });

  it('uses each user starting balance as the resolution PnL baseline', () => {
    const core = new MarketCore(cfg, {
      startingBalanceCents: usdCents(100_000),
      startingBalanceCentsForUser: (userId) =>
        userId === 'market-maker-1' ? usdCents(100_000_000) : usdCents(100_000),
    });
    const now = timestampMs(0);

    core.applyMatch(m('market-maker-1', 'BUY', 'taker-001', 50, 2), now);
    const { realizedPnlCents } = core.resolve('YES', timestampMs(999_999));

    expect(realizedPnlCents.get('market-maker-1')).toBe(100);
    expect(realizedPnlCents.get('taker-001')).toBe(-100);
    expect([...realizedPnlCents.values()].reduce((sum, pnl) => sum + pnl, 0)).toBe(0);
  });

  it('YES wins: YES holders get PAYOUT_CENTS per contract, NO holders get nothing', () => {
    const { core, START } = setupMarket();
    const now = timestampMs(999_999);

    const { payouts, realizedPnlCents } = core.resolve('YES', now);

    const PAYOUT = PAYOUT_CENTS as number;

    // alice: +5 YES -> payout = 5 * 100 = 500
    expect(payouts.get('alice')).toBe(5 * PAYOUT);
    // carol: +3 YES -> payout = 3 * 100 = 300
    expect(payouts.get('carol')).toBe(3 * PAYOUT);
    // bob, dave: NO holders -> no payout
    expect(payouts.get('bob') ?? 0).toBe(0);
    expect(payouts.get('dave') ?? 0).toBe(0);

    // Post-resolution: Σ locked == 0
    for (const u of ['alice', 'bob', 'carol', 'dave']) {
      expect(core.getBalance(u).lockedSettlementCollateralCents).toBe(0);
    }
    expect(core.getOpenInterest()).toBe(0);

    // Σ realized PnL == 0 (zero-sum)
    let sumPnl = 0;
    for (const [, pnl] of realizedPnlCents) {
      sumPnl += pnl;
    }
    expect(sumPnl).toBe(0);
  });

  it('NO wins: NO holders get PAYOUT_CENTS per contract, YES holders get nothing', () => {
    const { core, START } = setupMarket();
    const now = timestampMs(999_999);

    const { payouts, realizedPnlCents } = core.resolve('NO', now);

    const PAYOUT = PAYOUT_CENTS as number;

    // bob: -5 NO (long 5 NO) -> payout = 5 * 100 = 500
    expect(payouts.get('bob')).toBe(5 * PAYOUT);
    // dave: -3 NO -> payout = 3 * 100 = 300
    expect(payouts.get('dave')).toBe(3 * PAYOUT);
    // alice, carol: YES holders -> no payout
    expect(payouts.get('alice') ?? 0).toBe(0);
    expect(payouts.get('carol') ?? 0).toBe(0);

    // Post-resolution: Σ locked == 0
    for (const u of ['alice', 'bob', 'carol', 'dave']) {
      expect(core.getBalance(u).lockedSettlementCollateralCents).toBe(0);
    }
    expect(core.getOpenInterest()).toBe(0);

    // Σ realized PnL == 0 (zero-sum)
    let sumPnl = 0;
    for (const [, pnl] of realizedPnlCents) {
      sumPnl += pnl;
    }
    expect(sumPnl).toBe(0);
  });

  it('resolve is idempotent', () => {
    const { core } = setupMarket();
    const now = timestampMs(999_999);
    const result1 = core.resolve('YES', now);
    const result2 = core.resolve('YES', now);
    expect(result1).toBe(result2); // same object reference
  });

  it('total wealth is conserved at resolution', () => {
    const { core, START } = setupMarket();
    const users = ['alice', 'bob', 'carol', 'dave'];
    const startingTotal = users.length * START;
    const now = timestampMs(999_999);

    core.resolve('YES', now);

    let total = 0;
    for (const u of users) {
      const bal = core.getBalance(u);
      total += (bal.availableBalanceCents as number) + (bal.lockedSettlementCollateralCents as number);
    }
    expect(total).toBe(startingTotal);
  });
});
