import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

interface FertigationCreateBody {
  batch_ids: number[];
  recipe_id: number;
  applied_at: string;
  volume_gallons: number;
  ec_measured: number;
  ph_measured: number;
  solution_temp_f?: number | null;
  ambient_temp_f?: number | null;
  ambient_rh?: number | null;
  notes?: string | null;
}

interface FertigationUpdateBody {
  volume_gallons?: number;
  ec_measured?: number;
  ph_measured?: number;
  solution_temp_f?: number | null;
  ambient_temp_f?: number | null;
  ambient_rh?: number | null;
  notes?: string | null;
  applied_at?: string;
}

/**
 * Returns true if applied_at is within 24 hours of now.
 */
function isEditable(appliedAt: string): boolean {
  const applied = new Date(appliedAt).getTime();
  const now = Date.now();
  return now - applied < 24 * 60 * 60 * 1000;
}

/**
 * Build the date filter clause for applied_at column.
 */
function dateClause(date: string): { sql: string; params: unknown[] } {
  const now = new Date();

  if (date === 'today' || !date) {
    // Calendar day in UTC (matches DB storage in UTC)
    const today = now.toISOString().slice(0, 10);
    return {
      sql: "date(a.applied_at) = date(?)",
      params: [today],
    };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      sql: "date(a.applied_at) = date(?)",
      params: [date],
    };
  }

  if (date === '7d') {
    return {
      sql: "a.applied_at >= datetime('now', '-7 days')",
      params: [],
    };
  }

  if (date === '30d') {
    return {
      sql: "a.applied_at >= datetime('now', '-30 days')",
      params: [],
    };
  }

  // Fallback: today
  const today = now.toISOString().slice(0, 10);
  return {
    sql: "date(a.applied_at) = date(?)",
    params: [today],
  };
}

const fertigationApplicationsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list fertigation applications.
   * Query params:
   *   ?batch_id=X — filter to one batch
   *   ?date=today (default) | ?date=YYYY-MM-DD | ?date=7d | ?date=30d
   *   ?limit=50 (default)
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { batch_id, date = 'today', limit = '50' } = request.query as {
      batch_id?: string;
      date?: string;
      limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);

    const { sql: dateSql, params: dateParams } = dateClause(date);

    let whereClauses = [dateSql];
    let params: unknown[] = [...dateParams];

    if (batch_id) {
      whereClauses.push('a.batch_id = ?');
      params.push(Number(batch_id));
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT
        a.*,
        s.name AS batch_strain_name,
        b.sub_zone_id AS batch_sub_zone_id,
        fr.name AS recipe_name,
        fr.version AS recipe_version,
        u.name AS applicator_name
      FROM cv_applications_fertigation a
      JOIN cv_batches b ON b.batch_id = a.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      JOIN cv_fertigation_recipes fr ON fr.recipe_id = a.recipe_id
      LEFT JOIN cv_users u ON u.id = a.applicator
      ${whereStr}
      ORDER BY a.applied_at DESC
      LIMIT ?
    `).all(...params, limitNum) as Array<Record<string, unknown>>;

    const enriched = rows.map(row => ({
      ...row,
      editable: isEditable(String(row['applied_at'])),
    }));

    return reply.send(enriched);
  });

  /**
   * POST / — create fertigation application(s).
   * Supports batch_ids array for bulk entry (one record per batch).
   * Requires grower+ role.
   */
  app.post<{ Body: FertigationCreateBody }>(
    '/',
    { preHandler: requireAuth },
    async (request, reply) => {
      const body = request.body as FertigationCreateBody;
      const {
        batch_ids,
        recipe_id,
        applied_at,
        volume_gallons,
        ec_measured,
        ph_measured,
        solution_temp_f = null,
        ambient_temp_f = null,
        ambient_rh = null,
        notes = null,
      } = body;

      // --- Validation ---
      if (!Array.isArray(batch_ids) || batch_ids.length === 0) {
        return reply.code(400).send({ error: 'batch_ids must be a non-empty array' });
      }

      if (!recipe_id || isNaN(Number(recipe_id))) {
        return reply.code(400).send({ error: 'recipe_id is required' });
      }

      if (ec_measured == null || isNaN(Number(ec_measured))) {
        return reply.code(400).send({ error: 'ec_measured is required (enter 0.0 and note "meter-error" if meter is broken)' });
      }

      if (ph_measured == null || isNaN(Number(ph_measured))) {
        return reply.code(400).send({ error: 'ph_measured is required (enter 0.0 and note "meter-error" if meter is broken)' });
      }

      if (!volume_gallons || isNaN(Number(volume_gallons)) || Number(volume_gallons) <= 0) {
        return reply.code(400).send({ error: 'volume_gallons is required and must be > 0' });
      }

      if (!applied_at || isNaN(Date.parse(applied_at))) {
        return reply.code(400).send({ error: 'applied_at is required and must be a valid ISO datetime' });
      }

      const db = getDB();

      // Validate recipe exists and is active
      const recipe = db.prepare(
        'SELECT * FROM cv_fertigation_recipes WHERE recipe_id = ? AND active = 1'
      ).get(Number(recipe_id));
      if (!recipe) {
        return reply.code(400).send({ error: 'recipe_id does not exist or is not active' });
      }

      // Validate all batch_ids exist and are not closed
      for (const bid of batch_ids) {
        const batch = db.prepare(
          "SELECT batch_id, status FROM cv_batches WHERE batch_id = ?"
        ).get(Number(bid)) as Record<string, unknown> | undefined;
        if (!batch) {
          return reply.code(400).send({ error: `batch_id ${bid} does not exist` });
        }
        if (batch['status'] === 'closed') {
          return reply.code(400).send({ error: `batch_id ${bid} is closed and cannot receive new applications` });
        }
      }

      const userId = request.user.id;
      const now = new Date().toISOString();

      const created: Array<{ application_id: number; batch_id: number }> = [];

      const insertMany = db.transaction(() => {
        for (const bid of batch_ids) {
          const result = db.prepare(`
            INSERT INTO cv_applications_fertigation
              (batch_id, recipe_id, applied_at, volume_gallons, ec_measured, ph_measured,
               solution_temp_f, ambient_temp_f, ambient_rh, applicator, notes, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            Number(bid),
            Number(recipe_id),
            applied_at,
            Number(volume_gallons),
            Number(ec_measured),
            Number(ph_measured),
            solution_temp_f != null ? Number(solution_temp_f) : null,
            ambient_temp_f != null ? Number(ambient_temp_f) : null,
            ambient_rh != null ? Number(ambient_rh) : null,
            userId,
            notes ?? null,
            userId,
            now,
          );
          created.push({ application_id: Number(result.lastInsertRowid), batch_id: Number(bid) });
        }
      });

      insertMany();

      return reply.code(201).send({ created });
    },
  );

  /**
   * PATCH /:id — edit a fertigation application.
   * Only allowed within 24 hours of applied_at.
   */
  app.patch<{ Params: IdParams; Body: FertigationUpdateBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid application id' });

      const db = getDB();

      const existing = db.prepare(
        'SELECT * FROM cv_applications_fertigation WHERE application_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Application not found' });

      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Application record is locked after 24 hours' });
      }

      const body = request.body as FertigationUpdateBody;
      const updates: string[] = [];
      const values: unknown[] = [];

      if ('volume_gallons' in body) {
        if (!body.volume_gallons || Number(body.volume_gallons) <= 0) {
          return reply.code(400).send({ error: 'volume_gallons must be > 0' });
        }
        updates.push('volume_gallons = ?');
        values.push(Number(body.volume_gallons));
      }

      if ('ec_measured' in body) {
        if (body.ec_measured == null || isNaN(Number(body.ec_measured))) {
          return reply.code(400).send({ error: 'ec_measured must be a number' });
        }
        updates.push('ec_measured = ?');
        values.push(Number(body.ec_measured));
      }

      if ('ph_measured' in body) {
        if (body.ph_measured == null || isNaN(Number(body.ph_measured))) {
          return reply.code(400).send({ error: 'ph_measured must be a number' });
        }
        updates.push('ph_measured = ?');
        values.push(Number(body.ph_measured));
      }

      if ('solution_temp_f' in body) {
        updates.push('solution_temp_f = ?');
        values.push(body.solution_temp_f != null ? Number(body.solution_temp_f) : null);
      }

      if ('ambient_temp_f' in body) {
        updates.push('ambient_temp_f = ?');
        values.push(body.ambient_temp_f != null ? Number(body.ambient_temp_f) : null);
      }

      if ('ambient_rh' in body) {
        updates.push('ambient_rh = ?');
        values.push(body.ambient_rh != null ? Number(body.ambient_rh) : null);
      }

      if ('notes' in body) {
        updates.push('notes = ?');
        values.push(body.notes ?? null);
      }

      if ('applied_at' in body && body.applied_at) {
        if (isNaN(Date.parse(body.applied_at))) {
          return reply.code(400).send({ error: 'applied_at must be a valid ISO datetime' });
        }
        // Must remain on the same calendar day
        const origDay = String(existing['applied_at']).slice(0, 10);
        const newDay = new Date(body.applied_at).toISOString().slice(0, 10);
        if (origDay !== newDay) {
          return reply.code(400).send({ error: 'applied_at can only be changed within the same calendar day' });
        }
        updates.push('applied_at = ?');
        values.push(body.applied_at);
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      values.push(id);
      db.prepare(`UPDATE cv_applications_fertigation SET ${updates.join(', ')} WHERE application_id = ?`).run(...values);

      const updated = db.prepare(`
        SELECT
          a.*,
          s.name AS batch_strain_name,
          b.sub_zone_id AS batch_sub_zone_id,
          fr.name AS recipe_name,
          fr.version AS recipe_version,
          u.name AS applicator_name
        FROM cv_applications_fertigation a
        JOIN cv_batches b ON b.batch_id = a.batch_id
        JOIN cv_strains s ON s.strain_id = b.strain_id
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = a.recipe_id
        LEFT JOIN cv_users u ON u.id = a.applicator
        WHERE a.application_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({
        ...updated,
        editable: isEditable(String(updated['applied_at'])),
      });
    },
  );

  /**
   * DELETE /:id — admin only, within 24h window only.
   */
  app.delete<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid application id' });

      const db = getDB();

      const existing = db.prepare(
        'SELECT * FROM cv_applications_fertigation WHERE application_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Application not found' });

      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Application record is locked after 24 hours' });
      }

      db.prepare('DELETE FROM cv_applications_fertigation WHERE application_id = ?').run(id);

      return reply.code(204).send();
    },
  );
};

export default fertigationApplicationsRoutes;
