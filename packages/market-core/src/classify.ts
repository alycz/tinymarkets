import type { Shares, SignedShares, TradeKind } from '@jet/shared';

export interface Segment {
  kind: TradeKind;
  size: Shares;
  buyerPreAtSegment: SignedShares;
  sellerPreAtSegment: SignedShares;
}

export function classifyKind(buyerPre: SignedShares, sellerPre: SignedShares): TradeKind {
  const b = buyerPre as number;
  const s = sellerPre as number;
  if (b >= 0 && s <= 0) return 'OPEN';
  if (b >= 0 && s > 0) return 'TRANSFER_YES';
  if (b < 0 && s <= 0) return 'TRANSFER_NO';
  return 'CLOSE'; // b < 0 && s > 0
}

/**
 * Decompose a match into 1..3 segments at zero-crossings.
 * Greedy: chunk = min(remaining, buyerToZero, sellerToZero).
 */
export function splitMatch(
  buyerPre: SignedShares,
  sellerPre: SignedShares,
  size: Shares,
): Segment[] {
  const segments: Segment[] = [];
  let remaining = size as number;
  let buyerPos = buyerPre as number;
  let sellerPos = sellerPre as number;

  while (remaining > 0) {
    const buyerToZero = buyerPos < 0 ? -buyerPos : Infinity;
    const sellerToZero = sellerPos > 0 ? sellerPos : Infinity;
    const chunk = Math.min(remaining, buyerToZero, sellerToZero);

    segments.push({
      kind: classifyKind(buyerPos as SignedShares, sellerPos as SignedShares),
      size: chunk as Shares,
      buyerPreAtSegment: buyerPos as SignedShares,
      sellerPreAtSegment: sellerPos as SignedShares,
    });

    buyerPos += chunk;
    sellerPos -= chunk;
    remaining -= chunk;
  }

  return segments;
}
