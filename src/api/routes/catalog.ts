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

  app.get<{ Querystring: { category?: string; search?: string } }>(
    '/inventory',
    { preHandler: requireAuth },
    async (request, reply) => {
      const farmstockUrl = process.env.FARMSTOCK_URL;
      const serviceKey = process.env.FARMSTOCK_SERVICE_KEY;

      if (!farmstockUrl || !serviceKey) {
        return reply.code(503).send({ error: 'Farmstock catalog not configured' });
      }

      try {
        const params = new URLSearchParams();
        if (request.query.category) params.set('category', request.query.category);
        if (request.query.search) params.set('search', request.query.search);
        const qs = params.toString();
        const res = await fetch(
          `${farmstockUrl}/api/items/inventory${qs ? '?' + qs : ''}`,
          { headers: { Authorization: `Service ${serviceKey}` } },
        );
        if (!res.ok) throw new Error(`Farmstock returned ${res.status}`);
        const data = await res.json();
        return reply.send(data);
      } catch (err) {
        return reply.code(502).send({ error: 'Could not reach farmstock inventory' });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/inventory/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const farmstockUrl = process.env.FARMSTOCK_URL;
      const serviceKey = process.env.FARMSTOCK_SERVICE_KEY;

      if (!farmstockUrl || !serviceKey) {
        return reply.code(503).send({ error: 'Farmstock catalog not configured' });
      }

      try {
        const res = await fetch(
          `${farmstockUrl}/api/items/inventory/${request.params.id}`,
          { headers: { Authorization: `Service ${serviceKey}` } },
        );
        if (res.status === 404) return reply.code(404).send({ error: 'Item not found' });
        if (!res.ok) throw new Error(`Farmstock returned ${res.status}`);
        const data = await res.json();
        return reply.send(data);
      } catch (err) {
        return reply.code(502).send({ error: 'Could not reach farmstock inventory' });
      }
    },
  );
};

export default catalogRoutes;
