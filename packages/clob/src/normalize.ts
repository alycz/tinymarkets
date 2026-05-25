import type { CanonicalOrder, PlaceOrderRequest } from '@jet/shared';
import { isValidOddsPriceCents, noPriceCents, timestampMs } from '@jet/shared';
import type { IdGen } from './ids';

/** Converts a user-facing PlaceOrderRequest into a canonical YES-book order. */
export function normalize(
  req: PlaceOrderRequest,
  idGen: IdGen,
  nowMs: number,
): CanonicalOrder {
  if (!isValidOddsPriceCents(req.oddsPriceCents)) {
    throw new RangeError(`Invalid oddsPriceCents: ${req.oddsPriceCents}`);
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
    req.side === 'YES' ? req.action : req.action === 'BUY' ? 'SELL' : 'BUY';
  const yesPriceCents =
    req.side === 'YES' ? req.oddsPriceCents : noPriceCents(req.oddsPriceCents);

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
    display: { side: req.side, action: req.action, oddsPriceCents: req.oddsPriceCents },
  };
}
