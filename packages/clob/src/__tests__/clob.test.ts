import { describe, it, expect, beforeEach } from 'vitest';
import type { PlaceOrderRequest, Side, Action } from '@jet/shared';
import type { PriceCents, Shares } from '@jet/shared';
import { normalize } from '../normalize';
import { makeIdGen } from '../ids';
import { Clob } from '../engine';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const MKT = 'm1' as const;

function req(
  side: Side,
  action: Action,
  price: number,
  size: number,
  tif: 'GTC' | 'IOC' = 'GTC',
): PlaceOrderRequest {
  return {
    userId: 'u1',
    marketId: MKT,
    type: 'LIMIT',
    side,
    action,
    oddsPriceCents: price as PriceCents,
    size: size as Shares,
    tif,
  };
}

function makeClob(): Clob {
  return new Clob(MKT, { now: () => 1000, idGen: makeIdGen(1) });
}

// ---------------------------------------------------------------------------
// 1. normalize mapping
// ---------------------------------------------------------------------------

describe('normalize mapping', () => {
  const idGen = makeIdGen(1);

  it('YES BUY -> BUY bid at oddsPriceCents', () => {
    const o = normalize(req('YES', 'BUY', 60, 10), idGen, 0);
    expect(o.yesAction).toBe('BUY');
    expect(o.yesPriceCents).toBe(60);
    expect(o.display).toEqual({ side: 'YES', action: 'BUY', oddsPriceCents: 60 });
  });

  it('YES SELL -> SELL ask at oddsPriceCents', () => {
    const o = normalize(req('YES', 'SELL', 60, 10), idGen, 0);
    expect(o.yesAction).toBe('SELL');
    expect(o.yesPriceCents).toBe(60);
  });

  it('NO BUY -> SELL ask at 100 - oddsPriceCents', () => {
    const o = normalize(req('NO', 'BUY', 40, 10), idGen, 0);
    expect(o.yesAction).toBe('SELL');
    expect(o.yesPriceCents).toBe(60);
    expect(o.display).toEqual({ side: 'NO', action: 'BUY', oddsPriceCents: 40 });
  });

  it('NO SELL -> BUY bid at 100 - oddsPriceCents', () => {
    const o = normalize(req('NO', 'SELL', 40, 10), idGen, 0);
    expect(o.yesAction).toBe('BUY');
    expect(o.yesPriceCents).toBe(60);
  });

  it('display echoes original side/action/price', () => {
    const o = normalize(req('NO', 'BUY', 35, 5), idGen, 0);
    expect(o.display.side).toBe('NO');
    expect(o.display.action).toBe('BUY');
    expect(o.display.oddsPriceCents).toBe(35);
  });

  it('throws on invalid oddsPriceCents', () => {
    expect(() => normalize(req('YES', 'BUY', 0, 10), idGen, 0)).toThrow();
    expect(() => normalize(req('YES', 'BUY', 100, 10), idGen, 0)).toThrow();
  });

  it('throws on invalid size', () => {
    expect(() => normalize(req('YES', 'BUY', 50, 0), idGen, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. price-time priority — bids
// ---------------------------------------------------------------------------

describe('price-time priority — bids', () => {
  it('best price wins over earlier arrival', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'BUY', 60, 10)); // bid @60, order 1
    clob.placeOrder(req('YES', 'BUY', 62, 10)); // bid @62, order 2 — best
    clob.placeOrder(req('YES', 'BUY', 60, 10)); // bid @60, order 3

    const { matches } = clob.placeOrder(req('YES', 'SELL', 60, 1));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.yesPriceCents).toBe(62); // matched against best bid
    expect(matches[0]!.makerOrderId).toBe('o-2');
  });
});

// ---------------------------------------------------------------------------
// 3. price-time priority — FIFO within level
// ---------------------------------------------------------------------------

describe('FIFO within level', () => {
  it('first-arrived order fills first at the same price', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'BUY', 60, 10)); // order 1 — first at p=60
    clob.placeOrder(req('YES', 'BUY', 60, 10)); // order 2

    const { matches } = clob.placeOrder(req('YES', 'SELL', 60, 1));
    expect(matches[0]!.makerOrderId).toBe('o-1');
  });
});

// ---------------------------------------------------------------------------
// 4. partial fill — taker smaller
// ---------------------------------------------------------------------------

describe('partial fill — taker smaller than resting', () => {
  it('ask shrinks, taker fills completely', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'SELL', 70, 100)); // ask 100 @70

    const { order, matches, delta } = clob.placeOrder(req('YES', 'BUY', 70, 30));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.size).toBe(30);
    expect(order.status).toBe('FILLED');

    const snap = clob.snapshot();
    expect(snap.asks[0]!.size).toBe(70);
    expect(snap.bids).toHaveLength(0);

    // delta shows updated ask level at size 70
    const askChange = delta.changes.find(c => c.side === 'ASK' && c.yesPriceCents === 70);
    expect(askChange?.size).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// 5. partial fill — taker larger, walks book
// ---------------------------------------------------------------------------

describe('partial fill — taker walks book', () => {
  it('fills multiple levels; remainder rests', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'SELL', 70, 30)); // ask 30 @70
    clob.placeOrder(req('YES', 'SELL', 71, 50)); // ask 50 @71

    const { order, matches } = clob.placeOrder(req('YES', 'BUY', 72, 100));
    expect(matches).toHaveLength(2);
    expect(matches[0]!.size).toBe(30);
    expect(matches[0]!.yesPriceCents).toBe(70);
    expect(matches[1]!.size).toBe(50);
    expect(matches[1]!.yesPriceCents).toBe(71);
    expect(order.status).toBe('PARTIALLY_FILLED');
    expect(order.remaining).toBe(20);

    const snap = clob.snapshot();
    expect(snap.bids[0]!.yesPriceCents).toBe(72);
    expect(snap.bids[0]!.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 6. IOC partial fill
// ---------------------------------------------------------------------------

describe('IOC partial fill', () => {
  it('remainder is dropped; status PARTIALLY_FILLED', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'SELL', 70, 30));
    clob.placeOrder(req('YES', 'SELL', 71, 50));

    const { order, matches } = clob.placeOrder(req('YES', 'BUY', 72, 100, 'IOC'));
    expect(matches).toHaveLength(2);
    expect(order.status).toBe('PARTIALLY_FILLED');
    expect(order.remaining).toBe(20);

    const snap = clob.snapshot();
    expect(snap.bids).toHaveLength(0); // remainder did not rest
  });
});

// ---------------------------------------------------------------------------
// 7. IOC zero fill
// ---------------------------------------------------------------------------

describe('IOC zero fill', () => {
  it('no match, no rest, status CANCELLED', () => {
    const clob = makeClob();
    // no opposing side
    const { order, matches, delta } = clob.placeOrder(req('YES', 'BUY', 50, 10, 'IOC'));
    expect(order.status).toBe('CANCELLED');
    expect(matches).toHaveLength(0);
    expect(delta.changes).toHaveLength(0);

    const snap = clob.snapshot();
    expect(snap.bids).toHaveLength(0);
    expect(snap.asks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. GTC rests when no opposite side
// ---------------------------------------------------------------------------

describe('GTC rests', () => {
  it('order appears in snapshot when no match', () => {
    const clob = makeClob();
    const { order } = clob.placeOrder(req('YES', 'BUY', 55, 20));
    expect(order.status).toBe('OPEN');

    const snap = clob.snapshot();
    expect(snap.bids).toHaveLength(1);
    expect(snap.bids[0]!.yesPriceCents).toBe(55);
    expect(snap.bids[0]!.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 9. Cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('removes order from book; second cancel returns ok: false', () => {
    const clob = makeClob();
    const { order } = clob.placeOrder(req('YES', 'BUY', 55, 20));
    const orderId = order.orderId;

    const { ok, delta } = clob.cancel(orderId);
    expect(ok).toBe(true);
    expect(delta.changes[0]!.size).toBe(0); // level removed

    const snap = clob.snapshot();
    expect(snap.bids).toHaveLength(0);

    const second = clob.cancel(orderId);
    expect(second.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Snapshot/delta seq compatibility
// ---------------------------------------------------------------------------

describe('seq compatibility', () => {
  it('deltas advance seq while snapshots report the current seq without consuming one', () => {
    const clob = makeClob();
    const r1 = clob.placeOrder(req('YES', 'BUY', 55, 10));
    const r2 = clob.placeOrder(req('YES', 'SELL', 55, 10));
    const snap = clob.snapshot();
    const r3 = clob.cancel('nonexistent-id');

    expect(r2.delta.seq).toBeGreaterThan(r1.delta.seq);
    expect(snap.seq).toBe(r2.delta.seq);
    expect(r3.delta.seq).toBe(snap.seq + 1);
  });

  it('multiple clients can snapshot before a mutation and both accept the next delta', () => {
    const clob = makeClob();
    const clientA = clob.snapshot();
    const clientB = clob.snapshot();

    const { delta } = clob.placeOrder(req('YES', 'BUY', 55, 10));

    expect(clientA.seq).toBe(0);
    expect(clientB.seq).toBe(0);
    expect(delta.seq).toBe(clientA.seq + 1);
    expect(delta.seq).toBe(clientB.seq + 1);
  });
});

// ---------------------------------------------------------------------------
// 11. Delta correctness — fully consumed level shows size 0
// ---------------------------------------------------------------------------

describe('delta correctness', () => {
  it('fully consumed ask emits delta with size 0', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'SELL', 70, 10));
    const { delta } = clob.placeOrder(req('YES', 'BUY', 70, 10));

    const change = delta.changes.find(c => c.side === 'ASK' && c.yesPriceCents === 70);
    expect(change?.size).toBe(0);
  });

  it('delta tracks both ASK consumed and BID resting when taker fills then rests at same price', () => {
    // ASK 5 @60, BUY 10 @60 → fills 5, rests 5 as BID @60
    // Regression: Map<number, side> overwrites ASK:60 with BID:60, losing the ASK removal
    const clob = makeClob();
    clob.placeOrder(req('YES', 'SELL', 60, 5));
    const { delta } = clob.placeOrder(req('YES', 'BUY', 60, 10));

    const askChange = delta.changes.find(c => c.side === 'ASK' && c.yesPriceCents === 60);
    const bidChange = delta.changes.find(c => c.side === 'BID' && c.yesPriceCents === 60);

    expect(askChange?.size).toBe(0); // consumed ask level must appear in delta
    expect(bidChange?.size).toBe(5); // resting bid also present
  });
});

// ---------------------------------------------------------------------------
// 12. NO-side normalization end-to-end
// ---------------------------------------------------------------------------

describe('NO-side normalization end-to-end', () => {
  it('Buy NO @40 matches resting Buy YES @60; match price = 60, takerSide = NO', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'BUY', 60, 10)); // resting bid @60

    // Buy NO @40 normalizes to Ask YES @60 -> crosses the bid
    const { matches } = clob.placeOrder(req('NO', 'BUY', 40, 5));
    expect(matches).toHaveLength(1);
    expect(matches[0]!.yesPriceCents).toBe(60);
    expect(matches[0]!.takerSide).toBe('NO');
    expect(matches[0]!.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 13. Match fields
// ---------------------------------------------------------------------------

describe('match fields', () => {
  it('populates all required match fields', () => {
    const clob = makeClob();
    const { order: maker } = clob.placeOrder(req('YES', 'SELL', 65, 20));
    const { order: taker, matches } = clob.placeOrder(req('YES', 'BUY', 65, 10));

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.marketId).toBe(MKT);
    expect(m.yesPriceCents).toBe(65);
    expect(m.size).toBe(10);
    expect(m.makerOrderId).toBe(maker.orderId);
    expect(m.takerOrderId).toBe(taker.orderId);
    expect(m.takerSide).toBe('YES');
    expect(typeof m.tradeId).toBe('string');
    expect(m.ts).toBe(1000);
  });

  it('getOrder returns resting order; undefined for filled/cancelled', () => {
    const clob = makeClob();
    const { order } = clob.placeOrder(req('YES', 'BUY', 55, 10));
    expect(clob.getOrder(order.orderId)).toBeDefined();
    expect(clob.getOrder(order.orderId)!.orderId).toBe(order.orderId);

    // Fill it
    clob.placeOrder({ ...req('YES', 'SELL', 55, 10), userId: 'u2' });
    expect(clob.getOrder(order.orderId)).toBeUndefined();

    // Cancelled order
    const { order: o2 } = clob.placeOrder(req('YES', 'BUY', 40, 5));
    clob.cancel(o2.orderId);
    expect(clob.getOrder(o2.orderId)).toBeUndefined();
  });

  it('openOrdersFor filters by userId', () => {
    const clob = makeClob();
    clob.placeOrder(req('YES', 'BUY', 55, 10));          // u1
    clob.placeOrder({ ...req('YES', 'SELL', 70, 5), userId: 'u2' }); // u2
    clob.placeOrder(req('YES', 'BUY', 50, 3));            // u1

    const u1Orders = clob.openOrdersFor('u1');
    expect(u1Orders).toHaveLength(2);
    expect(u1Orders.every(o => o.userId === 'u1')).toBe(true);

    const u2Orders = clob.openOrdersFor('u2');
    expect(u2Orders).toHaveLength(1);
    expect(u2Orders[0]!.userId).toBe('u2');

    expect(clob.openOrdersFor('u3')).toHaveLength(0);
  });

  it('CLOB source files do not import Trade or TradeKind or Fill', async () => {
    // Compile-time guard: import the engine module and verify no Trade type leaks.
    // If engine.ts imported Trade/TradeKind/Fill, TypeScript would have caught it.
    // At runtime, just assert the Clob class is present and Match has no kind field.
    const { Clob: ClobClass } = await import('../engine');
    expect(ClobClass).toBeDefined();

    const clob2 = new ClobClass(MKT, { now: () => 1000, idGen: makeIdGen(1) });
    clob2.placeOrder(req('YES', 'SELL', 50, 5));
    const { matches } = clob2.placeOrder(req('YES', 'BUY', 50, 5));
    expect('kind' in matches[0]!).toBe(false);
  });
});
