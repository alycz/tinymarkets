import type {
  Action,
  ApiError,
  MarketId,
  OrderId,
  OrderIntent,
  PlaceOrderRequest,
  PriceCents,
  Side,
  UserId,
} from '@jet/shared';
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

  if (b['type'] !== 'LIMIT') {
    return err('VALIDATION', 'type must be LIMIT');
  }
  if (b['tif'] !== undefined && b['tif'] !== 'GTC' && b['tif'] !== 'IOC') {
    return err('VALIDATION', 'tif must be GTC or IOC');
  }

  const intentResult = parseOrderIntent(b);
  if (!intentResult.ok) return intentResult;

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
      intent: intentResult.value.intent,
      price: intentResult.value.price,
      side: intentResult.value.side,
      action: intentResult.value.action,
      type: 'LIMIT',
      oddsPriceCents: intentResult.value.price,
      size: shares(rawSize),
      tif: (b['tif'] as 'GTC' | 'IOC' | undefined) ?? 'GTC',
      clientOrderId: clientOrderId?.ok ? clientOrderId.value : undefined,
    },
  };
}

type IntentParse = {
  intent: OrderIntent;
  price: PriceCents;
  side: Side;
  action: Action;
};

function parseOrderIntent(body: Record<string, unknown>): Result<IntentParse> {
  const hasIntent = body['intent'] !== undefined || body['price'] !== undefined;
  const hasLegacy =
    body['side'] !== undefined ||
    body['action'] !== undefined ||
    body['oddsPriceCents'] !== undefined;

  let fromIntent: IntentParse | null = null;
  let fromLegacy: IntentParse | null = null;

  if (hasIntent) {
    if (!isOrderIntent(body['intent'])) {
      return err('VALIDATION', 'intent must be BUY_YES, SELL_YES, BUY_NO, or SELL_NO');
    }
    const price = parsePrice(body['price'], 'price');
    if (!price.ok) return price;
    fromIntent = displayFromIntent(body['intent'], price.value);
  }

  if (hasLegacy) {
    if (body['side'] !== 'YES' && body['side'] !== 'NO') {
      return err('VALIDATION', 'side must be YES or NO');
    }
    if (body['action'] !== 'BUY' && body['action'] !== 'SELL') {
      return err('VALIDATION', 'action must be BUY or SELL');
    }
    const price = parsePrice(body['oddsPriceCents'], 'oddsPriceCents');
    if (!price.ok) return price;
    fromLegacy = {
      intent: intentFromDisplay(body['side'], body['action']),
      price: price.value,
      side: body['side'],
      action: body['action'],
    };
  }

  if (!fromIntent && !fromLegacy) {
    return err('VALIDATION', 'Order must include either intent/price or side/action/oddsPriceCents');
  }

  if (fromIntent && fromLegacy) {
    const same =
      fromIntent.intent === fromLegacy.intent &&
      fromIntent.price === fromLegacy.price;
    if (!same) {
      return err('VALIDATION', 'intent/price conflicts with side/action/oddsPriceCents');
    }
  }

  return { ok: true, value: fromIntent ?? fromLegacy! };
}

function parsePrice(value: unknown, field: 'price' | 'oddsPriceCents'): Result<PriceCents> {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 99
  ) {
    return err('INVALID_PRICE', `${field} must be an integer between 1 and 99`);
  }
  return { ok: true, value: oddsPriceCents(value) };
}

function isOrderIntent(value: unknown): value is OrderIntent {
  return (
    value === 'BUY_YES' ||
    value === 'SELL_YES' ||
    value === 'BUY_NO' ||
    value === 'SELL_NO'
  );
}

function displayFromIntent(intent: OrderIntent, price: PriceCents): IntentParse {
  switch (intent) {
    case 'BUY_YES':
      return { intent, price, side: 'YES', action: 'BUY' };
    case 'SELL_YES':
      return { intent, price, side: 'YES', action: 'SELL' };
    case 'BUY_NO':
      return { intent, price, side: 'NO', action: 'BUY' };
    case 'SELL_NO':
      return { intent, price, side: 'NO', action: 'SELL' };
  }
}

function intentFromDisplay(side: Side, action: Action): OrderIntent {
  if (side === 'YES') return action === 'BUY' ? 'BUY_YES' : 'SELL_YES';
  return action === 'BUY' ? 'BUY_NO' : 'SELL_NO';
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
