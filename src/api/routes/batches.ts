import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

// Valid lifecycle statuses in order
const STATUS_ORDER = ['germ', 'seedling', 'cult-hoop', 'field-veg', 'field-flower', 'flush', 'harvest', 'closed'] as const;
type BatchStatus = (typeof STATUS_ORDER)[number];

// Valid transitions: from → to
const VALID_TRANSITIONS: Record<string, string> = {
  'germ': 'seedling',
  'seedling': 'cult-hoop',
  'cult-hoop': 'field-veg',
  'field-veg': 'field-flower',
  'field-flower': 'flush',
  'flush': 'harvest',
  'harvest': 'closed',
};

interface BatchCreateBody {
  strain_id: number;
  sub_zone_id?: string | null;
  plant_count_initial: number;
  sow_date: string;
  metrc_plant_batch_uid?: string | null;
  notes?: string | null;
}

interface BatchUpdateBody {
  metrc_plant_batch_uid?: string | null;
  notes?: string | null;
  sub_zone_id?: string | null;
  plant_count_initial?: number;
}

interface TransitionBody {
  to_status: string;
  notes?: string | null;
}

interface RecipeAssignBody {
  recipe_id: number;
  notes?: string | null;
}

/**
 * Build the enriched batch query shared by list and detail endpoints.
 */
function batchBaseQuery(db: ReturnType<typeof import('../../db/index.js').getDB>) {
  return db.prepare(`
    SELECT b.*,
           s.name AS strain_name,
           s.type AS strain_type,
           bsr.recipe_id AS active_recipe_id,
           fr.name AS active_recipe_name,
           fr.version AS active_recipe_version,
           fr.ec_target_low AS active_recipe_ec_low,
           fr.ec_target_high AS active_recipe_ec_high,
           fr.ph_target_low AS active_recipe_ph_low,
           fr.ph_target_high AS active_recipe_ec_ph_high,
           COALESCE(
             (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
             0
           ) AS active_assignment_count,
           CAST(
             ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date)))
           AS INTEGER) AS days_in_stage
    FROM cv_batches b
    JOIN cv_strains s ON s.strain_id = b.strain_id
    LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
    LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
  `);
}

/**
 * Compute plant_count_current: active assignments if any exist, else plant_count_initial.
 */
function resolvedPlantCount(row: Record<string, unknown>): number {
  const activeCount = Number(row['active_assignment_count'] ?? 0);
  if (activeCount > 0) return activeCount;
  return Number(row['plant_count_initial'] ?? 0);
}

/**
 * Status sort order for list endpoint.
 */
const STATUS_RANK: Record<string, number> = Object.fromEntries(
  STATUS_ORDER.map((s, i) => [s, i])
);

const batchesRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list batches with optional ?status filter.
   * status=active (default): all non-closed
   * status=closed: only closed
   * status=all: everything
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { status = 'active' } = request.query as { status?: string };

    const db = getDB();
    let rows: Record<string, unknown>[];

    if (status === 'closed') {
      rows = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ec_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.status = 'closed'
        ORDER BY b.sow_date DESC
      `).all() as Record<string, unknown>[];
    } else if (status === 'all') {
      rows = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ec_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        ORDER BY b.sow_date DESC
      `).all() as Record<string, unknown>[];
    } else {
      // active (default)
      rows = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ec_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.status != 'closed'
        ORDER BY b.sow_date DESC
      `).all() as Record<string, unknown>[];
    }

    // Sort by status priority, then sow_date DESC
    rows.sort((a, b) => {
      const rankDiff = (STATUS_RANK[a['status'] as string] ?? 99) - (STATUS_RANK[b['status'] as string] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return String(b['sow_date'] ?? '').localeCompare(String(a['sow_date'] ?? ''));
    });

    const enriched = rows.map(row => ({
      ...row,
      plant_count_current: resolvedPlantCount(row),
    }));

    return reply.send(enriched);
  });

  /**
   * GET /:id — single batch with full detail.
   */
  app.get<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();

      const row = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.batch_id = ?
      `).get(id) as Record<string, unknown> | undefined;

      if (!row) return reply.code(404).send({ error: 'Batch not found' });

      // Recipe history
      const recipeHistory = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.batch_id = ?
        ORDER BY bsr.effective_from DESC
      `).all(id) as Array<Record<string, unknown>>;

      // Application counts
      const fertigationCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_fertigation WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;
      const foliarCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_foliar WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;
      const pesticideCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_pesticide WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;

      return reply.send({
        ...row,
        plant_count_current: resolvedPlantCount(row),
        recipe_history: recipeHistory,
        application_counts: {
          fertigation: fertigationCount,
          foliar: foliarCount,
          pesticide: pesticideCount,
        },
      });
    },
  );

  /**
   * POST / — create a new batch. Requires supervisor role.
   */
  app.post<{ Body: BatchCreateBody }>(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const { strain_id, sub_zone_id, plant_count_initial, sow_date, metrc_plant_batch_uid, notes } =
        request.body as BatchCreateBody;

      // Validation
      if (!strain_id || isNaN(Number(strain_id))) {
        return reply.code(400).send({ error: 'strain_id is required' });
      }
      if (!plant_count_initial || plant_count_initial <= 0) {
        return reply.code(400).send({ error: 'plant_count_initial must be > 0' });
      }
      if (!sow_date || !/^\d{4}-\d{2}-\d{2}/.test(sow_date)) {
        return reply.code(400).send({ error: 'sow_date is required (YYYY-MM-DD)' });
      }

      const db = getDB();

      // Validate strain exists and is active
      const strain = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ? AND active = 1').get(Number(strain_id));
      if (!strain) {
        return reply.code(400).send({ error: 'strain_id does not exist or is not active' });
      }

      // Validate sub_zone_id if provided
      if (sub_zone_id) {
        const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(sub_zone_id);
        if (!subZone) {
          return reply.code(400).send({ error: `sub_zone_id "${sub_zone_id}" does not exist` });
        }
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const r = db.prepare(`
        INSERT INTO cv_batches
          (strain_id, sub_zone_id, plant_count_initial, sow_date, status, current_stage_since,
           metrc_plant_batch_uid, notes, supervisor, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'germ', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(strain_id),
        sub_zone_id ?? null,
        Number(plant_count_initial),
        sow_date,
        sow_date, // current_stage_since = sow_date for new germination
        metrc_plant_batch_uid ?? null,
        notes ?? null,
        userId,
        userId,
        now,
        now,
      );

      const batch = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE b.batch_id = ?
      `).get(Number(r.lastInsertRowid)) as Record<string, unknown>;

      return reply.code(201).send({
        ...batch,
        plant_count_current: Number(batch['plant_count_initial']),
        active_recipe_id: null,
        active_recipe_name: null,
        active_recipe_version: null,
        recipe_history: [],
        application_counts: { fertigation: 0, foliar: 0, pesticide: 0 },
      });
    },
  );

  /**
   * PATCH /:id/transition — advance batch through lifecycle stages.
   */
  app.patch<{ Params: IdParams; Body: TransitionBody }>(
    '/:id/transition',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const { to_status, notes } = request.body as TransitionBody;
      if (!to_status) return reply.code(400).send({ error: 'to_status is required' });

      const db = getDB();

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const currentStatus = batch['status'] as string;
      if (currentStatus === 'closed') {
        return reply.code(400).send({ error: 'Batch is already closed' });
      }

      const expectedNext = VALID_TRANSITIONS[currentStatus];
      if (!expectedNext || to_status !== expectedNext) {
        return reply.code(400).send({
          error: `Invalid transition. Batch is currently "${currentStatus}". Next valid status is "${expectedNext ?? 'none'}"`,
        });
      }

      // field-veg requires sub_zone_id to be set
      if (to_status === 'field-veg' && !batch['sub_zone_id']) {
        return reply.code(400).send({
          error: 'Cannot move to field-veg: sub_zone_id must be set before moving to field. Update the batch first.',
        });
      }

      const now = new Date().toISOString();
      const updates: string[] = ['status = ?', 'current_stage_since = ?', 'updated_at = ?'];
      const values: unknown[] = [to_status, now, now];

      // Set appropriate date columns
      if (to_status === 'seedling') {
        updates.push('transplant_date = ?');
        values.push(now);
      } else if (to_status === 'field-veg') {
        updates.push('field_move_date = ?');
        values.push(now);
      } else if (to_status === 'harvest') {
        updates.push('harvest_date = ?');
        values.push(now);
      } else if (to_status === 'closed') {
        updates.push('closed_date = ?');
        values.push(now);
      }

      // Append notes if provided
      if (notes && notes.trim()) {
        const existing = (batch['notes'] as string | null) ?? '';
        const newNotes = existing
          ? `${existing}\n[${to_status} transition ${now.slice(0, 10)}] ${notes.trim()}`
          : `[${to_status} transition ${now.slice(0, 10)}] ${notes.trim()}`;
        updates.push('notes = ?');
        values.push(newNotes);
      }

      values.push(id);
      db.prepare(`UPDATE cv_batches SET ${updates.join(', ')} WHERE batch_id = ?`).run(...values);

      // Fetch updated batch with enrichment
      const row = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.batch_id = ?
      `).get(id) as Record<string, unknown>;

      const recipeHistory = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.batch_id = ?
        ORDER BY bsr.effective_from DESC
      `).all(id) as Array<Record<string, unknown>>;

      return reply.send({
        ...row,
        plant_count_current: resolvedPlantCount(row),
        recipe_history: recipeHistory,
      });
    },
  );

  /**
   * PATCH /:id — update mutable batch fields. Requires supervisor role.
   */
  app.patch<{ Params: IdParams; Body: BatchUpdateBody }>(
    '/:id',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();
      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const body = request.body as BatchUpdateBody;
      const updates: string[] = [];
      const values: unknown[] = [];
      const now = new Date().toISOString();

      if ('metrc_plant_batch_uid' in body) {
        updates.push('metrc_plant_batch_uid = ?');
        values.push(body.metrc_plant_batch_uid ?? null);
      }

      if ('notes' in body) {
        updates.push('notes = ?');
        values.push(body.notes ?? null);
      }

      if ('sub_zone_id' in body) {
        const currentStatus = batch['status'] as string;
        const lockedStatuses = ['field-veg', 'field-flower', 'flush', 'harvest', 'closed'];
        if (lockedStatuses.includes(currentStatus)) {
          return reply.code(400).send({
            error: `Cannot change sub_zone_id once batch is in "${currentStatus}" status`,
          });
        }
        if (body.sub_zone_id) {
          const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(body.sub_zone_id);
          if (!subZone) {
            return reply.code(400).send({ error: `sub_zone_id "${body.sub_zone_id}" does not exist` });
          }
        }
        updates.push('sub_zone_id = ?');
        values.push(body.sub_zone_id ?? null);
      }

      if ('plant_count_initial' in body) {
        // Only allowed if no plant_assignments exist yet
        const assignmentCount = (
          db.prepare('SELECT COUNT(*) as n FROM cv_plant_assignments WHERE batch_id = ?').get(id) as { n: number }
        ).n;
        if (assignmentCount > 0) {
          return reply.code(400).send({
            error: 'Cannot change plant_count_initial once plant assignments exist',
          });
        }
        if (!body.plant_count_initial || body.plant_count_initial <= 0) {
          return reply.code(400).send({ error: 'plant_count_initial must be > 0' });
        }
        updates.push('plant_count_initial = ?');
        values.push(Number(body.plant_count_initial));
      }

      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No valid fields to update' });
      }

      updates.push('updated_at = ?');
      values.push(now);
      values.push(id);

      db.prepare(`UPDATE cv_batches SET ${updates.join(', ')} WHERE batch_id = ?`).run(...values);

      const row = db.prepare(`
        SELECT b.*,
               s.name AS strain_name,
               s.type AS strain_type,
               bsr.recipe_id AS active_recipe_id,
               fr.name AS active_recipe_name,
               fr.version AS active_recipe_version,
               fr.ec_target_low AS active_recipe_ec_low,
               fr.ec_target_high AS active_recipe_ec_high,
               fr.ph_target_low AS active_recipe_ph_low,
               fr.ph_target_high AS active_recipe_ph_high,
               COALESCE(
                 (SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
                 0
               ) AS active_assignment_count,
               CAST(ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date))) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.batch_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({
        ...row,
        plant_count_current: resolvedPlantCount(row),
      });
    },
  );

  /**
   * PATCH /:id/recipe — assign or change active fertigation recipe. Requires supervisor role.
   */
  app.patch<{ Params: IdParams; Body: RecipeAssignBody }>(
    '/:id/recipe',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const { recipe_id, notes } = request.body as RecipeAssignBody;
      if (!recipe_id || isNaN(Number(recipe_id))) {
        return reply.code(400).send({ error: 'recipe_id is required' });
      }

      const db = getDB();

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(id);
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const recipe = db.prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id = ? AND active = 1').get(Number(recipe_id));
      if (!recipe) {
        return reply.code(400).send({ error: 'recipe_id does not exist or is not active' });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const assignRecipe = db.transaction(() => {
        // Close any currently open recipe for this batch
        db.prepare(`
          UPDATE cv_batch_stage_recipes SET effective_to = ? WHERE batch_id = ? AND effective_to IS NULL
        `).run(now, id);

        // Insert new active record
        const r = db.prepare(`
          INSERT INTO cv_batch_stage_recipes (batch_id, recipe_id, effective_from, effective_to, authorized_by, notes, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, ?)
        `).run(id, Number(recipe_id), now, userId, notes ?? null, now);

        return Number(r.lastInsertRowid);
      });

      const newId = assignRecipe();

      const record = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.id = ?
      `).get(newId);

      return reply.code(201).send(record);
    },
  );
};

export default batchesRoutes;
