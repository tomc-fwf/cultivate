import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware.js';

const metrcCsvRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send({ status: 'ok', module: 'metrc-csv' });
  });
};

export default metrcCsvRoutes;
