import type { PlaceOrderRequest, ApiError } from '@jet/shared';
import { priceCents, shares } from '@jet/shared';

type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export function validatePlaceOrder(body: unknown): Result<PlaceOrderRequest> {
  if (!body || typeof body !== 'object') {
    return err('VALIDATION', 'Request body must be an object');
  }
  const b = body as Record<string, unknown>;

  if (!b['userId'] || typeof b['userId'] !== 'string') {
    return err('VALIDATION', 'userId is required');
  }
  if (!b['marketId'] || typeof b['marketId'] !== 'string') {
    return err('VALIDATION', 'marketId is required');
  }
  if (b['side'] !== 'YES' && b['side'] !== 'NO') {
    return err('VALIDATION', 'side must be YES or NO');
  }
  if (b['action'] !== 'BUY' && b['action'] !== 'SELL') {
    return err('VALIDATION', 'action must be BUY or SELL');
  }
  if (b['type'] !== 'LIMIT') {
    return err('VALIDATION', 'type must be LIMIT');
  }
  if (b['tif'] !== undefined && b['tif'] !== 'GTC' && b['tif'] !== 'IOC') {
    return err('VALIDATION', 'tif must be GTC or IOC');
  }

  const rawPrice = b['priceCents'];
  if (
    typeof rawPrice !== 'number' ||
    !Number.isInteger(rawPrice) ||
    rawPrice < 1 ||
    rawPrice > 99
  ) {
    return err('INVALID_PRICE', 'priceCents must be an integer between 1 and 99');
  }

  const rawSize = b['size'];
  if (
    typeof rawSize !== 'number' ||
    !Number.isInteger(rawSize) ||
    rawSize <= 0
  ) {
    return err('INVALID_SIZE', 'size must be a positive integer');
  }

  return {
    ok: true,
    value: {
      userId: b['userId'] as string,
      marketId: b['marketId'] as string,
      side: b['side'] as 'YES' | 'NO',
      action: b['action'] as 'BUY' | 'SELL',
      type: 'LIMIT',
      priceCents: priceCents(rawPrice),
      size: shares(rawSize),
      tif: (b['tif'] as 'GTC' | 'IOC' | undefined) ?? 'GTC',
      clientOrderId: typeof b['clientOrderId'] === 'string' ? b['clientOrderId'] : undefined,
    },
  };
}

function err(
  code: ApiError['code'],
  message: string,
): { ok: false; error: ApiError } {
  return { ok: false, error: { code, message } };
}
