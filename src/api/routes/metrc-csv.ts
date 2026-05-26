import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
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
};

export default metrcCsvRoutes;
