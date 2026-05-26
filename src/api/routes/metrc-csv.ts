import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { writeCsv, generateAdditiveTemplateCsv } from '../../lib/metrc-csv/index.js';

// ── Validation schemas ────────────────────────────────────────────────────────

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
};

export default metrcCsvRoutes;
