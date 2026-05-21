import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const PlantLossSchema = z.object({
  batch_id: z.number().int().positive(),
  container_id: z.string().min(1),
  plant_assignment_id: z.number().int().positive(),
  loss_type: z.enum([
    'death_natural', 'death_disease', 'death_pest', 'physical_damage',
    'removal_culled', 'removal_quality', 'accidental', 'other',
  ]),
  loss_cause: z.string().nullable().optional(),
  plant_disposition: z.enum(['disposed_compost', 'disposed_waste', 'quarantined', 'tested', 'other']),
  occurred_at: z.string().optional(),
  notes: z.string().nullable().optional(),
});
type PlantLossBody = z.infer<typeof PlantLossSchema>;

const PlantReplacementSchema = z.object({
  batch_id: z.number().int().positive(),
  container_id: z.string().min(1),
  placed_at: z.string().optional(),
  notes: z.string().nullable().optional(),
});
type PlantReplacementBody = z.infer<typeof PlantReplacementSchema>;

// Map loss_type to unassign_reason enum values on cv_plant_assignments
function lossTypeToUnassignReason(lossType: string): string {
  if (lossType.startsWith('death_')) return 'died';
  if (lossType === 'physical_damage' || lossType.startsWith('removal_')) return 'destroyed';
  return 'other';
}

const plantLossRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST / — record a plant loss event.
   *
   * Validates that the batch is not closed, the assignment is active and belongs
   * to the specified batch/container, and the container is currently 'active'.
   *
   * In a single transaction:
   *   1. Inserts cv_plant_loss_events
   *   2. Unassigns the plant_assignment
   *   3. If no active assignments remain → transitions container active → empty
   */
  app.post<{ Body: PlantLossBody }>('/', { preHandler: requireAuth }, async (request, reply) => {
    let body: PlantLossBody;
    try { body = PlantLossSchema.parse(request.body); }
    catch (e: unknown) {
      if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
      throw e;
    }

    const { batch_id, container_id, plant_assignment_id, loss_type, loss_cause, plant_disposition, notes } = body;
    const occurred_at = body.occurred_at ?? new Date().toISOString();

    const db = getDB();
    const userId = request.user.id;
    const now = new Date().toISOString();

    // Batch must exist and not be closed
    const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(Number(batch_id)) as Record<string, unknown> | undefined;
    if (!batch) return reply.code(404).send({ error: 'Batch not found' });
    if (batch['status'] === 'closed') return reply.code(400).send({ error: 'Cannot record plant loss for a closed batch' });

    // Assignment must be active (unassigned_at IS NULL) and belong to this batch + container
    const assignment = db.prepare(`
      SELECT * FROM cv_plant_assignments
      WHERE assignment_id = ? AND unassigned_at IS NULL
    `).get(Number(plant_assignment_id)) as Record<string, unknown> | undefined;

    if (!assignment) return reply.code(400).send({ error: 'Plant assignment not found or already unassigned' });
    if (Number(assignment['batch_id']) !== Number(batch_id)) {
      return reply.code(400).send({ error: 'Plant assignment does not belong to this batch' });
    }
    if (assignment['container_id'] !== container_id) {
      return reply.code(400).send({ error: 'Plant assignment does not belong to this container' });
    }

    // Container must be in 'active' state
    const containerState = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(container_id) as Record<string, unknown> | undefined;
    if (!containerState) return reply.code(404).send({ error: 'Container state not found' });
    if (containerState['current_state'] !== 'active') {
      return reply.code(400).send({
        error: `Container is "${containerState['current_state']}", not "active". Only active containers can have a plant loss recorded.`,
      });
    }

    const unassignReason = lossTypeToUnassignReason(loss_type);
    // Denormalize metrc_plant_tag; empty string if plant was placed but never tagged
    const metrcTag = (assignment['metrc_plant_tag'] as string | null) ?? '';

    const lossId = db.transaction(() => {
      // 1. Insert plant loss event
      const r = db.prepare(`
        INSERT INTO cv_plant_loss_events
          (batch_id, container_id, plant_assignment_id, metrc_plant_tag,
           occurred_at, discovered_at, loss_type, loss_cause,
           plant_disposition, plant_count, reported_by, metrc_sync_status,
           notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending', ?, ?)
      `).run(
        Number(batch_id), container_id, Number(plant_assignment_id), metrcTag,
        occurred_at, now, loss_type, loss_cause ?? null,
        plant_disposition, userId, notes ?? null, now,
      );

      // 2. Unassign the plant assignment
      db.prepare(`
        UPDATE cv_plant_assignments
        SET unassigned_at = ?, unassign_reason = ?, unassigned_by = ?
        WHERE assignment_id = ?
      `).run(now, unassignReason, userId, Number(plant_assignment_id));

      // 3. Check remaining active assignments for this container in this batch
      const { n: activeCount } = db.prepare(`
        SELECT COUNT(*) AS n FROM cv_plant_assignments
        WHERE container_id = ? AND batch_id = ? AND unassigned_at IS NULL
      `).get(container_id, Number(batch_id)) as { n: number };

      if (activeCount === 0) {
        // No plants remain — transition container active → empty
        db.prepare(`
          UPDATE cv_container_state
          SET current_state = 'empty', state_since = ?, updated_at = ?
          WHERE container_id = ?
        `).run(now, now, container_id);

        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by,
             batch_id, trigger_event, created_at)
          VALUES (?, 'active', 'empty', ?, ?, ?, 'plant_loss', ?)
        `).run(container_id, now, userId, Number(batch_id), now);
      }

      return Number(r.lastInsertRowid);
    })();

    const lossEvent = db.prepare(`
      SELECT ple.*, u.name AS reported_by_name
      FROM cv_plant_loss_events ple
      LEFT JOIN cv_users u ON u.id = ple.reported_by
      WHERE ple.loss_id = ?
    `).get(lossId);

    return reply.code(201).send(lossEvent);
  });

  /**
   * GET / — list plant loss events with optional filters.
   * Filters: ?batch_id, ?container_id, ?metrc_sync_status
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const q = request.query as { batch_id?: string; container_id?: string; metrc_sync_status?: string };
    const db = getDB();

    let sql = `
      SELECT ple.*,
             b.status AS batch_status,
             s.name AS strain_name,
             u.name AS reported_by_name
      FROM cv_plant_loss_events ple
      JOIN cv_batches b ON b.batch_id = ple.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = ple.reported_by
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (q.batch_id) { sql += ' AND ple.batch_id = ?'; params.push(Number(q.batch_id)); }
    if (q.container_id) { sql += ' AND ple.container_id = ?'; params.push(q.container_id); }
    if (q.metrc_sync_status) { sql += ' AND ple.metrc_sync_status = ?'; params.push(q.metrc_sync_status); }

    sql += ' ORDER BY ple.occurred_at DESC';

    const rows = db.prepare(sql).all(...params);
    return reply.send(rows);
  });

  /**
   * POST /replacements — assign a replacement plant to an empty container.
   *
   * The new assignment is created without a METRC tag (null); the tag-assignment
   * workflow is used separately to associate a tag once the plant is physically placed.
   *
   * In a single transaction:
   *   1. Inserts a new cv_plant_assignments row (metrc_plant_tag = NULL)
   *   2. Transitions container empty → active
   */
  app.post<{ Body: PlantReplacementBody }>('/replacements', { preHandler: requireAuth }, async (request, reply) => {
    let body: PlantReplacementBody;
    try { body = PlantReplacementSchema.parse(request.body); }
    catch (e: unknown) {
      if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
      throw e;
    }

    const { batch_id, container_id, notes } = body;
    const placed_at = body.placed_at ?? new Date().toISOString();

    const db = getDB();
    const userId = request.user.id;
    const now = new Date().toISOString();

    // Batch must exist and not be closed
    const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(Number(batch_id)) as Record<string, unknown> | undefined;
    if (!batch) return reply.code(404).send({ error: 'Batch not found' });
    if (batch['status'] === 'closed') return reply.code(400).send({ error: 'Cannot assign replacement in a closed batch' });

    // Container must exist
    const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(container_id);
    if (!container) return reply.code(404).send({ error: `Container "${container_id}" not found` });

    // Container must be 'empty' and in this batch
    const containerState = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(container_id) as Record<string, unknown> | undefined;
    if (!containerState) return reply.code(404).send({ error: 'Container state not found' });
    if (containerState['current_state'] !== 'empty') {
      return reply.code(400).send({
        error: `Container is "${containerState['current_state']}", not "empty". Only empty containers can receive a replacement plant.`,
      });
    }
    if (Number(containerState['current_batch_id']) !== Number(batch_id)) {
      return reply.code(400).send({ error: 'Container is not assigned to this batch' });
    }

    const assignmentId = db.transaction(() => {
      // 1. Create new placement — no METRC tag yet; tag comes via tag-assignment workflow
      const r = db.prepare(`
        INSERT INTO cv_plant_assignments
          (batch_id, container_id, metrc_plant_tag, placed_at, placed_by, created_at)
        VALUES (?, ?, NULL, ?, ?, ?)
      `).run(Number(batch_id), container_id, placed_at, userId, now);

      const newId = Number(r.lastInsertRowid);

      // 2. Transition container empty → active
      db.prepare(`
        UPDATE cv_container_state
        SET current_state = 'active', state_since = ?, updated_at = ?
        WHERE container_id = ?
      `).run(now, now, container_id);

      db.prepare(`
        INSERT INTO cv_container_state_transitions
          (container_id, from_state, to_state, transitioned_at, transitioned_by,
           batch_id, trigger_event, notes, created_at)
        VALUES (?, 'empty', 'active', ?, ?, ?, 'plant_replaced', ?, ?)
      `).run(container_id, now, userId, Number(batch_id), notes ?? null, now);

      return newId;
    })();

    const assignment = db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId);
    return reply.code(201).send(assignment);
  });
};

export default plantLossRoutes;
