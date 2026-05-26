import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  writeCsv,
  generateAdditiveTemplateCsv,
  generatePlantsWasteCsv,
} from '../../lib/metrc-csv/index.js';

// ── Validation schemas ────────────────────────────────────────────────────────

// Plants Waste (#21)
const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;
const WASTE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PlantsWasteRowSchema = z.object({
  waste_method_name: z.string().min(1),
  mixed_material: z.string().optional().nullable(),
  waste_weight: z.number().gt(0),
  unit_of_measure_name: z.string().min(1),
  reason_name: z.string().min(1),
  note: z.string().optional().nullable(),
  location_name: z.string().optional().nullable(),
  sublocation_name: z.string().optional().nullable(),
  waste_date: z.string().regex(WASTE_DATE_RE, 'waste_date must be YYYY-MM-DD'),
  plant_labels: z
    .array(z.string().regex(METRC_TAG_RE, 'Each plant label must be 24 alphanumeric characters'))
    .optional(),
});

const CreatePlantsWasteSchema = z.object({
  events: z.array(PlantsWasteRowSchema).min(1).max(500),
});

const ActiveIngredientSchema = z.object({
  name: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

const AdditiveTemplateSchema = z.object({
  name: z.string()
    .min(1)
    .max(100)
    .regex(/^[^,'"\n\r]+$/, 'Name must not contain commas, quotes, or newlines'),
  additive_type: z.enum(['Fertilizer', 'Pesticide', 'Other']),
  product_trade_name: z.string().max(200).optional().nullable(),
  epa_registration_number: z.string().max(50).optional().nullable(),
  note: z.string().optional().nullable(),
  rei_quantity: z.string().max(10).optional().nullable(),
  rei_time_unit: z.string().max(50).optional().nullable(),
  product_supplier: z.string().max(200).optional().nullable(),
  application_device: z.string().max(200).optional().nullable(),
  active_ingredients: z.array(ActiveIngredientSchema).min(1),
}).refine(
  (t) => t.additive_type !== 'Pesticide' || (!!t.epa_registration_number && t.epa_registration_number.trim().length > 0),
  { message: 'epa_registration_number is required when additive_type is Pesticide', path: ['epa_registration_number'] },
).refine(
  (t) => {
    const hasQty = t.rei_quantity != null && t.rei_quantity.trim() !== '';
    const hasUnit = t.rei_time_unit != null && t.rei_time_unit.trim() !== '';
    return hasQty === hasUnit;
  },
  { message: 'rei_quantity and rei_time_unit must both be present or both absent', path: ['rei_quantity'] },
);

const CreateAdditiveTemplatesSchema = z.object({
  templates: z.array(AdditiveTemplateSchema).min(1),
}).refine(
  (data) => data.templates.reduce((sum, t) => sum + t.active_ingredients.length, 0) <= 500,
  { message: 'Total ingredient row count cannot exceed 500' },
);

// ── Admin schemas ─────────────────────────────────────────────────────────────

const AdminNameSchema = z.object({
  name: z.string().min(1).max(200),
});

const AdminUomSchema = z.object({
  name: z.string().min(1).max(200),
  unit_type: z.string().min(1).max(50).default('weight'),
});

const AdminItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
});

const AdminSublocationSchema = z.object({
  name: z.string().min(1).max(200),
  location_id: z.number().int().positive().optional().nullable(),
  sub_zone_id: z.string().max(10).optional().nullable(),
});

const AdminTagsImportSchema = z.object({
  tags: z
    .array(z.string().regex(METRC_TAG_RE, 'Each tag must be exactly 24 alphanumeric characters'))
    .min(1)
    .max(10000),
});

const AdminEmployeeCreateSchema = z.object({
  license_number: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  role: z.string().max(50).optional().nullable(),
  user_id: z.number().int().positive().optional().nullable(),
});

const AdminEmployeePatchSchema = z
  .object({
    is_active: z.number().int().min(0).max(1).optional(),
    license_number: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    role: z.string().max(50).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

// ── Route handlers ────────────────────────────────────────────────────────────

const metrcCsvRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', { preHandler: [requireAuth] }, async (_req, reply) => {
    return reply.send({ status: 'ok', module: 'metrc-csv' });
  });

  // POST /api/metrc/csv/additive-templates
  fastify.post('/additive-templates', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreateAdditiveTemplatesSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { templates } = parse.data;
    const db = getDB();

    // Duplicate names within request
    const names = templates.map((t) => t.name);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) {
      if (seen.has(n)) dupes.push(n);
      seen.add(n);
    }
    if (dupes.length) {
      return reply.code(400).send({ error: `Duplicate template names in request: ${[...new Set(dupes)].join(', ')}` });
    }

    // Duplicate names in DB
    const placeholders = names.map(() => '?').join(',');
    const existing = db
      .prepare(`SELECT name FROM cv_metrc_additive_templates WHERE name IN (${placeholders})`)
      .all(...names) as { name: string }[];
    if (existing.length) {
      return reply.code(400).send({ error: `Template names already exist: ${existing.map((e) => e.name).join(', ')}` });
    }

    // Generate CSV and write file
    const csvContent = generateAdditiveTemplateCsv(templates);
    const { filePath, rowCount } = await writeCsv(csvContent, 'additive-template');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    const templateIds: number[] = [];
    let uploadId: number;

    const insertFn = db.transaction(() => {
      for (const t of templates) {
        const result = db.prepare(`
          INSERT INTO cv_metrc_additive_templates
            (name, additive_type, product_trade_name, epa_registration_number, note,
             rei_quantity, rei_time_unit, product_supplier, application_device,
             active_ingredients, metrc_csv_generated_at, metrc_csv_file_path,
             created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          t.name,
          t.additive_type,
          t.product_trade_name ?? null,
          t.epa_registration_number ?? null,
          t.note ?? null,
          t.rei_quantity ?? null,
          t.rei_time_unit ?? null,
          t.product_supplier ?? null,
          t.application_device ?? null,
          JSON.stringify(t.active_ingredients),
          now,
          filePath,
          userId,
          now,
          now,
        );
        templateIds.push(Number(result.lastInsertRowid));
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('additive-template', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      template_ids: templateIds,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
    });
  });

  // GET /api/metrc/csv/additive-templates
  fastify.get('/additive-templates', { preHandler: [requireAuth] }, async (_req, reply) => {
    const db = getDB();
    const rows = db
      .prepare('SELECT * FROM cv_metrc_additive_templates ORDER BY created_at DESC')
      .all() as Record<string, unknown>[];
    const result = rows.map((r) => ({
      ...r,
      active_ingredients: JSON.parse(r['active_ingredients'] as string),
    }));
    return reply.send(result);
  });

  // GET /api/metrc/csv/plants-waste/pending
  fastify.get('/plants-waste/pending', { preHandler: [requireAuth] }, async (_req, reply) => {
    const db = getDB();
    const rows = db
      .prepare(
        `SELECT
          w.waste_trim_id,
          w.batch_id,
          w.container_id,
          w.plant_assignment_id,
          w.trimmed_at,
          w.trim_reason,
          w.trim_reason_notes,
          w.wet_weight,
          w.weight_unit,
          w.waste_status,
          w.notes,
          w.metrc_waste_method,
          w.metrc_waste_reason,
          pa.metrc_plant_tag,
          b.batch_id AS linked_batch_id,
          s.name AS strain_name
        FROM cv_plant_waste_trim_events w
        LEFT JOIN cv_plant_assignments pa ON pa.assignment_id = w.plant_assignment_id
        LEFT JOIN cv_batches b ON b.batch_id = w.batch_id
        LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE w.metrc_csv_generated_at IS NULL
          AND w.waste_status IN ('collected', 'held')
        ORDER BY w.trimmed_at DESC
        LIMIT 200`,
      )
      .all();
    return reply.send(rows);
  });

  // POST /api/metrc/csv/plants-waste
  fastify.post('/plants-waste', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreatePlantsWasteSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { events } = parse.data;
    const db = getDB();
    const warnings: string[] = [];

    // Validate location_names against cv_locations.metrc_name
    const locationNames = [
      ...new Set(
        events.map((e) => e.location_name).filter((l): l is string => !!l && l.trim() !== ''),
      ),
    ];
    if (locationNames.length > 0) {
      const placeholders = locationNames.map(() => '?').join(',');
      const found = db
        .prepare(`SELECT metrc_name FROM cv_locations WHERE metrc_name IN (${placeholders})`)
        .all(...locationNames) as { metrc_name: string }[];
      const foundSet = new Set(found.map((r) => r.metrc_name));
      const missing = locationNames.filter((l) => !foundSet.has(l));
      if (missing.length > 0) {
        return reply
          .code(400)
          .send({ error: `Unknown location_name(s) — not in cv_locations.metrc_name: ${missing.join(', ')}` });
      }
    }

    // Warn if reference tables are empty
    const methodCount = (
      db.prepare('SELECT COUNT(*) AS n FROM cv_metrc_plant_waste_methods').get() as { n: number }
    ).n;
    if (methodCount === 0) {
      warnings.push(
        'cv_metrc_plant_waste_methods is empty — waste method values are not validated against a reference list',
      );
    }
    const reasonCount = (
      db.prepare('SELECT COUNT(*) AS n FROM cv_metrc_plant_waste_reasons').get() as { n: number }
    ).n;
    if (reasonCount === 0) {
      warnings.push(
        'cv_metrc_plant_waste_reasons is empty — reason values are not validated against a reference list',
      );
    }

    // Generate CSV content
    const csvContent = generatePlantsWasteCsv(events);
    const { filePath, rowCount } = await writeCsv(csvContent, 'plants-waste');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    const insertFn = db.transaction(() => {
      // Update matching cv_plant_waste_trim_events (match on plant tag + waste date)
      for (const event of events) {
        if (!event.plant_labels || event.plant_labels.length === 0) continue;
        for (const tag of event.plant_labels) {
          db.prepare(
            `UPDATE cv_plant_waste_trim_events
             SET metrc_waste_method = COALESCE(metrc_waste_method, ?),
                 metrc_waste_reason = COALESCE(metrc_waste_reason, ?),
                 metrc_csv_generated_at = ?,
                 metrc_csv_file_path = ?
             WHERE waste_trim_id IN (
               SELECT w.waste_trim_id
               FROM cv_plant_waste_trim_events w
               JOIN cv_plant_assignments pa ON pa.assignment_id = w.plant_assignment_id
               WHERE pa.metrc_plant_tag = ?
                 AND DATE(w.trimmed_at) = ?
                 AND w.metrc_csv_generated_at IS NULL
             )`,
          ).run(event.waste_method_name, event.reason_name, now, filePath, tag, event.waste_date);
        }
      }

      const uploadResult = db
        .prepare(
          `INSERT INTO cv_metrc_csv_uploads
             (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
        )
        .run('plants-waste', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    const uploadId = insertFn();

    return reply.code(201).send({
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── Admin: waste methods ──────────────────────────────────────────────────

  fastify.get('/admin/waste-methods', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_plant_waste_methods ORDER BY name').all());
  });

  fastify.post('/admin/waste-methods', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminNameSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT method_id FROM cv_metrc_plant_waste_methods WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_plant_waste_methods (name) VALUES (?)').run(parse.data.name);
    return reply.code(201).send({ method_id: Number(r.lastInsertRowid), name: parse.data.name });
  });

  fastify.delete('/admin/waste-methods/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_plant_waste_methods WHERE method_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: plant waste reasons ────────────────────────────────────────────

  fastify.get('/admin/plant-waste-reasons', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_plant_waste_reasons ORDER BY name').all());
  });

  fastify.post('/admin/plant-waste-reasons', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminNameSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT reason_id FROM cv_metrc_plant_waste_reasons WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_plant_waste_reasons (name) VALUES (?)').run(parse.data.name);
    return reply.code(201).send({ reason_id: Number(r.lastInsertRowid), name: parse.data.name });
  });

  fastify.delete('/admin/plant-waste-reasons/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_plant_waste_reasons WHERE reason_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: batch waste reasons ────────────────────────────────────────────

  fastify.get('/admin/batch-waste-reasons', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_batch_waste_reasons ORDER BY name').all());
  });

  fastify.post('/admin/batch-waste-reasons', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminNameSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT reason_id FROM cv_metrc_batch_waste_reasons WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_batch_waste_reasons (name) VALUES (?)').run(parse.data.name);
    return reply.code(201).send({ reason_id: Number(r.lastInsertRowid), name: parse.data.name });
  });

  fastify.delete('/admin/batch-waste-reasons/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_batch_waste_reasons WHERE reason_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: package adjustment reasons ────────────────────────────────────

  fastify.get('/admin/adjustment-reasons', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_package_adjustment_reasons ORDER BY name').all());
  });

  fastify.post('/admin/adjustment-reasons', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminNameSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT reason_id FROM cv_metrc_package_adjustment_reasons WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_package_adjustment_reasons (name) VALUES (?)').run(parse.data.name);
    return reply.code(201).send({ reason_id: Number(r.lastInsertRowid), name: parse.data.name });
  });

  fastify.delete('/admin/adjustment-reasons/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_package_adjustment_reasons WHERE reason_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: units of measure ───────────────────────────────────────────────

  fastify.get('/admin/units-of-measure', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_units_of_measure ORDER BY name').all());
  });

  fastify.post('/admin/units-of-measure', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminUomSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT uom_id FROM cv_metrc_units_of_measure WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_units_of_measure (name, unit_type) VALUES (?, ?)').run(parse.data.name, parse.data.unit_type);
    return reply.code(201).send({ uom_id: Number(r.lastInsertRowid), name: parse.data.name, unit_type: parse.data.unit_type });
  });

  fastify.delete('/admin/units-of-measure/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_units_of_measure WHERE uom_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: items ──────────────────────────────────────────────────────────

  fastify.get('/admin/items', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_metrc_items ORDER BY name').all());
  });

  fastify.post('/admin/items', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminItemSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    if (db.prepare('SELECT item_id FROM cv_metrc_items WHERE name = ?').get(parse.data.name)) {
      return reply.code(400).send({ error: 'Name already exists' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_items (name, category) VALUES (?, ?)').run(parse.data.name, parse.data.category ?? null);
    return reply.code(201).send({ item_id: Number(r.lastInsertRowid), name: parse.data.name, category: parse.data.category ?? null });
  });

  fastify.delete('/admin/items/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_items WHERE item_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: sublocations ───────────────────────────────────────────────────

  fastify.get('/admin/sublocations', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    const rows = getDB().prepare(`
      SELECT s.*, l.name AS location_name
      FROM cv_metrc_sublocations s
      LEFT JOIN cv_locations l ON l.location_id = s.location_id
      ORDER BY l.name NULLS LAST, s.name
    `).all();
    return reply.send(rows);
  });

  fastify.post('/admin/sublocations', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminSublocationSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const { name, location_id, sub_zone_id } = parse.data;
    const db = getDB();
    if (location_id) {
      const loc = db.prepare('SELECT location_id FROM cv_locations WHERE location_id = ?').get(location_id);
      if (!loc) return reply.code(400).send({ error: 'location_id not found' });
    }
    if (db.prepare('SELECT sublocation_id FROM cv_metrc_sublocations WHERE name = ? AND (location_id IS ? OR location_id = ?)').get(name, location_id ?? null, location_id ?? null)) {
      return reply.code(400).send({ error: 'Sublocation with this name already exists for this location' });
    }
    const r = db.prepare('INSERT INTO cv_metrc_sublocations (name, location_id, sub_zone_id) VALUES (?, ?, ?)').run(name, location_id ?? null, sub_zone_id ?? null);
    return reply.code(201).send({ sublocation_id: Number(r.lastInsertRowid), name, location_id: location_id ?? null, sub_zone_id: sub_zone_id ?? null });
  });

  fastify.delete('/admin/sublocations/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = getDB().prepare('DELETE FROM cv_metrc_sublocations WHERE sublocation_id = ?').run(Number(id));
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // ── Admin: plant tags ─────────────────────────────────────────────────────

  fastify.get('/admin/plant-tags', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    const db = getDB();
    const counts = db.prepare(
      'SELECT status, COUNT(*) AS count FROM cv_metrc_available_plant_tags GROUP BY status'
    ).all() as { status: string; count: number }[];
    const total = counts.reduce((s, r) => s + r.count, 0);
    const byStatus: Record<string, number> = {};
    for (const r of counts) byStatus[r.status] = r.count;
    const recent = db.prepare(
      'SELECT tag, status, reserved_at, used_at FROM cv_metrc_available_plant_tags ORDER BY rowid DESC LIMIT 20'
    ).all();
    return reply.send({ counts: { ...byStatus, total }, recent });
  });

  fastify.post('/admin/plant-tags', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminTagsImportSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    const stmt = db.prepare('INSERT OR IGNORE INTO cv_metrc_available_plant_tags (tag, status) VALUES (?, \'available\')');
    let added = 0;
    const insertAll = db.transaction(() => {
      for (const tag of parse.data.tags) {
        const r = stmt.run(tag.toUpperCase());
        added += r.changes;
      }
    });
    insertAll();
    const skipped = parse.data.tags.length - added;
    const total = (db.prepare('SELECT COUNT(*) AS n FROM cv_metrc_available_plant_tags').get() as { n: number }).n;
    return reply.code(201).send({ added, skipped, total_now: total });
  });

  // ── Admin: package tags ───────────────────────────────────────────────────

  fastify.get('/admin/package-tags', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    const db = getDB();
    const counts = db.prepare(
      'SELECT status, COUNT(*) AS count FROM cv_metrc_available_package_tags GROUP BY status'
    ).all() as { status: string; count: number }[];
    const total = counts.reduce((s, r) => s + r.count, 0);
    const byStatus: Record<string, number> = {};
    for (const r of counts) byStatus[r.status] = r.count;
    const recent = db.prepare(
      'SELECT tag, status, used_at FROM cv_metrc_available_package_tags ORDER BY rowid DESC LIMIT 20'
    ).all();
    return reply.send({ counts: { ...byStatus, total }, recent });
  });

  fastify.post('/admin/package-tags', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminTagsImportSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    const stmt = db.prepare('INSERT OR IGNORE INTO cv_metrc_available_package_tags (tag, status) VALUES (?, \'available\')');
    let added = 0;
    const insertAll = db.transaction(() => {
      for (const tag of parse.data.tags) {
        const r = stmt.run(tag.toUpperCase());
        added += r.changes;
      }
    });
    insertAll();
    const skipped = parse.data.tags.length - added;
    const total = (db.prepare('SELECT COUNT(*) AS n FROM cv_metrc_available_package_tags').get() as { n: number }).n;
    return reply.code(201).send({ added, skipped, total_now: total });
  });

  // ── Admin: employees ──────────────────────────────────────────────────────

  fastify.get('/admin/employees', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    return reply.send(getDB().prepare('SELECT * FROM cv_employees ORDER BY name').all());
  });

  fastify.post('/admin/employees', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const parse = AdminEmployeeCreateSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const { license_number, name, role, user_id } = parse.data;
    const db = getDB();
    if (db.prepare('SELECT employee_id FROM cv_employees WHERE license_number = ?').get(license_number)) {
      return reply.code(400).send({ error: 'License number already exists' });
    }
    const now = new Date().toISOString();
    const r = db.prepare(
      'INSERT INTO cv_employees (license_number, name, role, user_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run(license_number, name, role ?? null, user_id ?? null, now, now);
    return reply.code(201).send({ employee_id: Number(r.lastInsertRowid), license_number, name, role: role ?? null, is_active: 1 });
  });

  fastify.patch('/admin/employees/:id', { preHandler: [requireRole('admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = AdminEmployeePatchSchema.safeParse(req.body);
    if (!parse.success) return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    const db = getDB();
    const emp = db.prepare('SELECT employee_id FROM cv_employees WHERE employee_id = ?').get(Number(id));
    if (!emp) return reply.code(404).send({ error: 'Not found' });
    const fields = parse.data;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if ('is_active' in fields) { sets.push('is_active = ?'); vals.push(fields.is_active); }
    if ('license_number' in fields) { sets.push('license_number = ?'); vals.push(fields.license_number); }
    if ('name' in fields) { sets.push('name = ?'); vals.push(fields.name); }
    if ('role' in fields) { sets.push('role = ?'); vals.push(fields.role ?? null); }
    sets.push('updated_at = ?');
    vals.push(new Date().toISOString());
    vals.push(Number(id));
    db.prepare(`UPDATE cv_employees SET ${sets.join(', ')} WHERE employee_id = ?`).run(...vals);
    return reply.send(db.prepare('SELECT * FROM cv_employees WHERE employee_id = ?').get(Number(id)));
  });
};

export default metrcCsvRoutes;
