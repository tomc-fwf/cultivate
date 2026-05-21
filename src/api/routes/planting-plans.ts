import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';

interface IdParams { id: string }
interface ItemIdParams { id: string; itemId: string }

const PlanCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  sub_zone_id: z.string().min(1),
  plants_to_place: z.number().int().positive(),
  notes: z.string().nullable().optional(),
});
type PlanCreateBody = z.infer<typeof PlanCreateSchema>;

const ItemAddSchema = z.object({
  container_id: z.string().min(1),
  plants_count: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
});

interface ItemAddBody {
  container_id: string;
  plants_count?: number;
  notes?: string | null;
}

interface ItemAddBulkBody {
  items: Array<{ container_id: string; plants_count?: number; notes?: string | null }>;
}

const CommitSchema = z.object({
  // Commit specific items. Omit or pass empty array to commit all draft items.
  item_ids: z.array(z.number().int().positive()).optional(),
});
type CommitBody = z.infer<typeof CommitSchema>;

const SupersedeSchema = z.object({
  notes: z.string().nullable().optional(),
});
type SupersedeBody = z.infer<typeof SupersedeSchema>;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the cv_locations.location_id for a given sub_zone_id.
 * Field locations are seeded 1:1 with sub_zones in 011_locations.
 */
function fieldLocationForSubZone(
  db: ReturnType<typeof import('../../db/index.js').getDB>,
  subZoneId: string,
): number | null {
  const row = db.prepare(
    'SELECT location_id FROM cv_locations WHERE sub_zone_id = ? AND active = 1'
  ).get(subZoneId) as { location_id: number } | undefined;
  return row?.location_id ?? null;
}

/**
 * Enriched SELECT for a single plan including item counts.
 */
const PLAN_SELECT = `
  SELECT p.*,
         b.status AS batch_status,
         b.current_location_id AS batch_current_location_id,
         s.name AS strain_name,
         s.type AS strain_type,
         b.plants_per_container AS batch_plants_per_container,
         sz.pot_size_gal,
         sz.container_count AS sub_zone_container_count,
         COALESCE((SELECT COUNT(*) FROM cv_planting_plan_items i
                   WHERE i.plan_id = p.plan_id AND i.status = 'draft'), 0) AS draft_count,
         COALESCE((SELECT COUNT(*) FROM cv_planting_plan_items i
                   WHERE i.plan_id = p.plan_id AND i.status = 'committed'), 0) AS committed_count,
         COALESCE((SELECT COUNT(*) FROM cv_planting_plan_items i
                   WHERE i.plan_id = p.plan_id AND i.status = 'cancelled'), 0) AS cancelled_count
  FROM cv_planting_plans p
  JOIN cv_batches b ON b.batch_id = p.batch_id
  JOIN cv_strains s ON s.strain_id = b.strain_id
  JOIN cv_sub_zones sz ON sz.sub_zone_id = p.sub_zone_id
`;

const plantingPlansRoutes: FastifyPluginAsync = async (app) => {

  // ── GET / — list plans ────────────────────────────────────────────────────

  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const q = request.query as {
      batch_id?: string;
      sub_zone_id?: string;
      status?: string;
    };

    const db = getDB();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.batch_id) { conditions.push('p.batch_id = ?'); params.push(Number(q.batch_id)); }
    if (q.sub_zone_id) { conditions.push('p.sub_zone_id = ?'); params.push(q.sub_zone_id); }
    if (q.status) { conditions.push('p.status = ?'); params.push(q.status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const plans = db.prepare(`${PLAN_SELECT} ${where} ORDER BY p.created_at DESC`)
      .all(...params) as Record<string, unknown>[];

    return reply.send(plans);
  });

  // ── GET /:id — plan detail with items ────────────────────────────────────

  app.get<{ Params: IdParams }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid plan id' });

    const db = getDB();
    const plan = db.prepare(`${PLAN_SELECT} WHERE p.plan_id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!plan) return reply.code(404).send({ error: 'Plan not found' });

    const items = db.prepare(`
      SELECT i.*,
             cs.current_state AS container_current_state,
             c.row_id,
             r.row_number,
             r.sub_zone_id
      FROM cv_planting_plan_items i
      JOIN cv_containers c ON c.container_id = i.container_id
      JOIN cv_rows r ON r.row_id = c.row_id
      LEFT JOIN cv_container_state cs ON cs.container_id = i.container_id
      WHERE i.plan_id = ?
      ORDER BY r.row_number, c.position
    `).all(id) as Array<Record<string, unknown>>;

    return reply.send({ ...plan, items });
  });

  // ── POST / — create a new draft plan ─────────────────────────────────────

  app.post<{ Body: PlanCreateBody }>(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      let planBody: PlanCreateBody;
      try { planBody = PlanCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { batch_id, sub_zone_id, plants_to_place, notes } = planBody;

      const db = getDB();

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(Number(batch_id)) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });

      const allowedStatuses = ['germ', 'seedling', 'cult-hoop', 'field-veg'];
      if (!allowedStatuses.includes(batch['status'] as string)) {
        return reply.code(400).send({
          error: `Cannot create a planting plan for a batch in "${batch['status']}" status`,
        });
      }

      const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(sub_zone_id);
      if (!subZone) return reply.code(400).send({ error: `sub_zone_id "${sub_zone_id}" does not exist` });

      // Only one active/draft plan per batch at a time
      const existing = db.prepare(`
        SELECT plan_id FROM cv_planting_plans
        WHERE batch_id = ? AND status IN ('draft', 'active')
      `).get(Number(batch_id)) as { plan_id: number } | undefined;
      if (existing) {
        return reply.code(409).send({
          error: `Batch already has an active plan (plan_id ${existing.plan_id}). Supersede it to create a new version.`,
        });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      // Determine version number (1 unless this batch+subzone has had prior plans)
      const priorVersion = db.prepare(`
        SELECT MAX(version) AS v FROM cv_planting_plans WHERE batch_id = ? AND sub_zone_id = ?
      `).get(Number(batch_id), sub_zone_id) as { v: number | null };
      const version = (priorVersion.v ?? 0) + 1;

      const r = db.prepare(`
        INSERT INTO cv_planting_plans
          (batch_id, sub_zone_id, version, status, supersedes_plan_id, plants_to_place,
           notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?)
      `).run(Number(batch_id), sub_zone_id, version, plants_to_place, notes ?? null, userId, now, now);

      const plan = db.prepare(`${PLAN_SELECT} WHERE p.plan_id = ?`)
        .get(Number(r.lastInsertRowid)) as Record<string, unknown>;

      return reply.code(201).send({ ...plan, items: [] });
    },
  );

  // ── POST /:id/items — add items to a draft plan ───────────────────────────

  app.post<{ Params: IdParams; Body: ItemAddBulkBody }>(
    '/:id/items',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid plan id' });

      const body = request.body;
      const rawItems = Array.isArray(body?.items) ? body.items : body as unknown as ItemAddBulkBody['items'];
      const items: ItemAddBulkBody['items'] = Array.isArray(rawItems) ? rawItems : [body as unknown as ItemAddBody];

      if (!items.length) return reply.code(400).send({ error: 'items array is required and must not be empty' });

      // Validate each item's structure with Zod
      try { items.forEach((item) => ItemAddSchema.parse(item)); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const plan = db.prepare('SELECT * FROM cv_planting_plans WHERE plan_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });
      if (plan['status'] !== 'draft') {
        return reply.code(400).send({ error: `Cannot add items to a plan in "${plan['status']}" status` });
      }

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?')
        .get(plan['batch_id'] as number) as Record<string, unknown>;
      const defaultPlantsCount = Number(batch['plants_per_container'] ?? 1);
      const subZoneId = plan['sub_zone_id'] as string;

      const errors: string[] = [];
      const now = new Date().toISOString();
      const userId = request.user.id;

      const insertItem = db.transaction((itemList: ItemAddBulkBody['items']) => {
        const inserted: number[] = [];

        for (const item of itemList) {
          if (!item.container_id) { errors.push('container_id is required for each item'); continue; }

          // Container must belong to this sub_zone
          const container = db.prepare(`
            SELECT c.container_id, r.sub_zone_id
            FROM cv_containers c
            JOIN cv_rows r ON r.row_id = c.row_id
            WHERE c.container_id = ?
          `).get(item.container_id) as { container_id: string; sub_zone_id: string } | undefined;

          if (!container) { errors.push(`Container "${item.container_id}" does not exist`); continue; }
          if (container.sub_zone_id !== subZoneId) {
            errors.push(`Container "${item.container_id}" is not in sub_zone ${subZoneId}`);
            continue;
          }

          // Container must be ready
          const state = db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?')
            .get(item.container_id) as { current_state: string } | undefined;
          if (state?.current_state !== 'ready') {
            errors.push(`Container "${item.container_id}" is not in ready state (currently: ${state?.current_state ?? 'unknown'})`);
            continue;
          }

          // No double-booking: not already in another active/draft plan
          const dupe = db.prepare(`
            SELECT i.item_id FROM cv_planting_plan_items i
            JOIN cv_planting_plans p ON p.plan_id = i.plan_id
            WHERE i.container_id = ? AND i.status = 'draft' AND p.status IN ('draft', 'active') AND i.plan_id != ?
          `).get(item.container_id, id);
          if (dupe) {
            errors.push(`Container "${item.container_id}" is already in another active plan`);
            continue;
          }

          // No duplicate within this plan
          const existingInPlan = db.prepare(`
            SELECT item_id FROM cv_planting_plan_items WHERE plan_id = ? AND container_id = ? AND status != 'cancelled'
          `).get(id, item.container_id);
          if (existingInPlan) {
            errors.push(`Container "${item.container_id}" is already in this plan`);
            continue;
          }

          const r = db.prepare(`
            INSERT INTO cv_planting_plan_items
              (plan_id, container_id, plants_count, status, notes, created_at)
            VALUES (?, ?, ?, 'draft', ?, ?)
          `).run(id, item.container_id, item.plants_count ?? defaultPlantsCount, item.notes ?? null, now);

          inserted.push(Number(r.lastInsertRowid));
        }

        if (errors.length) throw new Error(errors.join('; '));
        return inserted;
      });

      let insertedIds: number[];
      try {
        insertedIds = insertItem(items);
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message });
      }

      // Return updated plan + items
      const updatedPlan = db.prepare(`${PLAN_SELECT} WHERE p.plan_id = ?`).get(id) as Record<string, unknown>;
      const updatedItems = db.prepare(`
        SELECT i.*, cs.current_state AS container_current_state, c.row_id, r.row_number, r.sub_zone_id
        FROM cv_planting_plan_items i
        JOIN cv_containers c ON c.container_id = i.container_id
        JOIN cv_rows r ON r.row_id = c.row_id
        LEFT JOIN cv_container_state cs ON cs.container_id = i.container_id
        WHERE i.plan_id = ? ORDER BY r.row_number, c.position
      `).all(id) as Array<Record<string, unknown>>;

      return reply.code(201).send({ ...updatedPlan, items: updatedItems, inserted_ids: insertedIds });
    },
  );

  // ── DELETE /:id/items/:itemId — remove a draft item ──────────────────────

  app.delete<{ Params: ItemIdParams }>(
    '/:id/items/:itemId',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      const itemId = Number(request.params.itemId);
      if (isNaN(id) || isNaN(itemId)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();
      const item = db.prepare('SELECT * FROM cv_planting_plan_items WHERE item_id = ? AND plan_id = ?')
        .get(itemId, id) as Record<string, unknown> | undefined;
      if (!item) return reply.code(404).send({ error: 'Item not found' });
      if (item['status'] !== 'draft') {
        return reply.code(400).send({ error: `Cannot remove a "${item['status']}" item` });
      }

      db.prepare("UPDATE cv_planting_plan_items SET status = 'cancelled' WHERE item_id = ?").run(itemId);
      return reply.code(204).send();
    },
  );

  // ── POST /:id/commit — commit draft items (partial or full) ──────────────
  //
  // For each committed item:
  //   - Creates cv_plant_assignment records (one per plants_count, no METRC tag yet)
  //   - Transitions container: ready → active
  //   - Writes container state transition log
  //   - Updates plan item to committed
  //
  // On first commit of any item in the plan:
  //   - Plan status → active, activated_at stamped
  //
  // On first field placement for the batch (batch still in cult-hoop):
  //   - Batch transitions to field-veg
  //   - Writes cv_batch_phase_history (pending METRC sync)
  //   - Writes cv_batch_location_history (pending METRC sync)
  //   - Updates batch.current_location_id to the field sub-zone location

  app.post<{ Params: IdParams; Body: CommitBody }>(
    '/:id/commit',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid plan id' });

      const db = getDB();
      const plan = db.prepare('SELECT * FROM cv_planting_plans WHERE plan_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });

      if (!['draft', 'active'].includes(plan['status'] as string)) {
        return reply.code(400).send({ error: `Cannot commit a plan in "${plan['status']}" status` });
      }

      let commitBody: CommitBody;
      try { commitBody = CommitSchema.parse(request.body ?? {}); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { item_ids } = commitBody;
      const userId = request.user.id;
      const now = new Date().toISOString();

      // Resolve which items to commit
      let targetItems: Array<Record<string, unknown>>;
      if (item_ids && item_ids.length > 0) {
        targetItems = db.prepare(`
          SELECT * FROM cv_planting_plan_items
          WHERE plan_id = ? AND item_id IN (${item_ids.map(() => '?').join(',')}) AND status = 'draft'
        `).all(id, ...item_ids) as Array<Record<string, unknown>>;

        if (targetItems.length !== item_ids.length) {
          return reply.code(400).send({ error: 'One or more item_ids not found or not in draft status' });
        }
      } else {
        targetItems = db.prepare(
          "SELECT * FROM cv_planting_plan_items WHERE plan_id = ? AND status = 'draft'"
        ).all(id) as Array<Record<string, unknown>>;
      }

      if (!targetItems.length) {
        return reply.code(400).send({ error: 'No draft items to commit' });
      }

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?')
        .get(plan['batch_id'] as number) as Record<string, unknown>;
      const subZoneId = plan['sub_zone_id'] as string;
      const fieldLocationId = fieldLocationForSubZone(db, subZoneId);

      if (!fieldLocationId) {
        return reply.code(500).send({ error: `No field location found for sub_zone ${subZoneId}` });
      }

      const committedAssignmentIds: number[] = [];

      db.transaction(() => {
        for (const item of targetItems) {
          const containerId = item['container_id'] as string;
          const plantsCount = Number(item['plants_count'] ?? 1);

          // Re-validate container is still ready at commit time
          const state = db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?')
            .get(containerId) as { current_state: string } | undefined;
          if (state?.current_state !== 'ready') {
            throw new Error(
              `Container "${containerId}" is no longer ready (currently: ${state?.current_state ?? 'unknown'}). Refresh the plan before committing.`
            );
          }

          // Create one plant_assignment per plant in this container
          let firstAssignmentId: number | null = null;
          for (let i = 0; i < plantsCount; i++) {
            const r = db.prepare(`
              INSERT INTO cv_plant_assignments
                (batch_id, container_id, metrc_plant_tag, placed_at, placed_by,
                 tagged_at, tagged_by, created_at)
              VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?)
            `).run(plan['batch_id'], containerId, now, userId, now);
            const assignmentId = Number(r.lastInsertRowid);
            committedAssignmentIds.push(assignmentId);
            if (firstAssignmentId === null) firstAssignmentId = assignmentId;
          }

          // Transition container: ready → active
          const fromState = state.current_state;
          db.prepare(`
            UPDATE cv_container_state
            SET current_state = 'active', current_batch_id = ?, state_since = ?, updated_at = ?
            WHERE container_id = ?
          `).run(plan['batch_id'], now, now, containerId);

          db.prepare(`
            INSERT INTO cv_container_state_transitions
              (container_id, from_state, to_state, transitioned_at, transitioned_by,
               batch_id, trigger_event, notes, created_at)
            VALUES (?, ?, 'active', ?, ?, ?, 'batch_assigned', ?, ?)
          `).run(containerId, fromState, now, userId, plan['batch_id'],
                 `Planting plan ${id} v${plan['version']} commit`, now);

          // Mark plan item committed
          db.prepare(`
            UPDATE cv_planting_plan_items
            SET status = 'committed', committed_at = ?, committed_by = ?, plant_assignment_id = ?
            WHERE item_id = ?
          `).run(now, userId, firstAssignmentId, item['item_id']);
        }

        // Activate plan if this is the first commit
        if (plan['status'] === 'draft') {
          db.prepare(`
            UPDATE cv_planting_plans SET status = 'active', activated_at = ?, updated_at = ? WHERE plan_id = ?
          `).run(now, now, id);
        } else {
          db.prepare('UPDATE cv_planting_plans SET updated_at = ? WHERE plan_id = ?').run(now, id);
        }

        // If batch is still in cult-hoop, trigger the field-veg phase transition.
        // This is the one place cult-hoop → field-veg is initiated — not the transition endpoint.
        if (batch['status'] === 'cult-hoop') {
          const fromLocationId = batch['current_location_id'] as number | null;

          db.prepare(`
            UPDATE cv_batches
            SET status = 'field-veg', current_stage_since = ?, field_move_date = ?,
                current_location_id = ?, sub_zone_id = ?, updated_at = ?
            WHERE batch_id = ?
          `).run(now, now, fieldLocationId, subZoneId, now, plan['batch_id']);

          db.prepare(`
            INSERT INTO cv_batch_phase_history
              (batch_id, from_status, to_status, transitioned_at, transitioned_by,
               notes, metrc_sync_status, created_at)
            VALUES (?, 'cult-hoop', 'field-veg', ?, ?, ?, 'pending', ?)
          `).run(plan['batch_id'], now, userId,
                 `First field placement via planting plan ${id} v${plan['version']}`, now);

          db.prepare(`
            INSERT INTO cv_batch_location_history
              (batch_id, from_location_id, to_location_id, moved_at, moved_by,
               trigger, planting_plan_id, metrc_sync_status, created_at)
            VALUES (?, ?, ?, ?, ?, 'planting_plan_commit', ?, 'pending', ?)
          `).run(plan['batch_id'], fromLocationId ?? null, fieldLocationId, now, userId, id, now);
        }
      })();

      const updatedPlan = db.prepare(`${PLAN_SELECT} WHERE p.plan_id = ?`).get(id) as Record<string, unknown>;
      const updatedItems = db.prepare(`
        SELECT i.*, cs.current_state AS container_current_state, c.row_id, r.row_number, r.sub_zone_id
        FROM cv_planting_plan_items i
        JOIN cv_containers c ON c.container_id = i.container_id
        JOIN cv_rows r ON r.row_id = c.row_id
        LEFT JOIN cv_container_state cs ON cs.container_id = i.container_id
        WHERE i.plan_id = ? ORDER BY r.row_number, c.position
      `).all(id) as Array<Record<string, unknown>>;

      return reply.send({
        ...updatedPlan,
        items: updatedItems,
        committed_assignment_ids: committedAssignmentIds,
      });
    },
  );

  // ── POST /:id/supersede — create a new version of the plan ───────────────
  //
  // Copies uncommitted (draft) items from the current plan into a new plan v+1.
  // Marks the current plan as superseded and cancels its remaining draft items.
  // Committed items are locked — they stay committed and are not carried forward.

  app.post<{ Params: IdParams; Body: SupersedeBody }>(
    '/:id/supersede',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid plan id' });

      const db = getDB();
      const plan = db.prepare('SELECT * FROM cv_planting_plans WHERE plan_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });

      if (!['draft', 'active'].includes(plan['status'] as string)) {
        return reply.code(400).send({ error: `Cannot supersede a plan in "${plan['status']}" status` });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      let supersedeBody: SupersedeBody;
      try { supersedeBody = SupersedeSchema.parse(request.body ?? {}); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { notes } = supersedeBody;

      const draftItems = db.prepare(
        "SELECT * FROM cv_planting_plan_items WHERE plan_id = ? AND status = 'draft'"
      ).all(id) as Array<Record<string, unknown>>;

      const newPlanId = db.transaction(() => {
        // Create new plan version
        const r = db.prepare(`
          INSERT INTO cv_planting_plans
            (batch_id, sub_zone_id, version, status, supersedes_plan_id, plants_to_place,
             notes, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
        `).run(
          plan['batch_id'],
          plan['sub_zone_id'],
          Number(plan['version']) + 1,
          id,
          plan['plants_to_place'],
          notes ?? plan['notes'] ?? null,
          userId, now, now,
        );
        const newId = Number(r.lastInsertRowid);

        // Copy draft items into new plan
        for (const item of draftItems) {
          db.prepare(`
            INSERT INTO cv_planting_plan_items
              (plan_id, container_id, plants_count, status, notes, created_at)
            VALUES (?, ?, ?, 'draft', ?, ?)
          `).run(newId, item['container_id'], item['plants_count'], item['notes'] ?? null, now);
        }

        // Cancel remaining draft items in old plan
        db.prepare(`
          UPDATE cv_planting_plan_items SET status = 'cancelled' WHERE plan_id = ? AND status = 'draft'
        `).run(id);

        // Mark old plan superseded
        db.prepare(`
          UPDATE cv_planting_plans SET status = 'superseded', superseded_at = ?, updated_at = ? WHERE plan_id = ?
        `).run(now, now, id);

        return newId;
      })();

      const newPlan = db.prepare(`${PLAN_SELECT} WHERE p.plan_id = ?`).get(newPlanId) as Record<string, unknown>;
      const newItems = db.prepare(`
        SELECT i.*, cs.current_state AS container_current_state, c.row_id, r.row_number, r.sub_zone_id
        FROM cv_planting_plan_items i
        JOIN cv_containers c ON c.container_id = i.container_id
        JOIN cv_rows r ON r.row_id = c.row_id
        LEFT JOIN cv_container_state cs ON cs.container_id = i.container_id
        WHERE i.plan_id = ? ORDER BY r.row_number, c.position
      `).all(newPlanId) as Array<Record<string, unknown>>;

      return reply.code(201).send({ ...newPlan, items: newItems });
    },
  );

  // ── PATCH /:id/cancel — cancel a draft plan ───────────────────────────────
  // Only allowed if no items have been committed (plan has never been activated).

  app.patch<{ Params: IdParams }>(
    '/:id/cancel',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid plan id' });

      const db = getDB();
      const plan = db.prepare('SELECT * FROM cv_planting_plans WHERE plan_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!plan) return reply.code(404).send({ error: 'Plan not found' });

      if (plan['status'] !== 'draft') {
        return reply.code(400).send({
          error: plan['status'] === 'active'
            ? 'Cannot cancel a plan that has committed items. Supersede it instead.'
            : `Plan is already "${plan['status']}"`,
        });
      }

      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare("UPDATE cv_planting_plan_items SET status = 'cancelled' WHERE plan_id = ? AND status = 'draft'").run(id);
        db.prepare("UPDATE cv_planting_plans SET status = 'cancelled', updated_at = ? WHERE plan_id = ?").run(now, id);
      })();

      return reply.code(204).send();
    },
  );
};

export default plantingPlansRoutes;
