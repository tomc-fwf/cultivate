import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';

interface ContainerIdParams { containerId: string }

// METRC plant tags are 24 alphanumeric characters.
const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;

function isValidTag(tag: string): boolean {
  return METRC_TAG_RE.test(tag);
}

// Enriched assignment row returned by most endpoints
const ASSIGNMENT_SELECT = `
  SELECT pa.*,
         c.row_id,
         r.row_number,
         r.sub_zone_id,
         cs.current_state AS container_state,
         b.status AS batch_status,
         s.name AS strain_name
  FROM cv_plant_assignments pa
  JOIN cv_containers c ON c.container_id = pa.container_id
  JOIN cv_rows r ON r.row_id = c.row_id
  LEFT JOIN cv_container_state cs ON cs.container_id = pa.container_id
  LEFT JOIN cv_batches b ON b.batch_id = pa.batch_id
  LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
`;

const AssignSchema = z.object({
  container_id: z.string().min(1),
  metrc_plant_tag: z.string().regex(/^[A-Za-z0-9]{24}$/, 'metrc_plant_tag must be exactly 24 alphanumeric characters'),
  // Required when the container has more than one untagged placement (plants_per_container > 1)
  assignment_id: z.number().int().positive().optional(),
});
type AssignBody = z.infer<typeof AssignSchema>;

const BulkAssignSchema = z.object({
  assignments: z.array(z.object({
    container_id: z.string().min(1),
    metrc_plant_tag: z.string().regex(/^[A-Za-z0-9]{24}$/, 'metrc_plant_tag must be exactly 24 alphanumeric characters'),
    assignment_id: z.number().int().positive().optional(),
  })).min(1),
});
type BulkAssignBody = z.infer<typeof BulkAssignSchema>;

// Reassign a tag that is already active on one assignment to a different untagged assignment.
// Used after the caller receives a 409 TAG_ALREADY_ASSIGNED conflict, or to correct a
// mis-scan. The physical plants do not move — only the METRC tag metadata is corrected.
const ReassignSchema = z.object({
  metrc_plant_tag: z.string().regex(/^[A-Za-z0-9]{24}$/, 'metrc_plant_tag must be exactly 24 alphanumeric characters'),
  from_assignment_id: z.number().int().positive(),
  to_container_id: z.string().min(1),
  to_assignment_id: z.number().int().positive().optional(),
  reason: z.string().min(1, 'reason is required for tag reassignment'),
});
type ReassignBody = z.infer<typeof ReassignSchema>;

// Move a plant (assignment) to a different physical container.
// Used when a plant is potted up, transplanted, or relocated.
// The tag and batch association follow the plant; container states are updated.
const MoveSchema = z.object({
  to_container_id: z.string().min(1, 'to_container_id is required'),
  reason: z.string().min(1, 'reason is required'),
  notes: z.string().nullable().optional(),
});
type MoveBody = z.infer<typeof MoveSchema>;

interface AssignmentMoveParams { assignmentId: string }

const tagAssignmentsRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /untagged — list placements awaiting a METRC tag ─────────────────
  // Primary feed for the walk-through tagging workflow. Returns active
  // plant_assignments where metrc_plant_tag IS NULL, grouped by row.
  // Filters: ?batch_id, ?sub_zone_id

  app.get('/untagged', { preHandler: requireAuth }, async (request, reply) => {
    const q = request.query as { batch_id?: string; sub_zone_id?: string };
    const db = getDB();

    const conditions = ["pa.unassigned_at IS NULL", "pa.metrc_plant_tag IS NULL"];
    const params: unknown[] = [];

    if (q.batch_id) { conditions.push('pa.batch_id = ?'); params.push(Number(q.batch_id)); }
    if (q.sub_zone_id) { conditions.push('r.sub_zone_id = ?'); params.push(q.sub_zone_id); }

    const rows = db.prepare(`
      ${ASSIGNMENT_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.sub_zone_id, r.row_number, c.position
    `).all(...params) as Array<Record<string, unknown>>;

    // Group by row for the walk-through UI
    const byRow = new Map<string, { row_id: string; row_number: number; sub_zone_id: string; placements: typeof rows }>();
    for (const row of rows) {
      const rowId = row['row_id'] as string;
      if (!byRow.has(rowId)) {
        byRow.set(rowId, {
          row_id: rowId,
          row_number: row['row_number'] as number,
          sub_zone_id: row['sub_zone_id'] as string,
          placements: [],
        });
      }
      byRow.get(rowId)!.placements.push(row);
    }

    return reply.send({
      total_untagged: rows.length,
      rows: Array.from(byRow.values()),
    });
  });

  // ── GET /container/:containerId — active assignments for a container ──────

  app.get<{ Params: ContainerIdParams }>(
    '/container/:containerId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { containerId } = request.params;
      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) return reply.code(404).send({ error: 'Container not found' });

      const assignments = db.prepare(`
        ${ASSIGNMENT_SELECT}
        WHERE pa.container_id = ? AND pa.unassigned_at IS NULL
        ORDER BY pa.placed_at
      `).all(containerId) as Array<Record<string, unknown>>;

      return reply.send({
        container_id: containerId,
        active_count: assignments.length,
        tagged_count: assignments.filter(a => a['metrc_plant_tag'] !== null).length,
        untagged_count: assignments.filter(a => a['metrc_plant_tag'] === null).length,
        assignments,
      });
    },
  );

  // ── POST / — assign a METRC tag to a single untagged placement ───────────
  //
  // Returns 409 TAG_ALREADY_ASSIGNED if the tag is active on another assignment.
  // The caller must explicitly use POST /reassign to move an active tag — no
  // silent reassignment.

  app.post<{ Body: AssignBody }>(
    '/',
    { preHandler: requireAuth },
    async (request, reply) => {
      let assignBody: AssignBody;
      try { assignBody = AssignSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { container_id, metrc_plant_tag, assignment_id } = assignBody;

      const db = getDB();

      // Verify container exists
      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(container_id);
      if (!container) return reply.code(404).send({ error: 'Container not found' });

      // Check tag not already active on any assignment
      const existingTagAssignment = db.prepare(`
        ${ASSIGNMENT_SELECT}
        WHERE pa.metrc_plant_tag = ? AND pa.unassigned_at IS NULL
      `).get(metrc_plant_tag) as Record<string, unknown> | undefined;

      if (existingTagAssignment) {
        return reply.code(409).send({
          error: 'TAG_ALREADY_ASSIGNED',
          message: `Tag ${metrc_plant_tag} is already assigned to container ${existingTagAssignment['container_id']}. Use POST /reassign to move it explicitly.`,
          existing_assignment: existingTagAssignment,
        });
      }

      // Find the target assignment
      const untagged = db.prepare(`
        SELECT * FROM cv_plant_assignments
        WHERE container_id = ? AND unassigned_at IS NULL AND metrc_plant_tag IS NULL
        ORDER BY placed_at
      `).all(container_id) as Array<Record<string, unknown>>;

      if (untagged.length === 0) {
        return reply.code(400).send({
          error: 'No untagged placement found for this container. The container may already be fully tagged or has no active assignments.',
        });
      }

      let target: Record<string, unknown>;
      if (untagged.length === 1) {
        target = untagged[0];
      } else {
        // Multiple untagged placements (plants_per_container > 1)
        if (!assignment_id) {
          return reply.code(400).send({
            error: `Container has ${untagged.length} untagged placements. Provide assignment_id to specify which one to tag.`,
            untagged_assignments: untagged,
          });
        }
        const found = untagged.find(a => Number(a['assignment_id']) === assignment_id);
        if (!found) {
          return reply.code(400).send({ error: 'assignment_id not found among untagged placements for this container' });
        }
        target = found;
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      db.prepare(`
        UPDATE cv_plant_assignments
        SET metrc_plant_tag = ?, tagged_at = ?, tagged_by = ?
        WHERE assignment_id = ?
      `).run(metrc_plant_tag, now, userId, target['assignment_id']);

      const updated = db.prepare(`
        ${ASSIGNMENT_SELECT} WHERE pa.assignment_id = ?
      `).get(target['assignment_id']) as Record<string, unknown>;

      return reply.code(201).send(updated);
    },
  );

  // ── POST /bulk — assign tags to multiple placements in one call ───────────
  //
  // Processes all items in a single transaction. If any item fails validation
  // (bad format, already assigned, container not found), the entire batch is
  // rejected with a per-item error report. This is intentional — a partial
  // bulk assignment would leave the batch in an ambiguous state.

  app.post<{ Body: BulkAssignBody }>(
    '/bulk',
    { preHandler: requireAuth },
    async (request, reply) => {
      let bulkBody: BulkAssignBody;
      try { bulkBody = BulkAssignSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { assignments } = bulkBody;

      // Check for duplicate tags within the batch itself
      const errors: Array<{ index: number; container_id: string; error: string }> = [];
      const tagsSeen = new Map<string, number>();
      for (let i = 0; i < assignments.length; i++) {
        const tag = assignments[i].metrc_plant_tag;
        if (!tag) continue;
        if (tagsSeen.has(tag)) {
          errors.push({ index: i, container_id: assignments[i].container_id, error: `Duplicate tag ${tag} in this batch (also at index ${tagsSeen.get(tag)})` });
        } else {
          tagsSeen.set(tag, i);
        }
      }

      if (errors.length > 0) {
        return reply.code(400).send({ error: 'Validation failed', errors });
      }

      const db = getDB();
      const now = new Date().toISOString();
      const userId = request.user.id;

      // DB-level validation and execution in a single transaction
      const results: Array<Record<string, unknown>> = [];

      try {
        db.transaction(() => {
          for (let i = 0; i < assignments.length; i++) {
            const item = assignments[i];

            // Tag must not already be active
            const existing = db.prepare(
              'SELECT assignment_id, container_id FROM cv_plant_assignments WHERE metrc_plant_tag = ? AND unassigned_at IS NULL'
            ).get(item.metrc_plant_tag) as { assignment_id: number; container_id: string } | undefined;
            if (existing) {
              throw Object.assign(new Error(
                `Tag ${item.metrc_plant_tag} is already assigned to container ${existing.container_id}`
              ), { index: i, container_id: item.container_id, type: 'TAG_ALREADY_ASSIGNED', existing });
            }

            // Find target untagged assignment
            const untagged = db.prepare(
              'SELECT * FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL AND metrc_plant_tag IS NULL ORDER BY placed_at'
            ).all(item.container_id) as Array<Record<string, unknown>>;

            if (untagged.length === 0) {
              throw Object.assign(new Error(`No untagged placement found for container ${item.container_id}`), { index: i, container_id: item.container_id });
            }

            let target: Record<string, unknown>;
            if (untagged.length === 1) {
              target = untagged[0];
            } else {
              if (!item.assignment_id) {
                throw Object.assign(new Error(
                  `Container ${item.container_id} has ${untagged.length} untagged placements. Provide assignment_id.`
                ), { index: i, container_id: item.container_id });
              }
              const found = untagged.find(a => Number(a['assignment_id']) === item.assignment_id);
              if (!found) {
                throw Object.assign(new Error(`assignment_id ${item.assignment_id} not found for container ${item.container_id}`), { index: i, container_id: item.container_id });
              }
              target = found;
            }

            db.prepare(`
              UPDATE cv_plant_assignments SET metrc_plant_tag = ?, tagged_at = ?, tagged_by = ? WHERE assignment_id = ?
            `).run(item.metrc_plant_tag, now, userId, target['assignment_id']);

            results.push({ index: i, container_id: item.container_id, assignment_id: target['assignment_id'], metrc_plant_tag: item.metrc_plant_tag });
          }
        })();
      } catch (err: unknown) {
        const e = err as Error & { index?: number; container_id?: string; type?: string; existing?: unknown };
        return reply.code(409).send({
          error: e.type ?? 'BULK_ASSIGNMENT_FAILED',
          message: e.message,
          failed_index: e.index,
          failed_container_id: e.container_id,
          existing_assignment: e.existing ?? undefined,
        });
      }

      return reply.code(201).send({
        assigned_count: results.length,
        assignments: results,
      });
    },
  );

  // ── POST /reassign — move an active tag from one assignment to another ────
  //
  // Called after a 409 TAG_ALREADY_ASSIGNED response, or to correct a mis-scan.
  // The physical plants do not move — only the METRC tag metadata is corrected.
  //
  // from_assignment: tag is cleared (back to "placed but untagged")
  // to_assignment:   tag is applied
  //
  // Both changes are logged with the reason for audit purposes.

  app.post<{ Body: ReassignBody }>(
    '/reassign',
    { preHandler: requireAuth },
    async (request, reply) => {
      let reassignBody: ReassignBody;
      try { reassignBody = ReassignSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { metrc_plant_tag, from_assignment_id, to_container_id, to_assignment_id, reason } = reassignBody;

      const db = getDB();

      // Validate the source assignment holds this tag and is active
      const fromAssignment = db.prepare(
        'SELECT * FROM cv_plant_assignments WHERE assignment_id = ? AND unassigned_at IS NULL'
      ).get(from_assignment_id) as Record<string, unknown> | undefined;

      if (!fromAssignment) {
        return reply.code(404).send({ error: 'from_assignment_id not found or is already unassigned' });
      }
      if (fromAssignment['metrc_plant_tag'] !== metrc_plant_tag) {
        return reply.code(400).send({
          error: `Assignment ${from_assignment_id} does not hold tag ${metrc_plant_tag}. It holds: ${fromAssignment['metrc_plant_tag'] ?? '(untagged)'}`,
        });
      }

      // Find the target untagged assignment
      const toContainer = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(to_container_id);
      if (!toContainer) return reply.code(404).send({ error: 'to_container_id not found' });

      const toUntagged = db.prepare(
        'SELECT * FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL AND metrc_plant_tag IS NULL ORDER BY placed_at'
      ).all(to_container_id) as Array<Record<string, unknown>>;

      if (toUntagged.length === 0) {
        return reply.code(400).send({ error: `No untagged placement found in container ${to_container_id}` });
      }

      let toTarget: Record<string, unknown>;
      if (toUntagged.length === 1) {
        toTarget = toUntagged[0];
      } else {
        if (!to_assignment_id) {
          return reply.code(400).send({
            error: `Container ${to_container_id} has ${toUntagged.length} untagged placements. Provide to_assignment_id.`,
            untagged_assignments: toUntagged,
          });
        }
        const found = toUntagged.find(a => Number(a['assignment_id']) === to_assignment_id);
        if (!found) {
          return reply.code(400).send({ error: `to_assignment_id ${to_assignment_id} not found among untagged placements for ${to_container_id}` });
        }
        toTarget = found;
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      db.transaction(() => {
        // Clear the tag from the source assignment (back to placed-but-untagged)
        db.prepare(`
          UPDATE cv_plant_assignments
          SET metrc_plant_tag = NULL, tagged_at = NULL, tagged_by = NULL,
              unassign_notes = ?
          WHERE assignment_id = ?
        `).run(`Tag reassigned to container ${to_container_id}: ${reason.trim()}`, from_assignment_id);

        // Apply the tag to the destination assignment
        db.prepare(`
          UPDATE cv_plant_assignments
          SET metrc_plant_tag = ?, tagged_at = ?, tagged_by = ?
          WHERE assignment_id = ?
        `).run(metrc_plant_tag, now, userId, toTarget['assignment_id']);
      })();

      const fromUpdated = db.prepare(`${ASSIGNMENT_SELECT} WHERE pa.assignment_id = ?`).get(from_assignment_id) as Record<string, unknown>;
      const toUpdated = db.prepare(`${ASSIGNMENT_SELECT} WHERE pa.assignment_id = ?`).get(toTarget['assignment_id']) as Record<string, unknown>;

      return reply.send({
        metrc_plant_tag,
        reason: reason.trim(),
        from_assignment: fromUpdated,
        to_assignment: toUpdated,
      });
    },
  );
  // ── POST /:assignmentId/move — physically move a plant to a different container ─
  //
  // Used when a plant is transplanted (e.g. potted up from 10-gal to 30-gal)
  // or relocated within a batch. The METRC tag and batch association stay on
  // the assignment; only container_id changes. Container states are updated in
  // the same transaction.
  //
  // Destination must be 'ready' (no batch) or 'empty' (same batch, plant was
  // previously lost). 'empty' from a different batch is rejected.

  app.post<{ Params: AssignmentMoveParams; Body: MoveBody }>(
    '/:assignmentId/move',
    { preHandler: requireAuth },
    async (request, reply) => {
      const assignmentId = Number(request.params.assignmentId);
      if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
        return reply.code(400).send({ error: 'assignmentId must be a positive integer' });
      }

      let body: MoveBody;
      try { body = MoveSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const { to_container_id, reason, notes } = body;

      const db = getDB();
      const userId = request.user.id;
      const now = new Date().toISOString();

      // Assignment must be active
      const assignment = db.prepare(
        'SELECT * FROM cv_plant_assignments WHERE assignment_id = ? AND unassigned_at IS NULL'
      ).get(assignmentId) as Record<string, unknown> | undefined;
      if (!assignment) return reply.code(404).send({ error: 'Assignment not found or already unassigned' });

      const fromContainerId = assignment['container_id'] as string;
      const batchId = Number(assignment['batch_id']);

      if (fromContainerId === to_container_id) {
        return reply.code(400).send({ error: 'Destination container is the same as the source container' });
      }

      // Destination container must exist
      const toContainer = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(to_container_id);
      if (!toContainer) return reply.code(404).send({ error: `Destination container "${to_container_id}" not found` });

      // Destination must be 'ready' or 'empty'
      const toState = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(to_container_id) as Record<string, unknown> | undefined;
      if (!toState) return reply.code(404).send({ error: 'Destination container state not found' });

      const toCurrentState = toState['current_state'] as string;
      if (toCurrentState !== 'ready' && toCurrentState !== 'empty') {
        return reply.code(400).send({
          error: `Destination container must be 'ready' or 'empty'; currently: ${toCurrentState}`,
        });
      }

      // Empty destination must be in the same batch
      if (toCurrentState === 'empty' && Number(toState['current_batch_id']) !== batchId) {
        return reply.code(400).send({
          error: `Destination container is 'empty' in a different batch (${toState['current_batch_id']}); cannot move a plant across batches`,
        });
      }

      // Destination must have no active assignments (defensive — state alone should guarantee this)
      const { n: destActive } = db.prepare(
        'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL'
      ).get(to_container_id) as { n: number };
      if (destActive > 0) {
        return reply.code(400).send({ error: 'Destination container already has active plant assignments' });
      }

      // Snapshot source container's current state before transaction
      const fromState = db.prepare(
        'SELECT current_state FROM cv_container_state WHERE container_id = ?'
      ).get(fromContainerId) as { current_state: string } | undefined;
      const fromCurrentState = fromState?.current_state ?? 'active';

      db.transaction(() => {
        // 1. Move the assignment to the destination container
        db.prepare(
          'UPDATE cv_plant_assignments SET container_id = ? WHERE assignment_id = ?'
        ).run(to_container_id, assignmentId);

        // 2. Activate destination container with the source batch
        db.prepare(
          'UPDATE cv_container_state SET current_state = ?, current_batch_id = ?, state_since = ?, updated_at = ? WHERE container_id = ?'
        ).run('active', batchId, now, now, to_container_id);

        // 3. Log destination state transition
        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, notes, created_at)
          VALUES (?, ?, 'active', ?, ?, ?, 'plant_replaced', ?, ?)
        `).run(to_container_id, toCurrentState, now, userId, batchId, reason.trim(), now);

        // 4. Check if source container still has active assignments
        const { n: remaining } = db.prepare(
          'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL'
        ).get(fromContainerId) as { n: number };

        if (remaining === 0) {
          // 5a. Source now empty — transition it
          db.prepare(
            "UPDATE cv_container_state SET current_state = 'empty', state_since = ?, updated_at = ? WHERE container_id = ?"
          ).run(now, now, fromContainerId);

          // 5b. Log source state transition
          db.prepare(`
            INSERT INTO cv_container_state_transitions
              (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, notes, created_at)
            VALUES (?, ?, 'empty', ?, ?, ?, 'plant_replaced', ?, ?)
          `).run(fromContainerId, fromCurrentState, now, userId, batchId,
            `Plant moved to ${to_container_id}: ${reason.trim()}`, now);
        }
      })();

      return reply.send({
        assignment_id: assignmentId,
        from_container_id: fromContainerId,
        to_container_id,
        moved_at: now,
      });
    },
  );

};

export default tagAssignmentsRoutes;
