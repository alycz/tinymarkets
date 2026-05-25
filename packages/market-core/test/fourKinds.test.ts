import { describe, it, expect, beforeEach } from 'vitest';
import { MarketCore } from '../src/market';
import type { MarketConfig, Match } from '@jet/shared';
import { oddsPriceCents, shares, timestampMs, usdCents } from '@jet/shared';

const cfg: MarketConfig = {
  marketId: 'mkt-1',
  question: 'Test',
  thresholdCents: usdCents(10_000_000),
  durationMs: 120_000,
};

let seq = 0;
function makeMatch(
  takerUserId: string,
  takerYesAction: 'BUY' | 'SELL',
  makerUserId: string,
  price: number,
  size: number,
): Match {
  return {
    tradeId: `t${++seq}` as Match['tradeId'],
    marketId: 'mkt-1',
    takerYesAction,
    takerUserId,
    takerOrderId: `o-t${seq}` as Match['takerOrderId'],
    makerUserId,
    makerOrderId: `o-m${seq}` as Match['makerOrderId'],
    takerSide: 'YES',
    yesPriceCents: oddsPriceCents(price),
    size: shares(size),
    ts: timestampMs(1_000),
  };
}

describe('four-kind classification and accounting', () => {
  const START = 100_000; // $1000 in cents

  describe('OPEN', () => {
    it('both flat: buyer pays p*n, seller pays (100-p)*n, OI up', () => {
      const core = new MarketCore(cfg);
      const { trade, fills } = core.applyMatch(makeMatch('alice', 'BUY', 'bob', 40, 5), timestampMs(1));

      expect(trade.kind).toBe('OPEN');
      expect(core.getOpenInterest()).toBe(5);

      const aliceFill = fills.find(f => f.userId === 'alice')!;
      const bobFill = fills.find(f => f.userId === 'bob')!;

      expect(aliceFill.kind).toBe('OPEN');
      expect(aliceFill.positionAfter).toBe(5); // +5 YES
      expect(aliceFill.balanceAfter).toBe(START - 40 * 5); // paid 200

      expect(bobFill.kind).toBe('OPEN');
      expect(bobFill.positionAfter).toBe(-5); // -5 (long NO)
      expect(bobFill.balanceAfter).toBe(START - 60 * 5); // paid 300
    });
  });

  describe('TRANSFER_YES', () => {
    it('buyer flat, seller long YES: cash flows buyer->seller, OI unchanged', () => {
      const core = new MarketCore(cfg);
      const now = timestampMs(1);
      // First: alice and bob open so alice is long YES
      core.applyMatch(makeMatch('alice', 'BUY', 'carol', 50, 3), now);
      const oiBefore = core.getOpenInterest() as number;

      // carol is now long NO (-3). alice is long YES (+3).
      // Now: dave buys 2 YES from alice (alice is long YES -> TRANSFER_YES)
      core.applyMatch(makeMatch('dave', 'BUY', 'alice', 60, 2), now);

      expect(core.getOpenInterest()).toBe(oiBefore); // unchanged

      const daveFill = core.getPosition('dave');
      expect(daveFill.net).toBe(2);

      const alicePos = core.getPosition('alice');
      expect(alicePos.net).toBe(1); // 3 - 2

      // Dave paid 2*60=120, alice received 2*60=120
      const daveBal = core.getBalance('dave');
      const aliceBal = core.getBalance('alice');
      expect(daveBal.availableBalanceCents).toBe(START - 2 * 60);
      // Alice started at START, paid 50*3=150 on OPEN, then received 60*2=120 on TRANSFER
      expect(aliceBal.availableBalanceCents).toBe(START - 50 * 3 + 60 * 2);
    });
  });

  describe('TRANSFER_NO', () => {
    it('seller flat, buyer long NO: cash flows seller->buyer, OI unchanged', () => {
      const core = new MarketCore(cfg);
      const now = timestampMs(1);
      // bob goes long NO (sells YES) from alice
      core.applyMatch(makeMatch('alice', 'BUY', 'bob', 40, 4), now);
      const oiBefore = core.getOpenInterest() as number;

      // Now eve (flat) sells 2 YES at 50, buying into NO from bob's position
      // takerYesAction='SELL' means eve is selling YES (going short YES = buying NO)
      // maker is carol (flat), so carol would be the buyer of YES
      // Actually: to get TRANSFER_NO, buyer must be long NO (b_pre < 0)
      // Let's have alice (flat? no, alice is +4) sell into bob.
      // For TRANSFER_NO: buyer(long NO) buys YES from seller(long NO or flat)
      // eve is flat, buys YES from bob who is long NO (-4)
      // eve is the buyer (buys YES, flat -> +N) which classifies as OPEN...
      // Let's instead have bob (long NO = -4) buy YES from carol (flat):
      // bob: 'BUY' takerYesAction, carol: maker
      const { fills } = core.applyMatch(makeMatch('bob', 'BUY', 'carol', 45, 2), now);

      expect(core.getOpenInterest()).toBe(oiBefore); // unchanged for TRANSFER_NO

      const bobFill = fills.find(f => f.userId === 'bob')!;
      expect(bobFill.kind).toBe('TRANSFER_NO');
      expect(bobFill.positionAfter).toBe(-2); // was -4, bought 2 YES

      // Buyer (bob, long NO) receives (100-45)*2 = 110 back
      const bobBal = core.getBalance('bob');
      // bob started at START, paid (100-40)*4 = 240 on OPEN, received (100-45)*2=110 on TRANSFER_NO
      expect(bobBal.availableBalanceCents).toBe(START - 60 * 4 + 55 * 2);
    });
  });

  describe('CLOSE', () => {
    it('buyer long NO, seller long YES: both get cash back, OI down', () => {
      const core = new MarketCore(cfg);
      const now = timestampMs(1);
      // alice +3 YES, bob -3 NO
      core.applyMatch(makeMatch('alice', 'BUY', 'bob', 50, 3), now);
      expect(core.getOpenInterest()).toBe(3);

      // Bob (long NO, net=-3) buys 3 YES from alice (long YES, net=+3) -> CLOSE
      const { fills } = core.applyMatch(makeMatch('bob', 'BUY', 'alice', 55, 3), now);

      expect(core.getOpenInterest()).toBe(0);

      const bobFill = fills.find(f => f.userId === 'bob')!;
      const aliceFill = fills.find(f => f.userId === 'alice')!;

      expect(bobFill.kind).toBe('CLOSE');
      expect(aliceFill.kind).toBe('CLOSE');
      expect(bobFill.positionAfter).toBe(0);
      expect(aliceFill.positionAfter).toBe(0);

      // Bob (buyer in CLOSE): receives (100-55)*3 = 135
      // Alice (seller in CLOSE): receives 55*3 = 165
      const bobBal = core.getBalance('bob');
      const aliceBal = core.getBalance('alice');
      // bob: START - 50*3 (OPEN cost) + 45*3 (CLOSE receipt) = START - 150 + 135 = START - 15
      expect(bobBal.availableBalanceCents).toBe(START - 50 * 3 + 45 * 3);
      // alice: START - 50*3 (OPEN cost) + 55*3 (CLOSE receipt) = START - 150 + 165 = START + 15
      expect(aliceBal.availableBalanceCents).toBe(START - 50 * 3 + 55 * 3);
    });
  });
});
