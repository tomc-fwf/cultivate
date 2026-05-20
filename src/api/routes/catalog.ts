import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware.js';

const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get('/items', { preHandler: requireAuth }, async (_request, reply) => {
    const farmstockUrl = process.env.FARMSTOCK_URL;
    const serviceKey = process.env.FARMSTOCK_SERVICE_KEY;

    if (!farmstockUrl || !serviceKey) {
      return reply.code(503).send({ error: 'Farmstock catalog not configured' });
    }

    try {
      const res = await fetch(`${farmstockUrl}/api/items/catalog`, {
        headers: { Authorization: `Service ${serviceKey}` },
      });
      if (!res.ok) throw new Error(`Farmstock returned ${res.status}`);
      const data = await res.json();
      return reply.send(data);
    } catch (err) {
      return reply.code(502).send({ error: 'Could not reach farmstock catalog' });
    }
  });
};

export default catalogRoutes;
