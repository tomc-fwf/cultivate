import Fastify from 'fastify';
import path from 'path';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import authRoutes from './routes/auth.js';
import fertigationRecipesRoutes from './routes/fertigation-recipes.js';
import foliarRecipesRoutes from './routes/foliar-recipes.js';
import catalogRoutes from './routes/catalog.js';
import strainsRoutes from './routes/strains.js';
import batchesRoutes from './routes/batches.js';
import containersRoutes from './routes/containers.js';
import fertigationApplicationsRoutes from './routes/fertigation-applications.js';
import foliarApplicationsRoutes from './routes/foliar-applications.js';
import containerAmendmentsRoutes from './routes/container-amendments.js';
import pesticideApplicationsRoutes from './routes/pesticide-applications.js';
import observationsRoutes from './routes/observations.js';
import plantingPlansRoutes from './routes/planting-plans.js';
import tagAssignmentsRoutes from './routes/tag-assignments.js';
import harvestRoutes from './routes/harvest.js';
import plantLossRoutes from './routes/plant-loss.js';
import containerLifecycleRoutes, { soilSamplesTrackerRoutes } from './routes/container-lifecycle.js';
import exportsRoutes from './routes/exports.js';
import sensorsRoutes from './routes/sensors.js';
import skillsRoutes from './routes/skills.js';
import skillInstancesRoutes from './routes/skill-instances.js';
import analyticsRoutes from './routes/analytics.js';
import locationsRoutes, { adminLocationsRoutes } from './routes/locations.js';
import seedPackagesRoutes from './routes/seed-packages.js';
import metrcTodosRoutes from './routes/metrc-todos.js';
import tasksRoutes from './routes/tasks.js';
import metrcCsvRoutes from './routes/metrc-csv.js';

export async function buildApp(opts: { skipStatic?: boolean } = {}) {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'static.cloudflareinsights.com'],
        connectSrc: ["'self'", 'cloudflareinsights.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  });

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

  await app.register(fastifyCookie);

  if (!opts.skipStatic) {
    await app.register(fastifyStatic, {
      // __dirname is the compiled dist/api/ folder; navigate to client/dist relative to project root
      root: path.join(__dirname, '../../client/dist'),
      prefix: '/',
    });
  }

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(fertigationRecipesRoutes, { prefix: '/api/recipes/fertigation' });
  await app.register(foliarRecipesRoutes, { prefix: '/api/recipes/foliar' });
  await app.register(catalogRoutes, { prefix: '/api/catalog' });
  await app.register(strainsRoutes, { prefix: '/api/strains' });
  await app.register(batchesRoutes, { prefix: '/api/batches' });
  await app.register(containersRoutes, { prefix: '/api/containers' });
  await app.register(fertigationApplicationsRoutes, { prefix: '/api/applications/fertigation' });
  await app.register(foliarApplicationsRoutes, { prefix: '/api/applications/foliar' });
  await app.register(containerAmendmentsRoutes, { prefix: '/api/applications/amendments' });
  await app.register(pesticideApplicationsRoutes, { prefix: '/api/applications/pesticide' });
  await app.register(observationsRoutes, { prefix: '/api/observations' });
  await app.register(plantingPlansRoutes, { prefix: '/api/planting-plans' });
  await app.register(tagAssignmentsRoutes, { prefix: '/api/tag-assignments' });
  await app.register(harvestRoutes, { prefix: '/api/harvest' });
  await app.register(plantLossRoutes, { prefix: '/api/plant-loss' });
  await app.register(containerLifecycleRoutes, { prefix: '/api/containers' });
  await app.register(soilSamplesTrackerRoutes, { prefix: '/api/soil-samples' });
  await app.register(exportsRoutes, { prefix: '/api/exports' });
  await app.register(sensorsRoutes, { prefix: '/api/sensors' });
  await app.register(skillsRoutes, { prefix: '/api/skills' });
  await app.register(skillInstancesRoutes, { prefix: '/api/skill-instances' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(locationsRoutes, { prefix: '/api/locations' });
  await app.register(adminLocationsRoutes, { prefix: '/api/admin' });
  await app.register(seedPackagesRoutes, { prefix: '/api/seed-packages' });
  await app.register(metrcTodosRoutes, { prefix: '/api/metrc-todos' });
  await app.register(tasksRoutes, { prefix: '/api/tasks' });
  await app.register(metrcCsvRoutes, { prefix: '/api/metrc/csv' });

  app.get('/health', async () => ({ status: 'ok', app: 'cultivate' }));

  // Serve SPA index.html for all non-/api routes.
  // Cache-Control: no-cache so Cloudflare/browsers always revalidate index.html
  // on each deploy. Hashed JS/CSS assets are still cached indefinitely by the
  // browser via their content-hash filenames.
  app.setNotFoundHandler(async (request, reply) => {
    if (!request.url.startsWith('/api')) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
