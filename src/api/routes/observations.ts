import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';

interface IdParams { id: string }

const ObservationCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  row_id: z.string().nullable().optional(),
  container_id: z.string().nullable().optional(),
  observed_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'observed_at must be a valid ISO datetime' }).optional(),
  category: z.enum(['healthy', 'pest', 'deficiency', 'disease', 'damage', 'harvest_readiness', 'other']),
  severity: z.enum(['low', 'medium', 'high']).nullable().optional(),
  note: z.string().nullable().optional(),
  maturity_pct: z.number().int().min(0).max(100).nullable().optional(),
  ready_to_harvest: z.number().nullable().optional(),
  harvest_priority: z.number().int().nullable().optional(),
  triggered_app_id: z.string().nullable().optional(),
});
type ObservationCreateBody = z.infer<typeof ObservationCreateSchema>;

const ObservationUpdateSchema = z.object({
  observed_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'observed_at must be a valid ISO datetime' }).optional(),
  category: z.enum(['healthy', 'pest', 'deficiency', 'disease', 'damage', 'harvest_readiness', 'other']).optional(),
  severity: z.enum(['low', 'medium', 'high']).nullable().optional(),
  note: z.string().nullable().optional(),
  maturity_pct: z.number().int().min(0).max(100).nullable().optional(),
  ready_to_harvest: z.number().nullable().optional(),
  harvest_priority: z.number().int().nullable().optional(),
  resolved_at: z.string().nullable().optional(),
  resolution_note: z.string().nullable().optional(),
});
type ObservationUpdateBody = z.infer<typeof ObservationUpdateSchema>;

const VALID_CATEGORIES = new Set([
  'healthy', 'pest', 'deficiency', 'disease', 'damage',
  'harvest_readiness', 'other',
]);

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

function isEditable(observedAt: string): boolean {
  return Date.now() - new Date(observedAt).getTime() < 24 * 60 * 60 * 1000;
}

function dateClause(date: string): { sql: string; params: unknown[] } {
  const now = new Date();
  if (!date || date === 'today') {
    const today = now.toISOString().slice(0, 10);
    return { sql: "date(o.observed_at) = date(?)", params: [today] };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { sql: "date(o.observed_at) = date(?)", params: [date] };
  }
  if (date === '7d') return { sql: "o.observed_at >= datetime('now', '-7 days')", params: [] };
  if (date === '30d') return { sql: "o.observed_at >= datetime('now', '-30 days')", params: [] };
  const today = now.toISOString().slice(0, 10);
  return { sql: "date(o.observed_at) = date(?)", params: [today] };
}

const observationsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /readiness-summary — per-row harvest readiness summary for a batch.
   * Uses the most recent harvest_readiness observation per container.
   * Query: ?batch_id (required)
   */
  app.get('/readiness-summary', { preHandler: requireAuth }, async (request, reply) => {
    const { batch_id } = request.query as { batch_id?: string };
    if (!batch_id || isNaN(Number(batch_id))) {
      return reply.code(400).send({ error: 'batch_id is required' });
    }

    const db = getDB();

    // Most recent harvest_readiness observation per container
    const rows = db.prepare(`
      WITH latest AS (
        SELECT
          container_id,
          row_id,
          ready_to_harvest,
          maturity_pct,
          observed_at,
          ROW_NUMBER() OVER (PARTITION BY container_id ORDER BY observed_at DESC) AS rn
        FROM cv_observations
        WHERE batch_id = ?
          AND category = 'harvest_readiness'
          AND container_id IS NOT NULL
      )
      SELECT
        row_id,
        COUNT(*)                                          AS observed_containers,
        SUM(CASE WHEN ready_to_harvest = 1 THEN 1 ELSE 0 END) AS ready_count,
        ROUND(AVG(maturity_pct), 0)                       AS avg_maturity_pct,
        MAX(observed_at)                                  AS last_observed_at
      FROM latest
      WHERE rn = 1
      GROUP BY row_id
      ORDER BY row_id
    `).all(Number(batch_id)) as Array<Record<string, unknown>>;

    return reply.send(rows);
  });

  /**
   * GET / — list observations.
   * Query: ?batch_id, ?date, ?category, ?row_id, ?container_id, ?unresolved=1, ?limit
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const {
      batch_id, date = 'today', category, row_id, container_id,
      unresolved, limit = '100',
    } = request.query as {
      batch_id?: string; date?: string; category?: string;
      row_id?: string; container_id?: string; unresolved?: string; limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000);
    const { sql: dateSql, params: dateParams } = dateClause(date);

    const whereClauses = [dateSql];
    const params: unknown[] = [...dateParams];

    if (batch_id) { whereClauses.push('o.batch_id = ?'); params.push(Number(batch_id)); }
    if (category && VALID_CATEGORIES.has(category)) { whereClauses.push('o.category = ?'); params.push(category); }
    if (row_id) { whereClauses.push('o.row_id = ?'); params.push(row_id); }
    if (container_id) { whereClauses.push('o.container_id = ?'); params.push(container_id); }
    if (unresolved === '1') { whereClauses.push('o.resolved_at IS NULL'); }

    const rows = db.prepare(`
      SELECT
        o.*,
        s.name  AS batch_strain_name,
        b.sub_zone_id AS batch_sub_zone_id,
        b.status AS batch_status,
        u.name  AS observer_name
      FROM cv_observations o
      JOIN cv_batches b ON b.batch_id = o.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = o.observer
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY o.observed_at DESC
      LIMIT ?
    `).all(...params, limitNum) as Array<Record<string, unknown>>;

    return reply.send(rows.map(r => ({
      ...r,
      editable: isEditable(String(r['observed_at'])),
    })));
  });

  /**
   * POST / — create an observation.
   */
  app.post<{ Body: ObservationCreateBody }>(
    '/',
    { preHandler: requireAuth },
    async (request, reply) => {
      let body: ObservationCreateBody;
      try { body = ObservationCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const {
        batch_id,
        row_id = null,
        container_id = null,
        observed_at,
        category,
        severity = null,
        note = null,
        maturity_pct = null,
        ready_to_harvest = null,
        harvest_priority = null,
        triggered_app_id = null,
      } = body;

      if (category !== 'harvest_readiness' && (!severity || !VALID_SEVERITIES.has(severity))) {
        return reply.code(400).send({ error: `severity is required for category '${category}'. Valid values: ${[...VALID_SEVERITIES].join(', ')}` });
      }

      const appliedAt = observed_at ?? new Date().toISOString();

      const db = getDB();
      const batch = db.prepare(
        'SELECT batch_id, status FROM cv_batches WHERE batch_id = ?'
      ).get(Number(batch_id)) as Record<string, unknown> | undefined;

      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });
      if (batch['status'] === 'closed') {
        return reply.code(400).send({ error: 'Batch is closed and cannot receive new observations' });
      }

      const userId = (request.user as Record<string, unknown>).id;
      const now = new Date().toISOString();

      const result = db.prepare(`
        INSERT INTO cv_observations
          (batch_id, row_id, container_id, observed_at, category, severity, note,
           maturity_pct, ready_to_harvest, harvest_priority, triggered_app_id,
           observer, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(batch_id),
        row_id ?? null,
        container_id ?? null,
        appliedAt,
        category,
        category === 'harvest_readiness' ? null : (severity ?? null),
        note ? String(note).trim() : null,
        maturity_pct != null ? Math.min(100, Math.max(0, Math.round(Number(maturity_pct)))) : null,
        ready_to_harvest != null ? (Number(ready_to_harvest) ? 1 : 0) : null,
        harvest_priority != null ? Number(harvest_priority) : null,
        triggered_app_id ?? null,
        userId,
        userId,
        now,
      );

      return reply.code(201).send({
        observation_id: Number(result.lastInsertRowid),
        batch_id: Number(batch_id),
        category,
        batch_status: String(batch['status']),
      });
    },
  );

  /**
   * PATCH /:id — edit within 24h. Also supports marking resolved.
   */
  app.patch<{ Params: IdParams; Body: ObservationUpdateBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();
      const existing = db.prepare(
        'SELECT * FROM cv_observations WHERE observation_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Observation not found' });
      if (!isEditable(String(existing['observed_at']))) {
        return reply.code(409).send({ error: 'Observation record is locked after 24 hours' });
      }

      let body: ObservationUpdateBody;
      try { body = ObservationUpdateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const updates: string[] = [];
      const values: unknown[] = [];

      if ('category' in body) {
        updates.push('category = ?'); values.push(body.category);
      }
      if ('severity' in body) {
        updates.push('severity = ?'); values.push(body.severity ?? null);
      }
      if ('note' in body) { updates.push('note = ?'); values.push(body.note ? String(body.note).trim() : null); }
      if ('maturity_pct' in body) {
        updates.push('maturity_pct = ?');
        values.push(body.maturity_pct != null ? Math.min(100, Math.max(0, Math.round(Number(body.maturity_pct)))) : null);
      }
      if ('ready_to_harvest' in body) { updates.push('ready_to_harvest = ?'); values.push(body.ready_to_harvest != null ? (Number(body.ready_to_harvest) ? 1 : 0) : null); }
      if ('harvest_priority' in body) { updates.push('harvest_priority = ?'); values.push(body.harvest_priority != null ? Number(body.harvest_priority) : null); }
      if ('resolved_at' in body) { updates.push('resolved_at = ?'); values.push(body.resolved_at ?? null); }
      if ('resolution_note' in body) { updates.push('resolution_note = ?'); values.push(body.resolution_note ?? null); }
      if ('observed_at' in body && body.observed_at) {
        updates.push('observed_at = ?'); values.push(body.observed_at);
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' });
      values.push(id);
      db.prepare(`UPDATE cv_observations SET ${updates.join(', ')} WHERE observation_id = ?`).run(...values);

      const updated = db.prepare(`
        SELECT o.*, s.name AS batch_strain_name, u.name AS observer_name
        FROM cv_observations o
        JOIN cv_batches b ON b.batch_id = o.batch_id
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_users u ON u.id = o.observer
        WHERE o.observation_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({ ...updated, editable: isEditable(String(updated['observed_at'])) });
    },
  );

  /**
   * DELETE /:id — admin only, within 24h.
   */
  app.delete<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();
      const existing = db.prepare(
        'SELECT * FROM cv_observations WHERE observation_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Observation not found' });
      if (!isEditable(String(existing['observed_at']))) return reply.code(409).send({ error: 'Observation record is locked after 24 hours' });

      db.prepare('DELETE FROM cv_observations WHERE observation_id = ?').run(id);
      return reply.code(204).send();
    },
  );
};

export default observationsRoutes;
