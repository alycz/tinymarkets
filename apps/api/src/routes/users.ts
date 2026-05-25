import type { FastifyInstance } from 'fastify';
import type { MarketSession } from '../session.js';
import { validateUserId } from '../validators.js';

export function createUsersRoutes(session: MarketSession) {
  return async function (fastify: FastifyInstance) {
    fastify.get<{ Params: { userId: string } }>(
      '/users/:userId',
      async (req, reply) => {
        const userId = validateUserId(req.params.userId);
        if (!userId.ok) {
          return reply.status(400).send({ ok: false, error: userId.error });
        }

        const snapshot = session.getUserSnapshot(userId.value);
        if (!snapshot) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
          });
        }
        return reply.send({ ok: true, snapshot });
      },
    );

    fastify.get<{ Params: { userId: string } }>(
      '/users/:userId/positions',
      async (req, reply) => {
        const userId = validateUserId(req.params.userId);
        if (!userId.ok) {
          return reply.status(400).send({ ok: false, error: userId.error });
        }

        const snapshot = session.getUserSnapshot(userId.value);
        if (!snapshot) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
          });
        }
        return reply.send({ ok: true, positions: snapshot.positions });
      },
    );

    fastify.get<{ Params: { userId: string } }>(
      '/users/:userId/balance',
      async (req, reply) => {
        const userId = validateUserId(req.params.userId);
        if (!userId.ok) {
          return reply.status(400).send({ ok: false, error: userId.error });
        }

        const snapshot = session.getUserSnapshot(userId.value);
        if (!snapshot) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
          });
        }
        return reply.send({ ok: true, balance: snapshot.balance });
      },
    );

    fastify.get<{ Params: { userId: string } }>(
      '/users/:userId/orders',
      async (req, reply) => {
        const userId = validateUserId(req.params.userId);
        if (!userId.ok) {
          return reply.status(400).send({ ok: false, error: userId.error });
        }

        const snapshot = session.getUserSnapshot(userId.value);
        if (!snapshot) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
          });
        }
        return reply.send({ ok: true, orders: snapshot.openOrders });
      },
    );
  };
}
