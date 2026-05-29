import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  writeCsv,
  generateAdditiveTemplateCsv,
  generatePlantsWasteCsv,
  generateCreatePlantingsCsv,
  generatePlantingsFromPackageCsv,
  generatePlantingsFromPlantCsv,
  generateSplitPlantingCsv,
  generateDestroyImmatureCsv,
  generateDestroyPlantsCsv,
  generateImmatureGrowthPhaseCsv,
  generateImmaturePackagesCsv,
  generateImmatureWasteCsv,
  generatePlantsGrowthPhaseCsv,
  generatePlantsLocationCsv,
  generateHarvestPlantsCsv,
  generateManicurePlantsCsv,
  generatePackagesFromHarvestCsv,
  generateImmatureAdditiveAppsCsv,
  generateLocationAdditiveAppsCsv,
  generatePlantAdditiveAppsCsv,
  generatePackageAdjustmentCsv,
  generatePackageFromVegCsv,
  generatePackagePlantingFromPlantCsv,
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
  // Product catalog fields (Phase 2 — all optional)
  category: z.enum(['Fertilizer', 'Pesticide', 'Fungicide', 'Biocontrol', 'Amendment', 'FoliarNutrient', 'Other']).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  manufacturer: z.string().max(200).optional().nullable(),
  phi_days: z.number().min(0).optional().nullable(),
  phi_days_operational: z.number().min(0).optional().nullable(),
  phi_notes: z.string().optional().nullable(),
  rei_hours: z.number().min(0).optional().nullable(),
  omri_listed: z.number().int().min(0).max(1).optional().nullable(),
  restricted_use: z.number().int().min(0).max(1).optional().nullable(),
  signal_word: z.enum(['CAUTION', 'WARNING', 'DANGER']).optional().nullable(),
  target_organisms: z.string().optional().nullable(),
  sds_url: z.string().max(500).optional().nullable(),
  label_url: z.string().max(500).optional().nullable(),
  label_file_name: z.string().max(200).optional().nullable(),
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

// Create Plantings (#2)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CreatePlantingsSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['Clone', 'Seed']),
  count: z.number().int().positive(),
  strain: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  sublocation: z.string().max(200).optional().nullable(),
  patient_license_number: z.string().max(50).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
  ingredient_batch_names: z.array(z.string().min(1)).default([]),
});

// Plantings from Package (#17)
const PlantingsFromPackageSchema = z.object({
  package_label: z.string().regex(METRC_TAG_RE, 'package_label must be 24 alphanumeric characters'),
  package_adjustment_amount: z.number().optional().nullable(),
  package_adjustment_uom: z.string().max(50).optional().nullable(),
  plant_batch_name: z.string().min(1).max(200),
  plant_batch_type: z.string().min(1).max(50),
  plant_count: z.number().int().positive(),
  strain_name: z.string().min(1).max(200),
  location_name: z.string().min(1).max(200),
  sublocation_name: z.string().max(200).optional().nullable(),
  patient_license_number: z.string().max(50).optional().nullable(),
  planted_date: z.string().regex(DATE_RE, 'planted_date must be YYYY-MM-DD'),
  unpackaged_date: z.string().regex(DATE_RE, 'unpackaged_date must be YYYY-MM-DD'),
}).refine(
  (d) => {
    const hasAmt = d.package_adjustment_amount != null;
    const hasUom = d.package_adjustment_uom != null && d.package_adjustment_uom.trim() !== '';
    return hasAmt === hasUom;
  },
  { message: 'package_adjustment_amount and package_adjustment_uom must both be present or both absent', path: ['package_adjustment_amount'] },
);

// Plantings from Plant (#18)
const PlantingsFromPlantSchema = z.object({
  plant_label: z.string().regex(METRC_TAG_RE, 'plant_label must be 24 alphanumeric characters'),
  plant_batch_name: z.string().min(1).max(200),
  plant_batch_type: z.string().min(1).max(50),
  plant_count: z.number().int().positive(),
  strain_name: z.string().min(1).max(200),
  location_name: z.string().min(1).max(200),
  sublocation_name: z.string().max(200).optional().nullable(),
  patient_license_number: z.string().max(50).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

// Split Planting (#22)
const SplitPlantingSchema = z.object({
  plant_batch_id: z.number().int().positive(),
  group_name: z.string().min(1).max(200),
  count: z.number().int().positive(),
  location_name: z.string().min(1).max(200),
  sublocation_name: z.string().max(200).optional().nullable(),
  patient_license_number: z.string().max(50).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

// Destroy Immature Plants (#3)
const DestroyImmatureSchema = z.object({
  plant_batch_id: z.number().int().positive(),
  count: z.number().int().positive(),
  waste_method_name: z.string().min(1).max(200).optional().nullable(),
  waste_material_mixed: z.string().max(200).optional().nullable(),
  waste_reason_name: z.string().min(1).max(200),
  reason_note: z.string().max(500).optional().nullable(),
  waste_weight: z.number().min(0),
  waste_uom: z.string().min(1).max(50).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

// Destroy Plants (#4)
const DestroyPlantsSchema = z.object({
  plant_tags: z
    .array(z.string().regex(METRC_TAG_RE, 'Each plant tag must be 24 alphanumeric characters'))
    .min(1)
    .max(500),
  waste_method_name: z.string().min(1).max(200),
  waste_material_mixed: z.string().max(200).optional().nullable(),
  waste_weight: z.number().min(0),
  waste_uom: z.string().min(1).max(50).optional().nullable(),
  waste_reason_name: z.string().min(1).max(200),
  reason_note: z.string().max(500).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

// Immature Plants Growth Phase (#7)
const ImmatureGrowthPhaseSchema = z.object({
  batch_id: z.number().int().positive(),
  count: z.number().int().positive().max(500),
  starting_tag: z.string().regex(METRC_TAG_RE, 'starting_tag must be 24 alphanumeric characters'),
  growth_phase: z.enum(['Vegetative', 'Flowering']),
  new_location: z.string().min(1).max(200),
  new_sublocation: z.string().max(200).optional().nullable(),
  growth_date: z.string().regex(DATE_RE, 'growth_date must be YYYY-MM-DD'),
  patient_license_number: z.string().max(50).optional().nullable(),
});

// Immature Plant Packages (#8)
const ImmaturePackagesSchema = z.object({
  plant_batch_id: z.number().int().positive(),
  item_name: z.string().min(1).max(200),
  package_tag: z.string().regex(METRC_TAG_RE, 'package_tag must be 24 alphanumeric characters'),
  patient_license_number: z.string().max(50).optional().nullable(),
  note: z.string().optional().nullable(),
  is_trade_sample: z.boolean(),
  is_donation: z.boolean(),
  count: z.number().int().positive(),
  location_name: z.string().max(200).optional().nullable(),
  sublocation_name: z.string().max(200).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

// Immature Plants Waste (#9) — batch endpoint
const ImmatureWasteEventSchema = z.object({
  plant_batch_id: z.number().int().positive(),
  waste_method_name: z.string().min(1).max(200),
  mixed_material: z.string().max(200).optional().nullable(),
  waste_weight: z.number().gt(0),
  uom_name: z.string().min(1).max(50),
  reason_name: z.string().min(1).max(200),
  note: z.string().optional().nullable(),
  waste_date: z.string().regex(DATE_RE, 'waste_date must be YYYY-MM-DD'),
});

const CreateImmatureWasteSchema = z.object({
  events: z.array(ImmatureWasteEventSchema).min(1).max(500),
});

// Plants Growth Phase (#19)
const PlantsGrowthPhaseItemSchema = z.object({
  label: z.string().regex(METRC_TAG_RE, 'label must be 24 alphanumeric characters'),
  new_tag: z.string().regex(METRC_TAG_RE, 'new_tag must be 24 alphanumeric characters'),
  growth_phase: z.enum(['Vegetative', 'Flowering']),
  new_location: z.string().min(1).max(200),
  new_sublocation: z.string().max(200).optional().nullable(),
  growth_date: z.string().regex(DATE_RE, 'growth_date must be YYYY-MM-DD'),
});

const PlantsGrowthPhaseSchema = z.object({
  plants: z.array(PlantsGrowthPhaseItemSchema).min(1).max(500),
});

// Plants Location (#20)
const PlantsLocationItemSchema = z.object({
  label: z.string().regex(METRC_TAG_RE, 'label must be 24 alphanumeric characters'),
  location: z.string().min(1).max(200),
  sublocation: z.string().max(200).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

const PlantsLocationSchema = z.object({
  plants: z.array(PlantsLocationItemSchema).min(1).max(500),
});

// Harvest Plants (#5)
const HarvestPlantEventSchema = z.object({
  plant_tag: z.string().regex(METRC_TAG_RE, 'plant_tag must be 24 alphanumeric characters'),
  weight: z.number().gt(0),
  unit_of_weight: z.string().min(1).max(50),
  drying_location: z.string().min(1).max(200),
  drying_sublocation: z.string().max(200).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
  patient_license_number: z.string().max(50).optional().nullable(),
});

const HarvestPlantsSchema = z.object({
  harvest_batch_id: z.number().int().positive(),
  plant_events: z.array(HarvestPlantEventSchema).min(1).max(500),
});

// Manicure Plants / Partial Harvest (#11)
const ManicurePlantEventSchema = z.object({
  plant_tag: z.string().regex(METRC_TAG_RE, 'plant_tag must be 24 alphanumeric characters'),
  weight: z.number().gt(0),
  unit_of_weight: z.string().min(1).max(50),
  drying_location: z.string().min(1).max(200),
  drying_sublocation: z.string().max(200).optional().nullable(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
  patient_license_number: z.string().max(50).optional().nullable(),
  plant_count: z.number().int().positive().optional().nullable(),
});

const ManicurePlantsSchema = z.object({
  harvest_batch_id: z.number().int().positive(),
  plant_events: z.array(ManicurePlantEventSchema).min(1).max(500),
});

// Packages From Harvest (#15)
const PackagesFromHarvestIngredientSchema = z.object({
  harvest_name: z.string().min(1).max(200),
  weight: z.number().gt(0),
  unit_of_weight: z.string().min(1).max(50),
});

const PackagesFromHarvestPackageSchema = z.object({
  tag: z.string().regex(METRC_TAG_RE, 'tag must be 24 alphanumeric characters'),
  location_name: z.string().max(200).optional().nullable(),
  sublocation_name: z.string().max(200).optional().nullable(),
  item_name: z.string().min(1).max(200),
  unit_of_weight: z.string().min(1).max(50),
  patient_license_number: z.string().max(50).optional().nullable(),
  note: z.string().optional().nullable(),
  production_batch_number: z.string().max(200).optional().nullable(),
  is_trade_sample: z.boolean(),
  is_donation: z.boolean(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
  ingredients: z.array(PackagesFromHarvestIngredientSchema).min(1),
});

const PackagesFromHarvestSchema = z
  .object({
    packages: z.array(PackagesFromHarvestPackageSchema).min(1),
  })
  .refine(
    (d) => d.packages.reduce((sum, p) => sum + p.ingredients.length, 0) <= 500,
    { message: 'Total ingredient row count cannot exceed 500' },
  );

// Immature Plant Additives (#6) — batch, CSV-only
const ImmatureAdditiveAppItemSchema = z.object({
  plant_batch_id: z.number().int().positive(),
  template_name: z.string().min(1).max(100),
  rate: z.string().max(100).optional().nullable(),
  volume: z.string().max(100).optional().nullable(),
  total_amount_applied: z.number().gt(0),
  total_amount_uom: z.string().min(1).max(50),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

const CreateImmatureAdditiveAppsSchema = z.object({
  applications: z.array(ImmatureAdditiveAppItemSchema).min(1).max(500),
});

// Location Additives (#10) — batch, CSV-only
const LocationAdditiveAppItemSchema = z.object({
  location_name: z.string().min(1).max(200),
  sublocation_name: z.string().max(200).optional().nullable(),
  template_name: z.string().min(1).max(100),
  rate: z.string().max(100).optional().nullable(),
  volume: z.string().max(100).optional().nullable(),
  total_amount_applied: z.number().gt(0),
  total_amount_uom: z.string().min(1).max(50),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

const CreateLocationAdditiveAppsSchema = z.object({
  applications: z.array(LocationAdditiveAppItemSchema).min(1).max(500),
});

// Plant Additives (#16) — batch, CSV-only
const PlantAdditiveAppItemSchema = z.object({
  plant_tag: z.string().regex(METRC_TAG_RE, 'plant_tag must be 24 alphanumeric characters'),
  template_name: z.string().min(1).max(100),
  rate: z.string().max(100).optional().nullable(),
  volume: z.string().max(100).optional().nullable(),
  total_amount_applied: z.number().gt(0),
  total_amount_uom: z.string().min(1).max(50),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

const CreatePlantAdditiveAppsSchema = z.object({
  applications: z.array(PlantAdditiveAppItemSchema).min(1).max(500),
});

// Package Adjustment (#12)
const PackageAdjustmentSchema = z.object({
  package_tag: z.string().regex(METRC_TAG_RE, 'package_tag must be 24 alphanumeric characters'),
  quantity: z.number().refine((n) => n !== 0, { message: 'quantity must be non-zero' }),
  unit_of_measure: z.string().min(1).max(50),
  adjustment_reason: z.string().min(1).max(200),
  reason_note: z.string().max(500).optional().nullable(),
  adjustment_date: z.string().regex(DATE_RE, 'adjustment_date must be YYYY-MM-DD'),
  employee_id: z.number().int().positive(),
});

// Package from Vegetative Plants (#13)
const PackageFromVegSchema = z.object({
  package_tag: z.string().regex(METRC_TAG_RE, 'package_tag must be 24 alphanumeric characters'),
  location_name: z.string().max(200).optional().nullable(),
  sublocation_name: z.string().max(200).optional().nullable(),
  item_name: z.string().min(1).max(200),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
  note: z.string().optional().nullable(),
  is_trade_sample: z.boolean(),
  is_donation: z.boolean(),
  expiration_date: z.string().regex(DATE_RE, 'expiration_date must be YYYY-MM-DD').optional().nullable(),
  sell_by_date: z.string().regex(DATE_RE, 'sell_by_date must be YYYY-MM-DD').optional().nullable(),
  use_by_date: z.string().regex(DATE_RE, 'use_by_date must be YYYY-MM-DD').optional().nullable(),
  plant_group_label: z.string().regex(METRC_TAG_RE, 'plant_group_label must be 24 alphanumeric characters'),
  quantity: z.number().positive().optional().nullable(),
});

// Package Planting from Plant (#14)
const PackagePlantingFromPlantSchema = z.object({
  plant_label: z.string().regex(METRC_TAG_RE, 'plant_label must be 24 alphanumeric characters'),
  package_tag: z.string().regex(METRC_TAG_RE, 'package_tag must be 24 alphanumeric characters'),
  plant_batch_type: z.enum(['Clone', 'Seed']),
  item_name: z.string().min(1).max(200),
  location_name: z.string().max(200).optional().nullable(),
  sublocation_name: z.string().max(200).optional().nullable(),
  note: z.string().optional().nullable(),
  patient_license_number: z.string().max(50).optional().nullable(),
  is_trade_sample: z.boolean(),
  is_donation: z.boolean(),
  count: z.number().int().positive(),
  actual_date: z.string().regex(DATE_RE, 'actual_date must be YYYY-MM-DD'),
});

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

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    const templateIds: number[] = [];

    db.transaction(() => {
      for (const t of templates) {
        const result = db.prepare(`
          INSERT INTO cv_metrc_additive_templates
            (name, additive_type, product_trade_name, epa_registration_number, note,
             rei_quantity, rei_time_unit, product_supplier, application_device,
             active_ingredients,
             category, unit, manufacturer, phi_days, phi_days_operational, phi_notes,
             rei_hours, omri_listed, restricted_use, signal_word, target_organisms, sds_url,
             label_url, label_file_name,
             created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          t.category ?? null,
          t.unit ?? null,
          t.manufacturer ?? null,
          t.phi_days ?? null,
          t.phi_days_operational ?? null,
          t.phi_notes ?? null,
          t.rei_hours ?? null,
          t.omri_listed ?? 0,
          t.restricted_use ?? 0,
          t.signal_word ?? null,
          t.target_organisms ?? null,
          t.sds_url ?? null,
          t.label_url ?? null,
          t.label_file_name ?? null,
          userId,
          now,
          now,
        );
        templateIds.push(Number(result.lastInsertRowid));
      }
    })();

    return reply.code(201).send({
      template_ids: templateIds,
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
      omri_listed: Number(r['omri_listed'] ?? 0),
      restricted_use: Number(r['restricted_use'] ?? 0),
    }));
    return reply.send(result);
  });

  // GET /api/metrc/csv/additive-templates/catalog — product picker endpoint for application forms
  fastify.get('/additive-templates/catalog', { preHandler: [requireAuth] }, async (_req, reply) => {
    const db = getDB();
    const rows = db
      .prepare(`
        SELECT
          template_id, name, additive_type, category, unit, manufacturer,
          epa_registration_number, phi_days, phi_days_operational, phi_notes,
          rei_hours, omri_listed, restricted_use, signal_word, active_ingredients
        FROM cv_metrc_additive_templates
        ORDER BY category NULLS LAST, name ASC
      `)
      .all() as Record<string, unknown>[];
    const result = rows.map((r) => ({
      ...r,
      active_ingredients: JSON.parse(r['active_ingredients'] as string),
      omri_listed: Number(r['omri_listed'] ?? 0),
      restricted_use: Number(r['restricted_use'] ?? 0),
    }));
    return reply.send(result);
  });

  // GET /api/metrc/csv/additive-templates/docs — fuzzy product name lookup for Label/SDS URLs
  fastify.get('/additive-templates/docs', { preHandler: [requireAuth] }, async (req, reply) => {
    const { name } = req.query as { name?: string };
    if (!name || name.trim() === '') {
      return reply.send({ label_url: null, sds_url: null });
    }
    const db = getDB();
    const row = db
      .prepare(`
        SELECT label_url, sds_url, name
        FROM cv_metrc_additive_templates
        WHERE LOWER(product_trade_name) LIKE LOWER('%' || ? || '%')
           OR LOWER(name) LIKE LOWER('%' || ? || '%')
        ORDER BY LENGTH(name) ASC
        LIMIT 1
      `)
      .get(name.trim(), name.trim()) as { label_url: string | null; sds_url: string | null } | undefined;
    return reply.send({
      label_url: row?.label_url ?? null,
      sds_url: row?.sds_url ?? null,
    });
  });

  // DELETE /api/metrc/csv/additive-templates/:id
  fastify.delete('/additive-templates/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDB();
    const template = db
      .prepare('SELECT * FROM cv_metrc_additive_templates WHERE template_id = ?')
      .get(Number(id)) as Record<string, unknown> | undefined;

    if (!template) {
      return reply.code(404).send({ error: 'Additive template not found' });
    }

    const filePath = template['metrc_csv_file_path'] as string | null;

    db.transaction(() => {
      db.prepare('DELETE FROM cv_metrc_additive_templates WHERE template_id = ?').run(Number(id));
      if (filePath) {
        db.prepare('DELETE FROM cv_metrc_csv_uploads WHERE file_path = ?').run(filePath);
      }
    })();

    // Best-effort file deletion — don't fail if file is already gone
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }

    return reply.code(200).send({ deleted: true });
  });

  // GET /api/metrc/csv/uploads — list all generated CSV uploads
  fastify.get('/uploads', { preHandler: [requireAuth] }, async (_req, reply) => {
    const db = getDB();
    const rows = db
      .prepare('SELECT * FROM cv_metrc_csv_uploads ORDER BY generated_at DESC')
      .all() as Record<string, unknown>[];
    return reply.send(rows);
  });

  // GET /api/metrc/csv/uploads/:id/download — stream CSV file to browser
  fastify.get('/uploads/:id/download', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDB();
    const upload = db
      .prepare('SELECT * FROM cv_metrc_csv_uploads WHERE upload_id = ?')
      .get(Number(id)) as Record<string, unknown> | undefined;

    if (!upload) {
      return reply.code(404).send({ error: 'Upload not found' });
    }

    const filePath = upload['file_path'] as string;
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'CSV file not found on disk. It may have been lost after a redeploy. Set METRC_CSV_OUTPUT_DIR to a persistent volume to prevent this.' });
    }

    const filename = path.basename(filePath);
    const content = await fs.promises.readFile(filePath, 'utf8');

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(content);
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

  // ── POST /api/metrc/csv/create-plantings (#2) ────────────────────────────
  fastify.post('/create-plantings', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreatePlantingsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate location exists
    const loc = db
      .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
      .get(data.location) as { location_id: number } | undefined;
    if (!loc) {
      return reply.code(400).send({ error: `Unknown location — not in cv_locations.metrc_name: ${data.location}` });
    }

    const csvContent = generateCreatePlantingsCsv(data);
    const { filePath, rowCount } = await writeCsv(csvContent, 'create-plantings');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    let batchId: number;

    const insertFn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO cv_batches
          (strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial, plant_count_current,
           status, sow_date, notes, metrc_source_type, metrc_ingredient_batch_names,
           metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at, updated_at)
        SELECT
          s.strain_id,
          NULL,
          NULL,
          ?,
          ?,
          'germ',
          ?,
          NULL,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        FROM cv_strains s
        WHERE s.name = ?
        LIMIT 1
      `).run(
        data.count,
        data.count,
        data.actual_date,
        data.ingredient_batch_names.length > 0 ? 'ingredient_batches' : 'none',
        data.ingredient_batch_names.length > 0 ? JSON.stringify(data.ingredient_batch_names) : null,
        now,
        filePath,
        userId,
        now,
        now,
        data.strain,
      );

      if (result.changes === 0) {
        throw new Error(`Strain not found: ${data.strain}`);
      }
      batchId = Number(result.lastInsertRowid);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('create-plantings', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    try {
      uploadId = insertFn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Strain not found')) {
        return reply.code(400).send({ error: msg });
      }
      throw err;
    }

    return reply.code(201).send({
      batch_id: batchId!,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings: [],
    });
  });

  // ── POST /api/metrc/csv/plantings-from-package (#17) ─────────────────────
  fastify.post('/plantings-from-package', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = PlantingsFromPackageSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate package label exists in cv_metrc_packages
    const pkg = db
      .prepare('SELECT package_id, weight_amount FROM cv_metrc_packages WHERE package_tag = ?')
      .get(data.package_label) as { package_id: number; weight_amount: number | null } | undefined;
    if (!pkg) {
      return reply.code(400).send({ error: `Package label not found in cv_metrc_packages: ${data.package_label}` });
    }

    const warnings: string[] = [];

    // Validate location exists
    const loc = db
      .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
      .get(data.location_name) as { location_id: number } | undefined;
    if (!loc) {
      warnings.push(`location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`);
    }

    const csvContent = generatePlantingsFromPackageCsv(data);
    const { filePath, rowCount } = await writeCsv(csvContent, 'plantings-from-package');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    let batchId: number;

    const insertFn = db.transaction(() => {
      // Insert new batch
      const result = db.prepare(`
        INSERT INTO cv_batches
          (strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial, plant_count_current,
           status, sow_date, notes, metrc_source_type, metrc_source_package_label,
           metrc_package_adjustment_amount, metrc_package_adjustment_uom,
           metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at, updated_at)
        SELECT
          COALESCE(
            (SELECT strain_id FROM cv_strains WHERE name = ? LIMIT 1),
            (SELECT strain_id FROM cv_strains LIMIT 1)
          ),
          NULL,
          NULL,
          ?,
          ?,
          'germ',
          ?,
          NULL,
          'package',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
      `).run(
        data.strain_name,
        data.plant_count,
        data.plant_count,
        data.planted_date,
        data.package_label,
        data.package_adjustment_amount ?? null,
        data.package_adjustment_uom ?? null,
        now,
        filePath,
        userId,
        now,
        now,
      );
      batchId = Number(result.lastInsertRowid);

      // Decrement package weight if adjustment provided
      if (data.package_adjustment_amount != null) {
        db.prepare(
          `UPDATE cv_metrc_packages
           SET weight_amount = COALESCE(weight_amount, 0) - ?
           WHERE package_tag = ?`,
        ).run(data.package_adjustment_amount, data.package_label);
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('plantings-from-package', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      batch_id: batchId!,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/plantings-from-plant (#18) ────────────────────────
  fastify.post('/plantings-from-plant', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = PlantingsFromPlantSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate plant_label is a mother plant
    const plant = db
      .prepare(
        'SELECT plant_state_id, batch_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND is_mother_plant = 1',
      )
      .get(data.plant_label) as { plant_state_id: number; batch_id: number } | undefined;
    if (!plant) {
      return reply.code(400).send({
        error: `plant_label not found or is not a mother plant in cv_metrc_plant_state: ${data.plant_label}`,
      });
    }

    const warnings: string[] = [];
    const loc = db
      .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
      .get(data.location_name) as { location_id: number } | undefined;
    if (!loc) {
      warnings.push(`location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`);
    }

    const csvContent = generatePlantingsFromPlantCsv(data);
    const { filePath, rowCount } = await writeCsv(csvContent, 'plantings-from-plant');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    let batchId: number;

    const insertFn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO cv_batches
          (strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial, plant_count_current,
           status, sow_date, notes, metrc_source_type, metrc_source_plant_label,
           metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at, updated_at)
        SELECT
          COALESCE(
            (SELECT strain_id FROM cv_strains WHERE name = ? LIMIT 1),
            (SELECT strain_id FROM cv_strains LIMIT 1)
          ),
          NULL,
          NULL,
          ?,
          ?,
          'germ',
          ?,
          NULL,
          'plant',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
      `).run(
        data.strain_name,
        data.plant_count,
        data.plant_count,
        data.actual_date,
        data.plant_label,
        now,
        filePath,
        userId,
        now,
        now,
      );
      batchId = Number(result.lastInsertRowid);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('plantings-from-plant', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      batch_id: batchId!,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/split-planting (#22) ──────────────────────────────
  fastify.post('/split-planting', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = SplitPlantingSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Fetch source batch
    const source = db
      .prepare(`
        SELECT b.batch_id, b.name, b.plant_count_current, b.metrc_plant_batch_uid, s.name AS strain_name
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE b.batch_id = ?
      `)
      .get(data.plant_batch_id) as {
        batch_id: number;
        name: string | null;
        plant_count_current: number;
        metrc_plant_batch_uid: string | null;
        strain_name: string;
      } | undefined;

    if (!source) {
      return reply.code(404).send({ error: `Plant batch not found: ${data.plant_batch_id}` });
    }
    if (data.count > source.plant_count_current) {
      return reply.code(400).send({
        error: `count (${data.count}) exceeds source batch plant_count_current (${source.plant_count_current})`,
      });
    }

    const warnings: string[] = [];
    const loc = db
      .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
      .get(data.location_name) as { location_id: number } | undefined;
    if (!loc) {
      warnings.push(`location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`);
    }

    // Use METRC batch UID as the CSV PlantBatch identifier, falling back to the batch name
    const plantBatchName = source.metrc_plant_batch_uid ?? source.name ?? String(source.batch_id);

    const csvContent = generateSplitPlantingCsv({
      plant_batch_name: plantBatchName,
      group_name: data.group_name,
      count: data.count,
      location_name: data.location_name,
      sublocation_name: data.sublocation_name,
      strain_name: source.strain_name,
      patient_license_number: data.patient_license_number,
      actual_date: data.actual_date,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'split-planting');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    let newBatchId: number;

    const insertFn = db.transaction(() => {
      // Decrement source batch count
      db.prepare(
        'UPDATE cv_batches SET plant_count_current = plant_count_current - ? WHERE batch_id = ?',
      ).run(data.count, data.plant_batch_id);

      // Insert new batch
      const result = db.prepare(`
        INSERT INTO cv_batches
          (strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial, plant_count_current,
           status, sow_date, notes, name, metrc_source_type, metrc_source_batch_name,
           metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at, updated_at)
        SELECT
          b.strain_id,
          NULL,
          NULL,
          ?,
          ?,
          'germ',
          ?,
          NULL,
          ?,
          'batch_split',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        FROM cv_batches b WHERE b.batch_id = ?
      `).run(
        data.count,
        data.count,
        data.actual_date,
        data.group_name,
        plantBatchName,
        now,
        filePath,
        userId,
        now,
        now,
        data.plant_batch_id,
      );
      newBatchId = Number(result.lastInsertRowid);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('split-planting', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      source_batch_id: data.plant_batch_id,
      new_batch_id: newBatchId!,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/destroy-immature (#3) ────────────────────────────
  fastify.post('/destroy-immature', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = DestroyImmatureSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Fetch source batch — get name for PlantBatch column
    const batch = db
      .prepare(`
        SELECT b.batch_id, b.name, b.metrc_plant_batch_uid, b.plant_count_initial, b.status
        FROM cv_batches b
        WHERE b.batch_id = ?
      `)
      .get(data.plant_batch_id) as {
        batch_id: number;
        name: string | null;
        metrc_plant_batch_uid: string | null;
        plant_count_initial: number;
        status: string;
      } | undefined;

    if (!batch) {
      return reply.code(404).send({ error: `Plant batch not found: ${data.plant_batch_id}` });
    }
    if (batch.status === 'closed') {
      return reply.code(400).send({ error: 'Cannot destroy plants from a closed batch' });
    }

    // Validate count against available plants
    const currentCount = batch.plant_count_initial;
    if (data.count > currentCount) {
      return reply.code(400).send({
        error: `count (${data.count}) exceeds available plant count (${currentCount})`,
      });
    }

    const plantBatchName = batch.metrc_plant_batch_uid ?? batch.name ?? String(batch.batch_id);

    const warnings: string[] = [];
    if (data.waste_weight === 0) {
      warnings.push(
        'waste_weight is 0 — no waste will be recorded in METRC; waste_method_name and waste_uom are omitted from CSV',
      );
    }

    const csvContent = generateDestroyImmatureCsv({
      plant_batch_name: plantBatchName,
      count: data.count,
      waste_method_name: data.waste_method_name,
      waste_material_mixed: data.waste_material_mixed,
      waste_reason_name: data.waste_reason_name,
      reason_note: data.reason_note,
      waste_weight: data.waste_weight,
      waste_uom: data.waste_uom,
      actual_date: data.actual_date,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'destroy-immature');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;
    const newCount = currentCount - data.count;

    let destructionId: number;
    let uploadId: number;

    const insertFn = db.transaction(() => {
      const destrResult = db.prepare(`
        INSERT INTO cv_metrc_immature_destruction_events
          (batch_id, count, waste_method, waste_material_mixed, waste_reason, reason_note,
           waste_weight, waste_uom, actual_date, metrc_csv_generated_at, metrc_csv_file_path,
           created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.plant_batch_id,
        data.count,
        data.waste_method_name ?? null,
        data.waste_material_mixed ?? null,
        data.waste_reason_name,
        data.reason_note ?? null,
        data.waste_weight,
        data.waste_uom ?? null,
        data.actual_date,
        now,
        filePath,
        userId,
        now,
      );
      destructionId = Number(destrResult.lastInsertRowid);

      // Close batch if count reaches zero
      if (newCount <= 0) {
        db.prepare(`
          UPDATE cv_batches
          SET status = 'closed', closed_date = ?, updated_at = ?
          WHERE batch_id = ?
        `).run(data.actual_date, now, data.plant_batch_id);
      } else {
        db.prepare(`
          UPDATE cv_batches SET updated_at = ? WHERE batch_id = ?
        `).run(now, data.plant_batch_id);
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('destroy-immature', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      destruction_id: destructionId!,
      batch_id: data.plant_batch_id,
      new_plant_count: Math.max(0, newCount),
      batch_closed: newCount <= 0,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/destroy-plants (#4) ───────────────────────────────
  fastify.post('/destroy-plants', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = DestroyPlantsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate all tags exist in cv_metrc_plant_state with status='active'
    const invalidTags: string[] = [];
    for (const tag of data.plant_tags) {
      const state = db
        .prepare(`SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`)
        .get(tag);
      if (!state) invalidTags.push(tag);
    }
    if (invalidTags.length > 0) {
      return reply.code(400).send({
        error: `Plant tags not found or not active in cv_metrc_plant_state: ${invalidTags.join(', ')}`,
        invalid_tags: invalidTags,
      });
    }

    const csvContent = generateDestroyPlantsCsv(data);
    const { filePath, rowCount } = await writeCsv(csvContent, 'destroy-plants');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;
    const warnings: string[] = [];

    const insertFn = db.transaction(() => {
      for (const tag of data.plant_tags) {
        // Mark plant as destroyed in METRC state table
        db.prepare(`
          UPDATE cv_metrc_plant_state
          SET status = 'destroyed', metrc_csv_generated_at = ?, updated_at = ?
          WHERE plant_tag = ?
        `).run(now, now, tag);

        // Unassign from cv_plant_assignments
        const assignment = db
          .prepare(`
            SELECT assignment_id, batch_id, container_id
            FROM cv_plant_assignments
            WHERE metrc_plant_tag = ? AND unassigned_at IS NULL
            LIMIT 1
          `)
          .get(tag) as { assignment_id: number; batch_id: number; container_id: string } | undefined;

        if (assignment) {
          db.prepare(`
            UPDATE cv_plant_assignments
            SET unassigned_at = ?, unassign_reason = 'destroyed'
            WHERE assignment_id = ?
          `).run(data.actual_date, assignment.assignment_id);

          // Update or insert cv_plant_loss_events with METRC fields
          const existingLoss = db
            .prepare(`SELECT loss_id FROM cv_plant_loss_events WHERE plant_assignment_id = ? LIMIT 1`)
            .get(assignment.assignment_id) as { loss_id: number } | undefined;

          if (existingLoss) {
            db.prepare(`
              UPDATE cv_plant_loss_events
              SET metrc_waste_method = ?, metrc_waste_material_mixed = ?, metrc_waste_reason = ?,
                  metrc_waste_weight = ?, metrc_waste_uom = ?, metrc_reason_note = ?,
                  metrc_csv_generated_at = ?, metrc_csv_file_path = ?,
                  metrc_sync_status = 'not_required'
              WHERE loss_id = ?
            `).run(
              data.waste_method_name,
              data.waste_material_mixed ?? null,
              data.waste_reason_name,
              data.waste_weight,
              data.waste_uom ?? null,
              data.reason_note ?? null,
              now,
              filePath,
              existingLoss.loss_id,
            );
          } else {
            db.prepare(`
              INSERT INTO cv_plant_loss_events
                (batch_id, container_id, plant_assignment_id, metrc_plant_tag,
                 occurred_at, discovered_at, loss_type, plant_disposition, plant_count,
                 metrc_waste_method, metrc_waste_material_mixed, metrc_waste_reason,
                 metrc_waste_weight, metrc_waste_uom, metrc_reason_note,
                 metrc_csv_generated_at, metrc_csv_file_path,
                 metrc_sync_status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 'removal_culled', 'disposed_waste', 1,
                      ?, ?, ?, ?, ?, ?, ?, ?, 'not_required', ?)
            `).run(
              assignment.batch_id,
              assignment.container_id,
              assignment.assignment_id,
              tag,
              data.actual_date,
              data.actual_date,
              data.waste_method_name,
              data.waste_material_mixed ?? null,
              data.waste_reason_name,
              data.waste_weight,
              data.waste_uom ?? null,
              data.reason_note ?? null,
              now,
              filePath,
              now,
            );
          }
        } else {
          warnings.push(`No active cv_plant_assignments record found for tag ${tag} — plant state updated but no loss event created`);
        }
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('destroy-plants', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    const uploadId = insertFn();

    return reply.code(201).send({
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      tags_destroyed: data.plant_tags.length,
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
      'SELECT tag, status, reserved_at, used_at FROM cv_metrc_available_plant_tags ORDER BY tag ASC'
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
      'SELECT tag, status, used_at FROM cv_metrc_available_package_tags ORDER BY tag ASC'
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

  fastify.delete('/admin/plant-tags/available', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    const db = getDB();
    const r = db.prepare("DELETE FROM cv_metrc_available_plant_tags WHERE status = 'available'").run();
    return reply.send({ deleted: r.changes });
  });

  fastify.delete('/admin/package-tags/available', { preHandler: [requireRole('admin')] }, async (_req, reply) => {
    const db = getDB();
    const r = db.prepare("DELETE FROM cv_metrc_available_package_tags WHERE status = 'available'").run();
    return reply.send({ deleted: r.changes });
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

  // ── POST /api/metrc/csv/immature-growth-phase (#7) ────────────────────────
  fastify.post('/immature-growth-phase', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = ImmatureGrowthPhaseSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Fetch source batch
    const batch = db
      .prepare(`
        SELECT b.batch_id, b.name, b.metrc_plant_batch_uid, b.plant_count_current, b.status, b.strain_id
        FROM cv_batches b
        WHERE b.batch_id = ?
      `)
      .get(data.batch_id) as {
        batch_id: number;
        name: string | null;
        metrc_plant_batch_uid: string | null;
        plant_count_current: number | null;
        status: string;
        strain_id: number;
      } | undefined;

    if (!batch) {
      return reply.code(404).send({ error: `Plant batch not found: ${data.batch_id}` });
    }
    if (batch.status === 'closed') {
      return reply.code(400).send({ error: 'Cannot graduate plants from a closed batch' });
    }

    const availableCount = batch.plant_count_current ?? 0;
    if (data.count > availableCount) {
      return reply.code(400).send({
        error: `count (${data.count}) exceeds available plant count (${availableCount})`,
      });
    }

    // Validate location exists
    const loc = db
      .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
      .get(data.new_location) as { location_id: number } | undefined;
    if (!loc) {
      return reply.code(400).send({ error: `Unknown location — not in cv_locations.metrc_name: ${data.new_location}` });
    }

    // Query tag range: starting_tag + count consecutive available tags
    const tagRows = db
      .prepare(
        `SELECT tag FROM cv_metrc_available_plant_tags
         WHERE tag >= ? AND status = 'available'
         ORDER BY tag
         LIMIT ?`,
      )
      .all(data.starting_tag, data.count) as { tag: string }[];

    if (tagRows.length < data.count) {
      return reply.code(400).send({
        error: `Not enough available plant tags starting from ${data.starting_tag}. Requested ${data.count}, found ${tagRows.length} available.`,
        available_count: tagRows.length,
        requested_count: data.count,
      });
    }

    // Verify all tags are contiguous from starting_tag (warn if not, but still proceed)
    const tags = tagRows.map((r) => r.tag);

    const plantBatchName = batch.metrc_plant_batch_uid ?? batch.name ?? String(batch.batch_id);

    const csvContent = generateImmatureGrowthPhaseCsv({
      name: plantBatchName,
      count: data.count,
      starting_tag: data.starting_tag,
      growth_phase: data.growth_phase,
      new_location: data.new_location,
      new_sublocation: data.new_sublocation,
      growth_date: data.growth_date,
      patient_license_number: data.patient_license_number,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'immature-growth-phase');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;

    const insertFn = db.transaction(() => {
      // Create a cv_metrc_plant_state row for each tag
      for (const tag of tags) {
        db.prepare(`
          INSERT INTO cv_metrc_plant_state
            (plant_tag, batch_id, strain_id, growth_phase, location_id, sublocation,
             phase_transition_date, status, metrc_csv_generated_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `).run(
          tag,
          data.batch_id,
          batch.strain_id,
          data.growth_phase,
          loc.location_id,
          data.new_sublocation ?? null,
          data.growth_date,
          now,
          now,
          now,
        );

        // Mark tag as used
        db.prepare(
          `UPDATE cv_metrc_available_plant_tags SET status = 'used', used_at = ? WHERE tag = ?`,
        ).run(now, tag);
      }

      // Decrement batch plant count
      db.prepare(
        `UPDATE cv_batches SET plant_count_current = plant_count_current - ?, updated_at = ? WHERE batch_id = ?`,
      ).run(data.count, now, data.batch_id);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('immature-growth-phase', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      batch_id: data.batch_id,
      tags_reserved: tags,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings: [],
    });
  });

  // ── POST /api/metrc/csv/immature-packages (#8) ────────────────────────────
  fastify.post('/immature-packages', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = ImmaturePackagesSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Fetch source batch
    const batch = db
      .prepare(`
        SELECT b.batch_id, b.name, b.metrc_plant_batch_uid, b.plant_count_current, b.status
        FROM cv_batches b
        WHERE b.batch_id = ?
      `)
      .get(data.plant_batch_id) as {
        batch_id: number;
        name: string | null;
        metrc_plant_batch_uid: string | null;
        plant_count_current: number | null;
        status: string;
      } | undefined;

    if (!batch) {
      return reply.code(404).send({ error: `Plant batch not found: ${data.plant_batch_id}` });
    }
    if (batch.status === 'closed') {
      return reply.code(400).send({ error: 'Cannot package plants from a closed batch' });
    }

    const availableCount = batch.plant_count_current ?? 0;
    if (data.count > availableCount) {
      return reply.code(400).send({
        error: `count (${data.count}) exceeds available plant count (${availableCount})`,
      });
    }

    // Validate package tag is available
    const pkgTag = db
      .prepare(`SELECT tag FROM cv_metrc_available_package_tags WHERE tag = ? AND status = 'available'`)
      .get(data.package_tag) as { tag: string } | undefined;
    if (!pkgTag) {
      return reply.code(400).send({
        error: `Package tag not available in cv_metrc_available_package_tags: ${data.package_tag}`,
      });
    }

    // Optionally validate location
    const warnings: string[] = [];
    if (data.location_name) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(data.location_name) as { location_id: number } | undefined;
      if (!loc) {
        warnings.push(`location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`);
      }
    }

    const plantBatchName = batch.metrc_plant_batch_uid ?? batch.name ?? String(batch.batch_id);

    const csvContent = generateImmaturePackagesCsv({
      plant_batch_name: plantBatchName,
      item_name: data.item_name,
      tag: data.package_tag,
      patient_license_number: data.patient_license_number,
      note: data.note,
      is_trade_sample: data.is_trade_sample,
      is_donation: data.is_donation,
      count: data.count,
      location_name: data.location_name,
      sublocation_name: data.sublocation_name,
      actual_date: data.actual_date,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'immature-packages');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    let packageId: number;

    const insertFn = db.transaction(() => {
      // Insert package record
      const pkgResult = db.prepare(`
        INSERT INTO cv_metrc_packages
          (package_tag, item_name, source_type, source_plant_batch_id, item_count,
           location_id, sublocation, patient_license_number, note,
           is_trade_sample, is_donation, actual_date,
           metrc_csv_generated_at, metrc_csv_file_path,
           created_by, created_at, updated_at)
        SELECT
          ?, ?, 'immature_batch', ?,  ?,
          (SELECT location_id FROM cv_locations WHERE metrc_name = ? LIMIT 1),
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?
      `).run(
        data.package_tag,
        data.item_name,
        data.plant_batch_id,
        data.count,
        data.location_name ?? null,
        data.sublocation_name ?? null,
        data.patient_license_number ?? null,
        data.note ?? null,
        data.is_trade_sample ? 1 : 0,
        data.is_donation ? 1 : 0,
        data.actual_date,
        now,
        filePath,
        userId,
        now,
        now,
      );
      packageId = Number(pkgResult.lastInsertRowid);

      // Mark package tag as used
      db.prepare(
        `UPDATE cv_metrc_available_package_tags SET status = 'used', used_at = ? WHERE tag = ?`,
      ).run(now, data.package_tag);

      // Decrement batch plant count
      db.prepare(
        `UPDATE cv_batches SET plant_count_current = plant_count_current - ?, updated_at = ? WHERE batch_id = ?`,
      ).run(data.count, now, data.plant_batch_id);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('immature-packages', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      package_id: packageId!,
      package_tag: data.package_tag,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/immature-waste (#9) ───────────────────────────────
  fastify.post('/immature-waste', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = CreateImmatureWasteSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { events } = parse.data;
    const db = getDB();

    // Resolve batch names for all batch IDs in the request
    const batchIds = [...new Set(events.map((e) => e.plant_batch_id))];
    const placeholders = batchIds.map(() => '?').join(',');
    const batchRows = db
      .prepare(
        `SELECT batch_id, name, metrc_plant_batch_uid FROM cv_batches WHERE batch_id IN (${placeholders})`,
      )
      .all(...batchIds) as { batch_id: number; name: string | null; metrc_plant_batch_uid: string | null }[];

    const batchMap = new Map<number, string>();
    for (const row of batchRows) {
      batchMap.set(row.batch_id, row.metrc_plant_batch_uid ?? row.name ?? String(row.batch_id));
    }

    // Validate all batch IDs exist
    const missingIds = batchIds.filter((id) => !batchMap.has(id));
    if (missingIds.length > 0) {
      return reply.code(400).send({ error: `Plant batch(es) not found: ${missingIds.join(', ')}` });
    }

    // Build rows for CSV
    const csvRows = events.map((e) => ({
      waste_method_name: e.waste_method_name,
      mixed_material: e.mixed_material,
      waste_weight: e.waste_weight,
      uom_name: e.uom_name,
      reason_name: e.reason_name,
      note: e.note,
      waste_date: e.waste_date,
      plant_batch_name: batchMap.get(e.plant_batch_id)!,
    }));

    const csvContent = generateImmatureWasteCsv(csvRows);
    const { filePath, rowCount } = await writeCsv(csvContent, 'immature-waste');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let uploadId: number;
    const wasteEventIds: number[] = [];

    const insertFn = db.transaction(() => {
      for (const e of events) {
        const result = db.prepare(`
          INSERT INTO cv_metrc_immature_waste_events
            (batch_id, waste_method, mixed_material, waste_weight, waste_uom,
             waste_reason, note, waste_date,
             metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          e.plant_batch_id,
          e.waste_method_name,
          e.mixed_material ?? null,
          e.waste_weight,
          e.uom_name,
          e.reason_name,
          e.note ?? null,
          e.waste_date,
          now,
          filePath,
          userId,
          now,
        );
        wasteEventIds.push(Number(result.lastInsertRowid));
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('immature-waste', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      waste_event_ids: wasteEventIds,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings: [],
    });
  });
  // ── POST /api/metrc/csv/plants-growth-phase (#19) ────────────────────────
  fastify.post('/plants-growth-phase', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = PlantsGrowthPhaseSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { plants } = parse.data;
    const db = getDB();

    // Collect all errors before rejecting — validate labels and new_tags up front
    const errors: string[] = [];

    // Validate all label values exist in cv_metrc_plant_state with status='active'
    const invalidLabels: string[] = [];
    for (const p of plants) {
      const state = db
        .prepare(`SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`)
        .get(p.label);
      if (!state) invalidLabels.push(p.label);
    }
    if (invalidLabels.length > 0) {
      errors.push(`Plant tags not found or not active in cv_metrc_plant_state: ${invalidLabels.join(', ')}`);
    }

    // Validate all new_tag values exist in cv_metrc_available_plant_tags with status='available'
    const unavailableTags: string[] = [];
    for (const p of plants) {
      const tagRow = db
        .prepare(`SELECT tag FROM cv_metrc_available_plant_tags WHERE tag = ? AND status = 'available'`)
        .get(p.new_tag);
      if (!tagRow) unavailableTags.push(p.new_tag);
    }
    if (unavailableTags.length > 0) {
      errors.push(`New tags not available in cv_metrc_available_plant_tags: ${unavailableTags.join(', ')}`);
    }

    // Validate no duplicate new_tag values in request
    const newTagsSeen = new Set<string>();
    const dupeTags: string[] = [];
    for (const p of plants) {
      if (newTagsSeen.has(p.new_tag)) dupeTags.push(p.new_tag);
      newTagsSeen.add(p.new_tag);
    }
    if (dupeTags.length > 0) {
      errors.push(`Duplicate new_tag values in request: ${[...new Set(dupeTags)].join(', ')}`);
    }

    if (errors.length > 0) {
      return reply.code(400).send({ error: errors.join(' | '), errors });
    }

    // Resolve location for each unique new_location
    const locationNames = [...new Set(plants.map((p) => p.new_location))];
    const locationMap = new Map<string, number>();
    for (const name of locationNames) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(name) as { location_id: number } | undefined;
      if (!loc) {
        return reply.code(400).send({ error: `Unknown location — not in cv_locations.metrc_name: ${name}` });
      }
      locationMap.set(name, loc.location_id);
    }

    const csvContent = generatePlantsGrowthPhaseCsv(
      plants.map((p) => ({
        label: p.label,
        new_tag: p.new_tag,
        growth_phase: p.growth_phase,
        new_location: p.new_location,
        new_sublocation: p.new_sublocation,
        growth_date: p.growth_date,
      })),
    );
    const { filePath, rowCount } = await writeCsv(csvContent, 'plants-growth-phase');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;
    const tagsConsumed: string[] = [];

    const insertFn = db.transaction(() => {
      for (const p of plants) {
        const locationId = locationMap.get(p.new_location)!;

        // Update plant state: swap tag, record transition
        db.prepare(`
          UPDATE cv_metrc_plant_state
          SET plant_tag = ?,
              previous_plant_tag = ?,
              tag_change_date = ?,
              growth_phase = ?,
              location_id = ?,
              sublocation = ?,
              phase_transition_date = ?,
              updated_at = ?
          WHERE plant_tag = ?
        `).run(
          p.new_tag,
          p.label,
          p.growth_date,
          p.growth_phase,
          locationId,
          p.new_sublocation ?? null,
          p.growth_date,
          now,
          p.label,
        );

        // Update active plant assignment to reflect new tag
        db.prepare(`
          UPDATE cv_plant_assignments
          SET metrc_plant_tag = ?
          WHERE metrc_plant_tag = ? AND unassigned_at IS NULL
        `).run(p.new_tag, p.label);

        // Mark new tag as consumed
        db.prepare(
          `UPDATE cv_metrc_available_plant_tags SET status = 'used', used_at = ? WHERE tag = ?`,
        ).run(now, p.new_tag);

        // Mark old tag as replaced
        db.prepare(
          `UPDATE cv_metrc_available_plant_tags SET status = 'replaced' WHERE tag = ?`,
        ).run(p.label);

        tagsConsumed.push(p.new_tag);
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('plants-growth-phase', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    const uploadId = insertFn();

    return reply.code(201).send({
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      tags_consumed: tagsConsumed,
      warnings: [],
    });
  });

  // ── POST /api/metrc/csv/plants-location (#20) ─────────────────────────────
  fastify.post('/plants-location', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = PlantsLocationSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { plants } = parse.data;
    const db = getDB();

    // Validate all labels exist in cv_metrc_plant_state with status='active'
    const invalidLabels: string[] = [];
    for (const p of plants) {
      const state = db
        .prepare(`SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`)
        .get(p.label);
      if (!state) invalidLabels.push(p.label);
    }
    if (invalidLabels.length > 0) {
      return reply.code(400).send({
        error: `Plant tags not found or not active in cv_metrc_plant_state: ${invalidLabels.join(', ')}`,
        invalid_labels: invalidLabels,
      });
    }

    // Resolve location IDs for all unique locations in request
    const locationNames = [...new Set(plants.map((p) => p.location))];
    const locationMap = new Map<string, number>();
    for (const name of locationNames) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(name) as { location_id: number } | undefined;
      if (!loc) {
        return reply.code(400).send({ error: `Unknown location — not in cv_locations.metrc_name: ${name}` });
      }
      locationMap.set(name, loc.location_id);
    }

    const csvContent = generatePlantsLocationCsv(
      plants.map((p) => ({
        label: p.label,
        location: p.location,
        sublocation: p.sublocation,
        actual_date: p.actual_date,
      })),
    );
    const { filePath, rowCount } = await writeCsv(csvContent, 'plants-location');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    const insertFn = db.transaction(() => {
      for (const p of plants) {
        const locationId = locationMap.get(p.location)!;

        db.prepare(`
          UPDATE cv_metrc_plant_state
          SET location_id = ?,
              sublocation = ?,
              updated_at = ?
          WHERE plant_tag = ?
        `).run(locationId, p.sublocation ?? null, now, p.label);
      }

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('plants-location', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    const uploadId = insertFn();

    return reply.code(201).send({
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings: [],
    });
  });
  // ── POST /api/metrc/csv/harvest-plants (#5) ───────────────────────────────
  fastify.post('/harvest-plants', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = HarvestPlantsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { harvest_batch_id, plant_events } = parse.data;
    const db = getDB();

    // Fetch harvest batch with strain and sow_date for harvest_name derivation
    const harvestBatch = db
      .prepare(
        `SELECT hb.harvest_batch_id, hb.harvest_name, hb.batch_id, hb.sequence_number,
                b.status AS batch_status, b.sow_date,
                s.name AS strain_name
         FROM cv_harvest_batches hb
         JOIN cv_batches b ON b.batch_id = hb.batch_id
         JOIN cv_strains s ON s.strain_id = b.strain_id
         WHERE hb.harvest_batch_id = ?`,
      )
      .get(harvest_batch_id) as {
        harvest_batch_id: number;
        harvest_name: string | null;
        batch_id: number;
        sequence_number: number;
        batch_status: string;
        sow_date: string;
        strain_name: string;
      } | undefined;

    if (!harvestBatch) {
      return reply.code(404).send({ error: `Harvest batch not found: ${harvest_batch_id}` });
    }
    if (harvestBatch.batch_status !== 'harvesting') {
      return reply.code(400).send({
        error: `Batch status must be 'harvesting' to record harvest events (current: ${harvestBatch.batch_status})`,
      });
    }

    // Validate all plant tags are active in cv_metrc_plant_state
    const invalidTags: string[] = [];
    for (const evt of plant_events) {
      const state = db
        .prepare(`SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`)
        .get(evt.plant_tag);
      if (!state) invalidTags.push(evt.plant_tag);
    }
    if (invalidTags.length > 0) {
      return reply.code(400).send({
        error: `Plant tags not found or not active in cv_metrc_plant_state: ${invalidTags.join(', ')}`,
        invalid_tags: invalidTags,
      });
    }

    // Validate drying_location names against cv_locations.metrc_name
    const locationNames = [...new Set(plant_events.map((e) => e.drying_location))];
    for (const locName of locationNames) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(locName);
      if (!loc) {
        return reply.code(400).send({
          error: `Unknown drying_location — not in cv_locations.metrc_name: ${locName}`,
        });
      }
    }

    // Always provide harvest_name — derive if not stored on the batch
    const harvestName =
      harvestBatch.harvest_name ??
      `${harvestBatch.strain_name}_${harvestBatch.sow_date}_batch${harvestBatch.sequence_number}`;

    const csvContent = generateHarvestPlantsCsv(
      plant_events.map((e) => ({
        plant_tag: e.plant_tag,
        weight: e.weight,
        unit_of_weight: e.unit_of_weight,
        drying_location: e.drying_location,
        drying_sublocation: e.drying_sublocation,
        harvest_name: harvestName,
        patient_license_number: e.patient_license_number,
        actual_date: e.actual_date,
      })),
    );
    const { filePath, rowCount } = await writeCsv(csvContent, 'harvest-plants');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;
    const warnings: string[] = [];
    const harvestedTags: string[] = [];
    let batchClosed = false;
    let uploadId: number;

    const insertFn = db.transaction(() => {
      for (const evt of plant_events) {
        // Mark plant as harvested in METRC state
        db.prepare(
          `UPDATE cv_metrc_plant_state SET status = 'harvested', metrc_csv_generated_at = ?, updated_at = ? WHERE plant_tag = ?`,
        ).run(now, now, evt.plant_tag);

        // Get the active plant assignment
        const assignment = db
          .prepare(
            `SELECT assignment_id, batch_id, container_id
             FROM cv_plant_assignments
             WHERE metrc_plant_tag = ? AND unassigned_at IS NULL
             LIMIT 1`,
          )
          .get(evt.plant_tag) as
          | { assignment_id: number; batch_id: number; container_id: string }
          | undefined;

        if (assignment) {
          // Unassign the plant
          db.prepare(
            `UPDATE cv_plant_assignments SET unassigned_at = ?, unassign_reason = 'harvested' WHERE assignment_id = ?`,
          ).run(evt.actual_date, assignment.assignment_id);

          // INSERT or UPDATE cv_plant_harvest_events for final_harvest
          const existing = db
            .prepare(
              `SELECT harvest_event_id FROM cv_plant_harvest_events
               WHERE plant_assignment_id = ? AND event_type = 'final_harvest'
               LIMIT 1`,
            )
            .get(assignment.assignment_id) as { harvest_event_id: number } | undefined;

          if (existing) {
            db.prepare(
              `UPDATE cv_plant_harvest_events
               SET wet_weight = ?, weight_unit = ?, harvested_at = ?,
                   metrc_csv_generated_at = ?, metrc_csv_file_path = ?,
                   metrc_sync_status = 'not_required', updated_at = ?
               WHERE harvest_event_id = ?`,
            ).run(
              evt.weight,
              evt.unit_of_weight,
              evt.actual_date,
              now,
              filePath,
              now,
              existing.harvest_event_id,
            );
          } else {
            db.prepare(
              `INSERT INTO cv_plant_harvest_events
                 (harvest_batch_id, batch_id, plant_assignment_id, container_id,
                  event_type, harvested_at, product_type, wet_weight, weight_unit,
                  metrc_csv_generated_at, metrc_csv_file_path,
                  metrc_sync_status, created_at, updated_at, created_by)
               VALUES (?, ?, ?, ?, 'final_harvest', ?, 'flower', ?, ?,
                       ?, ?, 'not_required', ?, ?, ?)`,
            ).run(
              harvest_batch_id,
              assignment.batch_id,
              assignment.assignment_id,
              assignment.container_id,
              evt.actual_date,
              evt.weight,
              evt.unit_of_weight,
              now,
              filePath,
              now,
              now,
              userId,
            );
          }

          harvestedTags.push(evt.plant_tag);
        } else {
          warnings.push(
            `No active plant assignment found for tag ${evt.plant_tag} — plant state updated but harvest event not created`,
          );
        }
      }

      // Auto-close the batch if all plants have been final-harvested
      const pendingCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS n
             FROM cv_plant_assignments pa
             WHERE pa.batch_id = ?
               AND pa.unassigned_at IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM cv_plant_harvest_events e
                 WHERE e.plant_assignment_id = pa.assignment_id
                   AND e.event_type = 'final_harvest'
               )`,
          )
          .get(harvestBatch.batch_id) as { n: number }
      ).n;

      if (pendingCount === 0) {
        const lastDate =
          plant_events
            .map((e) => e.actual_date)
            .sort()
            .at(-1) ?? now.substring(0, 10);
        db.prepare(
          `UPDATE cv_batches SET status = 'closed', closed_date = ?, updated_at = ? WHERE batch_id = ?`,
        ).run(lastDate, now, harvestBatch.batch_id);
        db.prepare(
          `UPDATE cv_harvest_batches SET status = 'completed', completed_at = ?, updated_at = ? WHERE harvest_batch_id = ?`,
        ).run(now, now, harvest_batch_id);
        batchClosed = true;
      }

      const uploadResult = db
        .prepare(
          `INSERT INTO cv_metrc_csv_uploads
             (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
        )
        .run('harvest-plants', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      harvest_name: harvestName,
      tags_harvested: harvestedTags.length,
      batch_closed: batchClosed,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/manicure-plants (#11) ─────────────────────────────
  fastify.post('/manicure-plants', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = ManicurePlantsSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const { harvest_batch_id, plant_events } = parse.data;
    const db = getDB();

    // Fetch harvest batch with strain info for harvest_name derivation
    const harvestBatch = db
      .prepare(
        `SELECT hb.harvest_batch_id, hb.harvest_name, hb.batch_id, hb.sequence_number,
                b.status AS batch_status, b.sow_date,
                s.name AS strain_name
         FROM cv_harvest_batches hb
         JOIN cv_batches b ON b.batch_id = hb.batch_id
         JOIN cv_strains s ON s.strain_id = b.strain_id
         WHERE hb.harvest_batch_id = ?`,
      )
      .get(harvest_batch_id) as {
        harvest_batch_id: number;
        harvest_name: string | null;
        batch_id: number;
        sequence_number: number;
        batch_status: string;
        sow_date: string;
        strain_name: string;
      } | undefined;

    if (!harvestBatch) {
      return reply.code(404).send({ error: `Harvest batch not found: ${harvest_batch_id}` });
    }
    if (harvestBatch.batch_status !== 'harvesting') {
      return reply.code(400).send({
        error: `Batch status must be 'harvesting' to record partial harvest events (current: ${harvestBatch.batch_status})`,
      });
    }

    // Validate all plant tags are active
    const invalidTags: string[] = [];
    for (const evt of plant_events) {
      const state = db
        .prepare(`SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`)
        .get(evt.plant_tag);
      if (!state) invalidTags.push(evt.plant_tag);
    }
    if (invalidTags.length > 0) {
      return reply.code(400).send({
        error: `Plant tags not found or not active in cv_metrc_plant_state: ${invalidTags.join(', ')}`,
        invalid_tags: invalidTags,
      });
    }

    // Validate drying_location names
    const locationNames = [...new Set(plant_events.map((e) => e.drying_location))];
    for (const locName of locationNames) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(locName);
      if (!loc) {
        return reply.code(400).send({
          error: `Unknown drying_location — not in cv_locations.metrc_name: ${locName}`,
        });
      }
    }

    const harvestName =
      harvestBatch.harvest_name ??
      `${harvestBatch.strain_name}_${harvestBatch.sow_date}_batch${harvestBatch.sequence_number}`;

    const csvContent = generateManicurePlantsCsv(
      plant_events.map((e) => ({
        plant_tag: e.plant_tag,
        weight: e.weight,
        unit_of_weight: e.unit_of_weight,
        drying_location: e.drying_location,
        drying_sublocation: e.drying_sublocation,
        harvest_name: harvestName,
        patient_license_number: e.patient_license_number,
        actual_date: e.actual_date,
        plant_count: e.plant_count,
      })),
    );
    const { filePath, rowCount } = await writeCsv(csvContent, 'manicure-plants');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;
    const warnings: string[] = [];
    const eventIds: number[] = [];
    let uploadId: number;

    const insertFn = db.transaction(() => {
      for (const evt of plant_events) {
        // Plant survives — cv_metrc_plant_state.status stays 'active'
        // Get active plant assignment (plant is still alive so assignment is still active)
        const assignment = db
          .prepare(
            `SELECT assignment_id, batch_id, container_id
             FROM cv_plant_assignments
             WHERE metrc_plant_tag = ? AND unassigned_at IS NULL
             LIMIT 1`,
          )
          .get(evt.plant_tag) as
          | { assignment_id: number; batch_id: number; container_id: string }
          | undefined;

        if (assignment) {
          const result = db
            .prepare(
              `INSERT INTO cv_plant_harvest_events
                 (harvest_batch_id, batch_id, plant_assignment_id, container_id,
                  event_type, harvested_at, product_type, wet_weight, weight_unit,
                  plant_count, metrc_csv_generated_at, metrc_csv_file_path,
                  metrc_sync_status, created_at, updated_at, created_by)
               VALUES (?, ?, ?, ?, 'partial_harvest', ?, 'flower', ?, ?,
                       ?, ?, ?, 'not_required', ?, ?, ?)`,
            )
            .run(
              harvest_batch_id,
              assignment.batch_id,
              assignment.assignment_id,
              assignment.container_id,
              evt.actual_date,
              evt.weight,
              evt.unit_of_weight,
              evt.plant_count ?? 1,
              now,
              filePath,
              now,
              now,
              userId,
            );
          eventIds.push(Number(result.lastInsertRowid));
        } else {
          warnings.push(
            `No active plant assignment found for tag ${evt.plant_tag} — partial harvest event not created`,
          );
        }
      }

      const uploadResult = db
        .prepare(
          `INSERT INTO cv_metrc_csv_uploads
             (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
        )
        .run('manicure-plants', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      harvest_name: harvestName,
      event_ids: eventIds,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
    });
  });

  // ── POST /api/metrc/csv/packages-from-harvest (#15) ───────────────────────
  fastify.post(
    '/packages-from-harvest',
    { preHandler: [requireRole('supervisor')] },
    async (req, reply) => {
      const parse = PackagesFromHarvestSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
      }
      const { packages } = parse.data;
      const db = getDB();

      // Validate all package tags are available before doing anything
      const unavailableTags: string[] = [];
      for (const pkg of packages) {
        const tagRow = db
          .prepare(
            `SELECT tag FROM cv_metrc_available_package_tags WHERE tag = ? AND status = 'available'`,
          )
          .get(pkg.tag);
        if (!tagRow) unavailableTags.push(pkg.tag);
      }
      if (unavailableTags.length > 0) {
        return reply.code(400).send({
          error: `Package tags not available in cv_metrc_available_package_tags: ${unavailableTags.join(', ')}`,
          unavailable_tags: unavailableTags,
        });
      }

      const warnings: string[] = [];

      // Optionally validate location names (warn only — location is optional in template)
      const locationNames = [
        ...new Set(
          packages
            .map((p) => p.location_name)
            .filter((l): l is string => !!l && l.trim() !== ''),
        ),
      ];
      for (const locName of locationNames) {
        const loc = db
          .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
          .get(locName);
        if (!loc) {
          warnings.push(
            `location_name "${locName}" not found in cv_locations.metrc_name — verify before uploading`,
          );
        }
      }

      const csvContent = generatePackagesFromHarvestCsv(
        packages.map((p) => ({
          tag: p.tag,
          location_name: p.location_name,
          sublocation_name: p.sublocation_name,
          item_name: p.item_name,
          unit_of_weight: p.unit_of_weight,
          patient_license_number: p.patient_license_number,
          note: p.note,
          production_batch_number: p.production_batch_number,
          is_trade_sample: p.is_trade_sample,
          is_donation: p.is_donation,
          actual_date: p.actual_date,
          ingredients: p.ingredients,
        })),
      );
      const { filePath, rowCount } = await writeCsv(csvContent, 'packages-from-harvest');

      const now = new Date().toISOString();
      const userId = (req as { user: { id: number } }).user.id;
      const packageIds: number[] = [];
      let uploadId: number;

      const insertFn = db.transaction(() => {
        for (const pkg of packages) {
          // Find location_id if provided
          const locationId = pkg.location_name
            ? (
                db
                  .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ? LIMIT 1')
                  .get(pkg.location_name) as { location_id: number } | undefined
              )?.location_id ?? null
            : null;

          const pkgResult = db
            .prepare(
              `INSERT INTO cv_metrc_packages
                 (package_tag, item_name, source_type, source_harvest_ingredients,
                  location_id, sublocation, patient_license_number, note,
                  production_batch_number, is_trade_sample, is_donation,
                  actual_date, metrc_csv_generated_at, metrc_csv_file_path,
                  created_by, created_at, updated_at)
               VALUES (?, ?, 'harvest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              pkg.tag,
              pkg.item_name,
              JSON.stringify(pkg.ingredients),
              locationId,
              pkg.sublocation_name ?? null,
              pkg.patient_license_number ?? null,
              pkg.note ?? null,
              pkg.production_batch_number ?? null,
              pkg.is_trade_sample ? 1 : 0,
              pkg.is_donation ? 1 : 0,
              pkg.actual_date,
              now,
              filePath,
              userId,
              now,
              now,
            );
          packageIds.push(Number(pkgResult.lastInsertRowid));

          // Mark package tag as used
          db.prepare(
            `UPDATE cv_metrc_available_package_tags SET status = 'used', used_at = ? WHERE tag = ?`,
          ).run(now, pkg.tag);

          // Update total_packaged_weight on matching harvest batches
          for (const ingredient of pkg.ingredients) {
            const updated = db
              .prepare(
                `UPDATE cv_harvest_batches
                 SET total_packaged_weight = total_packaged_weight + ?, updated_at = ?
                 WHERE harvest_name = ?`,
              )
              .run(ingredient.weight, now, ingredient.harvest_name);

            if (updated.changes === 0) {
              warnings.push(
                `harvest_name "${ingredient.harvest_name}" not found in cv_harvest_batches — total_packaged_weight not updated`,
              );
            }
          }
        }

        const uploadResult = db
          .prepare(
            `INSERT INTO cv_metrc_csv_uploads
               (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
          )
          .run('packages-from-harvest', filePath, rowCount, now, userId, now, now);

        return Number(uploadResult.lastInsertRowid);
      });

      uploadId = insertFn();

      return reply.code(201).send({
        package_ids: packageIds,
        csv_file_path: filePath,
        row_count: rowCount,
        upload_id: uploadId,
        warnings,
      });
    },
  );
  // ── POST /api/metrc/csv/additive-applications/immature-batch (#6) ──────────
  fastify.post(
    '/additive-applications/immature-batch',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const parse = CreateImmatureAdditiveAppsSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
      }
      const { applications } = parse.data;
      const db = getDB();

      // Resolve batch names and template IDs up front
      const batchIds = [...new Set(applications.map((a) => a.plant_batch_id))];
      const batchPlaceholders = batchIds.map(() => '?').join(',');
      const batchRows = db
        .prepare(
          `SELECT batch_id, name, metrc_plant_batch_uid FROM cv_batches WHERE batch_id IN (${batchPlaceholders})`,
        )
        .all(...batchIds) as { batch_id: number; name: string | null; metrc_plant_batch_uid: string | null }[];
      const batchMap = new Map<number, string>();
      for (const row of batchRows) {
        batchMap.set(row.batch_id, row.metrc_plant_batch_uid ?? row.name ?? String(row.batch_id));
      }
      const missingBatches = batchIds.filter((id) => !batchMap.has(id));
      if (missingBatches.length > 0) {
        return reply.code(400).send({ error: `Plant batch(es) not found: ${missingBatches.join(', ')}` });
      }

      const templateNames = [...new Set(applications.map((a) => a.template_name))];
      const tmplPlaceholders = templateNames.map(() => '?').join(',');
      const tmplRows = db
        .prepare(
          `SELECT template_id, name FROM cv_metrc_additive_templates WHERE name IN (${tmplPlaceholders})`,
        )
        .all(...templateNames) as { template_id: number; name: string }[];
      const templateMap = new Map<string, number>();
      for (const row of tmplRows) {
        templateMap.set(row.name, row.template_id);
      }
      const missingTemplates = templateNames.filter((n) => !templateMap.has(n));
      if (missingTemplates.length > 0) {
        return reply.code(400).send({
          error: `Additive template(s) not found in cv_metrc_additive_templates: ${missingTemplates.join(', ')}`,
        });
      }

      // Build CSV rows
      const csvRows = applications.map((a) => ({
        plant_batch_name: batchMap.get(a.plant_batch_id)!,
        template_name: a.template_name,
        rate: a.rate,
        volume: a.volume,
        total_amount_applied: a.total_amount_applied,
        total_amount_uom: a.total_amount_uom,
        actual_date: a.actual_date,
      }));

      const csvContent = generateImmatureAdditiveAppsCsv(csvRows);
      const { filePath, rowCount } = await writeCsv(csvContent, 'immature-additive-applications');

      const now = new Date().toISOString();
      const userId = (req as { user: { id: number } }).user.id;
      const applicationIds: number[] = [];
      let uploadId: number;

      const insertFn = db.transaction(() => {
        for (const a of applications) {
          const result = db
            .prepare(
              `INSERT INTO cv_metrc_additive_applications
                 (application_type, template_id, target_plant_batch_id, rate, volume,
                  total_amount_applied, total_amount_uom, actual_date,
                  metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at)
               VALUES ('immature_batch', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              templateMap.get(a.template_name)!,
              a.plant_batch_id,
              a.rate ?? null,
              a.volume ?? null,
              a.total_amount_applied,
              a.total_amount_uom,
              a.actual_date,
              now,
              filePath,
              userId,
              now,
            );
          applicationIds.push(Number(result.lastInsertRowid));
        }

        const uploadResult = db
          .prepare(
            `INSERT INTO cv_metrc_csv_uploads
               (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
          )
          .run('immature-additive-applications', filePath, rowCount, now, userId, now, now);

        return Number(uploadResult.lastInsertRowid);
      });

      uploadId = insertFn();

      return reply.code(201).send({
        application_ids: applicationIds,
        csv_file_path: filePath,
        row_count: rowCount,
        upload_id: uploadId,
        warnings: [],
        metrc_submission: { status: 'csv_only' },
      });
    },
  );

  // ── POST /api/metrc/csv/additive-applications/location (#10) ───────────────
  fastify.post(
    '/additive-applications/location',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const parse = CreateLocationAdditiveAppsSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
      }
      const { applications } = parse.data;
      const db = getDB();

      // Validate location names and resolve IDs
      const locationNames = [...new Set(applications.map((a) => a.location_name))];
      const locPlaceholders = locationNames.map(() => '?').join(',');
      const locRows = db
        .prepare(
          `SELECT location_id, metrc_name FROM cv_locations WHERE metrc_name IN (${locPlaceholders})`,
        )
        .all(...locationNames) as { location_id: number; metrc_name: string }[];
      const locationMap = new Map<string, number>();
      for (const row of locRows) {
        locationMap.set(row.metrc_name, row.location_id);
      }
      const missingLocations = locationNames.filter((n) => !locationMap.has(n));
      if (missingLocations.length > 0) {
        return reply.code(400).send({
          error: `Location(s) not found in cv_locations.metrc_name: ${missingLocations.join(', ')}`,
        });
      }

      // Validate and resolve template names
      const templateNames = [...new Set(applications.map((a) => a.template_name))];
      const tmplPlaceholders = templateNames.map(() => '?').join(',');
      const tmplRows = db
        .prepare(
          `SELECT template_id, name FROM cv_metrc_additive_templates WHERE name IN (${tmplPlaceholders})`,
        )
        .all(...templateNames) as { template_id: number; name: string }[];
      const templateMap = new Map<string, number>();
      for (const row of tmplRows) {
        templateMap.set(row.name, row.template_id);
      }
      const missingTemplates = templateNames.filter((n) => !templateMap.has(n));
      if (missingTemplates.length > 0) {
        return reply.code(400).send({
          error: `Additive template(s) not found in cv_metrc_additive_templates: ${missingTemplates.join(', ')}`,
        });
      }

      const csvRows = applications.map((a) => ({
        location_name: a.location_name,
        sublocation_name: a.sublocation_name,
        template_name: a.template_name,
        rate: a.rate,
        volume: a.volume,
        total_amount_applied: a.total_amount_applied,
        total_amount_uom: a.total_amount_uom,
        actual_date: a.actual_date,
      }));

      const csvContent = generateLocationAdditiveAppsCsv(csvRows);
      const { filePath, rowCount } = await writeCsv(csvContent, 'location-additive-applications');

      const now = new Date().toISOString();
      const userId = (req as { user: { id: number } }).user.id;
      const applicationIds: number[] = [];
      let uploadId: number;

      const insertFn = db.transaction(() => {
        for (const a of applications) {
          const result = db
            .prepare(
              `INSERT INTO cv_metrc_additive_applications
                 (application_type, template_id, target_location_id, target_sublocation,
                  rate, volume, total_amount_applied, total_amount_uom, actual_date,
                  metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at)
               VALUES ('location', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              templateMap.get(a.template_name)!,
              locationMap.get(a.location_name)!,
              a.sublocation_name ?? null,
              a.rate ?? null,
              a.volume ?? null,
              a.total_amount_applied,
              a.total_amount_uom,
              a.actual_date,
              now,
              filePath,
              userId,
              now,
            );
          applicationIds.push(Number(result.lastInsertRowid));
        }

        const uploadResult = db
          .prepare(
            `INSERT INTO cv_metrc_csv_uploads
               (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
          )
          .run('location-additive-applications', filePath, rowCount, now, userId, now, now);

        return Number(uploadResult.lastInsertRowid);
      });

      uploadId = insertFn();

      return reply.code(201).send({
        application_ids: applicationIds,
        csv_file_path: filePath,
        row_count: rowCount,
        upload_id: uploadId,
        warnings: [],
        metrc_submission: { status: 'csv_only' },
      });
    },
  );

  // ── POST /api/metrc/csv/additive-applications/plants (#16) ─────────────────
  fastify.post(
    '/additive-applications/plants',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const parse = CreatePlantAdditiveAppsSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
      }
      const { applications } = parse.data;
      const db = getDB();

      // Validate all plant tags are active in cv_metrc_plant_state
      const plantTags = [...new Set(applications.map((a) => a.plant_tag))];
      const tagPlaceholders = plantTags.map(() => '?').join(',');
      const activeTagRows = db
        .prepare(
          `SELECT plant_tag FROM cv_metrc_plant_state WHERE plant_tag IN (${tagPlaceholders}) AND status = 'active'`,
        )
        .all(...plantTags) as { plant_tag: string }[];
      const activeTagSet = new Set(activeTagRows.map((r) => r.plant_tag));
      const invalidTags = plantTags.filter((t) => !activeTagSet.has(t));
      if (invalidTags.length > 0) {
        return reply.code(400).send({
          error: `Plant tags not found or not active in cv_metrc_plant_state: ${invalidTags.join(', ')}`,
          invalid_tags: invalidTags,
        });
      }

      // Validate and resolve template names
      const templateNames = [...new Set(applications.map((a) => a.template_name))];
      const tmplPlaceholders = templateNames.map(() => '?').join(',');
      const tmplRows = db
        .prepare(
          `SELECT template_id, name FROM cv_metrc_additive_templates WHERE name IN (${tmplPlaceholders})`,
        )
        .all(...templateNames) as { template_id: number; name: string }[];
      const templateMap = new Map<string, number>();
      for (const row of tmplRows) {
        templateMap.set(row.name, row.template_id);
      }
      const missingTemplates = templateNames.filter((n) => !templateMap.has(n));
      if (missingTemplates.length > 0) {
        return reply.code(400).send({
          error: `Additive template(s) not found in cv_metrc_additive_templates: ${missingTemplates.join(', ')}`,
        });
      }

      const csvRows = applications.map((a) => ({
        plant_tag: a.plant_tag,
        template_name: a.template_name,
        rate: a.rate,
        volume: a.volume,
        total_amount_applied: a.total_amount_applied,
        total_amount_uom: a.total_amount_uom,
        actual_date: a.actual_date,
      }));

      const csvContent = generatePlantAdditiveAppsCsv(csvRows);
      const { filePath, rowCount } = await writeCsv(csvContent, 'plant-additive-applications');

      const now = new Date().toISOString();
      const userId = (req as { user: { id: number } }).user.id;
      const applicationIds: number[] = [];
      let uploadId: number;

      const insertFn = db.transaction(() => {
        for (const a of applications) {
          const result = db
            .prepare(
              `INSERT INTO cv_metrc_additive_applications
                 (application_type, template_id, target_plant_tag, rate, volume,
                  total_amount_applied, total_amount_uom, actual_date,
                  metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at)
               VALUES ('plant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              templateMap.get(a.template_name)!,
              a.plant_tag,
              a.rate ?? null,
              a.volume ?? null,
              a.total_amount_applied,
              a.total_amount_uom,
              a.actual_date,
              now,
              filePath,
              userId,
              now,
            );
          applicationIds.push(Number(result.lastInsertRowid));
        }

        const uploadResult = db
          .prepare(
            `INSERT INTO cv_metrc_csv_uploads
               (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)`,
          )
          .run('plant-additive-applications', filePath, rowCount, now, userId, now, now);

        return Number(uploadResult.lastInsertRowid);
      });

      uploadId = insertFn();

      return reply.code(201).send({
        application_ids: applicationIds,
        csv_file_path: filePath,
        row_count: rowCount,
        upload_id: uploadId,
        warnings: [],
        metrc_submission: { status: 'csv_only' },
      });
    },
  );

  // ── POST /api/metrc/csv/package-adjustment (#12) ──────────────────────────
  fastify.post('/package-adjustment', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = PackageAdjustmentSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate package_tag exists in cv_metrc_packages
    const pkg = db
      .prepare('SELECT package_id, weight_amount FROM cv_metrc_packages WHERE package_tag = ?')
      .get(data.package_tag) as { package_id: number; weight_amount: number | null } | undefined;
    if (!pkg) {
      return reply.code(400).send({ error: `Package tag not found in cv_metrc_packages: ${data.package_tag}` });
    }

    // Look up employee license_number
    const employee = db
      .prepare('SELECT employee_id, license_number FROM cv_employees WHERE employee_id = ? AND is_active = 1')
      .get(data.employee_id) as { employee_id: number; license_number: string } | undefined;
    if (!employee) {
      return reply.code(400).send({ error: `Employee not found or inactive: ${data.employee_id}` });
    }

    const csvContent = generatePackageAdjustmentCsv({
      package_tag: data.package_tag,
      quantity: data.quantity,
      unit_of_measure: data.unit_of_measure,
      adjustment_reason: data.adjustment_reason,
      reason_note: data.reason_note,
      adjustment_date: data.adjustment_date,
      employee_license_number: employee.license_number,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'package-adjustment');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let adjustmentId: number;
    let uploadId: number;

    const insertFn = db.transaction(() => {
      const adjResult = db.prepare(`
        INSERT INTO cv_metrc_package_adjustments
          (package_id, quantity_change, unit_of_measure, adjustment_reason, reason_note,
           adjustment_date, employee_id, metrc_csv_generated_at, metrc_csv_file_path,
           created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        pkg.package_id,
        data.quantity,
        data.unit_of_measure,
        data.adjustment_reason,
        data.reason_note ?? null,
        data.adjustment_date,
        data.employee_id,
        now,
        filePath,
        userId,
        now,
      );
      adjustmentId = Number(adjResult.lastInsertRowid);

      // Update weight_amount on the package
      db.prepare(
        `UPDATE cv_metrc_packages
         SET weight_amount = COALESCE(weight_amount, 0) + ?, updated_at = ?
         WHERE package_tag = ?`,
      ).run(data.quantity, now, data.package_tag);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('package-adjustment', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      adjustment_id: adjustmentId!,
      package_tag: data.package_tag,
      new_weight_amount: (pkg.weight_amount ?? 0) + data.quantity,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings: [],
      metrc_submission: { status: 'pending', note: 'POST /packages/v2/adjust (CONFIRMED for Phase 5)' },
    });
  });

  // ── POST /api/metrc/csv/package-from-veg (#13) ────────────────────────────
  fastify.post('/package-from-veg', { preHandler: [requireRole('supervisor')] }, async (req, reply) => {
    const parse = PackageFromVegSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }
    const data = parse.data;
    const db = getDB();

    // Validate package_tag is available
    const pkgTag = db
      .prepare(`SELECT tag FROM cv_metrc_available_package_tags WHERE tag = ? AND status = 'available'`)
      .get(data.package_tag) as { tag: string } | undefined;
    if (!pkgTag) {
      return reply.code(400).send({
        error: `Package tag not available in cv_metrc_available_package_tags: ${data.package_tag}`,
      });
    }

    const warnings: string[] = [];

    // Optionally validate location
    if (data.location_name) {
      const loc = db
        .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
        .get(data.location_name) as { location_id: number } | undefined;
      if (!loc) {
        warnings.push(`location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`);
      }
    }

    const csvContent = generatePackageFromVegCsv({
      package_tag: data.package_tag,
      location_name: data.location_name,
      sublocation_name: data.sublocation_name,
      item_name: data.item_name,
      actual_date: data.actual_date,
      note: data.note,
      is_trade_sample: data.is_trade_sample,
      is_donation: data.is_donation,
      expiration_date: data.expiration_date,
      sell_by_date: data.sell_by_date,
      use_by_date: data.use_by_date,
      plant_group_label: data.plant_group_label,
      quantity: data.quantity,
    });
    const { filePath, rowCount } = await writeCsv(csvContent, 'package-from-veg');

    const now = new Date().toISOString();
    const userId = (req as { user: { id: number } }).user.id;

    let packageId: number;
    let uploadId: number;

    const insertFn = db.transaction(() => {
      const locationId = data.location_name
        ? (
            db
              .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ? LIMIT 1')
              .get(data.location_name) as { location_id: number } | undefined
          )?.location_id ?? null
        : null;

      const pkgResult = db.prepare(`
        INSERT INTO cv_metrc_packages
          (package_tag, item_name, source_type, source_plant_group_label,
           item_count, location_id, sublocation, note,
           is_trade_sample, is_donation, actual_date,
           expiration_date, sell_by_date, use_by_date,
           metrc_csv_generated_at, metrc_csv_file_path,
           created_by, created_at, updated_at)
        VALUES (?, ?, 'plant_group', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.package_tag,
        data.item_name,
        data.plant_group_label,
        data.quantity != null ? Math.round(data.quantity) : null,
        locationId,
        data.sublocation_name ?? null,
        data.note ?? null,
        data.is_trade_sample ? 1 : 0,
        data.is_donation ? 1 : 0,
        data.actual_date,
        data.expiration_date ?? null,
        data.sell_by_date ?? null,
        data.use_by_date ?? null,
        now,
        filePath,
        userId,
        now,
        now,
      );
      packageId = Number(pkgResult.lastInsertRowid);

      // Mark package tag as used
      db.prepare(
        `UPDATE cv_metrc_available_package_tags SET status = 'used', used_at = ? WHERE tag = ?`,
      ).run(now, data.package_tag);

      const uploadResult = db.prepare(`
        INSERT INTO cv_metrc_csv_uploads
          (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
      `).run('package-from-veg', filePath, rowCount, now, userId, now, now);

      return Number(uploadResult.lastInsertRowid);
    });

    uploadId = insertFn();

    return reply.code(201).send({
      package_id: packageId!,
      package_tag: data.package_tag,
      csv_file_path: filePath,
      row_count: rowCount,
      upload_id: uploadId,
      warnings,
      metrc_submission: {
        status: 'api_unknown',
        note: 'Package from Vegetative Plants API endpoint not confirmed for MN. Manual upload required.',
      },
    });
  });

  // ── POST /api/metrc/csv/package-planting-from-plant (#14) ─────────────────
  fastify.post(
    '/package-planting-from-plant',
    { preHandler: [requireRole('supervisor')] },
    async (req, reply) => {
      const parse = PackagePlantingFromPlantSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'Validation failed', issues: parse.error.issues });
      }
      const data = parse.data;
      const db = getDB();

      // Validate plant_label is a mother plant in cv_metrc_plant_state
      const plant = db
        .prepare(
          `SELECT plant_state_id, batch_id, strain_id
           FROM cv_metrc_plant_state
           WHERE plant_tag = ? AND is_mother_plant = 1 AND status = 'active'`,
        )
        .get(data.plant_label) as
        | { plant_state_id: number; batch_id: number; strain_id: number }
        | undefined;
      if (!plant) {
        return reply.code(400).send({
          error: `plant_label not found, not a mother plant, or not active in cv_metrc_plant_state: ${data.plant_label}`,
        });
      }

      // Validate package_tag is available
      const pkgTag = db
        .prepare(`SELECT tag FROM cv_metrc_available_package_tags WHERE tag = ? AND status = 'available'`)
        .get(data.package_tag) as { tag: string } | undefined;
      if (!pkgTag) {
        return reply.code(400).send({
          error: `Package tag not available in cv_metrc_available_package_tags: ${data.package_tag}`,
        });
      }

      const warnings: string[] = [];

      // Optionally validate location
      if (data.location_name) {
        const loc = db
          .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
          .get(data.location_name) as { location_id: number } | undefined;
        if (!loc) {
          warnings.push(
            `location_name "${data.location_name}" not found in cv_locations.metrc_name — verify before uploading`,
          );
        }
      }

      const csvContent = generatePackagePlantingFromPlantCsv({
        plant_label: data.plant_label,
        package_tag: data.package_tag,
        plant_batch_type: data.plant_batch_type,
        item_name: data.item_name,
        location_name: data.location_name,
        sublocation_name: data.sublocation_name,
        note: data.note,
        patient_license_number: data.patient_license_number,
        is_trade_sample: data.is_trade_sample,
        is_donation: data.is_donation,
        count: data.count,
        actual_date: data.actual_date,
      });
      const { filePath, rowCount } = await writeCsv(csvContent, 'package-planting-from-plant');

      const now = new Date().toISOString();
      const userId = (req as { user: { id: number } }).user.id;

      let packageId: number;
      let batchId: number;
      let uploadId: number;

      const insertFn = db.transaction(() => {
        const locationId = data.location_name
          ? (
              db
                .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ? LIMIT 1')
                .get(data.location_name) as { location_id: number } | undefined
            )?.location_id ?? null
          : null;

        // Insert package record
        const pkgResult = db.prepare(`
          INSERT INTO cv_metrc_packages
            (package_tag, item_name, source_type, source_plant_label, plant_batch_type, item_count,
             location_id, sublocation, patient_license_number, note,
             is_trade_sample, is_donation, actual_date,
             metrc_csv_generated_at, metrc_csv_file_path,
             created_by, created_at, updated_at)
          VALUES (?, ?, 'mother_plant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.package_tag,
          data.item_name,
          data.plant_label,
          data.plant_batch_type,
          data.count,
          locationId,
          data.sublocation_name ?? null,
          data.patient_license_number ?? null,
          data.note ?? null,
          data.is_trade_sample ? 1 : 0,
          data.is_donation ? 1 : 0,
          data.actual_date,
          now,
          filePath,
          userId,
          now,
          now,
        );
        packageId = Number(pkgResult.lastInsertRowid);

        // Mark package tag as used
        db.prepare(
          `UPDATE cv_metrc_available_package_tags SET status = 'used', used_at = ? WHERE tag = ?`,
        ).run(now, data.package_tag);

        // Insert new immature batch (clones/seeds from mother plant)
        const batchResult = db.prepare(`
          INSERT INTO cv_batches
            (strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial, plant_count_current,
             status, sow_date, notes, metrc_source_type, metrc_source_plant_label,
             metrc_csv_generated_at, metrc_csv_file_path, created_by, created_at, updated_at)
          VALUES (?, NULL, NULL, ?, ?, 'germ', ?, NULL, 'plant', ?, ?, ?, ?, ?, ?)
        `).run(
          plant.strain_id,
          data.count,
          data.count,
          data.actual_date,
          data.plant_label,
          now,
          filePath,
          userId,
          now,
          now,
        );
        batchId = Number(batchResult.lastInsertRowid);

        // Mother plant stays active — no cv_metrc_plant_state update needed

        const uploadResult = db.prepare(`
          INSERT INTO cv_metrc_csv_uploads
            (upload_type, file_path, row_count, generated_at, generated_by, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'generated', ?, ?)
        `).run('package-planting-from-plant', filePath, rowCount, now, userId, now, now);

        return Number(uploadResult.lastInsertRowid);
      });

      uploadId = insertFn();

      return reply.code(201).send({
        package_id: packageId!,
        package_tag: data.package_tag,
        batch_id: batchId!,
        csv_file_path: filePath,
        row_count: rowCount,
        upload_id: uploadId,
        warnings,
        metrc_submission: {
          status: 'pending',
          note: 'POST /plantbatches/v2/packages/frommotherplant (CONFIRMED for Phase 5)',
        },
      });
    },
  );
};

export default metrcCsvRoutes;
