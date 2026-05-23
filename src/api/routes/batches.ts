import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { formatMetrcDate, toMetrcPhase, makeBatchName } from '../../lib/domain-utils.js';
import { z } from 'zod';

interface IdParams { id: string }

// Allow server-to-server calls with X-Service-Key alongside user JWT auth.
async function requireAuthOrServiceKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const serviceKey = process.env.CULTIVATE_SERVICE_KEY;
  if (serviceKey) {
    const incoming = request.headers['x-service-key'] as string | undefined;
    if (incoming === serviceKey) {
      (request as any).user = { id: 0, name: 'service', role: 'grower' };
      return;
    }
  }
  return requireAuth(request, reply);
}

const STATUS_ORDER = [
  'germ', 'seedling', 'cult-hoop',
  'field-veg', 'field-flower', 'flush',
  'harvest_window', 'harvesting', 'closed',
] as const;
type BatchStatus = (typeof STATUS_ORDER)[number];

const VALID_TRANSITIONS: Record<string, string> = {
  'germ':          'seedling',
  'seedling':      'cult-hoop',
  'cult-hoop':     'field-veg',
  'field-veg':     'field-flower',
  'field-flower':  'flush',
  'flush':         'harvest_window',
  'harvest_window':'harvesting',
  'harvesting':    'closed',
};

// Seed location IDs from 011_locations migration
const LOCATION = {
  GERM:      1,
  SEEDLINGS: 2,
  CULT_HOOP: 3,
  // Field: location_id = 3 + sub_zone index (Z1A=4, Z1B=5, Z2A=6 ... Z4B=11)
  // Resolved at runtime via cv_locations.sub_zone_id join
} as const;

// Transitions where a location move is auto-generated alongside the phase change.
// cult-hoop → field-veg is NOT here: the planting plan commit owns that move.
const IMPLIED_LOCATION_MOVES: Partial<Record<string, { to_location_id: number }>> = {
  'seedling':  { to_location_id: LOCATION.SEEDLINGS },
  'cult-hoop': { to_location_id: LOCATION.CULT_HOOP },
};

// Transitions that generate a METRC "Change Growth Phase" event.
// Pre-field sub-stage changes (germ→seedling, seedling→cult-hoop) are internal only —
// METRC tracks immature plants as a group with no sub-stage distinction.
const METRC_PHASE_EVENT: Partial<Record<string, boolean>> = {
  'field-veg':    true,  // Immature → Vegetative in METRC
  'field-flower': true,  // Vegetative → Flowering in METRC
};

// Transitions that generate a METRC "Move Plants" event for the implied location move.
const METRC_LOCATION_EVENT: Partial<Record<string, boolean>> = {
  'seedling':  true,
  'cult-hoop': true,
};

const BatchCreateSchema = z.object({
  strain_id: z.number().int().positive(),
  sub_zone_id: z.string().nullable().optional(),
  plant_count_initial: z.number().int().positive(),
  plants_per_container: z.number().int().min(1).default(1),
  sow_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'sow_date must be YYYY-MM-DD'),
  expected_harvest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metrc_plant_batch_uid: z.string().length(24).regex(/^[A-Za-z0-9]+$/).nullable().optional(),
  notes: z.string().nullable().optional(),
  source_type: z.enum(['seed', 'clone']).nullable().optional(),
  seed_package_id: z.number().int().positive().nullable().optional(),
  seed_count_used: z.number().int().positive().nullable().optional(),
  seed_weight_g: z.number().positive().nullable().optional(),
  initial_phase: z.enum(['immature', 'veg', 'flower']).nullable().optional(),
  initial_status: z.enum(['germ', 'seedling', 'cult-hoop', 'field-veg', 'field-flower']).nullable().optional(),
});
type BatchCreateBody = z.infer<typeof BatchCreateSchema>;

const BatchUpdateSchema = z.object({
  metrc_plant_batch_uid: z.string().length(24).regex(/^[A-Za-z0-9]+$/).nullable().optional(),
  notes: z.string().nullable().optional(),
  sub_zone_id: z.string().nullable().optional(),
  plant_count_initial: z.number().int().positive().optional(),
});
type BatchUpdateBody = z.infer<typeof BatchUpdateSchema>;

const TransitionSchema = z.object({
  to_status: z.string().min(1),
  notes: z.string().nullable().optional(),
});
type TransitionBody = z.infer<typeof TransitionSchema>;

const RecipeAssignSchema = z.object({
  recipe_id: z.number().int().positive(),
  notes: z.string().nullable().optional(),
});
type RecipeAssignBody = z.infer<typeof RecipeAssignSchema>;

const STATUS_RANK: Record<string, number> = Object.fromEntries(
  STATUS_ORDER.map((s, i) => [s, i])
);

function enrichBatch(row: Record<string, unknown>): Record<string, unknown> {
  const strainName = (row['strain_name'] as string) ?? '';
  const sowDate = (row['sow_date'] as string) ?? '';
  const strainType = (row['strain_type'] as string) ?? '';
  const status = (row['status'] as string) ?? '';
  return {
    ...row,
    metrc_batch_name: sowDate ? makeBatchName(strainName, sowDate, strainType) : null,
    metrc_phase: toMetrcPhase(status),
  };
}

// Shared enriched SELECT used by list and detail endpoints
const BATCH_SELECT = `
  SELECT b.*,
         s.name AS strain_name,
         s.type AS strain_type,
         loc.name AS current_location_name,
         loc.location_type AS current_location_type,
         bsr.recipe_id AS active_recipe_id,
         fr.name AS active_recipe_name,
         fr.version AS active_recipe_version,
         fr.ec_target_low AS active_recipe_ec_low,
         fr.ec_target_high AS active_recipe_ec_high,
         fr.ph_target_low AS active_recipe_ph_low,
         fr.ph_target_high AS active_recipe_ph_high,
         COALESCE(
           (SELECT COUNT(*) FROM cv_plant_assignments pa
            WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL),
           0
         ) AS active_assignment_count,
         CAST(
           ROUND(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date)))
         AS INTEGER) AS days_in_stage
  FROM cv_batches b
  JOIN cv_strains s ON s.strain_id = b.strain_id
  LEFT JOIN cv_locations loc ON loc.location_id = b.current_location_id
  LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
  LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
`;

function resolvedPlantCount(row: Record<string, unknown>): number {
  const activeCount = Number(row['active_assignment_count'] ?? 0);
  if (activeCount > 0) return activeCount;
  return Number(row['plant_count_initial'] ?? 0);
}

const batchesRoutes: FastifyPluginAsync = async (app) => {

  const BatchListQuerySchema = z.object({
    status: z.string().default('active'),
    location_id: z.coerce.number().int().positive().optional(),
  });

  /**
   * GET / — list batches with optional ?status and ?location_id filters.
   * status=active (default): all non-closed
   * status=closed: only closed
   * status=all: everything
   * location_id: filter to batches whose most recent location matches
   */
  app.get('/', { preHandler: requireAuthOrServiceKey }, async (request, reply) => {
    const parsed = BatchListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }
    const { status, location_id } = parsed.data;
    const db = getDB();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status === 'closed') {
      conditions.push("b.status = 'closed'");
    } else if (status !== 'all') {
      conditions.push("b.status != 'closed'");
    }

    if (location_id != null) {
      conditions.push(`b.batch_id IN (
        SELECT lh.batch_id FROM cv_batch_location_history lh
        WHERE lh.to_location_id = ?
          AND lh.location_history_id = (
            SELECT MAX(lh2.location_history_id) FROM cv_batch_location_history lh2
            WHERE lh2.batch_id = lh.batch_id
          )
      )`);
      params.push(location_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`${BATCH_SELECT} ${whereClause} ORDER BY b.sow_date DESC`)
      .all(...params) as Record<string, unknown>[];

    rows.sort((a, b) => {
      const rankDiff = (STATUS_RANK[a['status'] as string] ?? 99) - (STATUS_RANK[b['status'] as string] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return String(b['sow_date'] ?? '').localeCompare(String(a['sow_date'] ?? ''));
    });

    return reply.send(rows.map(row => enrichBatch({ ...row, plant_count_current: resolvedPlantCount(row) })));
  });

  /**
   * GET /:id — single batch with full detail including phase and location history.
   */
  app.get<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();

      const row = db.prepare(`${BATCH_SELECT} WHERE b.batch_id = ?`).get(id) as Record<string, unknown> | undefined;
      if (!row) return reply.code(404).send({ error: 'Batch not found' });

      const recipeHistory = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.batch_id = ?
        ORDER BY bsr.effective_from DESC
      `).all(id) as Array<Record<string, unknown>>;

      const phaseHistory = db.prepare(`
        SELECT ph.*, u.name AS transitioned_by_name
        FROM cv_batch_phase_history ph
        LEFT JOIN cv_users u ON u.id = ph.transitioned_by
        WHERE ph.batch_id = ?
        ORDER BY ph.transitioned_at ASC
      `).all(id) as Array<Record<string, unknown>>;

      const locationHistory = db.prepare(`
        SELECT lh.*,
               fl.name AS from_location_name,
               tl.name AS to_location_name,
               u.name AS moved_by_name
        FROM cv_batch_location_history lh
        LEFT JOIN cv_locations fl ON fl.location_id = lh.from_location_id
        LEFT JOIN cv_locations tl ON tl.location_id = lh.to_location_id
        LEFT JOIN cv_users u ON u.id = lh.moved_by
        WHERE lh.batch_id = ?
        ORDER BY lh.moved_at ASC
      `).all(id) as Array<Record<string, unknown>>;

      const fertigationCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_fertigation WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;
      const foliarCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_foliar WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;
      const pesticideCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_applications_pesticide WHERE batch_id = ?').get(id) as { n: number } | undefined
      )?.n ?? 0;

      const teardownEligibleCount = (
        db.prepare(`
          SELECT COUNT(*) as n FROM cv_container_state
          WHERE current_batch_id = ? AND current_state IN ('active', 'empty')
        `).get(id) as { n: number } | undefined
      )?.n ?? 0;

      const untaggedCount = (
        db.prepare(`
          SELECT COUNT(*) as n FROM cv_plant_assignments
          WHERE batch_id = ? AND unassigned_at IS NULL AND metrc_plant_tag IS NULL
        `).get(id) as { n: number } | undefined
      )?.n ?? 0;

      return reply.send(enrichBatch({
        ...row,
        plant_count_current: resolvedPlantCount(row),
        recipe_history: recipeHistory,
        phase_history: phaseHistory,
        location_history: locationHistory,
        application_counts: {
          fertigation: fertigationCount,
          foliar: foliarCount,
          pesticide: pesticideCount,
        },
        teardown_eligible_count: teardownEligibleCount,
        untagged_count: untaggedCount,
      }));
    },
  );

  /**
   * POST / — create a new batch. Requires supervisor role.
   * Writes the initial phase history (germ) and location history (Germ-01) records.
   */
  app.post<{ Body: BatchCreateBody }>(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      let body: BatchCreateBody;
      try { body = BatchCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const {
        strain_id, sub_zone_id, plant_count_initial, plants_per_container, sow_date,
        expected_harvest_date, metrc_plant_batch_uid, notes,
        source_type, seed_package_id, seed_count_used, seed_weight_g, initial_phase,
        initial_status,
      } = body;

      const db = getDB();

      const strain = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ? AND active = 1').get(Number(strain_id));
      if (!strain) return reply.code(400).send({ error: 'strain_id does not exist or is not active' });

      if (sub_zone_id) {
        const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(sub_zone_id);
        if (!subZone) return reply.code(400).send({ error: `sub_zone_id "${sub_zone_id}" does not exist` });
      }

      if (seed_package_id != null) {
        const pkg = db.prepare('SELECT * FROM cv_seed_packages WHERE package_id = ? AND active = 1').get(Number(seed_package_id)) as Record<string, unknown> | undefined;
        if (!pkg) return reply.code(400).send({ error: 'seed_package_id does not exist or is not active' });
        if (seed_count_used != null && Number(pkg['seed_count_remaining']) < seed_count_used) {
          return reply.code(400).send({ error: `Seed package only has ${pkg['seed_count_remaining']} seeds remaining; requested ${seed_count_used}` });
        }
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const effective_status = initial_status ?? 'germ';
      const stage_since = effective_status === 'germ' ? sow_date : now;
      // Map pre-field statuses to their implied locations; field statuses keep GERM until plan commit
      const INITIAL_LOCATION_MAP: Partial<Record<string, number>> = {
        'seedling':  LOCATION.SEEDLINGS,
        'cult-hoop': LOCATION.CULT_HOOP,
      };
      const initial_location_id = INITIAL_LOCATION_MAP[effective_status] ?? LOCATION.GERM;

      const batchId = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO cv_batches
            (strain_id, sub_zone_id, plant_count_initial, plants_per_container, sow_date, expected_harvest_date,
             status, current_stage_since, current_location_id, metrc_plant_batch_uid,
             source_type, seed_package_id, seed_count_used, seed_weight_g, initial_phase,
             notes, supervisor, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(strain_id),
          sub_zone_id ?? null,
          Number(plant_count_initial),
          plants_per_container ? Number(plants_per_container) : 1,
          sow_date,
          expected_harvest_date ?? null,
          effective_status,
          stage_since,
          initial_location_id,
          metrc_plant_batch_uid ?? null,
          source_type ?? null,
          seed_package_id ?? null,
          seed_count_used ?? null,
          seed_weight_g ?? null,
          initial_phase ?? null,
          notes ?? null,
          userId, userId, now, now,
        );

        const newBatchId = Number(r.lastInsertRowid);

        // Phase history — from_status null = batch created in this state
        const phaseMetrcStatus = METRC_PHASE_EVENT[effective_status] ? 'pending' : 'not_required';
        db.prepare(`
          INSERT INTO cv_batch_phase_history
            (batch_id, from_status, to_status, transitioned_at, transitioned_by,
             notes, metrc_sync_status, created_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
        `).run(newBatchId, effective_status, now, userId, notes ?? null, phaseMetrcStatus, now);

        // Initial location record — from_location_id null = initial placement
        db.prepare(`
          INSERT INTO cv_batch_location_history
            (batch_id, from_location_id, to_location_id, moved_at, moved_by,
             trigger, metrc_sync_status, created_at)
          VALUES (?, NULL, ?, ?, ?, 'manual', 'not_required', ?)
        `).run(newBatchId, initial_location_id, now, userId, now);

        // Decrement seed package remaining count if seeds were used
        if (seed_package_id != null && seed_count_used != null) {
          db.prepare(`
            UPDATE cv_seed_packages
            SET seed_count_remaining = seed_count_remaining - ?
            WHERE package_id = ?
          `).run(Number(seed_count_used), Number(seed_package_id));
        }

        return newBatchId;
      })();

      const batch = db.prepare(`${BATCH_SELECT} WHERE b.batch_id = ?`).get(batchId) as Record<string, unknown>;

      return reply.code(201).send(enrichBatch({
        ...batch,
        plant_count_current: Number(batch['plant_count_initial']),
        active_recipe_id: null,
        active_recipe_name: null,
        active_recipe_version: null,
        recipe_history: [],
        phase_history: db.prepare('SELECT * FROM cv_batch_phase_history WHERE batch_id = ?').all(batchId),
        location_history: db.prepare('SELECT * FROM cv_batch_location_history WHERE batch_id = ?').all(batchId),
        application_counts: { fertigation: 0, foliar: 0, pesticide: 0 },
      }));
    },
  );

  /**
   * PATCH /:id/transition — advance batch through lifecycle phases.
   *
   * Writes to cv_batch_phase_history for every transition.
   * For transitions that imply a physical location move (germ→seedling,
   * seedling→cult-hoop), also writes to cv_batch_location_history and
   * updates current_location_id on the batch.
   *
   * cult-hoop → field-veg does NOT generate a location move here —
   * that move is owned by the planting plan commit workflow.
   */
  app.patch<{ Params: IdParams; Body: TransitionBody }>(
    '/:id/transition',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      let transBody: TransitionBody;
      try { transBody = TransitionSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { to_status, notes } = transBody;

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
          error: `Invalid transition. Batch is "${currentStatus}". Next valid status is "${expectedNext ?? 'none'}"`,
        });
      }

      if (to_status === 'field-veg' && !batch['sub_zone_id']) {
        return reply.code(400).send({
          error: 'Cannot move to field-veg: sub_zone_id must be set before moving to field',
        });
      }

      // harvesting requires notes explaining the management decision
      if (to_status === 'harvesting' && !notes?.trim()) {
        return reply.code(400).send({
          error: 'Transition to harvesting requires notes referencing the maturity observation evidence',
        });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const impliedMove = IMPLIED_LOCATION_MOVES[to_status];
      const phaseMetrcStatus = METRC_PHASE_EVENT[to_status] ? 'pending' : 'not_required';
      const locationMetrcStatus = METRC_LOCATION_EVENT[to_status] ? 'pending' : 'not_required';

      db.transaction(() => {
        // Build batch UPDATE
        const updates: string[] = ['status = ?', 'current_stage_since = ?', 'updated_at = ?'];
        const values: unknown[] = [to_status, now, now];

        if (to_status === 'seedling') {
          updates.push('transplant_date = ?');
          values.push(now);
        } else if (to_status === 'field-veg') {
          updates.push('field_move_date = ?');
          values.push(now);
        } else if (to_status === 'harvesting') {
          updates.push('harvest_date = ?');
          values.push(now);
        } else if (to_status === 'closed') {
          updates.push('closed_date = ?');
          values.push(now);
        }

        if (impliedMove) {
          updates.push('current_location_id = ?');
          values.push(impliedMove.to_location_id);
        }

        values.push(id);
        db.prepare(`UPDATE cv_batches SET ${updates.join(', ')} WHERE batch_id = ?`).run(...values);

        // Phase history record
        db.prepare(`
          INSERT INTO cv_batch_phase_history
            (batch_id, from_status, to_status, transitioned_at, transitioned_by,
             notes, metrc_sync_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, currentStatus, to_status, now, userId, notes ?? null, phaseMetrcStatus, now);

        // Location history record — only for transitions that imply a physical move
        if (impliedMove) {
          const fromLocationId = batch['current_location_id'] as number | null;
          db.prepare(`
            INSERT INTO cv_batch_location_history
              (batch_id, from_location_id, to_location_id, moved_at, moved_by,
               trigger, metrc_sync_status, created_at)
            VALUES (?, ?, ?, ?, ?, 'phase_transition', ?, ?)
          `).run(id, fromLocationId ?? null, impliedMove.to_location_id, now, userId, locationMetrcStatus, now);
        }
      })();

      const row = db.prepare(`${BATCH_SELECT} WHERE b.batch_id = ?`).get(id) as Record<string, unknown>;

      const recipeHistory = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.batch_id = ?
        ORDER BY bsr.effective_from DESC
      `).all(id) as Array<Record<string, unknown>>;

      const phaseHistory = db.prepare(`
        SELECT ph.*, u.name AS transitioned_by_name
        FROM cv_batch_phase_history ph
        LEFT JOIN cv_users u ON u.id = ph.transitioned_by
        WHERE ph.batch_id = ?
        ORDER BY ph.transitioned_at ASC
      `).all(id) as Array<Record<string, unknown>>;

      const locationHistory = db.prepare(`
        SELECT lh.*,
               fl.name AS from_location_name,
               tl.name AS to_location_name,
               u.name AS moved_by_name
        FROM cv_batch_location_history lh
        LEFT JOIN cv_locations fl ON fl.location_id = lh.from_location_id
        LEFT JOIN cv_locations tl ON tl.location_id = lh.to_location_id
        LEFT JOIN cv_users u ON u.id = lh.moved_by
        WHERE lh.batch_id = ?
        ORDER BY lh.moved_at ASC
      `).all(id) as Array<Record<string, unknown>>;

      return reply.send(enrichBatch({
        ...row,
        plant_count_current: resolvedPlantCount(row),
        recipe_history: recipeHistory,
        phase_history: phaseHistory,
        location_history: locationHistory,
      }));
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

      let body: BatchUpdateBody;
      try { body = BatchUpdateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
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
        const lockedStatuses = ['field-veg', 'field-flower', 'flush', 'harvest_window', 'harvesting', 'closed'];
        if (lockedStatuses.includes(batch['status'] as string)) {
          return reply.code(400).send({
            error: `Cannot change sub_zone_id once batch is in "${batch['status']}" status`,
          });
        }
        if (body.sub_zone_id) {
          const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(body.sub_zone_id);
          if (!subZone) return reply.code(400).send({ error: `sub_zone_id "${body.sub_zone_id}" does not exist` });
        }
        updates.push('sub_zone_id = ?');
        values.push(body.sub_zone_id ?? null);
      }

      if ('plant_count_initial' in body) {
        const assignmentCount = (
          db.prepare('SELECT COUNT(*) as n FROM cv_plant_assignments WHERE batch_id = ?').get(id) as { n: number }
        ).n;
        if (assignmentCount > 0) {
          return reply.code(400).send({ error: 'Cannot change plant_count_initial once plant assignments exist' });
        }
        updates.push('plant_count_initial = ?');
        values.push(Number(body.plant_count_initial));
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' });

      updates.push('updated_at = ?');
      values.push(now, id);

      db.prepare(`UPDATE cv_batches SET ${updates.join(', ')} WHERE batch_id = ?`).run(...values);

      const row = db.prepare(`${BATCH_SELECT} WHERE b.batch_id = ?`).get(id) as Record<string, unknown>;
      return reply.send(enrichBatch({ ...row, plant_count_current: resolvedPlantCount(row) }));
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

      let recipeBody: RecipeAssignBody;
      try { recipeBody = RecipeAssignSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { recipe_id, notes } = recipeBody;

      const db = getDB();

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(id);
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const recipe = db.prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id = ? AND active = 1').get(Number(recipe_id));
      if (!recipe) return reply.code(400).send({ error: 'recipe_id does not exist or is not active' });

      const now = new Date().toISOString();
      const userId = request.user.id;

      const newId = db.transaction(() => {
        db.prepare(`
          UPDATE cv_batch_stage_recipes SET effective_to = ? WHERE batch_id = ? AND effective_to IS NULL
        `).run(now, id);

        const r = db.prepare(`
          INSERT INTO cv_batch_stage_recipes
            (batch_id, recipe_id, effective_from, effective_to, authorized_by, notes, created_at)
          VALUES (?, ?, ?, NULL, ?, ?, ?)
        `).run(id, Number(recipe_id), now, userId, notes ?? null, now);

        return Number(r.lastInsertRowid);
      })();

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

  /**
   * POST /:id/bulk-teardown — transition all active/empty containers for a closed batch to teardown.
   * Creates a teardown_event for each container and updates container state in a single transaction.
   * Requires supervisor role. Batch must be 'closed' (or 'harvesting' with zero active assignments).
   */
  app.post<{ Params: IdParams }>(
    '/:id/bulk-teardown',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();
      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const status = batch['status'] as string;
      if (status !== 'closed') {
        if (status !== 'harvesting') {
          return reply.code(400).send({ error: `Batch must be 'closed' to run bulk teardown; currently: "${status}"` });
        }
        const activeCount = (
          db.prepare('SELECT COUNT(*) as n FROM cv_plant_assignments WHERE batch_id = ? AND unassigned_at IS NULL').get(id) as { n: number }
        ).n;
        if (activeCount > 0) {
          return reply.code(400).send({
            error: `Batch has ${activeCount} active plant assignment(s). Close the batch before running bulk teardown.`,
          });
        }
      }

      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const userId = request.user.id;

      const containers = db.prepare(`
        SELECT container_id, current_state FROM cv_container_state
        WHERE current_batch_id = ? AND current_state IN ('active', 'empty')
      `).all(id) as Array<{ container_id: string; current_state: string }>;

      if (containers.length === 0) {
        return reply.send({ transitioned_count: 0, teardown_ids: [] });
      }

      const teardownIds: number[] = [];

      db.transaction(() => {
        for (const c of containers) {
          const ins = db.prepare(`
            INSERT INTO cv_teardown_events
              (container_id, batch_id, started_at, plant_removed, debris_disposed,
               container_cleaned, soil_sample_collected, performed_by, notes, created_at, created_by)
            VALUES (?, ?, ?, 0, 0, 0, 0, ?, NULL, ?, ?)
          `).run(c.container_id, id, now, userId, now, userId);
          teardownIds.push(Number(ins.lastInsertRowid));

          db.prepare(`
            UPDATE cv_container_state
            SET current_state = 'teardown', state_since = ?, last_teardown_date = ?, updated_at = ?
            WHERE container_id = ?
          `).run(now, today, now, c.container_id);

          db.prepare(`
            INSERT INTO cv_container_state_transitions
              (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, created_at)
            VALUES (?, ?, 'teardown', ?, ?, ?, 'batch_closed', ?)
          `).run(c.container_id, c.current_state, now, userId, id, now);
        }
      })();

      return reply.code(201).send({
        transitioned_count: containers.length,
        teardown_ids: teardownIds,
      });
    },
  );

  /**
   * GET /:id/labor-summary — aggregate labor hours from Timetrack for this batch.
   * Calls Timetrack's /api/time-entries?cv_batch_id=<id> using a shared service key.
   * Returns { batch_id, total_hours, by_activity, by_worker, date_range } on success,
   * or { error: 'TIMETRACK_UNAVAILABLE' } with HTTP 200 if Timetrack is unreachable.
   */
  app.get<{ Params: IdParams }>(
    '/:id/labor-summary',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid batch id' });

      const timetracUrl = process.env.TIMETRACK_URL || 'http://localhost:3000';
      const serviceKey = process.env.TIMETRACK_SERVICE_KEY;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (serviceKey) headers['x-service-key'] = serviceKey;

      try {
        const r = await fetch(`${timetracUrl}/api/time-entries?cv_batch_id=${id}`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return reply.send({ error: 'TIMETRACK_UNAVAILABLE' });

        const entries = await r.json() as Array<Record<string, unknown>>;

        let totalMinutes = 0;
        const byActivity: Record<string, number> = {};
        const byWorkerMap: Record<string, { name: string; minutes: number }> = {};
        let minDate: string | null = null;
        let maxDate: string | null = null;

        for (const e of entries) {
          const mins = Number(e['duration_minutes'] ?? 0);
          totalMinutes += mins;

          const code = String(e['activity_code'] ?? 'unknown');
          byActivity[code] = (byActivity[code] ?? 0) + mins;

          const wid = String(e['worker_id']);
          if (!byWorkerMap[wid]) byWorkerMap[wid] = { name: String(e['worker_name'] ?? wid), minutes: 0 };
          byWorkerMap[wid].minutes += mins;

          const d = String(e['date'] ?? '');
          if (d) {
            if (!minDate || d < minDate) minDate = d;
            if (!maxDate || d > maxDate) maxDate = d;
          }
        }

        return reply.send({
          batch_id: id,
          total_hours: Math.round(totalMinutes / 60 * 100) / 100,
          by_activity: Object.entries(byActivity).map(([activity_code, mins]) => ({
            activity_code,
            hours: Math.round(mins / 60 * 100) / 100,
          })),
          by_worker: Object.values(byWorkerMap).map(w => ({
            name: w.name,
            hours: Math.round(w.minutes / 60 * 100) / 100,
          })),
          date_range: minDate && maxDate ? { start: minDate, end: maxDate } : null,
        });
      } catch {
        return reply.send({ error: 'TIMETRACK_UNAVAILABLE' });
      }
    },
  );
};

export default batchesRoutes;
