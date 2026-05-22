import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { triggerFarmstockDepletion } from '../../lib/farmstock-client.js';

interface IdParams { id: string }

const AmendmentCreateSchema = z.object({
  container_id: z.string().min(1),
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }),
  amendment_type: z.enum(['media_replacement', 'amendment', 'inoculation', 'drench', 'top_dress', 'mix_in', 'correction', 'removal', 'other']),
  application_method: z.enum(['top_dress', 'mix_in', 'drench', 'side_dress', 'replaced', 'removed', 'other']).nullable().optional(),
  input_id: z.number().int().positive().nullable().optional(),
  input_lot_id: z.number().int().positive().nullable().optional(),
  quantity: z.number().nullable().optional(),
  quantity_unit: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  soil_sample_id: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type AmendmentCreateBody = z.infer<typeof AmendmentCreateSchema>;

const AmendmentUpdateSchema = z.object({
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }).optional(),
  amendment_type: z.enum(['media_replacement', 'amendment', 'inoculation', 'drench', 'top_dress', 'mix_in', 'correction', 'removal', 'other']).optional(),
  application_method: z.enum(['top_dress', 'mix_in', 'drench', 'side_dress', 'replaced', 'removed', 'other']).nullable().optional(),
  quantity: z.number().nullable().optional(),
  quantity_unit: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type AmendmentUpdateBody = z.infer<typeof AmendmentUpdateSchema>;

const VALID_AMENDMENT_TYPES = new Set([
  'media_replacement', 'amendment', 'inoculation', 'drench',
  'top_dress', 'mix_in', 'correction', 'removal', 'other',
]);

const VALID_APPLICATION_METHODS = new Set([
  'top_dress', 'mix_in', 'drench', 'side_dress', 'replaced', 'removed', 'other',
]);

function isEditable(appliedAt: string): boolean {
  return Date.now() - new Date(appliedAt).getTime() < 24 * 60 * 60 * 1000;
}

function dateClause(date: string): { sql: string; params: unknown[] } {
  const now = new Date();
  if (!date || date === 'today') {
    const today = now.toISOString().slice(0, 10);
    return { sql: "date(a.applied_at) = date(?)", params: [today] };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { sql: "date(a.applied_at) = date(?)", params: [date] };
  }
  if (date === '7d') return { sql: "a.applied_at >= datetime('now', '-7 days')", params: [] };
  if (date === '30d') return { sql: "a.applied_at >= datetime('now', '-30 days')", params: [] };
  const today = now.toISOString().slice(0, 10);
  return { sql: "date(a.applied_at) = date(?)", params: [today] };
}

async function fetchFarmstockItem(itemId: number): Promise<Record<string, unknown> | null> {
  const url = process.env.FARMSTOCK_URL;
  const key = process.env.FARMSTOCK_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/api/items/inventory/${itemId}`, {
      headers: { Authorization: `Service ${key}` },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

const containerAmendmentsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list amendments.
   * Query: ?container_id, ?batch_id, ?date=today|YYYY-MM-DD|7d|30d, ?limit
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { container_id, batch_id, date = 'today', limit = '50' } = request.query as {
      container_id?: string; batch_id?: string; date?: string; limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
    const { sql: dateSql, params: dateParams } = dateClause(date);

    const whereClauses = [dateSql];
    const params: unknown[] = [...dateParams];

    if (container_id) {
      whereClauses.push('a.container_id = ?');
      params.push(container_id);
    }
    if (batch_id) {
      whereClauses.push('a.batch_id = ?');
      params.push(Number(batch_id));
    }

    const rows = db.prepare(`
      SELECT
        a.*,
        u.name AS applicator_name,
        s.name AS batch_strain_name
      FROM cv_container_amendments a
      LEFT JOIN cv_users u ON u.id = a.applicator
      LEFT JOIN cv_batches b ON b.batch_id = a.batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.applied_at DESC
      LIMIT ?
    `).all(...params, limitNum) as Array<Record<string, unknown>>;

    return reply.send(rows.map(r => ({
      ...r,
      editable: isEditable(String(r['applied_at'])),
    })));
  });

  /**
   * POST / — create an amendment.
   * Auto-populates container_state and batch_id from cv_container_state.
   */
  app.post<{ Body: AmendmentCreateBody }>(
    '/',
    { preHandler: requireAuth },
    async (request, reply) => {
      let body: AmendmentCreateBody;
      try { body = AmendmentCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const {
        container_id,
        applied_at,
        amendment_type,
        application_method = null,
        input_id = null,
        input_lot_id = null,
        quantity = null,
        quantity_unit = null,
        purpose = null,
        soil_sample_id = null,
        notes = null,
      } = body;

      const db = getDB();

      const container = db.prepare(
        'SELECT container_id FROM cv_containers WHERE container_id = ?'
      ).get(String(container_id).trim()) as Record<string, unknown> | undefined;

      if (!container) {
        return reply.code(400).send({ error: `Container '${container_id}' does not exist` });
      }

      // Auto-populate state + batch from cv_container_state at submission time
      const stateRow = db.prepare(
        'SELECT current_state, current_batch_id FROM cv_container_state WHERE container_id = ?'
      ).get(String(container_id).trim()) as Record<string, unknown> | undefined;

      const containerStateVal = String(stateRow?.current_state ?? 'active');
      const batchIdFromState = stateRow?.current_batch_id != null
        ? Number(stateRow.current_batch_id)
        : null;

      // Pesticide check: amendments cannot use EPA-registered products (rule 13 equivalent)
      let productNameSnapshot: string | null = null;
      if (input_id) {
        const item = await fetchFarmstockItem(Number(input_id));
        if (item) {
          const epaRegNo = item['epa_reg_number'] ?? item['epa_reg_no'];
          if (epaRegNo) {
            return reply.code(422).send({
              error: 'This product has an EPA registration number and must be logged as a Pesticide Application, not a Container Amendment.',
              redirect: 'pesticide',
              input_id: Number(input_id),
            });
          }
          // Snapshot product name at save time (MN 342.25 — 5-year retention)
          productNameSnapshot = String(item['name'] ?? item['item_name'] ?? `Input #${input_id}`);
        }
      }

      const userId = (request.user as Record<string, unknown>).id;
      const now = new Date().toISOString();

      const result = db.prepare(`
        INSERT INTO cv_container_amendments
          (container_id, batch_id, container_state, applied_at, amendment_type,
           application_method, input_id, input_lot_id, quantity, quantity_unit,
           purpose, soil_sample_id, applicator, notes, product_name_snapshot,
           created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(container_id).trim(),
        batchIdFromState,
        containerStateVal,
        applied_at,
        amendment_type,
        application_method ?? null,
        input_id != null ? Number(input_id) : null,
        input_lot_id != null ? Number(input_lot_id) : null,
        quantity != null ? Number(quantity) : null,
        quantity_unit ?? null,
        purpose ? String(purpose).trim() : null,
        soil_sample_id != null ? Number(soil_sample_id) : null,
        userId,
        notes ?? null,
        productNameSnapshot,
        userId,
        now,
      );

      const amendment_id = Number(result.lastInsertRowid);

      // Fire-and-forget: deplete the consumed lot in farmstock (non-blocking)
      if (input_lot_id != null) {
        void triggerFarmstockDepletion({
          lot_id: Number(input_lot_id),
          quantity: quantity != null ? Number(quantity) : null,
          quantity_unit: quantity_unit ?? null,
          reference_id: String(amendment_id),
          reference_type: 'container_amendment',
        }, app.log);
      }

      return reply.code(201).send({
        amendment_id,
        container_id: String(container_id).trim(),
        batch_id: batchIdFromState,
        container_state: containerStateVal,
      });
    },
  );

  /**
   * PATCH /:id — edit within 24h.
   */
  app.patch<{ Params: IdParams; Body: AmendmentUpdateBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();

      const existing = db.prepare(
        'SELECT * FROM cv_container_amendments WHERE amendment_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Amendment not found' });
      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Amendment record is locked after 24 hours' });
      }

      let body: AmendmentUpdateBody;
      try { body = AmendmentUpdateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const updates: string[] = [];
      const values: unknown[] = [];

      if ('amendment_type' in body) {
        updates.push('amendment_type = ?');
        values.push(body.amendment_type);
      }

      if ('application_method' in body) {
        updates.push('application_method = ?');
        values.push(body.application_method ?? null);
      }

      if ('quantity' in body) {
        updates.push('quantity = ?');
        values.push(body.quantity != null ? Number(body.quantity) : null);
      }
      if ('quantity_unit' in body) { updates.push('quantity_unit = ?'); values.push(body.quantity_unit ?? null); }
      if ('purpose' in body) {
        updates.push('purpose = ?');
        values.push(body.purpose ? String(body.purpose).trim() : null);
      }
      if ('notes' in body) { updates.push('notes = ?'); values.push(body.notes ?? null); }

      if ('applied_at' in body && body.applied_at) {
        const origDay = String(existing['applied_at']).slice(0, 10);
        const newDay = new Date(body.applied_at).toISOString().slice(0, 10);
        if (origDay !== newDay) {
          return reply.code(400).send({ error: 'applied_at can only be changed within the same calendar day' });
        }
        updates.push('applied_at = ?');
        values.push(body.applied_at);
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' });

      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(
        `UPDATE cv_container_amendments SET ${updates.join(', ')} WHERE amendment_id = ?`
      ).run(...values);

      const updated = db.prepare(`
        SELECT a.*, u.name AS applicator_name
        FROM cv_container_amendments a
        LEFT JOIN cv_users u ON u.id = a.applicator
        WHERE a.amendment_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({ ...updated, editable: isEditable(String(updated['applied_at'])) });
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
        'SELECT * FROM cv_container_amendments WHERE amendment_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Amendment not found' });
      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Amendment record is locked after 24 hours' });
      }

      db.prepare('DELETE FROM cv_container_amendments WHERE amendment_id = ?').run(id);
      return reply.code(204).send();
    },
  );
};

export default containerAmendmentsRoutes;
