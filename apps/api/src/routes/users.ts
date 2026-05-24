import type { FastifyInstance } from 'fastify';
import type { MarketSession } from '../session.js';

export function createUsersRoutes(session: MarketSession) {
  return async function (fastify: FastifyInstance) {
    fastify.get<{ Params: { userId: string } }>(
      '/users/:userId',
      async (req, reply) => {
        const { userId } = req.params;
        const snapshot = session.getUserSnapshot(userId);
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
        const { userId } = req.params;
        const snapshot = session.getUserSnapshot(userId);
        if (!snapshot) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
          });
        }
        return reply.send({ ok: true, positions: snapshot.positions });
      },
    );
  };
}
