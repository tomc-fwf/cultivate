import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

const VALID_STAGES = ['germ','seedling','cult-hoop','field-veg','field-flower','flush','harvest_window','harvesting'] as const;
const VALID_TASK_TYPES = ['fertigation','observation','foliar','amendment','record'] as const;

const ProtocolSchema = z.object({
  stage:          z.enum(VALID_STAGES),
  task_type:      z.enum(VALID_TASK_TYPES),
  title:          z.string().min(1).max(100),
  frequency_days: z.number().int().min(1).max(30),
  day_min:        z.number().int().nonnegative().nullable().optional(),
  day_max:        z.number().int().nonnegative().nullable().optional(),
  description:    z.string().max(300).nullable().optional(),
  sop_text:       z.string().nullable().optional(),
  order_index:    z.number().int().nonnegative().optional().default(0),
  active:         z.number().int().min(0).max(1).optional().default(1),
  sample_count:   z.number().int().min(1).max(20).nullable().optional(),
  record_fields:  z.string().nullable().optional(), // JSON: [{key,label,unit,type}]
});

const POSTPONE_REASONS = ['weather','staffing','equipment','priority','other'] as const;

// Hours of grace before a task flips from 'due' to 'overdue'.
// A daily task becomes 'overdue' after 30 hours (24h threshold + 6h grace).
const OVERDUE_GRACE_HOURS = 6;

interface TodayTask {
  task_key: string;
  protocol_id: number;
  batch_id: number;
  batch_name: string | null;
  strain_name: string | null;
  sub_zone_id: string | null;
  stage: string;
  days_in_stage: number;
  task_type: string;
  title: string;
  description: string | null;
  frequency_days: number;
  last_performed_at: string | null;
  hours_since: number | null;
  urgency: 'overdue' | 'due';
  has_sop: boolean;
  has_checklist: boolean;
  action_path: string;
}

function actionPath(taskType: string, batchId: number, protocolId?: number): string {
  switch (taskType) {
    case 'fertigation': return `/applications/fertigation/new?batch_id=${batchId}`;
    case 'observation':  return `/observations/new?batch_id=${batchId}`;
    case 'foliar':       return `/applications/foliar/new?batch_id=${batchId}`;
    case 'amendment':    return `/applications/amendments/new?batch_id=${batchId}`;
    case 'record':       return `/tasks/sampling/new?protocol_id=${protocolId}&batch_id=${batchId}`;
    default:             return `/batches/${batchId}`;
  }
}

const tasksRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /today — generate today's task queue across all active batches.
   *
   * For each active batch, finds matching stage protocols and checks when each
   * task was last performed. Returns tasks that are due or overdue, sorted by
   * urgency (overdue first) then by batch name.
   */
  app.get('/today', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const now = Date.now();
    const nowIso = new Date().toISOString();

    // All active (non-closed) batches with days_in_stage computed
    const batches = db.prepare(`
      SELECT b.batch_id, b.status, b.name AS batch_name, b.sub_zone_id,
             s.name AS strain_name,
             CAST(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date)) AS INTEGER) AS days_in_stage
      FROM cv_batches b
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.status NOT IN ('closed')
      ORDER BY b.name
    `).all() as Array<Record<string, unknown>>;

    if (batches.length === 0) return reply.send({ tasks: [], postponed_count: 0 });

    // Active postponements: (protocol_id, batch_id) pairs with snooze still in window
    const postponed = db.prepare(`
      SELECT protocol_id, batch_id FROM cv_task_postponements
      WHERE snooze_until IS NULL OR snooze_until > ?
    `).all(nowIso) as Array<{ protocol_id: number; batch_id: number }>;
    const postponedSet = new Set(postponed.map(p => `${p.protocol_id}-${p.batch_id}`));

    // All active protocols, keyed by stage for quick lookup
    const allProtocols = db.prepare(`
      SELECT * FROM cv_stage_protocols WHERE active = 1 ORDER BY order_index ASC
    `).all() as Array<Record<string, unknown>>;

    const protocolsByStage = new Map<string, Array<Record<string, unknown>>>();
    for (const p of allProtocols) {
      const stage = p['stage'] as string;
      if (!protocolsByStage.has(stage)) protocolsByStage.set(stage, []);
      protocolsByStage.get(stage)!.push(p);
    }

    // Prepared statements for last-performed lookups
    const lastFertigation = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_applications_fertigation WHERE batch_id = ?`
    );
    const lastObservation = db.prepare(
      `SELECT MAX(observed_at) AS last FROM cv_observations WHERE batch_id = ?`
    );
    const lastFoliar = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_applications_foliar WHERE batch_id = ?`
    );
    const lastAmendment = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_container_amendments WHERE batch_id = ?`
    );

    const tasks: TodayTask[] = [];
    let postponedCount = 0;

    for (const batch of batches) {
      const batchId    = batch['batch_id'] as number;
      const stage      = batch['status'] as string;
      const daysInStage = batch['days_in_stage'] as number ?? 0;
      const protocols  = protocolsByStage.get(stage) ?? [];

      for (const protocol of protocols) {
        const dayMin = protocol['day_min'] as number | null;
        const dayMax = protocol['day_max'] as number | null;

        // Skip if outside the day window for this protocol
        if (dayMin != null && daysInStage < dayMin) continue;
        if (dayMax != null && daysInStage > dayMax) continue;

        const taskType      = protocol['task_type'] as string;
        const frequencyDays = protocol['frequency_days'] as number;
        const thresholdMs   = frequencyDays * 24 * 3600 * 1000;

        // Look up last performed time for this task type on this batch
        let lastPerformedAt: string | null = null;
        if (taskType === 'fertigation') {
          const row = lastFertigation.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'observation') {
          const row = lastObservation.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'foliar') {
          const row = lastFoliar.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'amendment') {
          const row = lastAmendment.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'record') {
          const row = db.prepare(
            `SELECT MAX(completed_at) AS last FROM cv_sampling_sessions WHERE batch_id = ? AND protocol_id = ?`
          ).get(batchId, protocol['protocol_id'] as number) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        }

        const lastMs = lastPerformedAt ? new Date(lastPerformedAt).getTime() : null;
        const hoursSince = lastMs != null ? (now - lastMs) / 3600000 : null;
        const hoursThreshold = frequencyDays * 24;

        // Only include tasks that are actually due (past threshold)
        const isDue = hoursSince === null || hoursSince >= hoursThreshold;
        if (!isDue) continue;

        const protocolId = protocol['protocol_id'] as number;
        const taskKey    = `${batchId}-${protocolId}`;

        // Skip tasks with an active postponement
        if (postponedSet.has(taskKey)) {
          postponedCount++;
          continue;
        }

        const isOverdue = hoursSince === null
          ? false  // never done — show as 'due' not 'overdue' (first time)
          : hoursSince >= hoursThreshold + OVERDUE_GRACE_HOURS;

        const hasChecklist = db.prepare(
          `SELECT COUNT(*) AS n FROM cv_protocol_checklist_items WHERE protocol_id = ?`
        ).get(protocolId) as { n: number };
        const hasSop = !!(protocol['sop_text'] as string | null);

        tasks.push({
          task_key: taskKey,
          protocol_id: protocolId,
          batch_id: batchId,
          batch_name: batch['batch_name'] as string | null,
          strain_name: batch['strain_name'] as string | null,
          sub_zone_id: batch['sub_zone_id'] as string | null,
          stage,
          days_in_stage: daysInStage,
          task_type: taskType,
          title: protocol['title'] as string,
          description: protocol['description'] as string | null,
          frequency_days: frequencyDays,
          last_performed_at: lastPerformedAt,
          hours_since: hoursSince != null ? Math.round(hoursSince) : null,
          urgency: isOverdue ? 'overdue' : 'due',
          has_sop: hasSop,
          has_checklist: hasChecklist.n > 0,
          action_path: actionPath(taskType, batchId, protocolId),
        });
      }
    }

    // Sort: overdue first, then due; within each group sort by batch name
    tasks.sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === 'overdue' ? -1 : 1;
      return (a.batch_name ?? '').localeCompare(b.batch_name ?? '');
    });

    return reply.send({ tasks, postponed_count: postponedCount });
  });

  /** GET /protocols — all protocols ordered by stage then display order. */
  app.get('/protocols', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const protocols = db.prepare(
      `SELECT * FROM cv_stage_protocols ORDER BY stage, order_index, protocol_id`
    ).all();
    return reply.send(protocols);
  });

  /** GET /protocols/:id — single protocol with checklist items. */
  app.get<{ Params: { id: string } }>(
    '/protocols/:id', { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
      const db = getDB();
      const protocol = db.prepare(`SELECT * FROM cv_stage_protocols WHERE protocol_id = ?`).get(id);
      if (!protocol) return reply.code(404).send({ error: 'Protocol not found' });
      const checklist_items = db.prepare(
        `SELECT * FROM cv_protocol_checklist_items WHERE protocol_id = ? ORDER BY order_index, item_id`
      ).all(id);
      return reply.send({ ...protocol as Record<string, unknown>, checklist_items });
    },
  );

  /**
   * PUT /protocols/:id/checklist — replace all checklist items atomically.
   * Body: { items: [{label, required?, order_index?, field_type?, field_unit?, min_value?, max_value?}] }
   */
  app.put<{ Params: { id: string } }>(
    '/protocols/:id/checklist', { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const ItemSchema = z.array(z.object({
        label:       z.string().min(1).max(200),
        required:    z.number().int().min(0).max(1).optional().default(0),
        order_index: z.number().int().nonnegative().optional(),
        field_type:  z.enum(['boolean', 'number', 'text']).optional().default('boolean'),
        field_unit:  z.string().max(20).nullable().optional(),
        min_value:   z.number().nullable().optional(),
        max_value:   z.number().nullable().optional(),
      }));
      let items: z.infer<typeof ItemSchema>;
      try {
        const body = request.body as { items?: unknown };
        items = ItemSchema.parse(body.items ?? []);
      } catch (err) {
        return reply.code(400).send({ error: 'Validation failed' });
      }

      const db = getDB();
      const existing = db.prepare(`SELECT protocol_id FROM cv_stage_protocols WHERE protocol_id = ?`).get(id);
      if (!existing) return reply.code(404).send({ error: 'Protocol not found' });

      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`DELETE FROM cv_protocol_checklist_items WHERE protocol_id = ?`).run(id);
        items.forEach((item, i) => {
          db.prepare(`
            INSERT INTO cv_protocol_checklist_items
              (protocol_id, order_index, label, required, field_type, field_unit, min_value, max_value, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, item.order_index ?? i, item.label, item.required ?? 0,
            item.field_type ?? 'boolean', item.field_unit ?? null,
            item.min_value ?? null, item.max_value ?? null, now,
          );
        });
      })();

      const saved = db.prepare(
        `SELECT * FROM cv_protocol_checklist_items WHERE protocol_id = ? ORDER BY order_index, item_id`
      ).all(id);
      return reply.send(saved);
    },
  );

  // ── Checklist progress ─────────────────────────────────────────────────────

  /**
   * GET /checklist-progress?protocol_id=X&batch_id=Y
   * Returns saved progress for all items in this task instance.
   */
  app.get<{ Querystring: { protocol_id: string; batch_id: string } }>(
    '/checklist-progress', { preHandler: requireAuth },
    async (request, reply) => {
      const pId = Number(request.query.protocol_id);
      const bId = Number(request.query.batch_id);
      if (isNaN(pId) || isNaN(bId)) return reply.code(400).send({ error: 'Invalid params' });
      const db = getDB();
      const rows = db.prepare(`
        SELECT item_id, checked, value_numeric, value_text, checked_at
        FROM cv_task_checklist_progress
        WHERE protocol_id = ? AND batch_id = ?
      `).all(pId, bId);
      return reply.send(rows);
    },
  );

  /**
   * PUT /checklist-progress — upsert progress for a single checklist item.
   * Body: { protocol_id, batch_id, item_id, checked, value_numeric?, value_text? }
   */
  app.put('/checklist-progress', { preHandler: requireAuth }, async (request, reply) => {
    const ProgressSchema = z.object({
      protocol_id:   z.number().int().positive(),
      batch_id:      z.number().int().positive(),
      item_id:       z.number().int().positive(),
      checked:       z.number().int().min(0).max(1),
      value_numeric: z.number().nullable().optional(),
      value_text:    z.string().nullable().optional(),
    });
    let body: z.infer<typeof ProgressSchema>;
    try { body = ProgressSchema.parse(request.body); }
    catch { return reply.code(400).send({ error: 'Validation failed' }); }

    const db    = getDB();
    const userId = request.user.id;
    const now   = new Date().toISOString();

    db.prepare(`
      INSERT INTO cv_task_checklist_progress
        (protocol_id, batch_id, item_id, checked, value_numeric, value_text, checked_by, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(protocol_id, batch_id, item_id) DO UPDATE SET
        checked       = excluded.checked,
        value_numeric = excluded.value_numeric,
        value_text    = excluded.value_text,
        checked_by    = excluded.checked_by,
        checked_at    = excluded.checked_at
    `).run(
      body.protocol_id, body.batch_id, body.item_id,
      body.checked, body.value_numeric ?? null, body.value_text ?? null,
      userId, now,
    );

    return reply.send({ ok: true });
  });

  /**
   * DELETE /checklist-progress?protocol_id=X&batch_id=Y
   * Clears all saved progress for a task (start fresh).
   */
  app.delete<{ Querystring: { protocol_id: string; batch_id: string } }>(
    '/checklist-progress', { preHandler: requireAuth },
    async (request, reply) => {
      const pId = Number(request.query.protocol_id);
      const bId = Number(request.query.batch_id);
      if (isNaN(pId) || isNaN(bId)) return reply.code(400).send({ error: 'Invalid params' });
      const db = getDB();
      db.prepare(`DELETE FROM cv_task_checklist_progress WHERE protocol_id = ? AND batch_id = ?`).run(pId, bId);
      return reply.code(204).send();
    },
  );

  /** POST /protocols — create a new protocol. Supervisor+. */
  app.post('/protocols', { preHandler: requireRole('supervisor') }, async (request, reply) => {
    let body: z.infer<typeof ProtocolSchema>;
    try { body = ProtocolSchema.parse(request.body); }
    catch (err) {
      const issues = err instanceof z.ZodError ? err.issues : undefined;
      return reply.code(400).send({ error: 'Validation failed', issues });
    }
    const db = getDB();
    const now = new Date().toISOString();
    const r = db.prepare(`
      INSERT INTO cv_stage_protocols
        (stage, task_type, title, frequency_days, day_min, day_max, description, sop_text,
         order_index, active, sample_count, record_fields, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.stage, body.task_type, body.title, body.frequency_days,
      body.day_min ?? null, body.day_max ?? null, body.description ?? null,
      body.sop_text ?? null,
      body.order_index ?? 0, body.active ?? 1,
      body.sample_count ?? null, body.record_fields ?? null, now,
    );
    const created = db.prepare(`SELECT * FROM cv_stage_protocols WHERE protocol_id = ?`).get(r.lastInsertRowid);
    return reply.code(201).send(created);
  });

  /** PATCH /protocols/:id — update a protocol. Supervisor+. */
  app.patch<{ Params: { id: string } }>(
    '/protocols/:id', { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
      const db = getDB();
      const existing = db.prepare(`SELECT * FROM cv_stage_protocols WHERE protocol_id = ?`).get(id);
      if (!existing) return reply.code(404).send({ error: 'Protocol not found' });

      let body: Partial<z.infer<typeof ProtocolSchema>>;
      try { body = ProtocolSchema.partial().parse(request.body); }
      catch (err) {
        const issues = err instanceof z.ZodError ? err.issues : undefined;
        return reply.code(400).send({ error: 'Validation failed', issues });
      }

      const fields: string[] = [];
      const vals: unknown[] = [];
      if (body.stage          !== undefined) { fields.push('stage = ?');          vals.push(body.stage); }
      if (body.task_type      !== undefined) { fields.push('task_type = ?');      vals.push(body.task_type); }
      if (body.title          !== undefined) { fields.push('title = ?');          vals.push(body.title); }
      if (body.frequency_days !== undefined) { fields.push('frequency_days = ?'); vals.push(body.frequency_days); }
      if ('day_min'      in body)            { fields.push('day_min = ?');        vals.push(body.day_min ?? null); }
      if ('day_max'      in body)            { fields.push('day_max = ?');        vals.push(body.day_max ?? null); }
      if ('description'  in body)            { fields.push('description = ?');    vals.push(body.description ?? null); }
      if (body.order_index    !== undefined) { fields.push('order_index = ?');    vals.push(body.order_index); }
      if (body.active         !== undefined) { fields.push('active = ?');         vals.push(body.active); }
      if ('sop_text'      in body)            { fields.push('sop_text = ?');      vals.push(body.sop_text ?? null); }
      if ('sample_count'  in body)            { fields.push('sample_count = ?');  vals.push(body.sample_count ?? null); }
      if ('record_fields' in body)            { fields.push('record_fields = ?'); vals.push(body.record_fields ?? null); }

      if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });
      vals.push(id);
      db.prepare(`UPDATE cv_stage_protocols SET ${fields.join(', ')} WHERE protocol_id = ?`).run(...vals);
      const updated = db.prepare(`SELECT * FROM cv_stage_protocols WHERE protocol_id = ?`).get(id);
      return reply.send(updated);
    },
  );

  /** DELETE /protocols/:id — delete a protocol. Admin only. */
  app.delete<{ Params: { id: string } }>(
    '/protocols/:id', { preHandler: requireRole('admin') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
      const db = getDB();
      const existing = db.prepare(`SELECT * FROM cv_stage_protocols WHERE protocol_id = ?`).get(id);
      if (!existing) return reply.code(404).send({ error: 'Protocol not found' });
      db.prepare(`DELETE FROM cv_stage_protocols WHERE protocol_id = ?`).run(id);
      return reply.code(204).send();
    },
  );

  // ── Postponements ─────────────────────────────────────────────────────────

  /**
   * POST /postpone — defer a task with a reason and optional snooze duration.
   * Body: { protocol_id, batch_id, reason, reason_notes?, snooze_hours? }
   * snooze_hours: omit or 0 for indefinite postponement.
   */
  app.post('/postpone', { preHandler: requireAuth }, async (request, reply) => {
    const PostponeSchema = z.object({
      protocol_id:  z.number().int().positive(),
      batch_id:     z.number().int().positive(),
      reason:       z.enum(POSTPONE_REASONS),
      reason_notes: z.string().max(300).nullable().optional(),
      snooze_hours: z.number().int().min(0).max(168).optional().default(0),
    });
    let body: z.infer<typeof PostponeSchema>;
    try { body = PostponeSchema.parse(request.body); }
    catch (err) {
      const issues = err instanceof z.ZodError ? err.issues : undefined;
      return reply.code(400).send({ error: 'Validation failed', issues });
    }

    const db     = getDB();
    const userId = request.user.id;
    const now    = new Date().toISOString();
    const snoozeUntil = body.snooze_hours
      ? new Date(Date.now() + body.snooze_hours * 3600000).toISOString()
      : null;

    // Remove any existing active postponement for this task first
    db.prepare(
      `DELETE FROM cv_task_postponements WHERE protocol_id = ? AND batch_id = ?`
    ).run(body.protocol_id, body.batch_id);

    const r = db.prepare(`
      INSERT INTO cv_task_postponements
        (protocol_id, batch_id, postponed_by, reason, reason_notes, snooze_until, postponed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.protocol_id, body.batch_id, userId,
      body.reason, body.reason_notes ?? null, snoozeUntil, now, now,
    );

    return reply.code(201).send(
      db.prepare(`SELECT * FROM cv_task_postponements WHERE postponement_id = ?`).get(r.lastInsertRowid)
    );
  });

  /** DELETE /postpone/:id — remove a postponement (resume the task). */
  app.delete<{ Params: { id: string } }>(
    '/postpone/:id', { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
      const db = getDB();
      db.prepare(`DELETE FROM cv_task_postponements WHERE postponement_id = ?`).run(id);
      return reply.code(204).send();
    },
  );

  /** GET /postpone?batch_id=X — list active postponements. */
  app.get<{ Querystring: { batch_id?: string } }>(
    '/postpone', { preHandler: requireAuth },
    async (request, reply) => {
      const db = getDB();
      const nowIso = new Date().toISOString();
      const { batch_id } = request.query;
      const where = batch_id ? 'AND p.batch_id = ?' : '';
      const vals: unknown[] = batch_id ? [nowIso, Number(batch_id)] : [nowIso];
      const rows = db.prepare(`
        SELECT p.*, pr.title, pr.task_type, pr.stage
        FROM cv_task_postponements p
        JOIN cv_stage_protocols pr ON pr.protocol_id = p.protocol_id
        WHERE (p.snooze_until IS NULL OR p.snooze_until > ?) ${where}
        ORDER BY p.postponed_at DESC
      `).all(...vals);
      return reply.send(rows);
    },
  );

  // ── Sampling sessions ──────────────────────────────────────────────────────

  /**
   * GET /sampling/suggest?batch_id=X&count=N
   * Returns N random active containers from the batch's sub-zone as suggested
   * sample positions. Used by the SamplingSession page to pre-populate slots.
   */
  app.get<{ Querystring: { batch_id: string; count?: string } }>(
    '/sampling/suggest', { preHandler: requireAuth },
    async (request, reply) => {
      const batchId = Number(request.query.batch_id);
      const count   = Math.min(Number(request.query.count ?? 5), 20);
      if (isNaN(batchId)) return reply.code(400).send({ error: 'Invalid batch_id' });

      const db = getDB();
      const batch = db.prepare(`SELECT sub_zone_id FROM cv_batches WHERE batch_id = ?`).get(batchId) as Record<string, unknown> | undefined;
      if (!batch) return reply.code(404).send({ error: 'Batch not found' });

      const subZoneId = batch['sub_zone_id'] as string | null;
      if (!subZoneId) return reply.send([]);

      const containers = db.prepare(`
        SELECT c.container_id
        FROM cv_containers c
        JOIN cv_rows r ON r.row_id = c.row_id
        WHERE r.sub_zone_id = ?
        ORDER BY RANDOM()
        LIMIT ?
      `).all(subZoneId, count) as Array<{ container_id: string }>;

      return reply.send(containers.map(c => c.container_id));
    },
  );

  /**
   * POST /sampling — create a completed sampling session with all readings.
   * Body: { protocol_id, batch_id, notes?, samples: [{ container_label?, values: [{field_key, field_label, field_unit?, value_numeric?, value_text?}] }] }
   */
  app.post('/sampling', { preHandler: requireAuth }, async (request, reply) => {
    const SamplingSchema = z.object({
      protocol_id: z.number().int().positive(),
      batch_id:    z.number().int().positive(),
      notes:       z.string().nullable().optional(),
      samples: z.array(z.object({
        container_label: z.string().nullable().optional(),
        values: z.array(z.object({
          field_key:     z.string(),
          field_label:   z.string(),
          field_unit:    z.string().nullable().optional(),
          value_numeric: z.number().nullable().optional(),
          value_text:    z.string().nullable().optional(),
        })),
      })).min(1),
    });

    let body: z.infer<typeof SamplingSchema>;
    try { body = SamplingSchema.parse(request.body); }
    catch (err) {
      const issues = err instanceof z.ZodError ? err.issues : undefined;
      return reply.code(400).send({ error: 'Validation failed', issues });
    }

    const db   = getDB();
    const userId = request.user.id;
    const now  = new Date().toISOString();

    const session = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO cv_sampling_sessions
          (protocol_id, batch_id, sample_count_target, sample_count_actual, performed_by, notes, started_at, completed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.protocol_id, body.batch_id,
        body.samples.length, body.samples.length,
        userId,
        body.notes ?? null, now, now, now,
      );

      const sessionId = r.lastInsertRowid as number;

      for (let i = 0; i < body.samples.length; i++) {
        const sample = body.samples[i];
        for (const v of sample.values) {
          db.prepare(`
            INSERT INTO cv_sampling_readings
              (session_id, sequence_number, container_label, field_key, field_label, field_unit, value_numeric, value_text, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            sessionId, i + 1,
            sample.container_label ?? null,
            v.field_key, v.field_label, v.field_unit ?? null,
            v.value_numeric ?? null, v.value_text ?? null, now,
          );
        }
      }

      return sessionId;
    })();

    const created = db.prepare(`SELECT * FROM cv_sampling_sessions WHERE session_id = ?`).get(session) as Record<string, unknown>;
    const readings = db.prepare(`SELECT * FROM cv_sampling_readings WHERE session_id = ? ORDER BY sequence_number, reading_id`).all(session);
    return reply.code(201).send({ ...created, readings });
  });

  /** GET /sampling/:sessionId — session with readings. */
  app.get<{ Params: { sessionId: string } }>(
    '/sampling/:sessionId', { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.sessionId);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });
      const db = getDB();
      const session = db.prepare(`SELECT * FROM cv_sampling_sessions WHERE session_id = ?`).get(id);
      if (!session) return reply.code(404).send({ error: 'Session not found' });
      const readings = db.prepare(
        `SELECT * FROM cv_sampling_readings WHERE session_id = ? ORDER BY sequence_number, reading_id`
      ).all(id);
      return reply.send({ ...session, readings });
    },
  );

  /** GET /sampling?batch_id=X — sampling sessions for a batch. */
  app.get<{ Querystring: { batch_id?: string; protocol_id?: string; limit?: string } }>(
    '/sampling', { preHandler: requireAuth },
    async (request, reply) => {
      const db = getDB();
      const { batch_id, protocol_id, limit = '20' } = request.query;
      const conditions: string[] = [];
      const vals: unknown[] = [];
      if (batch_id)    { conditions.push('batch_id = ?');    vals.push(Number(batch_id)); }
      if (protocol_id) { conditions.push('protocol_id = ?'); vals.push(Number(protocol_id)); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const sessions = db.prepare(
        `SELECT * FROM cv_sampling_sessions ${where} ORDER BY started_at DESC LIMIT ?`
      ).all(...vals, Number(limit));
      return reply.send(sessions);
    },
  );
};

export default tasksRoutes;
