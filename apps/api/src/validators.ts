import type { PlaceOrderRequest, ApiError, MarketId, OrderId, UserId } from '@jet/shared';
import { oddsPriceCents, shares } from '@jet/shared';

type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

const MAX_ID_LENGTH = 128;
const SAFE_ID_RE = /^[A-Za-z0-9._:-]+$/;

export function validatePlaceOrder(body: unknown): Result<PlaceOrderRequest> {
  if (!body || typeof body !== 'object') {
    return err('VALIDATION', 'Request body must be an object');
  }
  const b = body as Record<string, unknown>;

  const userId = validateUserId(b['userId']);
  if (!userId.ok) return userId;

  const marketId = validateMarketId(b['marketId']);
  if (!marketId.ok) return marketId;

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

  const rawPrice = b['oddsPriceCents'];
  if (
    typeof rawPrice !== 'number' ||
    !Number.isInteger(rawPrice) ||
    rawPrice < 1 ||
    rawPrice > 99
  ) {
    return err('INVALID_PRICE', 'oddsPriceCents must be an integer between 1 and 99');
  }

  const rawSize = b['size'];
  if (
    typeof rawSize !== 'number' ||
    !Number.isInteger(rawSize) ||
    rawSize <= 0
  ) {
    return err('INVALID_SIZE', 'size must be a positive integer');
  }

  const clientOrderId =
    b['clientOrderId'] === undefined
      ? undefined
      : validateClientOrderId(b['clientOrderId']);
  if (clientOrderId && !clientOrderId.ok) return clientOrderId;

  return {
    ok: true,
    value: {
      userId: userId.value,
      marketId: marketId.value,
      side: b['side'] as 'YES' | 'NO',
      action: b['action'] as 'BUY' | 'SELL',
      type: 'LIMIT',
      oddsPriceCents: oddsPriceCents(rawPrice),
      size: shares(rawSize),
      tif: (b['tif'] as 'GTC' | 'IOC' | undefined) ?? 'GTC',
      clientOrderId: clientOrderId?.ok ? clientOrderId.value : undefined,
    },
  };
}

export function validateUserId(value: unknown): Result<UserId> {
  return validateId(value, 'userId') as Result<UserId>;
}

export function validateMarketId(value: unknown): Result<MarketId> {
  return validateId(value, 'marketId') as Result<MarketId>;
}

export function validateOrderId(value: unknown): Result<OrderId> {
  return validateId(value, 'orderId') as Result<OrderId>;
}

export function validateClientOrderId(value: unknown): Result<string> {
  return validateId(value, 'clientOrderId');
}

function validateId(value: unknown, field: string): Result<string> {
  if (typeof value !== 'string') {
    return err('VALIDATION', `${field} must be a string`);
  }
  if (value.length === 0) {
    return err('VALIDATION', `${field} is required`);
  }
  if (value.length > MAX_ID_LENGTH) {
    return err('VALIDATION', `${field} must be ${MAX_ID_LENGTH} characters or fewer`);
  }
  if (!SAFE_ID_RE.test(value)) {
    return err('VALIDATION', `${field} may only contain letters, numbers, dot, underscore, colon, or dash`);
  }
  return { ok: true, value };
}

function err(
  code: ApiError['code'],
  message: string,
): { ok: false; error: ApiError } {
  return { ok: false, error: { code, message } };
}
