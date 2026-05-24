import type { FastifyInstance } from 'fastify';
import type { MarketMachine } from '../market-machine.js';

export function createMarketsRoutes(machine: MarketMachine) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/markets/current', async (_req, reply) => {
      const state = machine.getCurrentState();
      if (!state) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
        });
      }
      return reply.send({ ok: true, market: state });
    });

    fastify.post('/markets/start-demo', async (_req, reply) => {
      const state = machine.startDemo();
      return reply.send({ ok: true, market: state });
    });
  };
}
