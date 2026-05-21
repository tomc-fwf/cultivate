import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { makeBatchName } from '../../lib/domain-utils.js';
import { z } from 'zod';

const MetrcAdditivesQuerySchema = z.object({
  batch_id: z.string().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const MdaPesticideQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from required in YYYY-MM-DD format'),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to required in YYYY-MM-DD format'),
  format: z.enum(['json', 'csv']).default('json'),
});

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

async function fetchFarmstockItems(itemIds: number[]): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  if (!itemIds.length) return map;
  await Promise.all(itemIds.map(async (id) => {
    const item = await fetchFarmstockItem(id);
    if (item) map.set(id, item);
  }));
  return map;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(','),
  );
  return [header, ...body].join('\n');
}

function itemName(item: Record<string, unknown> | undefined | null, inputId: number | null): string {
  if (!item) return inputId != null ? `Input #${inputId}` : 'Unknown product';
  return String(item['name'] ?? item['item_name'] ?? (inputId != null ? `Input #${inputId}` : 'Unknown'));
}

function batchDisplayName(row: Record<string, unknown>): string {
  if (row['sow_date']) {
    return makeBatchName(
      String(row['strain_name'] ?? ''),
      String(row['sow_date']),
      String(row['strain_type'] ?? ''),
    );
  }
  return row['metrc_plant_batch_uid'] ? String(row['metrc_plant_batch_uid']) : String(row['batch_id'] ?? '—');
}

interface DateWhereResult { sql: string; params: unknown[] }

function buildDateBatchWhere(
  dateCol: string,
  batchCol: string,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  batchId: string | undefined,
): DateWhereResult {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (dateFrom) { clauses.push(`date(${dateCol}) >= date(?)`); params.push(dateFrom); }
  if (dateTo)   { clauses.push(`date(${dateCol}) <= date(?)`); params.push(dateTo); }
  if (batchId)  { clauses.push(`${batchCol} = ?`); params.push(Number(batchId)); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const exportsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /metrc-additives — METRC Record Additives unified export.
   * Aggregates all four application types. Returns JSON or CSV.
   */
  app.get('/metrc-additives', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = MetrcAdditivesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const { batch_id, date_from, date_to, format } = parsed.data;

    const db = getDB();

    // Fertigation
    const fw = buildDateBatchWhere('af.applied_at', 'af.batch_id', date_from, date_to, batch_id);
    const fertigRows = db.prepare(`
      SELECT af.application_id, af.applied_at, af.batch_id,
             af.volume_gallons, af.ec_measured, af.ph_measured, af.notes,
             b.sub_zone_id, b.metrc_plant_batch_uid, b.sow_date,
             s.name AS strain_name, s.type AS strain_type,
             fr.name AS recipe_name, fr.version AS recipe_version,
             u.name AS applicator_name
      FROM cv_applications_fertigation af
      JOIN cv_batches b ON b.batch_id = af.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      JOIN cv_fertigation_recipes fr ON fr.recipe_id = af.recipe_id
      LEFT JOIN cv_users u ON u.id = af.applicator
      ${fw.sql}
      ORDER BY af.applied_at DESC
    `).all(...fw.params) as Array<Record<string, unknown>>;

    // Foliar
    const flw = buildDateBatchWhere('af.applied_at', 'af.batch_id', date_from, date_to, batch_id);
    const foliarRows = db.prepare(`
      SELECT af.foliar_id, af.applied_at, af.batch_id,
             af.row_id, af.container_id, af.input_id,
             af.rate_value, af.rate_unit, af.volume_applied, af.volume_unit, af.purpose,
             b.sub_zone_id, b.metrc_plant_batch_uid, b.sow_date,
             s.name AS strain_name, s.type AS strain_type,
             fr.name AS recipe_name,
             u.name AS applicator_name
      FROM cv_applications_foliar af
      JOIN cv_batches b ON b.batch_id = af.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_foliar_recipes fr ON fr.foliar_recipe_id = af.foliar_recipe_id
      LEFT JOIN cv_users u ON u.id = af.applicator
      ${flw.sql}
      ORDER BY af.applied_at DESC
    `).all(...flw.params) as Array<Record<string, unknown>>;

    // Pesticide
    const pw = buildDateBatchWhere('ap.applied_at', 'ap.batch_id', date_from, date_to, batch_id);
    const pesticideRows = db.prepare(`
      SELECT ap.pesticide_app_id, ap.applied_at, ap.batch_id,
             ap.row_id, ap.container_id, ap.input_id, ap.input_lot_id,
             ap.rate_value, ap.rate_unit, ap.volume_applied, ap.volume_unit,
             ap.application_method, ap.target_pest,
             b.sub_zone_id, b.metrc_plant_batch_uid, b.sow_date,
             s.name AS strain_name, s.type AS strain_type,
             u.name AS applicator_name
      FROM cv_applications_pesticide ap
      JOIN cv_batches b ON b.batch_id = ap.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = ap.applicator
      ${pw.sql}
      ORDER BY ap.applied_at DESC
    `).all(...pw.params) as Array<Record<string, unknown>>;

    // Amendments
    const aw = buildDateBatchWhere('ca.applied_at', 'ca.batch_id', date_from, date_to, batch_id);
    const amendmentRows = db.prepare(`
      SELECT ca.amendment_id, ca.applied_at, ca.batch_id, ca.container_id,
             ca.input_id, ca.input_lot_id, ca.quantity, ca.quantity_unit,
             ca.amendment_type, ca.application_method, ca.purpose,
             b.sub_zone_id, b.metrc_plant_batch_uid, b.sow_date,
             s.name AS strain_name, s.type AS strain_type,
             u.name AS applicator_name
      FROM cv_container_amendments ca
      LEFT JOIN cv_batches b ON b.batch_id = ca.batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = ca.applicator
      ${aw.sql}
      ORDER BY ca.applied_at DESC
    `).all(...aw.params) as Array<Record<string, unknown>>;

    // Resolve farmstock item names
    const inputIds = Array.from(new Set([
      ...foliarRows.map(r => r['input_id']),
      ...pesticideRows.map(r => r['input_id']),
      ...amendmentRows.map(r => r['input_id']),
    ].filter((id): id is number => id != null)));
    const itemMap = await fetchFarmstockItems(inputIds);

    const rows: Record<string, unknown>[] = [];

    for (const r of fertigRows) {
      rows.push({
        application_type: 'fertigation',
        applied_at: r['applied_at'],
        batch_name: batchDisplayName(r),
        product_name: `${r['recipe_name']} v${r['recipe_version']}`,
        lot_number: null,
        rate: null,
        rate_unit: null,
        volume_applied: r['volume_gallons'],
        volume_unit: 'gal',
        applicator_name: r['applicator_name'] ?? null,
        location: r['sub_zone_id'] ?? null,
        notes: `EC: ${r['ec_measured']} | pH: ${r['ph_measured']}${r['notes'] ? ' | ' + r['notes'] : ''}`,
      });
    }

    for (const r of foliarRows) {
      const inputId = r['input_id'] as number | null;
      const item = inputId ? itemMap.get(inputId) : null;
      const productName = item ? itemName(item, inputId) :
        r['recipe_name'] ? `${r['recipe_name']} (recipe)` : itemName(null, inputId);
      rows.push({
        application_type: 'foliar',
        applied_at: r['applied_at'],
        batch_name: batchDisplayName(r),
        product_name: productName,
        lot_number: null,
        rate: r['rate_value'] ?? null,
        rate_unit: r['rate_unit'] ?? null,
        volume_applied: r['volume_applied'] ?? null,
        volume_unit: r['volume_unit'] ?? null,
        applicator_name: r['applicator_name'] ?? null,
        location: r['container_id'] ?? r['row_id'] ?? r['sub_zone_id'] ?? null,
        notes: r['purpose'] ?? null,
      });
    }

    for (const r of pesticideRows) {
      const inputId = r['input_id'] as number | null;
      const item = inputId ? itemMap.get(inputId) : null;
      rows.push({
        application_type: 'pesticide',
        applied_at: r['applied_at'],
        batch_name: batchDisplayName(r),
        product_name: itemName(item, inputId),
        lot_number: item ? (item['lot_number'] ?? null) : null,
        rate: r['rate_value'],
        rate_unit: r['rate_unit'],
        volume_applied: r['volume_applied'],
        volume_unit: r['volume_unit'],
        applicator_name: r['applicator_name'] ?? null,
        location: r['container_id'] ?? r['row_id'] ?? r['sub_zone_id'] ?? null,
        notes: `Target: ${r['target_pest']} | Method: ${r['application_method']}`,
      });
    }

    for (const r of amendmentRows) {
      const inputId = r['input_id'] as number | null;
      const item = inputId ? itemMap.get(inputId) : null;
      const productName = item ? itemName(item, inputId) :
        inputId ? `Input #${inputId}` : String(r['amendment_type'] ?? 'amendment');
      rows.push({
        application_type: 'amendment',
        applied_at: r['applied_at'],
        batch_name: r['batch_id'] ? batchDisplayName(r) : 'Container only (no batch)',
        product_name: productName,
        lot_number: null,
        rate: r['quantity'] ?? null,
        rate_unit: r['quantity_unit'] ?? null,
        volume_applied: null,
        volume_unit: null,
        applicator_name: r['applicator_name'] ?? null,
        location: r['container_id'] ?? r['sub_zone_id'] ?? null,
        notes: r['purpose'] ?? null,
      });
    }

    rows.sort((a, b) => String(b['applied_at']).localeCompare(String(a['applied_at'])));

    if (format === 'csv') {
      const columns = [
        'application_type', 'applied_at', 'batch_name', 'product_name',
        'lot_number', 'rate', 'rate_unit', 'volume_applied', 'volume_unit',
        'applicator_name', 'location', 'notes',
      ];
      const dateStr = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="metrc-additives-${dateStr}.csv"`);
      return reply.send(toCsv(rows, columns));
    }

    return reply.send(rows);
  });

  /**
   * GET /mda-pesticide — MDA pesticide report per MN Statute 18B.37.
   * date_from and date_to are required query parameters.
   */
  app.get('/mda-pesticide', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = MdaPesticideQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const { date_from, date_to, format } = parsed.data;

    const db = getDB();

    const rows = db.prepare(`
      SELECT ap.*,
             b.sub_zone_id, b.metrc_plant_batch_uid, b.sow_date,
             s.name AS strain_name, s.type AS strain_type,
             u.name AS applicator_name
      FROM cv_applications_pesticide ap
      JOIN cv_batches b ON b.batch_id = ap.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = ap.applicator
      WHERE date(ap.applied_at) >= date(?) AND date(ap.applied_at) <= date(?)
      ORDER BY ap.applied_at ASC
    `).all(date_from, date_to) as Array<Record<string, unknown>>;

    const inputIds = Array.from(new Set(rows.map(r => r['input_id']).filter((id): id is number => id != null)));
    const itemMap = await fetchFarmstockItems(inputIds);

    const output = rows.map(r => {
      const inputId = r['input_id'] as number | null;
      const item = inputId ? itemMap.get(inputId) : null;
      return {
        application_date: String(r['applied_at'] ?? '').slice(0, 10),
        applicator_name: r['applicator_name'] ?? null,
        applicator_license: r['applicator_license'] ?? null,
        crop: r['strain_name'] ?? null,
        site: r['container_id'] ?? r['row_id'] ?? r['sub_zone_id'] ?? null,
        product_name: itemName(item, inputId),
        epa_reg_no: item ? (item['epa_reg_no'] ?? null) : null,
        rate_value: r['rate_value'],
        rate_unit: r['rate_unit'],
        volume_applied: r['volume_applied'],
        volume_unit: r['volume_unit'],
        application_method: r['application_method'],
        target_pest: r['target_pest'],
        ambient_temp_f: r['ambient_temp_f'],
        wind_speed_mph: r['wind_speed_mph'],
        wind_direction: r['wind_direction'] ?? null,
        rei_expires_at: r['rei_expires_at'] ?? null,
        phi_compliant: r['phi_compliant'],
        batch_name: batchDisplayName(r),
      };
    });

    if (format === 'csv') {
      const columns = [
        'application_date', 'applicator_name', 'applicator_license', 'crop',
        'site', 'product_name', 'epa_reg_no', 'rate_value', 'rate_unit',
        'volume_applied', 'volume_unit', 'application_method', 'target_pest',
        'ambient_temp_f', 'wind_speed_mph', 'wind_direction',
        'rei_expires_at', 'phi_compliant', 'batch_name',
      ];
      const dateStr = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="mda-pesticide-${dateStr}.csv"`);
      return reply.send(toCsv(output, columns));
    }

    return reply.send(output);
  });

  /**
   * GET /cultivation-record/:batchId — full per-batch compliance record.
   * Per MN Statute 342.25. Returns comprehensive JSON for audit/export.
   */
  app.get<{ Params: { batchId: string } }>(
    '/cultivation-record/:batchId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const batchId = Number(request.params.batchId);
      if (isNaN(batchId)) return reply.code(400).send({ error: 'Invalid batch id' });

      const db = getDB();

      const batchRow = db.prepare(`
        SELECT b.*, s.name AS strain_name, s.type AS strain_type, s.genetics AS strain_genetics
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        WHERE b.batch_id = ?
      `).get(batchId) as Record<string, unknown> | undefined;

      if (!batchRow) return reply.code(404).send({ error: 'Batch not found' });

      const metrcBatchName = batchRow['sow_date'] ? makeBatchName(
        String(batchRow['strain_name'] ?? ''),
        String(batchRow['sow_date']),
        String(batchRow['strain_type'] ?? ''),
      ) : null;

      const phaseHistory = db.prepare(`
        SELECT ph.*, u.name AS transitioned_by_name
        FROM cv_batch_phase_history ph
        LEFT JOIN cv_users u ON u.id = ph.transitioned_by
        WHERE ph.batch_id = ?
        ORDER BY ph.transitioned_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const locationHistory = db.prepare(`
        SELECT lh.*,
               fl.name AS from_location_name,
               tl.name AS to_location_name,
               u.name AS moved_by_name
        FROM cv_batch_location_history lh
        LEFT JOIN cv_locations fl ON fl.location_id = lh.from_location_id
        LEFT JOIN cv_locations tl ON tl.location_id = lh.to_location_id
        LEFT JOIN cv_users u ON u.id = lh.moved_by
        WHERE lh.batch_id = ?
        ORDER BY lh.moved_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const recipeHistory = db.prepare(`
        SELECT bsr.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS authorized_by_name
        FROM cv_batch_stage_recipes bsr
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        LEFT JOIN cv_users u ON u.id = bsr.authorized_by
        WHERE bsr.batch_id = ?
        ORDER BY bsr.effective_from ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const fertigationApps = db.prepare(`
        SELECT af.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS applicator_name
        FROM cv_applications_fertigation af
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = af.recipe_id
        LEFT JOIN cv_users u ON u.id = af.applicator
        WHERE af.batch_id = ?
        ORDER BY af.applied_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const foliarApps = db.prepare(`
        SELECT af.*, fr.name AS recipe_name,
               u.name AS applicator_name
        FROM cv_applications_foliar af
        LEFT JOIN cv_foliar_recipes fr ON fr.foliar_recipe_id = af.foliar_recipe_id
        LEFT JOIN cv_users u ON u.id = af.applicator
        WHERE af.batch_id = ?
        ORDER BY af.applied_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const pesticideApps = db.prepare(`
        SELECT ap.*, u.name AS applicator_name, uc.name AS rei_cleared_by_name
        FROM cv_applications_pesticide ap
        LEFT JOIN cv_users u ON u.id = ap.applicator
        LEFT JOIN cv_users uc ON uc.id = ap.rei_cleared_by
        WHERE ap.batch_id = ?
        ORDER BY ap.applied_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const amendments = db.prepare(`
        SELECT ca.*, u.name AS applicator_name
        FROM cv_container_amendments ca
        LEFT JOIN cv_users u ON u.id = ca.applicator
        WHERE ca.batch_id = ?
        ORDER BY ca.applied_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const observations = db.prepare(`
        SELECT ob.*, u.name AS observer_name
        FROM cv_observations ob
        LEFT JOIN cv_users u ON u.id = ob.observer
        WHERE ob.batch_id = ?
        ORDER BY ob.observed_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const harvestBatches = db.prepare(`
        SELECT hb.*, u.name AS started_by_name, uc.name AS closed_by_name
        FROM cv_harvest_batches hb
        LEFT JOIN cv_users u ON u.id = hb.started_by
        LEFT JOIN cv_users uc ON uc.id = hb.closed_by
        WHERE hb.batch_id = ?
        ORDER BY hb.started_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const harvestEvents = db.prepare(`
        SELECT he.*, u.name AS applicator_name
        FROM cv_plant_harvest_events he
        LEFT JOIN cv_users u ON u.id = he.applicator
        WHERE he.batch_id = ?
        ORDER BY he.harvested_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const wasteTrimEvents = db.prepare(`
        SELECT wt.*, u.name AS applicator_name, ud.name AS disposed_by_name
        FROM cv_plant_waste_trim_events wt
        LEFT JOIN cv_users u ON u.id = wt.applicator
        LEFT JOIN cv_users ud ON ud.id = wt.disposed_by
        WHERE wt.batch_id = ?
        ORDER BY wt.trimmed_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const plantAssignments = db.prepare(`
        SELECT pa.*, u.name AS placed_by_name, uu.name AS unassigned_by_name
        FROM cv_plant_assignments pa
        LEFT JOIN cv_users u ON u.id = pa.placed_by
        LEFT JOIN cv_users uu ON uu.id = pa.unassigned_by
        WHERE pa.batch_id = ?
        ORDER BY pa.placed_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      const plantLosses = db.prepare(`
        SELECT pl.*, u.name AS reported_by_name
        FROM cv_plant_loss_events pl
        LEFT JOIN cv_users u ON u.id = pl.reported_by
        WHERE pl.batch_id = ?
        ORDER BY pl.occurred_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      return reply.send({
        generated_at: new Date().toISOString(),
        batch_id: batchId,
        record_version: '1.0',
        data: {
          batch: {
            ...batchRow,
            metrc_batch_name: metrcBatchName,
            phase_history: phaseHistory,
            location_history: locationHistory,
            recipe_history: recipeHistory,
          },
          applications: {
            fertigation: fertigationApps,
            foliar: foliarApps,
            pesticide: pesticideApps,
            amendments,
          },
          observations,
          harvest: {
            harvest_batches: harvestBatches,
            harvest_events: harvestEvents,
            waste_trim_events: wasteTrimEvents,
          },
          plant_assignments: plantAssignments,
          plant_losses: plantLosses,
        },
      });
    },
  );
};

export default exportsRoutes;
