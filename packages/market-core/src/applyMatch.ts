import type { Balance, Fill, Position } from '@jet/shared';
import type { OrderId, PriceCents, Shares, TimestampMs, TradeId, UserId } from '@jet/shared';
import { signedShares, usdCents } from '@jet/shared';
import type { Segment } from './classify';

export interface ApplySegmentParams {
  segment: Segment;
  tradeId: TradeId;
  buyerOrderId: OrderId;
  sellerOrderId: OrderId;
  buyerUserId: UserId;
  sellerUserId: UserId;
  yesPriceCents: PriceCents;
  ts: TimestampMs;
  buyerBalance: Balance;
  sellerBalance: Balance;
  buyerPosition: Position;
  sellerPosition: Position;
}

export interface ApplySegmentResult {
  buyerFill: Fill;
  sellerFill: Fill;
  openInterestDelta: number;
  buyerRealizedDelta: number;
  sellerRealizedDelta: number;
}

export function applySegment(params: ApplySegmentParams): ApplySegmentResult {
  const {
    segment, tradeId, buyerOrderId, sellerOrderId,
    buyerUserId, sellerUserId, yesPriceCents, ts,
    buyerBalance, sellerBalance, buyerPosition, sellerPosition,
  } = params;

  const { kind, size } = segment;
  const p = yesPriceCents as number;
  const n = size as number;

  // Cash flow per kind
  let buyerDeltaAvail = 0;
  let sellerDeltaAvail = 0;
  let oiDelta = 0;

  switch (kind) {
    case 'OPEN':
      buyerDeltaAvail = -(p * n);
      sellerDeltaAvail = -((100 - p) * n);
      oiDelta = n;
      break;
    case 'TRANSFER_YES':
      buyerDeltaAvail = -(p * n);
      sellerDeltaAvail = p * n;
      break;
    case 'TRANSFER_NO':
      buyerDeltaAvail = (100 - p) * n;
      sellerDeltaAvail = -((100 - p) * n);
      break;
    case 'CLOSE':
      buyerDeltaAvail = (100 - p) * n;
      sellerDeltaAvail = p * n;
      oiDelta = -n;
      break;
  }

  buyerBalance.availableBalanceCents = usdCents((buyerBalance.availableBalanceCents as number) + buyerDeltaAvail);
  sellerBalance.availableBalanceCents = usdCents((sellerBalance.availableBalanceCents as number) + sellerDeltaAvail);

  // Capture pre-trade nets for avg entry and realized PnL calculation
  const buyerPreNet = buyerPosition.net as number;
  const sellerPreNet = sellerPosition.net as number;

  // Position deltas (always: buyer +n, seller -n)
  buyerPosition.net = signedShares(buyerPreNet + n);
  sellerPosition.net = signedShares(sellerPreNet - n);

  // avgEntryPriceCents and realized PnL
  let buyerRealizedDelta = 0;
  let sellerRealizedDelta = 0;

  if (kind === 'OPEN' || kind === 'TRANSFER_YES') {
    // Buyer growing long YES
    const absPreNet = Math.abs(buyerPreNet);
    const oldAvg = buyerPosition.avgEntryPriceCents as number;
    buyerPosition.avgEntryPriceCents = (absPreNet === 0
      ? p
      : Math.round((absPreNet * oldAvg + n * p) / (absPreNet + n))) as PriceCents;
  } else {
    // Buyer shrinking long NO (TRANSFER_NO or CLOSE): avg entry unchanged, realize PnL
    // Entered NO at (100 - avgEntry), exiting at (100 - p). PnL = avgEntry - p per share.
    buyerRealizedDelta = ((buyerPosition.avgEntryPriceCents as number) - p) * n;
  }

  if (kind === 'OPEN' || kind === 'TRANSFER_NO') {
    // Seller growing long NO (selling YES)
    const absPreNet = Math.abs(sellerPreNet);
    const oldAvg = sellerPosition.avgEntryPriceCents as number;
    sellerPosition.avgEntryPriceCents = (absPreNet === 0
      ? p
      : Math.round((absPreNet * oldAvg + n * p) / (absPreNet + n))) as PriceCents;
  } else {
    // Seller shrinking long YES (TRANSFER_YES or CLOSE): avg entry unchanged, realize PnL
    // Entered YES at avgEntry, exiting at p. PnL = p - avgEntry per share.
    sellerRealizedDelta = (p - (sellerPosition.avgEntryPriceCents as number)) * n;
  }

  buyerBalance.realizedPnlCents += buyerRealizedDelta;
  sellerBalance.realizedPnlCents += sellerRealizedDelta;

  const buyerFill: Fill = {
    tradeId,
    orderId: buyerOrderId,
    userId: buyerUserId,
    yesAction: 'BUY',
    yesPriceCents,
    size,
    kind,
    positionAfter: buyerPosition.net,
    balanceAfter: buyerBalance.availableBalanceCents,
    ts,
  };

  const sellerFill: Fill = {
    tradeId,
    orderId: sellerOrderId,
    userId: sellerUserId,
    yesAction: 'SELL',
    yesPriceCents,
    size,
    kind,
    positionAfter: sellerPosition.net,
    balanceAfter: sellerBalance.availableBalanceCents,
    ts,
  };

  return { buyerFill, sellerFill, openInterestDelta: oiDelta, buyerRealizedDelta, sellerRealizedDelta };
}
