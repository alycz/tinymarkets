import type { CanonicalOrder, PlaceOrderRequest } from '@jet/shared';
import { isValidOddsPriceCents, noPriceCents, timestampMs } from '@jet/shared';
import type { Action, PriceCents, Side } from '@jet/shared';
import type { IdGen } from './ids';

/** Converts a user-facing PlaceOrderRequest into a canonical YES-book order. */
export function normalize(
  req: PlaceOrderRequest,
  idGen: IdGen,
  nowMs: number,
): CanonicalOrder {
  const display = requestDisplay(req);

  if (!isValidOddsPriceCents(display.oddsPriceCents)) {
    throw new RangeError(`Invalid price: ${display.oddsPriceCents}`);
  }
  if (!Number.isInteger(req.size) || req.size <= 0) {
    throw new RangeError(`Invalid size: ${req.size}`);
  }

  const tif = req.tif ?? 'GTC';

  // Unified YES-book mapping:
  //   YES BUY  -> BUY  (bid) @ oddsPriceCents
  //   YES SELL -> SELL (ask) @ oddsPriceCents
  //   NO  BUY  -> SELL (ask) @ 100 - oddsPriceCents
  //   NO  SELL -> BUY  (bid) @ 100 - oddsPriceCents
  const yesAction =
    display.side === 'YES' ? display.action : display.action === 'BUY' ? 'SELL' : 'BUY';
  const yesPriceCents =
    display.side === 'YES' ? display.oddsPriceCents : noPriceCents(display.oddsPriceCents);

  return {
    orderId: idGen.nextOrderId(),
    userId: req.userId,
    marketId: req.marketId,
    yesAction,
    yesPriceCents,
    size: req.size,
    remaining: req.size,
    tif,
    status: 'OPEN',
    createdAtMs: timestampMs(nowMs),
    display,
  };
}

function requestDisplay(req: PlaceOrderRequest): { side: Side; action: Action; oddsPriceCents: PriceCents } {
  if (req.intent !== undefined) {
    if (req.price === undefined) {
      throw new RangeError('Missing price for intent order');
    }
    switch (req.intent) {
      case 'BUY_YES':
        return { side: 'YES', action: 'BUY', oddsPriceCents: req.price };
      case 'SELL_YES':
        return { side: 'YES', action: 'SELL', oddsPriceCents: req.price };
      case 'BUY_NO':
        return { side: 'NO', action: 'BUY', oddsPriceCents: req.price };
      case 'SELL_NO':
        return { side: 'NO', action: 'SELL', oddsPriceCents: req.price };
    }
  }

  if (req.side === undefined || req.action === undefined || req.oddsPriceCents === undefined) {
    throw new RangeError('Order must include either intent/price or side/action/oddsPriceCents');
  }
  return { side: req.side, action: req.action, oddsPriceCents: req.oddsPriceCents };
}
