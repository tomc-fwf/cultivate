import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { formatMetrcDate, makeHarvestBatchName } from '../../lib/domain-utils.js';
import { z } from 'zod';

// formatMetrcDate is used by makeHarvestBatchName internally; imported per route spec.
void formatMetrcDate;

interface IdParams { id: string }

const HarvestBatchCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  batch_type: z.enum(['harvest', 'manicure']),
  ambient_temp_f: z.number().nullable().optional(),
  ambient_rh: z.number().nullable().optional(),
  wind_speed_mph: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type HarvestBatchCreateBody = z.infer<typeof HarvestBatchCreateSchema>;

const HarvestEventCreateSchema = z.object({
  plant_assignment_id: z.number().int().positive(),
  event_type: z.enum(['partial_harvest', 'final_harvest']),
  product_type: z.enum(['flower', 'larf', 'popcorn', 'trim_product', 'other']),
  wet_weight: z.number().positive(),
  weight_unit: z.string().min(1),
  notes: z.string().nullable().optional(),
});
type HarvestEventCreateBody = z.infer<typeof HarvestEventCreateSchema>;

const ForceCloseSchema = z.object({
  close_notes: z.string().min(10),
  ambient_temp_f: z.number().nullable().optional(),
  ambient_rh: z.number().nullable().optional(),
  wind_speed_mph: z.number().nullable().optional(),
});
type ForceCloseBody = z.infer<typeof ForceCloseSchema>;

const WasteTrimCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  container_id: z.string().optional(),
  row_id: z.string().optional(),
  plant_assignment_id: z.number().int().positive().optional(),
  harvest_batch_id: z.number().int().positive().optional(),
  trim_reason: z.enum([
    'defoliation', 'lollipoping', 'ipm_removal', 'disease_removal',
    'pest_damage', 'physical_damage', 'senescence', 'other',
  ]),
  trim_reason_notes: z.string().nullable().optional(),
  wet_weight: z.number().positive(),
  weight_unit: z.string().min(1),
  notes: z.string().nullable().optional(),
});
type WasteTrimCreateBody = z.infer<typeof WasteTrimCreateSchema>;

const WasteTrimDisposeSchema = z.object({
  disposition: z.enum(['composted', 'incinerated', 'quarantined', 'tested', 'other']),
  disposed_at: z.string().min(1),
  notes: z.string().nullable().optional(),
});
type WasteTrimDisposeBody = z.infer<typeof WasteTrimDisposeSchema>;

const harvestRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /batch/:batchId — harvest status for a plant batch.
   * Returns harvest batches (with event counts), plant assignments (with harvest status),
   * batch status, and current plant count.
   */
  app.get<{ Params: { batchId: string } }>(
    '/batch/:batchId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const batchId = Number(request.params.batchId);
      if (isNaN(batchId)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();

      const batch = db.prepare('SELECT * FROM cv_batches WHERE batch_id = ?').get(batchId) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const harvestBatches = db.prepare(`
        SELECT hb.*,
          (SELECT COUNT(*) FROM cv_plant_harvest_events e
           WHERE e.harvest_batch_id = hb.harvest_batch_id
             AND e.event_type = 'partial_harvest') AS partial_harvest_count,
          (SELECT COUNT(*) FROM cv_plant_harvest_events e
           WHERE e.harvest_batch_id = hb.harvest_batch_id
             AND e.event_type = 'final_harvest') AS final_harvest_count
        FROM cv_harvest_batches hb
        WHERE hb.batch_id = ?
        ORDER BY hb.sequence_number ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const assignments = db.prepare(`
        SELECT pa.*,
          CASE WHEN EXISTS (
            SELECT 1 FROM cv_plant_harvest_events e
            WHERE e.plant_assignment_id = pa.assignment_id AND e.event_type = 'final_harvest'
          ) THEN 1 ELSE 0 END AS has_final_harvest
        FROM cv_plant_assignments pa
        WHERE pa.batch_id = ?
        ORDER BY pa.container_id ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const activePlantCount = (
        db.prepare(
          'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE batch_id = ? AND unassigned_at IS NULL'
        ).get(batchId) as { n: number }
      ).n;

      return reply.send({
        batch_id: batchId,
        status: batch['status'],
        plant_count_current: activePlantCount,
        harvest_batches: harvestBatches,
        plant_assignments: assignments,
      });
    },
  );

  /**
   * POST /batches — create a harvest batch. Requires supervisor.
   */
  app.post<{ Body: HarvestBatchCreateBody }>(
    '/batches',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      let body: HarvestBatchCreateBody;
      try { body = HarvestBatchCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const { batch_id, batch_type, ambient_temp_f, ambient_rh, wind_speed_mph, notes } = body;

      const batch = db.prepare(`
        SELECT b.*, s.name AS strain_name, s.type AS strain_type
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE b.batch_id = ?
      `).get(batch_id) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });

      if (batch['status'] !== 'harvesting') {
        return reply.code(400).send({
          error: `Batch must be in 'harvesting' status. Current status: "${batch['status']}"`,
        });
      }

      if (batch_type === 'harvest') {
        const existing = db.prepare(`
          SELECT harvest_batch_id FROM cv_harvest_batches
          WHERE batch_id = ? AND status = 'in_progress' AND batch_type = 'harvest'
        `).get(batch_id);
        if (existing) {
          return reply.code(400).send({
            error: 'A harvest batch is already in progress. Force-close it before creating a new one.',
          });
        }
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const { max_seq: maxSeq } = db.prepare(`
        SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM cv_harvest_batches WHERE batch_id = ?
      `).get(batch_id) as { max_seq: number };
      const sequenceNumber = maxSeq + 1;

      const metrcName = makeHarvestBatchName(
        batch['strain_name'] as string,
        now.slice(0, 10),
        batch_type,
        batch['strain_type'] as string,
      );

      const newId = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO cv_harvest_batches
            (batch_id, batch_type, sequence_number, status, started_at, started_by,
             ambient_temp_f, ambient_rh, wind_speed_mph, metrc_name, notes,
             created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          batch_id, batch_type, sequenceNumber, now, userId,
          ambient_temp_f ?? null, ambient_rh ?? null, wind_speed_mph ?? null,
          metrcName, notes ?? null, userId, now, now,
        );
        return Number(r.lastInsertRowid);
      })();

      const created = db.prepare('SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?').get(newId);
      return reply.code(201).send(created);
    },
  );

  /**
   * POST /batches/:harvestBatchId/events — record a harvest event (partial or final).
   * Final harvest triggers plant unassignment, container → teardown, and
   * auto-closes the batch + harvest batch if all plants are harvested.
   */
  app.post<{ Params: { harvestBatchId: string }; Body: HarvestEventCreateBody }>(
    '/batches/:harvestBatchId/events',
    { preHandler: requireAuth },
    async (request, reply) => {
      const harvestBatchId = Number(request.params.harvestBatchId);
      if (isNaN(harvestBatchId)) return reply.code(400).send({ error: 'Invalid harvest batch id' });

      let body: HarvestEventCreateBody;
      try { body = HarvestEventCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const { plant_assignment_id, event_type, product_type, wet_weight, weight_unit, notes } = body;

      const harvestBatch = db.prepare(
        'SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?'
      ).get(harvestBatchId) as Record<string, unknown> | undefined;
      if (!harvestBatch) return reply.code(404).send({ error: 'Harvest batch not found' });
      if (harvestBatch['status'] !== 'in_progress') {
        return reply.code(400).send({
          error: `Harvest batch is not in_progress. Current status: "${harvestBatch['status']}"`,
        });
      }

      const assignment = db.prepare(`
        SELECT * FROM cv_plant_assignments
        WHERE assignment_id = ? AND unassigned_at IS NULL AND batch_id = ?
      `).get(plant_assignment_id, harvestBatch['batch_id']) as Record<string, unknown> | undefined;
      if (!assignment) {
        return reply.code(400).send({
          error: 'plant_assignment_id not found, not active, or does not belong to this harvest batch\'s plant batch',
        });
      }

      if (event_type === 'final_harvest') {
        const existingFinal = db.prepare(`
          SELECT harvest_event_id FROM cv_plant_harvest_events
          WHERE plant_assignment_id = ? AND event_type = 'final_harvest'
        `).get(plant_assignment_id);
        if (existingFinal) {
          return reply.code(400).send({
            error: 'A final_harvest event already exists for this plant assignment',
          });
        }
      }

      const now = new Date().toISOString();
      const userId = request.user.id;
      const batchId = harvestBatch['batch_id'] as number;
      const containerId = assignment['container_id'] as string;

      const createdEvent = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO cv_plant_harvest_events
            (harvest_batch_id, batch_id, plant_assignment_id, container_id, event_type,
             harvested_at, product_type, wet_weight, weight_unit, applicator, notes,
             metrc_sync_status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
        `).run(
          harvestBatchId, batchId, plant_assignment_id, containerId, event_type,
          now, product_type, wet_weight, weight_unit, userId, notes ?? null,
          userId, now, now,
        );
        const eventId = Number(r.lastInsertRowid);

        if (event_type === 'final_harvest') {
          // Unassign the plant
          db.prepare(`
            UPDATE cv_plant_assignments
            SET unassigned_at = ?, unassign_reason = 'harvested', unassigned_by = ?
            WHERE assignment_id = ?
          `).run(now, userId, plant_assignment_id);

          // Transition container active → teardown
          const containerState = db.prepare(
            'SELECT current_state FROM cv_container_state WHERE container_id = ?'
          ).get(containerId) as { current_state: string } | undefined;
          const fromState = containerState?.current_state ?? 'active';

          db.prepare(`
            UPDATE cv_container_state
            SET current_state = 'teardown', state_since = ?, updated_at = ?
            WHERE container_id = ?
          `).run(now, now, containerId);

          db.prepare(`
            INSERT INTO cv_container_state_transitions
              (container_id, from_state, to_state, transitioned_at, transitioned_by,
               batch_id, trigger_event, created_at)
            VALUES (?, ?, 'teardown', ?, ?, ?, 'batch_closed', ?)
          `).run(containerId, fromState, now, userId, batchId, now);

          // Auto-close batch if all plants are now final-harvested
          const { n: remainingActive } = db.prepare(`
            SELECT COUNT(*) AS n FROM cv_plant_assignments
            WHERE batch_id = ? AND unassigned_at IS NULL
          `).get(batchId) as { n: number };

          if (remainingActive === 0) {
            db.prepare(`
              UPDATE cv_batches SET status = 'closed', closed_date = ?, updated_at = ?
              WHERE batch_id = ?
            `).run(now, now, batchId);

            db.prepare(`
              UPDATE cv_harvest_batches
              SET status = 'completed', completed_at = ?, close_reason = 'completed',
                  closed_by = ?, updated_at = ?
              WHERE harvest_batch_id = ? AND status = 'in_progress'
            `).run(now, userId, now, harvestBatchId);
          }
        }

        return db.prepare(
          'SELECT * FROM cv_plant_harvest_events WHERE harvest_event_id = ?'
        ).get(eventId);
      })();

      return reply.code(201).send(createdEvent);
    },
  );

  /**
   * POST /batches/:harvestBatchId/force-close — force-close due to weather event.
   * Creates a new harvest batch for remaining plants. Requires supervisor.
   */
  app.post<{ Params: { harvestBatchId: string }; Body: ForceCloseBody }>(
    '/batches/:harvestBatchId/force-close',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const harvestBatchId = Number(request.params.harvestBatchId);
      if (isNaN(harvestBatchId)) return reply.code(400).send({ error: 'Invalid harvest batch id' });

      let body: ForceCloseBody;
      try { body = ForceCloseSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const { close_notes, ambient_temp_f, ambient_rh, wind_speed_mph } = body;

      const harvestBatch = db.prepare(`
        SELECT hb.*, s.name AS strain_name, s.type AS strain_type
        FROM cv_harvest_batches hb
        JOIN cv_batches b ON b.batch_id = hb.batch_id
        JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE hb.harvest_batch_id = ?
      `).get(harvestBatchId) as Record<string, unknown> | undefined;
      if (!harvestBatch) return reply.code(404).send({ error: 'Harvest batch not found' });
      if (harvestBatch['status'] !== 'in_progress') {
        return reply.code(400).send({
          error: `Harvest batch is not in_progress. Current status: "${harvestBatch['status']}"`,
        });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;
      const batchId = harvestBatch['batch_id'] as number;
      const batchType = harvestBatch['batch_type'] as 'harvest' | 'manicure';

      const { max_seq: maxSeq } = db.prepare(`
        SELECT COALESCE(MAX(sequence_number), 0) AS max_seq FROM cv_harvest_batches WHERE batch_id = ?
      `).get(batchId) as { max_seq: number };
      const newSequenceNumber = maxSeq + 1;

      const newMetrcName = makeHarvestBatchName(
        harvestBatch['strain_name'] as string,
        now.slice(0, 10),
        batchType,
        harvestBatch['strain_type'] as string,
      );

      const result = db.transaction(() => {
        db.prepare(`
          UPDATE cv_harvest_batches
          SET status = 'force_closed', close_reason = 'weather_event', close_notes = ?,
              completed_at = ?, closed_by = ?, updated_at = ?
          WHERE harvest_batch_id = ?
        `).run(close_notes, now, userId, now, harvestBatchId);

        const closedBatch = db.prepare(
          'SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?'
        ).get(harvestBatchId);

        const r = db.prepare(`
          INSERT INTO cv_harvest_batches
            (batch_id, batch_type, sequence_number, status, started_at, started_by,
             ambient_temp_f, ambient_rh, wind_speed_mph, metrc_name,
             created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          batchId, batchType, newSequenceNumber, now, userId,
          ambient_temp_f ?? null, ambient_rh ?? null, wind_speed_mph ?? null,
          newMetrcName, userId, now, now,
        );

        const newBatch = db.prepare(
          'SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?'
        ).get(Number(r.lastInsertRowid));

        return { closed_batch: closedBatch, new_batch: newBatch };
      })();

      return reply.code(201).send(result);
    },
  );

  /**
   * POST /waste-trim — record a waste trim event. Occurs at any batch status.
   */
  app.post<{ Body: WasteTrimCreateBody }>(
    '/waste-trim',
    { preHandler: requireAuth },
    async (request, reply) => {
      let body: WasteTrimCreateBody;
      try { body = WasteTrimCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const {
        batch_id, container_id, row_id, plant_assignment_id, harvest_batch_id,
        trim_reason, trim_reason_notes, wet_weight, weight_unit, notes,
      } = body;

      const batch = db.prepare('SELECT batch_id FROM cv_batches WHERE batch_id = ?').get(batch_id);
      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });

      const now = new Date().toISOString();
      const userId = request.user.id;

      const r = db.prepare(`
        INSERT INTO cv_plant_waste_trim_events
          (batch_id, container_id, row_id, plant_assignment_id, harvest_batch_id,
           trim_reason, trim_reason_notes, wet_weight, weight_unit,
           waste_status, waste_status_updated_at, trimmed_at, applicator, notes,
           metrc_sync_status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'collected', ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(
        batch_id,
        container_id ?? null,
        row_id ?? null,
        plant_assignment_id ?? null,
        harvest_batch_id ?? null,
        trim_reason,
        trim_reason_notes ?? null,
        wet_weight,
        weight_unit,
        now, now,
        userId,
        notes ?? null,
        userId, now, now,
      );

      const created = db.prepare(
        'SELECT * FROM cv_plant_waste_trim_events WHERE waste_trim_id = ?'
      ).get(Number(r.lastInsertRowid));
      return reply.code(201).send(created);
    },
  );

  /**
   * GET /waste-trim — list waste trim events with optional filters.
   * Query params: batch_id, container_id, waste_status
   */
  app.get(
    '/waste-trim',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { batch_id, container_id, waste_status } = request.query as {
        batch_id?: string;
        container_id?: string;
        waste_status?: string;
      };

      const db = getDB();
      const conditions: string[] = [];
      const values: unknown[] = [];

      if (batch_id) {
        conditions.push('batch_id = ?');
        values.push(Number(batch_id));
      }
      if (container_id) {
        conditions.push('container_id = ?');
        values.push(container_id);
      }
      if (waste_status) {
        conditions.push('waste_status = ?');
        values.push(waste_status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db.prepare(
        `SELECT * FROM cv_plant_waste_trim_events ${where} ORDER BY trimmed_at DESC`
      ).all(...values) as Array<Record<string, unknown>>;

      return reply.send(rows);
    },
  );

  /**
   * PATCH /waste-trim/:id/dispose — mark waste trim as disposed.
   */
  app.patch<{ Params: IdParams; Body: WasteTrimDisposeBody }>(
    '/waste-trim/:id/dispose',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid waste trim id' });

      let body: WasteTrimDisposeBody;
      try { body = WasteTrimDisposeSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const db = getDB();
      const { disposition, disposed_at, notes } = body;

      const existing = db.prepare(
        'SELECT waste_trim_id FROM cv_plant_waste_trim_events WHERE waste_trim_id = ?'
      ).get(id);
      if (!existing) return reply.code(404).send({ error: 'Waste trim event not found' });

      const now = new Date().toISOString();
      const userId = request.user.id;

      const updates = [
        'waste_status = ?',
        'waste_status_updated_at = ?',
        'disposition = ?',
        'disposed_at = ?',
        'disposed_by = ?',
        'updated_at = ?',
      ];
      const values: unknown[] = ['disposed', now, disposition, disposed_at, userId, now];

      if (notes !== undefined) {
        updates.push('notes = ?');
        values.push(notes ?? null);
      }

      values.push(id);
      db.prepare(
        `UPDATE cv_plant_waste_trim_events SET ${updates.join(', ')} WHERE waste_trim_id = ?`
      ).run(...values);

      const updated = db.prepare(
        'SELECT * FROM cv_plant_waste_trim_events WHERE waste_trim_id = ?'
      ).get(id);
      return reply.send(updated);
    },
  );
};

export default harvestRoutes;
