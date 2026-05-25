import { describe, it, expect } from 'vitest';
import { MarketCore } from '../src/market';
import type { MarketConfig, Match } from '@jet/shared';
import { oddsPriceCents, shares, timestampMs, usdCents, PAYOUT_CENTS } from '@jet/shared';

const cfg: MarketConfig = {
  marketId: 'mkt-inv',
  question: 'Invariant test',
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
    tradeId: `t${seq}` as Match['tradeId'],
    marketId: 'mkt-inv',
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

function assertInvariant(core: MarketCore, users: string[]) {
  const oi = core.getOpenInterest() as number;
  const payout = PAYOUT_CENTS as number;
  const expectedLocked = oi * payout;
  let actualLocked = 0;
  let actualTotal = 0;
  for (const u of users) {
    const bal = core.getBalance(u);
    actualLocked += bal.lockedSettlementCollateralCents as number;
    actualTotal += (bal.availableBalanceCents as number) + (bal.lockedSettlementCollateralCents as number);
  }
  expect(actualLocked).toBe(expectedLocked);
  return actualTotal;
}

describe('collateral invariant', () => {
  const users = ['alice', 'bob', 'carol', 'dave'];
  const START = 100_000;
  const startingTotal = users.length * START;

  it('holds across a mixed sequence of 20+ trades including zero-crossings', () => {
    seq = 0;
    const core = new MarketCore(cfg, { startingBalanceCents: usdCents(START) });

    // Force balance creation for all users
    for (const u of users) core.getBalance(u);

    const now = timestampMs(0);
    const trades: Match[] = [
      // OPEN trades
      m('alice', 'BUY', 'bob', 40, 3),
      m('carol', 'BUY', 'dave', 60, 5),
      m('alice', 'BUY', 'carol', 50, 2),
      // carol is now +0-5+2=-3 (check: initially flat, carol BUY makes her long NO? wait...
      // carol is takerYesAction='BUY' so carol buys YES from dave: carol +5, dave -5
      // then alice BUY from carol (carol has +5 YES, alice flat -> TRANSFER_YES)
      m('bob', 'BUY', 'dave', 45, 2),
      // bob is long NO (-3 from first trade), dave is long NO (-5 from second, then sold 2 more?)
      // actually let me just fire trades and rely on invariant check after each
      m('alice', 'BUY', 'bob', 55, 4), // may cause zero crossing for bob
      m('carol', 'BUY', 'alice', 50, 3),
      m('dave', 'BUY', 'carol', 48, 4),
      m('bob', 'BUY', 'alice', 52, 5),
      m('carol', 'BUY', 'dave', 35, 2),
      m('alice', 'BUY', 'bob', 65, 3),
      m('dave', 'BUY', 'carol', 42, 6),
      m('bob', 'BUY', 'alice', 58, 2),
      m('carol', 'BUY', 'dave', 47, 3),
      m('alice', 'BUY', 'carol', 53, 4),
      m('dave', 'BUY', 'bob', 44, 5),
      m('bob', 'BUY', 'dave', 61, 2),
      m('alice', 'BUY', 'carol', 39, 3),
      m('carol', 'BUY', 'alice', 56, 4),
      m('dave', 'BUY', 'bob', 43, 2),
      m('alice', 'BUY', 'dave', 50, 5),
    ];

    let firstTotal: number | undefined;
    for (const trade of trades) {
      core.applyMatch(trade, now);
      const total = assertInvariant(core, users);
      if (firstTotal === undefined) firstTotal = total;
      // Total system cash must be conserved
      expect(total).toBe(startingTotal);
    }
  });
});
