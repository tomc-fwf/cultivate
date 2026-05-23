import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { triggerFarmstockDepletion } from '../../lib/farmstock-client.js';

interface IdParams { id: string }

const FoliarCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  row_id: z.string().nullable().optional(),
  container_id: z.string().nullable().optional(),
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }),
  foliar_recipe_id: z.number().int().positive().nullable().optional(),
  input_id: z.number().int().positive().nullable().optional(),
  input_lot_id: z.number().int().positive().nullable().optional(),
  rate_value: z.number().positive().nullable().optional(),
  rate_unit: z.string().nullable().optional(),
  volume_applied: z.number().positive().nullable().optional(),
  volume_unit: z.string().nullable().optional(),
  purpose: z.string().min(1, 'purpose is required — describe why this foliar is being applied'),
  ambient_temp_f: z.number().nullable().optional(),
  ambient_rh: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type FoliarCreateBody = z.infer<typeof FoliarCreateSchema>;

const FoliarUpdateSchema = z.object({
  row_id: z.string().nullable().optional(),
  container_id: z.string().nullable().optional(),
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }).optional(),
  rate_value: z.number().positive().nullable().optional(),
  rate_unit: z.string().nullable().optional(),
  volume_applied: z.number().positive().nullable().optional(),
  volume_unit: z.string().nullable().optional(),
  purpose: z.string().min(1, 'purpose cannot be empty').optional(),
  ambient_temp_f: z.number().nullable().optional(),
  ambient_rh: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type FoliarUpdateBody = z.infer<typeof FoliarUpdateSchema>;

function isEditable(appliedAt: string): boolean {
  return Date.now() - new Date(appliedAt).getTime() < 24 * 60 * 60 * 1000;
}

function dateClause(date: string): { sql: string; params: unknown[] } {
  const now = new Date();
  if (date === 'today' || !date) {
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

/**
 * Fetch item details from farmstock to check for pesticide category and PHI.
 * Returns null if farmstock is not configured (dev mode) or unavailable.
 */
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

/**
 * Map batch status + days in flower to cv_input_phi_stage_overrides batch_stage key.
 */
function getBatchStageKey(status: string, currentStageSince: string | null): string | null {
  switch (status) {
    case 'germ': return 'germ';
    case 'seedling': return 'seedling';
    case 'cult-hoop': return 'cult_hoop';
    case 'field-veg': return 'field_veg';
    case 'field-flower': {
      if (!currentStageSince) return 'field_flower_w1';
      const days = Math.floor((Date.now() - new Date(currentStageSince).getTime()) / 86400000);
      if (days < 7) return 'field_flower_w1';
      if (days < 14) return 'field_flower_w2';
      if (days < 21) return 'field_flower_w3';
      return 'field_flower_w4plus';
    }
    case 'flush': return 'flush';
    default: return null;
  }
}

const foliarApplicationsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list foliar applications.
   * Query: ?batch_id=X, ?date=today|YYYY-MM-DD|7d|30d, ?limit=50
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { batch_id, date = 'today', limit = '50' } = request.query as {
      batch_id?: string; date?: string; limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
    const { sql: dateSql, params: dateParams } = dateClause(date);

    const whereClauses = [dateSql];
    const params: unknown[] = [...dateParams];

    if (batch_id) {
      whereClauses.push('a.batch_id = ?');
      params.push(Number(batch_id));
    }

    const rows = db.prepare(`
      SELECT
        a.*,
        s.name AS batch_strain_name,
        b.sub_zone_id AS batch_sub_zone_id,
        fr.name AS recipe_name,
        fr.version AS recipe_version,
        u.name AS applicator_name
      FROM cv_applications_foliar a
      JOIN cv_batches b ON b.batch_id = a.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_foliar_recipes fr ON fr.foliar_recipe_id = a.foliar_recipe_id
      LEFT JOIN cv_users u ON u.id = a.applicator
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
   * POST / — create a foliar application.
   *
   * Business rules enforced here:
   *   - purpose required (rule 12)
   *   - product must be non-pesticide (rule 13) — checked via farmstock if configured
   *   - phi_compliant and stage_compliant computed and stored (rule 14)
   *   - stage_compliant = false is a hard block, returns 422
   */
  app.post<{ Body: FoliarCreateBody }>(
    '/',
    { preHandler: requireRole('grower') },
    async (request, reply) => {
      let body: FoliarCreateBody;
      try { body = FoliarCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const {
        batch_id,
        row_id = null,
        container_id = null,
        applied_at,
        foliar_recipe_id = null,
        input_id = null,
        input_lot_id = null,
        rate_value = null,
        rate_unit = null,
        volume_applied = null,
        volume_unit = null,
        purpose,
        ambient_temp_f = null,
        ambient_rh = null,
        notes = null,
      } = body;

      // --- Cross-field business logic checks ---
      if (!foliar_recipe_id && !input_id) {
        return reply.code(400).send({ error: 'Either foliar_recipe_id or input_id is required' });
      }

      if (foliar_recipe_id && input_id) {
        return reply.code(400).send({ error: 'Provide either foliar_recipe_id or input_id, not both' });
      }

      if (input_id && (!rate_value || isNaN(Number(rate_value)) || Number(rate_value) <= 0)) {
        return reply.code(400).send({ error: 'rate_value is required when using a single product (no recipe)' });
      }

      if (input_id && !rate_unit) {
        return reply.code(400).send({ error: 'rate_unit is required when using a single product (no recipe)' });
      }

      if (volume_applied != null && !volume_unit) {
        return reply.code(400).send({ error: 'volume_unit is required when volume_applied is provided' });
      }

      const db = getDB();

      // --- Batch validation ---
      const batch = db.prepare(
        'SELECT batch_id, status, current_stage_since, strain_id, harvest_date FROM cv_batches WHERE batch_id = ?'
      ).get(Number(batch_id)) as Record<string, unknown> | undefined;

      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });
      if (batch['status'] === 'closed') {
        return reply.code(400).send({ error: 'Batch is closed and cannot receive new applications' });
      }
      if (batch['status'] === 'harvesting') {
        return reply.code(400).send({ error: 'Batch is in harvesting — foliar applications cannot be logged during active harvest' });
      }

      // --- Recipe validation ---
      if (foliar_recipe_id) {
        const recipe = db.prepare(
          'SELECT foliar_recipe_id FROM cv_foliar_recipes WHERE foliar_recipe_id = ? AND active = 1'
        ).get(Number(foliar_recipe_id));
        if (!recipe) return reply.code(400).send({ error: 'foliar_recipe_id does not exist or is not active' });
      }

      // --- Pesticide check (rule 13) ---
      // Fetches item from farmstock if configured; if unavailable, trusts the frontend selection.
      let phi_days_operational: number | null = null;
      if (input_id) {
        const item = await fetchFarmstockItem(Number(input_id));
        if (item) {
          const epaRegNo = item['epa_reg_number'] ?? item['epa_reg_no'];
          if (epaRegNo) {
            return reply.code(422).send({
              error: 'This product has an EPA registration number and must be logged as a Pesticide Application, not a Foliar Application.',
              redirect: 'pesticide',
              input_id: Number(input_id),
            });
          }
          phi_days_operational = item['phi_days_operational'] != null
            ? Number(item['phi_days_operational'])
            : null;
        }
      }

      // --- Stage compliance check (rule 14 — hard block) ---
      const stageKey = getBatchStageKey(
        String(batch['status']),
        batch['current_stage_since'] ? String(batch['current_stage_since']) : null
      );
      let stage_compliant: number | null = 1; // assume compliant unless override says otherwise

      if (stageKey && input_id) {
        const override = db.prepare(`
          SELECT allowed, reason FROM cv_input_phi_stage_overrides
          WHERE input_id = ? AND batch_stage = ? AND allowed = 0
          LIMIT 1
        `).get(Number(input_id), stageKey) as Record<string, unknown> | undefined;

        if (override) {
          return reply.code(422).send({
            error: `This product is not permitted during the current growth stage (${stageKey.replace(/_/g, ' ')}).`,
            reason: override['reason'],
            stage_blocked: true,
          });
        }
      } else if (!stageKey) {
        stage_compliant = null; // unknown stage, don't compute
      }

      // --- PHI compliance (rule 14 — warn only, not block) ---
      let phi_compliant: number | null = null;
      if (phi_days_operational != null && batch['harvest_date']) {
        const harvestMs = new Date(String(batch['harvest_date'])).getTime();
        const appliedMs = new Date(applied_at).getTime();
        const phiMs = phi_days_operational * 86400000;
        phi_compliant = (harvestMs - appliedMs) >= phiMs ? 1 : 0;
      }

      // Snapshot product name at save time (MN 342.25 — 5-year retention)
      let productNameSnapshot: string | null = null;
      if (input_id != null) {
        const item = await fetchFarmstockItem(Number(input_id));
        if (item) productNameSnapshot = String(item['name'] ?? item['item_name'] ?? `Input #${input_id}`);
      }

      const userId = (request.user as Record<string, unknown>).id;
      const now = new Date().toISOString();

      const result = db.prepare(`
        INSERT INTO cv_applications_foliar
          (batch_id, row_id, container_id, applied_at, foliar_recipe_id, input_id,
           input_lot_id, rate_value, rate_unit, volume_applied, volume_unit, purpose,
           ambient_temp_f, ambient_rh, phi_compliant, stage_compliant, applicator,
           notes, product_name_snapshot, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(batch_id),
        row_id ?? null,
        container_id ?? null,
        applied_at,
        foliar_recipe_id != null ? Number(foliar_recipe_id) : null,
        input_id != null ? Number(input_id) : null,
        input_lot_id != null ? Number(input_lot_id) : null,
        rate_value != null ? Number(rate_value) : null,
        rate_unit ?? null,
        volume_applied != null ? Number(volume_applied) : null,
        volume_unit ?? null,
        String(purpose).trim(),
        ambient_temp_f != null ? Number(ambient_temp_f) : null,
        ambient_rh != null ? Number(ambient_rh) : null,
        phi_compliant,
        stage_compliant,
        userId,
        notes ?? null,
        productNameSnapshot,
        userId,
        now,
      );

      const foliar_id = Number(result.lastInsertRowid);

      // Fire-and-forget: deplete the consumed lot in farmstock (non-blocking)
      if (input_lot_id != null) {
        void triggerFarmstockDepletion({
          lot_id: Number(input_lot_id),
          quantity: volume_applied != null ? Number(volume_applied) : null,
          quantity_unit: volume_unit ?? null,
          reference_id: String(foliar_id),
          reference_type: 'foliar_application',
        }, app.log);
      }

      return reply.code(201).send({
        foliar_id,
        batch_id: Number(batch_id),
        phi_compliant,
        stage_compliant,
        // Surface a warning if PHI is non-compliant (was allowed but flagged)
        ...(phi_compliant === 0 ? { warning: 'PHI check: applied within operational pre-harvest interval. Review before harvest.' } : {}),
      });
    },
  );

  /**
   * PATCH /:id — edit a foliar application within 24h.
   */
  app.patch<{ Params: IdParams; Body: FoliarUpdateBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();

      const existing = db.prepare(
        'SELECT * FROM cv_applications_foliar WHERE foliar_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Application not found' });
      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Application record is locked after 24 hours' });
      }

      let body: FoliarUpdateBody;
      try { body = FoliarUpdateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const updates: string[] = [];
      const values: unknown[] = [];

      if ('purpose' in body) {
        updates.push('purpose = ?');
        values.push(String(body.purpose).trim());
      }

      if ('row_id' in body) { updates.push('row_id = ?'); values.push(body.row_id ?? null); }
      if ('container_id' in body) { updates.push('container_id = ?'); values.push(body.container_id ?? null); }
      if ('rate_value' in body) { updates.push('rate_value = ?'); values.push(body.rate_value != null ? Number(body.rate_value) : null); }
      if ('rate_unit' in body) { updates.push('rate_unit = ?'); values.push(body.rate_unit ?? null); }
      if ('volume_applied' in body) { updates.push('volume_applied = ?'); values.push(body.volume_applied != null ? Number(body.volume_applied) : null); }
      if ('volume_unit' in body) { updates.push('volume_unit = ?'); values.push(body.volume_unit ?? null); }
      if ('ambient_temp_f' in body) { updates.push('ambient_temp_f = ?'); values.push(body.ambient_temp_f != null ? Number(body.ambient_temp_f) : null); }
      if ('ambient_rh' in body) { updates.push('ambient_rh = ?'); values.push(body.ambient_rh != null ? Number(body.ambient_rh) : null); }
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
        `UPDATE cv_applications_foliar SET ${updates.join(', ')} WHERE foliar_id = ?`
      ).run(...values);

      const updated = db.prepare(`
        SELECT a.*, s.name AS batch_strain_name, b.sub_zone_id AS batch_sub_zone_id,
          fr.name AS recipe_name, fr.version AS recipe_version, u.name AS applicator_name
        FROM cv_applications_foliar a
        JOIN cv_batches b ON b.batch_id = a.batch_id
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_foliar_recipes fr ON fr.foliar_recipe_id = a.foliar_recipe_id
        LEFT JOIN cv_users u ON u.id = a.applicator
        WHERE a.foliar_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({ ...updated, editable: isEditable(String(updated['applied_at'])) });
    },
  );

  // DELETE is intentionally absent — foliar records are audit records
  // retained for 5 years per MN Statute 342.25 (Business Rule 5).
};

export default foliarApplicationsRoutes;
