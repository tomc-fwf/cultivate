import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

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

interface AssignBody {
  container_id: string;
  metrc_plant_tag: string;
  // Required when the container has more than one untagged placement (plants_per_container > 1)
  assignment_id?: number;
}

interface BulkAssignBody {
  assignments: Array<{
    container_id: string;
    metrc_plant_tag: string;
    assignment_id?: number;
  }>;
}

// Reassign a tag that is already active on one assignment to a different untagged assignment.
// Used after the caller receives a 409 TAG_ALREADY_ASSIGNED conflict, or to correct a
// mis-scan. The physical plants do not move — only the METRC tag metadata is corrected.
interface ReassignBody {
  metrc_plant_tag: string;
  from_assignment_id: number;   // assignment currently holding the tag (will be cleared)
  to_container_id: string;      // destination container
  to_assignment_id?: number;    // required if destination has multiple untagged placements
  reason: string;               // required — shown in audit trail
}

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
      const { container_id, metrc_plant_tag, assignment_id } = request.body;

      if (!container_id) return reply.code(400).send({ error: 'container_id is required' });
      if (!metrc_plant_tag) return reply.code(400).send({ error: 'metrc_plant_tag is required' });
      if (!isValidTag(metrc_plant_tag)) {
        return reply.code(400).send({ error: 'metrc_plant_tag must be exactly 24 alphanumeric characters' });
      }

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
      const { assignments } = request.body;

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return reply.code(400).send({ error: 'assignments array is required and must not be empty' });
      }

      // Validate all items before touching the DB
      const errors: Array<{ index: number; container_id: string; error: string }> = [];

      for (let i = 0; i < assignments.length; i++) {
        const item = assignments[i];
        if (!item.container_id) {
          errors.push({ index: i, container_id: '', error: 'container_id is required' });
          continue;
        }
        if (!item.metrc_plant_tag) {
          errors.push({ index: i, container_id: item.container_id, error: 'metrc_plant_tag is required' });
          continue;
        }
        if (!isValidTag(item.metrc_plant_tag)) {
          errors.push({ index: i, container_id: item.container_id, error: 'metrc_plant_tag must be exactly 24 alphanumeric characters' });
        }
      }

      // Check for duplicate tags within the batch itself
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
      const { metrc_plant_tag, from_assignment_id, to_container_id, to_assignment_id, reason } = request.body;

      if (!metrc_plant_tag) return reply.code(400).send({ error: 'metrc_plant_tag is required' });
      if (!isValidTag(metrc_plant_tag)) return reply.code(400).send({ error: 'metrc_plant_tag must be exactly 24 alphanumeric characters' });
      if (!from_assignment_id) return reply.code(400).send({ error: 'from_assignment_id is required' });
      if (!to_container_id) return reply.code(400).send({ error: 'to_container_id is required' });
      if (!reason?.trim()) return reply.code(400).send({ error: 'reason is required for tag reassignment' });

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
};

export default tagAssignmentsRoutes;
