import type { FastifyInstance } from 'fastify';
import type { MarketSession } from '../session.js';
import { validateOrderId, validatePlaceOrder, validateUserId } from '../validators.js';

export function createOrdersRoutes(session: MarketSession) {
  return async function (fastify: FastifyInstance) {
    fastify.post('/orders', async (req, reply) => {
      const validation = validatePlaceOrder(req.body);
      if (!validation.ok) {
        return reply.status(400).send({ ok: false, error: validation.error });
      }

      const result = session.placeOrder(validation.value);
      if (!result.ok) {
        const status = result.error.code === 'UNKNOWN_MARKET' ? 404 : 422;
        return reply.status(status).send(result);
      }
      return reply.send(result);
    });

    fastify.post<{ Params: { orderId: string } }>(
      '/orders/:orderId/cancel',
      async (req, reply) => {
        const orderId = validateOrderId(req.params.orderId);
        if (!orderId.ok) {
          return reply.status(400).send({ ok: false, error: orderId.error });
        }

        const body = req.body as Record<string, unknown> | null;
        const query = req.query as Record<string, unknown>;
        const userId = validateUserId(body?.['userId'] ?? query['userId']);

        if (!userId.ok) {
          return reply.status(400).send({ ok: false, error: userId.error });
        }

        const result = session.cancelOrder(orderId.value, userId.value);
        if (!result.ok) {
          const status =
            result.error.code === 'UNKNOWN_ORDER' ? 404
            : result.error.code === 'NOT_ORDER_OWNER' ? 403
            : 422;
          return reply.status(status).send(result);
        }
        return reply.send(result);
      },
    );
  };
}
