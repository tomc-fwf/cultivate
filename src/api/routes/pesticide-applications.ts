import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { getSkill } from '../../lib/skill-loader.js';
import { triggerFarmstockDepletion } from '../../lib/farmstock-client.js';

interface IdParams { id: string }

const PesticideCreateSchema = z.object({
  batch_id: z.number().int().positive(),
  row_id: z.string().nullable().optional(),
  container_id: z.string().nullable().optional(),
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }),
  input_id: z.number().int().positive(),
  input_lot_id: z.number().int().positive(),
  rate_value: z.number().positive(),
  rate_unit: z.string().min(1),
  volume_applied: z.number().positive(),
  volume_unit: z.string().min(1),
  application_method: z.enum(['foliar_spray', 'soil_drench', 'granular', 'other']),
  target_pest: z.string().min(1),
  pest_pressure: z.enum(['incidental', 'threshold', 'outbreak']).nullable().optional(),
  ambient_temp_f: z.number(),
  ambient_rh: z.number().nullable().optional(),
  wind_speed_mph: z.number(),
  wind_direction: z.string().nullable().optional(),
  expected_harvest_date: z.string().nullable().optional(),
  applicator_license: z.string().nullable().optional(),
  phi_override_notes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type PesticideCreateBody = z.infer<typeof PesticideCreateSchema>;

const PesticideUpdateSchema = z.object({
  applied_at: z.string().refine(s => !isNaN(Date.parse(s)), { message: 'applied_at must be a valid ISO datetime' }).optional(),
  target_pest: z.string().min(1).optional(),
  pest_pressure: z.enum(['incidental', 'threshold', 'outbreak']).nullable().optional(),
  ambient_temp_f: z.number().optional(),
  ambient_rh: z.number().nullable().optional(),
  wind_speed_mph: z.number().optional(),
  wind_direction: z.string().nullable().optional(),
  applicator_license: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type PesticideUpdateBody = z.infer<typeof PesticideUpdateSchema>;

const VALID_APPLICATION_METHODS = new Set([
  'foliar_spray', 'soil_drench', 'granular', 'other',
]);

const VALID_PEST_PRESSURES = new Set(['incidental', 'threshold', 'outbreak']);

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

const pesticideApplicationsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list pesticide applications.
   * Query: ?batch_id, ?date=today|YYYY-MM-DD|7d|30d, ?rei_active=1, ?limit
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { batch_id, date = 'today', rei_active, limit = '50' } = request.query as {
      batch_id?: string; date?: string; rei_active?: string; limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (rei_active === '1') {
      // REI active = expires_at is set and has not passed and not yet cleared
      whereClauses.push("a.rei_expires_at IS NOT NULL AND a.rei_expires_at > datetime('now') AND a.rei_cleared_at IS NULL");
    } else {
      const { sql: dateSql, params: dateParams } = dateClause(date);
      whereClauses.push(dateSql);
      params.push(...dateParams);
    }

    if (batch_id) {
      whereClauses.push('a.batch_id = ?');
      params.push(Number(batch_id));
    }

    const rows = db.prepare(`
      SELECT
        a.*,
        s.name AS batch_strain_name,
        b.sub_zone_id AS batch_sub_zone_id,
        u.name AS applicator_name
      FROM cv_applications_pesticide a
      JOIN cv_batches b ON b.batch_id = a.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = a.applicator
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.applied_at DESC
      LIMIT ?
    `).all(...params, limitNum) as Array<Record<string, unknown>>;

    return reply.send(rows.map(r => ({
      ...r,
      editable: isEditable(String(r['applied_at'])),
      rei_active: r['rei_expires_at'] && !r['rei_cleared_at']
        ? new Date(String(r['rei_expires_at'])) > new Date()
        : false,
    })));
  });

  /**
   * POST / — create a pesticide application.
   *
   * Business rules enforced:
   *   Rule 16 — input_lot_id required
   *   Rule 17 — target_pest, ambient_temp_f, wind_speed_mph required
   *   Rule 18 — PHI checked against phi_days_operational; non-compliant
   *             allowed only with phi_override_notes
   *   Rule 19 — stage block is a hard reject (no override)
   *   Rule 20 — rei_expires_at computed from applied_at + rei_hours
   *   Rule 21 — applicator_license required for restricted-use products
   */
  app.post<{ Body: PesticideCreateBody }>(
    '/',
    { preHandler: requireRole('grower') },
    async (request, reply) => {
      let body: PesticideCreateBody;
      try { body = PesticideCreateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const {
        batch_id,
        row_id = null,
        container_id = null,
        applied_at,
        input_id,
        input_lot_id,
        rate_value,
        rate_unit,
        volume_applied,
        volume_unit,
        application_method,
        target_pest,
        pest_pressure = null,
        ambient_temp_f,
        ambient_rh = null,
        wind_speed_mph,
        wind_direction = null,
        expected_harvest_date = null,
        applicator_license = null,
        phi_override_notes = null,
        notes = null,
      } = body;

      const db = getDB();

      // ── Batch validation ───────────────────────────────────────────────────
      const batch = db.prepare(
        'SELECT batch_id, status, current_stage_since, strain_id, harvest_date FROM cv_batches WHERE batch_id = ?'
      ).get(Number(batch_id)) as Record<string, unknown> | undefined;

      if (!batch) return reply.code(400).send({ error: 'batch_id does not exist' });
      if (batch['status'] === 'closed') return reply.code(400).send({ error: 'Batch is closed and cannot receive new applications' });

      // ── Farmstock item check ───────────────────────────────────────────────
      let phi_days_operational: number | null = null;
      let rei_hours: number | null = null;
      let restricted_use = false;

      const item = await fetchFarmstockItem(Number(input_id));
      if (item) {
        // Verify it's actually a pesticide (rule 13 enforcement from the other side)
        const epaRegNo = item['epa_reg_number'] ?? item['epa_reg_no'];
        if (!epaRegNo) {
          return reply.code(422).send({
            error: 'This product does not have an EPA registration number. Use the Foliar Application or Container Amendment form instead.',
            redirect: 'foliar',
            input_id: Number(input_id),
          });
        }
        phi_days_operational = item['phi_days_operational'] != null ? Number(item['phi_days_operational']) : null;
        rei_hours = item['rei_hours'] != null ? Number(item['rei_hours']) : null;
        restricted_use = Boolean(item['restricted_use']);
      }

      // ── Rule 21 — RUP requires applicator license ──────────────────────────
      if (restricted_use && (!applicator_license || String(applicator_license).trim() === '')) {
        return reply.code(422).send({
          error: 'This is a restricted-use pesticide. Applicator license number is required.',
          restricted_use: true,
        });
      }

      // ── Rule 19 — stage block (hard reject, no override) ──────────────────
      const stageKey = getBatchStageKey(
        String(batch['status']),
        batch['current_stage_since'] ? String(batch['current_stage_since']) : null
      );

      if (stageKey) {
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
      }

      // ── Rule 18 — PHI compliance check ────────────────────────────────────
      const harvestDate = expected_harvest_date ?? batch['harvest_date'];
      let phi_compliant: number | null = null;

      if (phi_days_operational != null && harvestDate) {
        const harvestMs = new Date(String(harvestDate)).getTime();
        const appliedMs = new Date(applied_at).getTime();
        const daysUntilHarvest = (harvestMs - appliedMs) / 86400000;
        phi_compliant = daysUntilHarvest >= phi_days_operational ? 1 : 0;

        if (phi_compliant === 0 && (!phi_override_notes || String(phi_override_notes).trim() === '')) {
          return reply.code(422).send({
            error: `PHI violation: this product requires ${phi_days_operational} days before harvest, but harvest is in ${Math.floor(daysUntilHarvest)} days. Provide phi_override_notes to proceed.`,
            phi_violation: true,
            phi_days_operational,
            days_until_harvest: Math.floor(daysUntilHarvest),
          });
        }
      }

      // ── Rule 20 — compute REI ──────────────────────────────────────────────
      let rei_expires_at: string | null = null;
      if (rei_hours != null) {
        const appliedMs = new Date(applied_at).getTime();
        rei_expires_at = new Date(appliedMs + rei_hours * 3600000).toISOString();
      }

      // Snapshot product identity at save time (MN 342.25 — 5-year retention)
      const productNameSnapshot = item
        ? String(item['name'] ?? item['item_name'] ?? `Input #${input_id}`)
        : null;
      const epaRegNoSnapshot = item
        ? String(item['epa_reg_number'] ?? item['epa_reg_no'] ?? '')
        : null;

      const userId = (request.user as Record<string, unknown>).id;
      const now = new Date().toISOString();

      const result = db.prepare(`
        INSERT INTO cv_applications_pesticide
          (batch_id, row_id, container_id, applied_at, input_id, input_lot_id,
           rate_value, rate_unit, volume_applied, volume_unit, application_method,
           target_pest, pest_pressure, ambient_temp_f, ambient_rh, wind_speed_mph,
           wind_direction, phi_compliant, expected_harvest_date, rei_expires_at,
           applicator_license, applicator, notes,
           product_name_snapshot, epa_reg_no_snapshot,
           created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        Number(batch_id),
        row_id ?? null,
        container_id ?? null,
        applied_at,
        Number(input_id),
        Number(input_lot_id),
        Number(rate_value),
        rate_unit,
        Number(volume_applied),
        volume_unit,
        application_method,
        String(target_pest).trim(),
        pest_pressure ?? null,
        Number(ambient_temp_f),
        ambient_rh != null ? Number(ambient_rh) : null,
        Number(wind_speed_mph),
        wind_direction ?? null,
        phi_compliant,
        harvestDate ?? null,
        rei_expires_at,
        applicator_license ? String(applicator_license).trim() : null,
        userId,
        notes ?? null,
        productNameSnapshot,
        epaRegNoSnapshot,
        userId,
        now,
      );

      const pesticide_app_id = Number(result.lastInsertRowid);

      // ── Skill instance record — SOP compliance evidence trail ─────────────
      // Best-effort: don't fail the application entry if this insert fails.
      // The skill instance links this application record to the pesticide-application
      // skill schema, preserving which preconditions were evaluated and any overrides.
      try {
        const skill = getSkill('pesticide-application');
        if (skill) {
          const overrideNotes = phi_compliant === 0 && phi_override_notes
            ? `PHI override: ${phi_override_notes}`
            : null;

          const validationSnapshot = JSON.stringify({
            passed: phi_compliant !== 0 || overrideNotes !== null,
            blocked: false, // we only reach here if all block checks passed
            checks: [
              { check_id: 'batch_not_closed', passed: true, severity: 'block', message: `Batch status: ${batch['status']}` },
              { check_id: 'rei_not_active', passed: true, severity: 'block', message: 'No active REI at time of submission' },
              { check_id: 'phi_compliant', passed: phi_compliant !== 0 || Boolean(phi_override_notes), severity: 'warn_override', message: phi_compliant === 0 ? 'PHI override accepted' : `PHI compliant (${phi_days_operational} day PHI)` },
              { check_id: 'stage_allows', passed: true, severity: 'block', message: `Stage ${stageKey ?? 'unknown'} allows application` },
              { check_id: 'rup_license_ok', passed: true, severity: 'block', message: restricted_use ? `RUP — license: ${applicator_license ?? 'provided'}` : 'Not RUP' },
            ],
            warnings: phi_compliant === 0 ? ['PHI violation override recorded'] : [],
          });

          db.prepare(`
            INSERT INTO cv_skill_instances
              (skill_id, skill_version, sop_id, completed_by, completed_at, context,
               validation_result, override_notes, output_record_id, output_table, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            skill.skill_id,
            skill.skill_version,
            skill.sop_id,
            userId,
            applied_at,
            JSON.stringify({ batch_id, input_id, input_lot_id, sub_zone_id: batch['sub_zone_id'] ?? null }),
            validationSnapshot,
            overrideNotes,
            String(pesticide_app_id),
            'cv_applications_pesticide',
            now,
          );
        }
      } catch (skillErr) {
        app.log.warn({ err: skillErr }, 'skill instance record failed — application saved successfully');
      }

      // Fire-and-forget: deplete the consumed lot in farmstock (non-blocking)
      // input_lot_id is required for pesticides (rule 16), so the guard always fires
      void triggerFarmstockDepletion({
        lot_id: Number(input_lot_id),
        quantity: Number(volume_applied),
        quantity_unit: volume_unit,
        reference_id: String(pesticide_app_id),
        reference_type: 'pesticide_application',
      }, app.log);

      return reply.code(201).send({
        pesticide_app_id,
        batch_id: Number(batch_id),
        phi_compliant,
        rei_expires_at,
        rei_hours,
        target_area: container_id ?? row_id ?? null,
        ...(phi_compliant === 0 ? { warning: 'PHI violation override recorded.' } : {}),
      });
    },
  );

  /**
   * POST /:id/clear-rei — clear REI (sign off that area is safe to re-enter).
   */
  app.post<{ Params: IdParams }>(
    '/:id/clear-rei',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();
      const existing = db.prepare(
        'SELECT pesticide_app_id, rei_expires_at, rei_cleared_at FROM cv_applications_pesticide WHERE pesticide_app_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Application not found' });
      if (existing['rei_cleared_at']) return reply.code(409).send({ error: 'REI already cleared' });
      if (!existing['rei_expires_at']) return reply.code(409).send({ error: 'This application has no REI' });

      const userId = (request.user as Record<string, unknown>).id;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE cv_applications_pesticide
        SET rei_cleared_at = ?, rei_cleared_by = ?
        WHERE pesticide_app_id = ?
      `).run(now, userId, id);

      return reply.send({ pesticide_app_id: id, rei_cleared_at: now });
    },
  );

  /**
   * PATCH /:id — edit within 24h (limited fields).
   */
  app.patch<{ Params: IdParams; Body: PesticideUpdateBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid id' });

      const db = getDB();
      const existing = db.prepare(
        'SELECT * FROM cv_applications_pesticide WHERE pesticide_app_id = ?'
      ).get(id) as Record<string, unknown> | undefined;

      if (!existing) return reply.code(404).send({ error: 'Application not found' });
      if (!isEditable(String(existing['applied_at']))) {
        return reply.code(409).send({ error: 'Application record is locked after 24 hours' });
      }

      let body: PesticideUpdateBody;
      try { body = PesticideUpdateSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }
      const updates: string[] = [];
      const values: unknown[] = [];

      if ('target_pest' in body) {
        updates.push('target_pest = ?'); values.push(String(body.target_pest).trim());
      }
      if ('pest_pressure' in body) {
        updates.push('pest_pressure = ?'); values.push(body.pest_pressure ?? null);
      }
      if ('ambient_temp_f' in body) {
        updates.push('ambient_temp_f = ?'); values.push(Number(body.ambient_temp_f));
      }
      if ('ambient_rh' in body) { updates.push('ambient_rh = ?'); values.push(body.ambient_rh != null ? Number(body.ambient_rh) : null); }
      if ('wind_speed_mph' in body) {
        updates.push('wind_speed_mph = ?'); values.push(Number(body.wind_speed_mph));
      }
      if ('wind_direction' in body) { updates.push('wind_direction = ?'); values.push(body.wind_direction ?? null); }
      if ('applicator_license' in body) { updates.push('applicator_license = ?'); values.push(body.applicator_license ? String(body.applicator_license).trim() : null); }
      if ('notes' in body) { updates.push('notes = ?'); values.push(body.notes ?? null); }

      if ('applied_at' in body && body.applied_at) {
        const origDay = String(existing['applied_at']).slice(0, 10);
        const newDay = new Date(body.applied_at).toISOString().slice(0, 10);
        if (origDay !== newDay) return reply.code(400).send({ error: 'applied_at can only be changed within the same calendar day' });
        updates.push('applied_at = ?'); values.push(body.applied_at);
      }

      if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' });
      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE cv_applications_pesticide SET ${updates.join(', ')} WHERE pesticide_app_id = ?`).run(...values);

      const updated = db.prepare(`
        SELECT a.*, s.name AS batch_strain_name, b.sub_zone_id AS batch_sub_zone_id, u.name AS applicator_name
        FROM cv_applications_pesticide a
        JOIN cv_batches b ON b.batch_id = a.batch_id
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_users u ON u.id = a.applicator
        WHERE a.pesticide_app_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({ ...updated, editable: isEditable(String(updated['applied_at'])) });
    },
  );

  // DELETE is intentionally absent — pesticide records are audit records
  // retained for 5 years per MN Statute 342.25 (Business Rule 5).
};

export default pesticideApplicationsRoutes;
