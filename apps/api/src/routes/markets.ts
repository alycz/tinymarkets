import type { FastifyInstance } from 'fastify';
import type { MarketId } from '@jet/shared';
import type { MarketSession } from '../session.js';

export function createMarketsRoutes(session: MarketSession) {
  return async function (fastify: FastifyInstance) {
    fastify.get('/markets/current', async (_req, reply) => {
      const state = session.getMarketState();
      if (!state) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'UNKNOWN_MARKET', message: 'No active market' },
        });
      }
      return reply.send({ ok: true, market: state });
    });

    fastify.post('/markets/start-demo', async (_req, reply) => {
      const state = session.startDemo();
      return reply.send({ ok: true, market: state });
    });

    fastify.post<{ Params: { marketId: string } }>(
      '/markets/:marketId/oracle/demo-spike',
      async (req, reply) => {
        const result = session.armDemoSpike(req.params.marketId as MarketId);
        if (!result.ok) {
          const status = result.error.code === 'UNKNOWN_MARKET' ? 404 : 409;
          return reply.status(status).send(result);
        }
        return reply.send(result);
      },
    );

    fastify.get<{ Params: { marketId: string } }>(
      '/markets/:marketId',
      async (req, reply) => {
        const state = session.getMarketState();
        if (!state || state.config.marketId !== req.params.marketId) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'Market not found' },
          });
        }
        return reply.send({ ok: true, market: state });
      },
    );

    fastify.get<{ Params: { marketId: string } }>(
      '/markets/:marketId/orderbook',
      async (req, reply) => {
        const state = session.getMarketState();
        if (!state || state.config.marketId !== req.params.marketId) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'Market not found' },
          });
        }
        const book = session.getOrderBookSnapshot();
        if (!book) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'No order book available' },
          });
        }
        return reply.send({ ok: true, book });
      },
    );

    fastify.get<{
      Params: { marketId: string };
      Querystring: { limit?: string };
    }>(
      '/markets/:marketId/trades',
      async (req, reply) => {
        const state = session.getMarketState();
        if (!state || state.config.marketId !== req.params.marketId) {
          return reply.status(404).send({
            ok: false,
            error: { code: 'UNKNOWN_MARKET', message: 'Market not found' },
          });
        }
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const trades = session.getRecentTrades(limit);
        return reply.send({ ok: true, trades });
      },
    );
  };
}
