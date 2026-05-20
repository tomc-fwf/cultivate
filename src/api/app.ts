import Fastify from 'fastify';
import path from 'path';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import authRoutes from './routes/auth.js';
import fertigationRecipesRoutes from './routes/fertigation-recipes.js';
import catalogRoutes from './routes/catalog.js';

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(fastifyHelmet);

  await app.register(fastifyCors, {
    origin: process.env.ALLOWED_ORIGIN ?? true,
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? 'cultivate-dev-secret',
    sign: { expiresIn: '7d' },
  });

  await app.register(fastifyStatic, {
    // __dirname is the compiled dist/api/ folder; navigate to client/dist relative to project root
    root: path.join(__dirname, '../../client/dist'),
    prefix: '/',
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(fertigationRecipesRoutes, { prefix: '/api/recipes/fertigation' });
  await app.register(catalogRoutes, { prefix: '/api/catalog' });

  app.get('/health', async () => ({ status: 'ok', app: 'cultivate' }));

  // Serve SPA index.html for all non-/api routes
  app.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
