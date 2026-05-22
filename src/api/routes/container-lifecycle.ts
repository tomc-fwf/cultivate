import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

interface ContainerParams { containerId: string }
interface TeardownParams { containerId: string; teardownId: string }
interface SampleParams { containerId: string; sampleId: string }
interface StartupParams { containerId: string; startupId: string }

const TeardownBodySchema = z.object({
  batch_id: z.number().int().positive(),
  plant_removed: z.boolean().default(false),
  debris_disposed: z.boolean().default(false),
  container_cleaned: z.boolean().default(false),
  soil_sample_collected: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

const TeardownPatchSchema = z.object({
  plant_removed: z.boolean().optional(),
  debris_disposed: z.boolean().optional(),
  container_cleaned: z.boolean().optional(),
  soil_sample_collected: z.boolean().optional(),
  soil_sample_id: z.number().int().positive().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SoilSampleBodySchema = z.object({
  sample_type: z.enum(['individual', 'composite_row', 'composite_subzone']),
  sample_label: z.string().min(1),
  teardown_id: z.number().int().positive().nullable().optional(),
  lab_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SoilResultItemSchema = z.object({
  parameter: z.string().min(1),
  value: z.number(),
  unit: z.string().nullable().optional(),
  reference_low: z.number().nullable().optional(),
  reference_high: z.number().nullable().optional(),
  interpretation: z.enum(['deficient', 'low', 'optimal', 'high', 'excessive', 'unknown']).nullable().optional(),
  notes: z.string().nullable().optional(),
});

const StartupBodySchema = z.object({
  prior_teardown_id: z.number().int().positive().nullable().optional(),
  prior_soil_sample_id: z.number().int().positive().nullable().optional(),
  media_replaced_pct: z.number().min(0).max(100).nullable().optional(),
  media_brand: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const ReadySignOffSchema = z.object({
  notes: z.string().nullable().optional(),
});

const containerLifecycleRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /:containerId/teardown
   * Initiate teardown for a container in 'active' or 'empty' state.
   */
  app.post<{ Params: ContainerParams }>(
    '/:containerId/teardown',
    { preHandler: requireAuth },
    async (request, reply) => {
      const containerId = request.params.containerId;

      let body: z.infer<typeof TeardownBodySchema>;
      try {
        body = TeardownBodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) return reply.code(404).send({ error: `Container "${containerId}" not found` });

      const state = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(containerId) as Record<string, unknown> | undefined;
      if (!state) return reply.code(404).send({ error: 'Container state not found' });

      const currentState = state['current_state'] as string;
      if (currentState !== 'active' && currentState !== 'empty') {
        return reply.code(400).send({
          error: `Container must be 'active' or 'empty' to begin teardown; currently: ${currentState}`,
        });
      }

      if (state['current_batch_id'] !== body.batch_id) {
        return reply.code(400).send({
          error: `batch_id ${body.batch_id} does not match container's current batch (${state['current_batch_id']})`,
        });
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const userId = request.user.id;

      const { teardown_id } = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO cv_teardown_events
            (container_id, batch_id, started_at, plant_removed, debris_disposed,
             container_cleaned, soil_sample_collected, performed_by, notes, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          containerId, body.batch_id, now,
          body.plant_removed ? 1 : 0,
          body.debris_disposed ? 1 : 0,
          body.container_cleaned ? 1 : 0,
          body.soil_sample_collected ? 1 : 0,
          userId, body.notes ?? null, now, userId,
        );

        db.prepare(`
          UPDATE cv_container_state
          SET current_state = 'teardown', state_since = ?, last_teardown_date = ?, updated_at = ?
          WHERE container_id = ?
        `).run(now, today, now, containerId);

        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, created_at)
          VALUES (?, ?, 'teardown', ?, ?, ?, 'batch_closed', ?)
        `).run(containerId, currentState, now, userId, body.batch_id, now);

        return { teardown_id: Number(ins.lastInsertRowid) };
      })();

      const teardown = db.prepare(`
        SELECT t.*, u.name AS performed_by_name
        FROM cv_teardown_events t
        LEFT JOIN cv_users u ON u.id = t.performed_by
        WHERE t.teardown_id = ?
      `).get(teardown_id) as Record<string, unknown>;

      return reply.code(201).send(teardown);
    },
  );

  /**
   * PATCH /:containerId/teardown/:teardownId
   * Update teardown checklist items.
   */
  app.patch<{ Params: TeardownParams }>(
    '/:containerId/teardown/:teardownId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { containerId, teardownId } = request.params;

      let body: z.infer<typeof TeardownPatchSchema>;
      try {
        body = TeardownPatchSchema.parse(request.body);
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const teardown = db.prepare(
        'SELECT * FROM cv_teardown_events WHERE teardown_id = ? AND container_id = ?',
      ).get(Number(teardownId), containerId) as Record<string, unknown> | undefined;
      if (!teardown) return reply.code(404).send({ error: 'Teardown event not found' });

      const setClauses: string[] = [];
      const values: unknown[] = [];

      if ('plant_removed' in body && body.plant_removed !== undefined) {
        setClauses.push('plant_removed = ?'); values.push(body.plant_removed ? 1 : 0);
      }
      if ('debris_disposed' in body && body.debris_disposed !== undefined) {
        setClauses.push('debris_disposed = ?'); values.push(body.debris_disposed ? 1 : 0);
      }
      if ('container_cleaned' in body && body.container_cleaned !== undefined) {
        setClauses.push('container_cleaned = ?'); values.push(body.container_cleaned ? 1 : 0);
      }
      if ('soil_sample_collected' in body && body.soil_sample_collected !== undefined) {
        setClauses.push('soil_sample_collected = ?'); values.push(body.soil_sample_collected ? 1 : 0);
      }
      if ('soil_sample_id' in body) {
        setClauses.push('soil_sample_id = ?'); values.push(body.soil_sample_id ?? null);
      }
      if ('completed_at' in body) {
        setClauses.push('completed_at = ?'); values.push(body.completed_at ?? null);
      }
      if ('notes' in body) {
        setClauses.push('notes = ?'); values.push(body.notes ?? null);
      }

      if (setClauses.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      db.prepare(`UPDATE cv_teardown_events SET ${setClauses.join(', ')} WHERE teardown_id = ?`)
        .run(...values, Number(teardownId));

      const updated = db.prepare(`
        SELECT t.*, u.name AS performed_by_name
        FROM cv_teardown_events t
        LEFT JOIN cv_users u ON u.id = t.performed_by
        WHERE t.teardown_id = ?
      `).get(Number(teardownId)) as Record<string, unknown>;

      return reply.send(updated);
    },
  );

  /**
   * POST /:containerId/soil-samples
   * Create a soil sample for a container.
   */
  app.post<{ Params: ContainerParams }>(
    '/:containerId/soil-samples',
    { preHandler: requireAuth },
    async (request, reply) => {
      const containerId = request.params.containerId;

      let body: z.infer<typeof SoilSampleBodySchema>;
      try {
        body = SoilSampleBodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) return reply.code(404).send({ error: `Container "${containerId}" not found` });

      const now = new Date().toISOString();
      const userId = request.user.id;

      const { sample_id } = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO cv_soil_samples
            (container_id, sample_type, sampled_at, sampled_by, sample_label,
             teardown_id, lab_name, notes, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          containerId, body.sample_type, now, userId, body.sample_label,
          body.teardown_id ?? null, body.lab_name ?? null, body.notes ?? null, now, userId,
        );

        if (body.teardown_id) {
          db.prepare(`
            UPDATE cv_teardown_events
            SET soil_sample_id = ?, soil_sample_collected = 1
            WHERE teardown_id = ? AND container_id = ?
          `).run(ins.lastInsertRowid, body.teardown_id, containerId);
        }

        return { sample_id: Number(ins.lastInsertRowid) };
      })();

      const sample = db.prepare('SELECT * FROM cv_soil_samples WHERE sample_id = ?').get(sample_id) as Record<string, unknown>;
      return reply.code(201).send(sample);
    },
  );

  /**
   * GET /:containerId/soil-samples
   * List soil samples for a container, newest first, including results.
   */
  app.get<{ Params: ContainerParams }>(
    '/:containerId/soil-samples',
    { preHandler: requireAuth },
    async (request, reply) => {
      const containerId = request.params.containerId;
      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) return reply.code(404).send({ error: `Container "${containerId}" not found` });

      const samples = db.prepare(`
        SELECT * FROM cv_soil_samples WHERE container_id = ? ORDER BY sampled_at DESC
      `).all(containerId) as Array<Record<string, unknown>>;

      if (samples.length === 0) return reply.send([]);

      const sampleIds = samples.map(s => s['sample_id'] as number);
      const placeholders = sampleIds.map(() => '?').join(', ');
      const allResults = db.prepare(`
        SELECT * FROM cv_soil_sample_results
        WHERE sample_id IN (${placeholders})
        ORDER BY sample_id, parameter
      `).all(...sampleIds) as Array<Record<string, unknown>>;

      const resultsBySample = new Map<number, Array<Record<string, unknown>>>();
      for (const r of allResults) {
        const sid = r['sample_id'] as number;
        if (!resultsBySample.has(sid)) resultsBySample.set(sid, []);
        resultsBySample.get(sid)!.push(r);
      }

      const enriched = samples.map(s => ({
        ...s,
        results: resultsBySample.get(s['sample_id'] as number) ?? [],
      }));

      return reply.send(enriched);
    },
  );

  /**
   * POST /:containerId/soil-samples/:sampleId/results
   * Add lab results to a soil sample. Body: array of result objects OR { results: [...] }.
   */
  app.post<{ Params: SampleParams }>(
    '/:containerId/soil-samples/:sampleId/results',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { containerId, sampleId } = request.params;

      let items: z.infer<typeof SoilResultItemSchema>[];
      try {
        const raw = request.body;
        if (Array.isArray(raw)) {
          items = z.array(SoilResultItemSchema).min(1).parse(raw);
        } else {
          const wrapped = z.object({ results: z.array(SoilResultItemSchema).min(1) }).parse(raw);
          items = wrapped.results;
        }
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const sample = db.prepare(
        'SELECT * FROM cv_soil_samples WHERE sample_id = ? AND container_id = ?',
      ).get(Number(sampleId), containerId) as Record<string, unknown> | undefined;
      if (!sample) return reply.code(404).send({ error: 'Soil sample not found' });

      const now = new Date().toISOString();

      db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO cv_soil_sample_results
            (sample_id, parameter, value, unit, reference_low, reference_high, interpretation, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          ins.run(
            Number(sampleId), item.parameter, item.value,
            item.unit ?? null, item.reference_low ?? null, item.reference_high ?? null,
            item.interpretation ?? null, item.notes ?? null, now,
          );
        }

        db.prepare(
          'UPDATE cv_soil_samples SET results_received = 1, lab_results_at = ? WHERE sample_id = ?',
        ).run(now, Number(sampleId));
      })();

      const results = db.prepare(
        'SELECT * FROM cv_soil_sample_results WHERE sample_id = ? ORDER BY parameter',
      ).all(Number(sampleId)) as Array<Record<string, unknown>>;

      return reply.code(201).send({ sample_id: Number(sampleId), results });
    },
  );

  /**
   * POST /:containerId/startup
   * Initiate startup for a container in 'teardown' state.
   */
  app.post<{ Params: ContainerParams }>(
    '/:containerId/startup',
    { preHandler: requireAuth },
    async (request, reply) => {
      const containerId = request.params.containerId;

      let body: z.infer<typeof StartupBodySchema>;
      try {
        body = StartupBodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) return reply.code(404).send({ error: `Container "${containerId}" not found` });

      const state = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(containerId) as Record<string, unknown> | undefined;
      if (!state) return reply.code(404).send({ error: 'Container state not found' });

      if (state['current_state'] !== 'teardown') {
        return reply.code(400).send({
          error: `Container must be in 'teardown' state to begin startup; currently: ${state['current_state']}`,
        });
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const userId = request.user.id;

      const { startup_id } = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO cv_startup_events
            (container_id, prior_teardown_id, prior_soil_sample_id, started_at,
             media_replaced_pct, media_brand, performed_by, notes, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          containerId,
          body.prior_teardown_id ?? null,
          body.prior_soil_sample_id ?? null,
          now,
          body.media_replaced_pct ?? null,
          body.media_brand ?? null,
          userId,
          body.notes ?? null,
          now,
          userId,
        );

        db.prepare(`
          UPDATE cv_container_state
          SET current_state = 'startup', state_since = ?, last_startup_date = ?,
              current_batch_id = NULL, updated_at = ?
          WHERE container_id = ?
        `).run(now, today, now, containerId);

        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, created_at)
          VALUES (?, 'teardown', 'startup', ?, ?, NULL, 'teardown_complete', ?)
        `).run(containerId, now, userId, now);

        return { startup_id: Number(ins.lastInsertRowid) };
      })();

      const startup = db.prepare(`
        SELECT se.*, u.name AS performed_by_name
        FROM cv_startup_events se
        LEFT JOIN cv_users u ON u.id = se.performed_by
        WHERE se.startup_id = ?
      `).get(startup_id) as Record<string, unknown>;

      return reply.code(201).send(startup);
    },
  );

  /**
   * POST /:containerId/startup/:startupId/ready
   * Supervisor sign-off: container is ready for next batch.
   */
  app.post<{ Params: StartupParams }>(
    '/:containerId/startup/:startupId/ready',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const { containerId, startupId } = request.params;

      let body: z.infer<typeof ReadySignOffSchema>;
      try {
        body = ReadySignOffSchema.parse(request.body);
      } catch (err) {
        if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
        throw err;
      }

      const db = getDB();

      const state = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(containerId) as Record<string, unknown> | undefined;
      if (!state) return reply.code(404).send({ error: `Container "${containerId}" not found` });

      if (state['current_state'] !== 'startup') {
        return reply.code(400).send({
          error: `Container must be in 'startup' state to sign off; currently: ${state['current_state']}`,
        });
      }

      const startup = db.prepare(
        'SELECT * FROM cv_startup_events WHERE startup_id = ? AND container_id = ?',
      ).get(Number(startupId), containerId) as Record<string, unknown> | undefined;
      if (!startup) return reply.code(404).send({ error: 'Startup event not found' });

      const now = new Date().toISOString();
      const userId = request.user.id;

      db.transaction(() => {
        db.prepare(`
          UPDATE cv_startup_events
          SET ready_sign_off_at = ?, ready_sign_off_by = ?, completed_at = ?
          WHERE startup_id = ?
        `).run(now, userId, now, Number(startupId));

        db.prepare(`
          UPDATE cv_container_state
          SET current_state = 'ready', state_since = ?, current_batch_id = NULL, updated_at = ?
          WHERE container_id = ?
        `).run(now, now, containerId);

        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, notes, created_at)
          VALUES (?, 'startup', 'ready', ?, ?, NULL, 'startup_complete', ?, ?)
        `).run(containerId, now, userId, body.notes ?? null, now);
      })();

      const updated = db.prepare(`
        SELECT se.*,
               u1.name AS performed_by_name,
               u2.name AS ready_sign_off_by_name
        FROM cv_startup_events se
        LEFT JOIN cv_users u1 ON u1.id = se.performed_by
        LEFT JOIN cv_users u2 ON u2.id = se.ready_sign_off_by
        WHERE se.startup_id = ?
      `).get(Number(startupId)) as Record<string, unknown>;

      return reply.send(updated);
    },
  );
};

export default containerLifecycleRoutes;

/**
 * GET /api/soil-samples?status=awaiting_collection|at_lab|results_received
 * Global soil sample tracker — shows pipeline across all containers.
 */
export const soilSamplesTrackerRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { status?: string } }>(
    '/',
    { preHandler: requireAuth },
    async (request, reply) => {
      const status = (request.query as { status?: string }).status ?? 'at_lab';

      const VALID_STATUSES = ['awaiting_collection', 'at_lab', 'results_received'];
      if (!VALID_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      const db = getDB();

      if (status === 'awaiting_collection') {
        // Containers in teardown state where the most recent teardown has soil_sample_collected = 0
        const rows = db.prepare(`
          SELECT cs.container_id, r.sub_zone_id, cs.current_state, cs.state_since,
                 te.teardown_id, te.started_at AS teardown_started_at, te.soil_sample_collected
          FROM cv_container_state cs
          JOIN cv_containers c ON c.container_id = cs.container_id
          JOIN cv_rows r ON r.row_id = c.row_id
          LEFT JOIN cv_teardown_events te ON te.teardown_id = (
            SELECT MAX(teardown_id) FROM cv_teardown_events WHERE container_id = cs.container_id
          )
          WHERE cs.current_state = 'teardown'
            AND (te.soil_sample_collected = 0 OR te.teardown_id IS NULL)
          ORDER BY cs.state_since ASC
        `).all() as Array<Record<string, unknown>>;

        return reply.send(rows);
      }

      if (status === 'at_lab') {
        // Samples sent to lab, results not yet received
        const rows = db.prepare(`
          SELECT ss.sample_id, ss.container_id, ss.sample_label, ss.lab_name,
                 ss.lab_sent_at, ss.notes, r.sub_zone_id, cs.current_state,
                 CAST((julianday('now') - julianday(ss.lab_sent_at)) AS INTEGER) AS days_waiting
          FROM cv_soil_samples ss
          JOIN cv_containers c ON c.container_id = ss.container_id
          JOIN cv_rows r ON r.row_id = c.row_id
          JOIN cv_container_state cs ON cs.container_id = ss.container_id
          WHERE ss.results_received = 0 AND ss.lab_sent_at IS NOT NULL
          ORDER BY ss.lab_sent_at ASC
        `).all() as Array<Record<string, unknown>>;

        return reply.send(rows);
      }

      // results_received — last 90 days
      const samples = db.prepare(`
        SELECT ss.sample_id, ss.container_id, ss.sample_label, ss.lab_name,
               ss.lab_sent_at, ss.lab_results_at, ss.notes, r.sub_zone_id, cs.current_state
        FROM cv_soil_samples ss
        JOIN cv_containers c ON c.container_id = ss.container_id
        JOIN cv_rows r ON r.row_id = c.row_id
        JOIN cv_container_state cs ON cs.container_id = ss.container_id
        WHERE ss.results_received = 1
          AND ss.lab_results_at >= datetime('now', '-90 days')
        ORDER BY ss.lab_results_at DESC
      `).all() as Array<Record<string, unknown>>;

      if (samples.length === 0) return reply.send([]);

      // Attach key parameters (pH, EC) for summary display
      const sampleIds = samples.map(s => s['sample_id'] as number);
      const placeholders = sampleIds.map(() => '?').join(', ');
      const keyResults = db.prepare(`
        SELECT sample_id, parameter, value, unit, interpretation
        FROM cv_soil_sample_results
        WHERE sample_id IN (${placeholders})
          AND parameter IN ('pH', 'EC')
        ORDER BY sample_id, parameter
      `).all(...sampleIds) as Array<Record<string, unknown>>;

      const resultsBySample = new Map<number, Array<Record<string, unknown>>>();
      for (const r of keyResults) {
        const sid = r['sample_id'] as number;
        if (!resultsBySample.has(sid)) resultsBySample.set(sid, []);
        resultsBySample.get(sid)!.push(r);
      }

      const enriched = samples.map(s => ({
        ...s,
        key_results: resultsBySample.get(s['sample_id'] as number) ?? [],
      }));

      return reply.send(enriched);
    },
  );
};
