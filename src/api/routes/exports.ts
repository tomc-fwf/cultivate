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

const PlantInventoryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const TagVerificationQuerySchema = z.object({
  sub_zone_id: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

function panelStatus(counts: { red: number; amber: number }): 'red' | 'amber' | 'green' {
  if (counts.red > 0) return 'red';
  if (counts.amber > 0) return 'amber';
  return 'green';
}

function worstStatus(statuses: Array<'red' | 'amber' | 'green'>): 'red' | 'amber' | 'green' {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('amber')) return 'amber';
  return 'green';
}

function getCount(db: ReturnType<typeof getDB>, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return Number(row?.['cnt'] ?? 0);
}

function getSyncCounts(db: ReturnType<typeof getDB>, table: string, dateCol: string) {
  const rows = db.prepare(`
    SELECT metrc_sync_status AS status, COUNT(*) AS count, MIN(${dateCol}) AS oldest
    FROM ${table}
    GROUP BY metrc_sync_status
  `).all() as Array<Record<string, unknown>>;
  const counts: Record<string, number> = { pending: 0, synced: 0, failed: 0, not_required: 0 };
  let oldest: string | null = null;
  for (const r of rows) {
    counts[String(r['status'])] = Number(r['count']);
    if (r['status'] === 'pending' && r['oldest']) oldest = String(r['oldest']);
  }
  return { counts, oldest_pending: oldest };
}

const exportsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /compliance-dashboard — real-time compliance posture snapshot.
   * Returns an aggregated JSON object with 8 RAG-status panels.
   */
  app.get('/compliance-dashboard', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const now = new Date().toISOString();

    // Panel 1: Active REIs
    const reiItems = db.prepare(`
      SELECT ap.pesticide_app_id, ap.batch_id, b.sub_zone_id,
             ap.row_id, ap.container_id, ap.rei_expires_at, ap.applied_at,
             ap.input_id, u.name AS applicator_name
      FROM cv_applications_pesticide ap
      JOIN cv_batches b ON b.batch_id = ap.batch_id
      LEFT JOIN cv_users u ON u.id = ap.applicator
      WHERE ap.rei_expires_at > datetime('now') AND ap.rei_cleared_at IS NULL
      ORDER BY ap.rei_expires_at ASC LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    // Panel 2: PHI Watch — non-compliant pesticide apps on batches approaching harvest
    const phiItems = db.prepare(`
      SELECT ap.pesticide_app_id, ap.batch_id, ap.applied_at, ap.phi_compliant,
             ap.expected_harvest_date, ap.input_id, b.status, b.sub_zone_id,
             s.name AS strain_name
      FROM cv_applications_pesticide ap
      JOIN cv_batches b ON b.batch_id = ap.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.status IN ('flush', 'harvest_window', 'harvesting')
        AND ap.phi_compliant = 0
      ORDER BY ap.applied_at DESC LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    // Panel 3 & 4: METRC pending / failed counts
    const phaseSync    = getSyncCounts(db, 'cv_batch_phase_history', 'transitioned_at');
    const locSync      = getSyncCounts(db, 'cv_batch_location_history', 'moved_at');
    const harvestSync  = getSyncCounts(db, 'cv_plant_harvest_events', 'harvested_at');
    const wasteSync    = getSyncCounts(db, 'cv_plant_waste_trim_events', 'trimmed_at');
    const lossSync     = getSyncCounts(db, 'cv_plant_loss_events', 'occurred_at');

    const metrcPendingByType = {
      phase_history:   phaseSync.counts['pending'] ?? 0,
      location_history: locSync.counts['pending'] ?? 0,
      harvest_events:  harvestSync.counts['pending'] ?? 0,
      waste_trim:      wasteSync.counts['pending'] ?? 0,
      plant_loss:      lossSync.counts['pending'] ?? 0,
    };
    const metrcFailedByType = {
      phase_history:   phaseSync.counts['failed'] ?? 0,
      location_history: locSync.counts['failed'] ?? 0,
      harvest_events:  harvestSync.counts['failed'] ?? 0,
      waste_trim:      wasteSync.counts['failed'] ?? 0,
      plant_loss:      lossSync.counts['failed'] ?? 0,
    };
    const metrcPendingTotal = Object.values(metrcPendingByType).reduce((a, b) => a + b, 0);
    const metrcFailedTotal  = Object.values(metrcFailedByType).reduce((a, b) => a + b, 0);

    // Panel 5: Untagged plants (placed but not yet METRC-tagged)
    const untaggedItems = db.prepare(`
      SELECT pa.assignment_id, pa.container_id, pa.batch_id, b.sub_zone_id
      FROM cv_plant_assignments pa
      JOIN cv_batches b ON b.batch_id = pa.batch_id
      WHERE pa.unassigned_at IS NULL
        AND (pa.metrc_plant_tag IS NULL OR pa.metrc_plant_tag = '')
      LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    // Panel 6: Batches without METRC UID
    const noUidItems = db.prepare(`
      SELECT b.batch_id, b.sub_zone_id, b.status, b.sow_date, s.name AS strain_name
      FROM cv_batches b
      JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.status NOT IN ('closed')
        AND (b.metrc_plant_batch_uid IS NULL OR b.metrc_plant_batch_uid = '')
    `).all() as Array<Record<string, unknown>>;

    // Panel 7: Plant losses unsynced
    const lossUnsyncedCount = metrcPendingByType.plant_loss;

    // Panel 8: Waste pending disposal
    const wasteDisposalCount = getCount(
      db,
      `SELECT COUNT(*) AS cnt FROM cv_plant_waste_trim_events WHERE waste_status IN ('collected', 'held')`,
    );

    // Compute per-panel status
    const reiStatus      = reiItems.length > 0 ? 'red' : 'green';
    const phiHarvesting  = phiItems.filter(i => i['status'] === 'harvesting').length;
    const phiStatus      = phiHarvesting > 0 ? 'red' : phiItems.length > 0 ? 'amber' : 'green';
    const pendingStatus  = metrcPendingTotal > 0 ? 'amber' : 'green';
    const failedStatus   = metrcFailedTotal > 0 ? 'red' : 'green';
    const untaggedStatus = untaggedItems.length > 0 ? 'amber' : 'green';
    const noUidStatus    = noUidItems.length > 0 ? 'amber' : 'green';
    const lossStatus     = lossUnsyncedCount > 0 ? 'amber' : 'green';
    const wasteStatus    = wasteDisposalCount > 0 ? 'amber' : 'green';

    const overallStatus = worstStatus([
      reiStatus as 'red' | 'amber' | 'green',
      phiStatus as 'red' | 'amber' | 'green',
      pendingStatus, failedStatus, untaggedStatus, noUidStatus, lossStatus, wasteStatus,
    ]);

    return reply.send({
      status: overallStatus,
      generated_at: now,
      panels: {
        active_reis:            { status: reiStatus,      count: reiItems.length,        items: reiItems },
        phi_watch:              { status: phiStatus,      count: phiItems.length,        items: phiItems },
        metrc_pending:          { status: pendingStatus,  count: metrcPendingTotal,       by_type: metrcPendingByType },
        metrc_failed:           { status: failedStatus,   count: metrcFailedTotal,        by_type: metrcFailedByType },
        untagged_plants:        { status: untaggedStatus, count: untaggedItems.length,    items: untaggedItems },
        batches_no_metrc_uid:   { status: noUidStatus,    count: noUidItems.length,       items: noUidItems },
        plant_losses_unsynced:  { status: lossStatus,     count: lossUnsyncedCount },
        waste_pending_disposal: { status: wasteStatus,    count: wasteDisposalCount },
      },
    });
  });

  /**
   * GET /plant-inventory — current plant inventory for inspector handoff.
   * All non-closed batches with counts, stage, REI, and METRC UID status.
   */
  app.get('/plant-inventory', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = PlantInventoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const db = getDB();

    const batches = db.prepare(`
      SELECT b.batch_id, b.metrc_plant_batch_uid, b.status, b.sow_date,
             b.transplant_date, b.field_move_date, b.plant_count_initial,
             b.plants_per_container, b.sub_zone_id, b.notes,
             s.name AS strain_name, s.type AS strain_type,
             u.name AS supervisor_name,
             (SELECT COUNT(*) FROM cv_plant_assignments pa
              WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL) AS plant_count_current,
             (SELECT COUNT(*) FROM cv_plant_assignments pa
              WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL
                AND pa.metrc_plant_tag IS NOT NULL AND pa.metrc_plant_tag != '') AS tagged_count,
             (SELECT MAX(t) FROM (
               SELECT applied_at AS t FROM cv_applications_fertigation WHERE batch_id = b.batch_id
               UNION ALL SELECT applied_at FROM cv_applications_foliar WHERE batch_id = b.batch_id
               UNION ALL SELECT applied_at FROM cv_applications_pesticide WHERE batch_id = b.batch_id
               UNION ALL SELECT applied_at FROM cv_container_amendments WHERE batch_id = b.batch_id
             )) AS last_application_at,
             (SELECT COUNT(*) FROM cv_applications_pesticide ap
              WHERE ap.batch_id = b.batch_id
                AND ap.rei_expires_at > datetime('now')
                AND ap.rei_cleared_at IS NULL) AS active_rei_count,
             (SELECT transitioned_at FROM cv_batch_phase_history
              WHERE batch_id = b.batch_id ORDER BY transitioned_at DESC LIMIT 1) AS stage_since,
             (SELECT fr.name FROM cv_batch_stage_recipes bsr
              JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
              WHERE bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
              ORDER BY bsr.effective_from DESC LIMIT 1) AS current_recipe
      FROM cv_batches b
      JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = b.supervisor
      WHERE b.status NOT IN ('closed')
      ORDER BY b.created_at DESC
    `).all() as Array<Record<string, unknown>>;

    const nowMs = Date.now();
    const result: Array<Record<string, unknown>> = batches.map(b => {
      const stageSince = b['stage_since'] as string | null;
      return {
        ...b,
        metrc_name: b['sow_date'] ? makeBatchName(String(b['strain_name'] ?? ''), String(b['sow_date']), String(b['strain_type'] ?? '')) : null,
        days_in_stage: stageSince ? Math.floor((nowMs - new Date(stageSince).getTime()) / 86400000) : null,
        has_active_rei: Number(b['active_rei_count']) > 0,
        metrc_uid_status: (b['metrc_plant_batch_uid'] as string | null) ? 'set' : 'missing',
      };
    });

    const totalPlants = result.reduce((sum, b) => sum + Number(b['plant_count_current'] ?? 0), 0);
    const totalTagged = result.reduce((sum, b) => sum + Number(b['tagged_count'] ?? 0), 0);

    return reply.send({
      generated_at: new Date().toISOString(),
      total_active_batches: result.length,
      total_active_plants: totalPlants,
      total_tagged_plants: totalTagged,
      batches: result,
    });
  });

  /**
   * GET /tag-verification — active plant-to-container tag mapping for walkthrough.
   * Optional ?sub_zone_id filter. Supports ?format=csv for printable verification sheet.
   */
  app.get('/tag-verification', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = TagVerificationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: parsed.error.issues });
    }
    const { sub_zone_id, format } = parsed.data;

    const db = getDB();

    const whereClause = sub_zone_id
      ? 'WHERE pa.unassigned_at IS NULL AND r.sub_zone_id = ?'
      : 'WHERE pa.unassigned_at IS NULL';
    const params = sub_zone_id ? [sub_zone_id] : [];

    const rows = db.prepare(`
      SELECT pa.assignment_id, pa.container_id, pa.batch_id,
             pa.metrc_plant_tag, pa.placed_at, pa.tagged_at,
             c.row_id, r.sub_zone_id, c.position,
             b.metrc_plant_batch_uid,
             s.name AS strain_name
      FROM cv_plant_assignments pa
      JOIN cv_containers c ON c.container_id = pa.container_id
      JOIN cv_rows r ON r.row_id = c.row_id
      JOIN cv_batches b ON b.batch_id = pa.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      ${whereClause}
      ORDER BY r.sub_zone_id, c.row_id, c.position
    `).all(...params) as Array<Record<string, unknown>>;

    const output = rows.map(r => ({
      container_id:      r['container_id'],
      sub_zone_id:       r['sub_zone_id'],
      row_id:            r['row_id'],
      position:          r['position'],
      metrc_plant_tag:   r['metrc_plant_tag'] ?? null,
      last_4:            r['metrc_plant_tag'] ? String(r['metrc_plant_tag']).slice(-4) : null,
      tagged:            !!r['metrc_plant_tag'] && r['metrc_plant_tag'] !== '',
      batch_id:          r['batch_id'],
      strain_name:       r['strain_name'],
      placed_at:         r['placed_at'],
      tagged_at:         r['tagged_at'] ?? null,
    }));

    if (format === 'csv') {
      const columns = [
        'container_id', 'sub_zone_id', 'row_id', 'position',
        'metrc_plant_tag', 'last_4', 'tagged', 'strain_name',
        'placed_at', 'tagged_at',
      ];
      const dateStr = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="tag-verification-${dateStr}.csv"`);
      return reply.send(toCsv(output, columns));
    }

    return reply.send({
      generated_at: new Date().toISOString(),
      filter_sub_zone: sub_zone_id ?? null,
      total_assigned: output.length,
      total_tagged: output.filter(r => r.tagged).length,
      total_untagged: output.filter(r => !r.tagged).length,
      assignments: output,
    });
  });

  /**
   * GET /metrc-reconciliation — METRC sync status across all trackable event types.
   * Shows pending/failed/synced counts with oldest pending date.
   */
  app.get('/metrc-reconciliation', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();

    const phase    = getSyncCounts(db, 'cv_batch_phase_history', 'transitioned_at');
    const location = getSyncCounts(db, 'cv_batch_location_history', 'moved_at');
    const harvest  = getSyncCounts(db, 'cv_plant_harvest_events', 'harvested_at');
    const waste    = getSyncCounts(db, 'cv_plant_waste_trim_events', 'trimmed_at');
    const loss     = getSyncCounts(db, 'cv_plant_loss_events', 'occurred_at');

    const batchesNoUid = getCount(
      db,
      `SELECT COUNT(*) AS cnt FROM cv_batches WHERE status NOT IN ('closed') AND (metrc_plant_batch_uid IS NULL OR metrc_plant_batch_uid = '')`,
    );

    const totalPending = (phase.counts['pending'] ?? 0) + (location.counts['pending'] ?? 0)
      + (harvest.counts['pending'] ?? 0) + (waste.counts['pending'] ?? 0) + (loss.counts['pending'] ?? 0);
    const totalFailed  = (phase.counts['failed'] ?? 0) + (location.counts['failed'] ?? 0)
      + (harvest.counts['failed'] ?? 0) + (waste.counts['failed'] ?? 0) + (loss.counts['failed'] ?? 0);

    const oldestCandidates = [
      phase.oldest_pending, location.oldest_pending, harvest.oldest_pending,
      waste.oldest_pending, loss.oldest_pending,
    ].filter((d): d is string => d != null);
    const oldestPending = oldestCandidates.length ? oldestCandidates.sort()[0] : null;

    // Pending items detail for each type
    const phasePending    = db.prepare(`SELECT phase_history_id AS id, batch_id, to_status, transitioned_at FROM cv_batch_phase_history WHERE metrc_sync_status = 'pending' ORDER BY transitioned_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const phaseFailedRows = db.prepare(`SELECT phase_history_id AS id, batch_id, to_status, transitioned_at FROM cv_batch_phase_history WHERE metrc_sync_status = 'failed' ORDER BY transitioned_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const locPending      = db.prepare(`SELECT move_id AS id, batch_id, to_location_id, moved_at FROM cv_batch_location_history WHERE metrc_sync_status = 'pending' ORDER BY moved_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const locFailed       = db.prepare(`SELECT move_id AS id, batch_id, to_location_id, moved_at FROM cv_batch_location_history WHERE metrc_sync_status = 'failed' ORDER BY moved_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const harvestPending  = db.prepare(`SELECT harvest_event_id AS id, batch_id, event_type, harvested_at, wet_weight, weight_unit FROM cv_plant_harvest_events WHERE metrc_sync_status = 'pending' ORDER BY harvested_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const harvestFailed   = db.prepare(`SELECT harvest_event_id AS id, batch_id, event_type, harvested_at FROM cv_plant_harvest_events WHERE metrc_sync_status = 'failed' ORDER BY harvested_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const wastePending    = db.prepare(`SELECT waste_trim_id AS id, batch_id, trim_reason, trimmed_at, wet_weight, waste_status FROM cv_plant_waste_trim_events WHERE metrc_sync_status = 'pending' ORDER BY trimmed_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const wasteFailed     = db.prepare(`SELECT waste_trim_id AS id, batch_id, trim_reason, trimmed_at FROM cv_plant_waste_trim_events WHERE metrc_sync_status = 'failed' ORDER BY trimmed_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const lossPending     = db.prepare(`SELECT loss_id AS id, batch_id, loss_type, occurred_at, plant_count FROM cv_plant_loss_events WHERE metrc_sync_status = 'pending' ORDER BY occurred_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;
    const lossFailed      = db.prepare(`SELECT loss_id AS id, batch_id, loss_type, occurred_at FROM cv_plant_loss_events WHERE metrc_sync_status = 'failed' ORDER BY occurred_at ASC LIMIT 50`).all() as Array<Record<string, unknown>>;

    return reply.send({
      generated_at: new Date().toISOString(),
      summary: {
        total_pending:            totalPending,
        total_failed:             totalFailed,
        oldest_pending_record:    oldestPending,
        batches_missing_metrc_uid: batchesNoUid,
      },
      by_type: {
        plant_batches: {
          missing_uid: batchesNoUid,
          note: 'METRC batch UID must be entered manually (Phase 4 will automate)',
        },
        phase_history: {
          counts:  phase.counts,
          pending: phasePending,
          failed:  phaseFailedRows,
        },
        location_history: {
          counts:  location.counts,
          pending: locPending,
          failed:  locFailed,
        },
        harvest_events: {
          counts:  harvest.counts,
          pending: harvestPending,
          failed:  harvestFailed,
        },
        waste_trim: {
          counts:  waste.counts,
          pending: wastePending,
          failed:  wasteFailed,
        },
        plant_loss: {
          counts:  loss.counts,
          pending: lossPending,
          failed:  lossFailed,
        },
        additive_applications: {
          note: 'Per-record metrc_sync_status not yet tracked for additive tables (planned for migration 016). All additive applications require manual METRC entry.',
        },
      },
    });
  });

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

    // Load fertigation recipe ingredients for all recipes used in fertigRows
    const recipeIds = Array.from(new Set(fertigRows.map(r => r['recipe_id'] as number).filter(Boolean)));
    type RecipeIngredient = { recipe_id: number; input_id: number; rate_value: number; rate_unit: string };
    const recipeIngredients: RecipeIngredient[] = recipeIds.length > 0
      ? (db.prepare(`
          SELECT recipe_id, input_id, rate_value, rate_unit
          FROM cv_fertigation_recipe_ingredients
          WHERE recipe_id IN (${recipeIds.map(() => '?').join(',')})
          ORDER BY recipe_id, order_index
        `).all(...recipeIds) as RecipeIngredient[])
      : [];
    const ingredientsByRecipe = new Map<number, RecipeIngredient[]>();
    for (const ing of recipeIngredients) {
      const arr = ingredientsByRecipe.get(ing.recipe_id) ?? [];
      arr.push(ing);
      ingredientsByRecipe.set(ing.recipe_id, arr);
    }

    // Resolve farmstock item names — include fertigation ingredients
    const inputIds = Array.from(new Set([
      ...recipeIngredients.map(i => i.input_id),
      ...foliarRows.map(r => r['input_id']),
      ...pesticideRows.map(r => r['input_id']),
      ...amendmentRows.map(r => r['input_id']),
    ].filter((id): id is number => id != null)));
    const itemMap = await fetchFarmstockItems(inputIds);

    const rows: Record<string, unknown>[] = [];

    for (const r of fertigRows) {
      const recipeId = r['recipe_id'] as number | undefined;
      const ings = recipeId ? (ingredientsByRecipe.get(recipeId) ?? []) : [];
      const volGal = Number(r['volume_gallons'] ?? 0);
      const baseNotes = `EC: ${r['ec_measured']} | pH: ${r['ph_measured']}${r['notes'] ? ' | ' + r['notes'] : ''} | Recipe: ${r['recipe_name']} v${r['recipe_version']}`;

      if (ings.length === 0) {
        // No ingredient data — emit a recipe-level row as fallback
        rows.push({
          application_type: 'fertigation',
          applied_at: r['applied_at'],
          batch_name: batchDisplayName(r),
          product_name: `${r['recipe_name']} v${r['recipe_version']}`,
          lot_number: null,
          rate: null,
          rate_unit: null,
          volume_applied: volGal,
          volume_unit: 'gal',
          applicator_name: r['applicator_name'] ?? null,
          location: r['sub_zone_id'] ?? null,
          notes: baseNotes,
        });
      } else {
        // Expand into one row per ingredient with computed quantity
        for (const ing of ings) {
          const item = itemMap.get(ing.input_id);
          rows.push({
            application_type: 'fertigation',
            applied_at: r['applied_at'],
            batch_name: batchDisplayName(r),
            product_name: itemName(item ?? null, ing.input_id),
            lot_number: null,
            rate: ing.rate_value,
            rate_unit: ing.rate_unit,
            volume_applied: volGal,
            volume_unit: 'gal',
            applicator_name: r['applicator_name'] ?? null,
            location: r['sub_zone_id'] ?? null,
            notes: baseNotes,
          });
        }
      }
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

      const fertigationAppsRaw = db.prepare(`
        SELECT af.*, fr.name AS recipe_name, fr.version AS recipe_version,
               u.name AS applicator_name
        FROM cv_applications_fertigation af
        JOIN cv_fertigation_recipes fr ON fr.recipe_id = af.recipe_id
        LEFT JOIN cv_users u ON u.id = af.applicator
        WHERE af.batch_id = ?
        ORDER BY af.applied_at ASC
      `).all(batchId) as Array<Record<string, unknown>>;

      // Expand recipe ingredients for each fertigation application (MN 342.25 — per-product quantities required)
      const fertRecipeIds = Array.from(new Set(fertigationAppsRaw.map(r => r['recipe_id'] as number).filter(Boolean)));
      type FertIng = { recipe_id: number; input_id: number; rate_value: number; rate_unit: string; order_index: number };
      const fertIngRows = fertRecipeIds.length > 0
        ? (db.prepare(`
            SELECT recipe_id, input_id, rate_value, rate_unit, order_index
            FROM cv_fertigation_recipe_ingredients
            WHERE recipe_id IN (${fertRecipeIds.map(() => '?').join(',')})
            ORDER BY recipe_id, order_index
          `).all(...fertRecipeIds) as FertIng[])
        : [];
      const fertIngByRecipe = new Map<number, FertIng[]>();
      for (const ing of fertIngRows) {
        const arr = fertIngByRecipe.get(ing.recipe_id) ?? [];
        arr.push(ing);
        fertIngByRecipe.set(ing.recipe_id, arr);
      }

      const fertigationApps = fertigationAppsRaw.map(r => ({
        ...r,
        ingredients: (fertIngByRecipe.get(r['recipe_id'] as number) ?? []).map(ing => ({
          input_id: ing.input_id,
          rate_value: ing.rate_value,
          rate_unit: ing.rate_unit,
          order_index: ing.order_index,
        })),
      }));

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
  /**
   * GET /metrc-waste — aggregate plant waste trim and plant loss events in
   * METRC waste report format (for Record Plant Destruction in METRC).
   * Supports optional batch_id, date_from, date_to, format query params.
   */
  const MetrcWasteQuerySchema = z.object({
    batch_id:  z.string().optional(),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    format:    z.enum(['json', 'csv']).default('json'),
  });

  app.get('/metrc-waste', { preHandler: requireAuth }, async (request, reply) => {
    const q = MetrcWasteQuerySchema.parse(request.query);
    const db = getDB();

    const trimWhere = buildDateBatchWhere('wt.trimmed_at', 'wt.batch_id', q.date_from, q.date_to, q.batch_id);
    const lossWhere = buildDateBatchWhere('pl.occurred_at', 'pl.batch_id', q.date_from, q.date_to, q.batch_id);

    const trimRows = db.prepare(`
      SELECT wt.waste_trim_id AS event_id, 'waste_trim' AS event_type,
             wt.trimmed_at AS event_date, wt.wet_weight, wt.weight_unit,
             wt.trim_reason AS reason, wt.waste_status, wt.disposed_at,
             wt.disposition, wt.metrc_sync_status,
             wt.metrc_plant_tag AS metrc_tag,
             b.metrc_plant_batch_uid, b.batch_id,
             s.name AS strain_name,
             pa.metrc_plant_tag AS assignment_tag,
             u.name AS applicator_name
      FROM cv_plant_waste_trim_events wt
      LEFT JOIN cv_batches b ON b.batch_id = wt.batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_plant_assignments pa ON pa.assignment_id = wt.plant_assignment_id
      LEFT JOIN cv_users u ON u.id = wt.applicator
      ${trimWhere.sql}
      ORDER BY wt.trimmed_at DESC LIMIT 1000
    `).all(...trimWhere.params) as Array<Record<string, unknown>>;

    const lossRows = db.prepare(`
      SELECT pl.loss_id AS event_id, 'plant_loss' AS event_type,
             pl.occurred_at AS event_date, NULL AS wet_weight, NULL AS weight_unit,
             pl.loss_type AS reason, pl.plant_disposition AS waste_status,
             pl.occurred_at AS disposed_at, pl.plant_disposition AS disposition,
             pl.metrc_sync_status,
             pl.metrc_plant_tag AS metrc_tag,
             b.metrc_plant_batch_uid, b.batch_id,
             s.name AS strain_name,
             pl.metrc_plant_tag AS assignment_tag,
             u.name AS applicator_name
      FROM cv_plant_loss_events pl
      LEFT JOIN cv_batches b ON b.batch_id = pl.batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = pl.reported_by
      ${lossWhere.sql}
      ORDER BY pl.occurred_at DESC LIMIT 1000
    `).all(...lossWhere.params) as Array<Record<string, unknown>>;

    const rows = [...trimRows, ...lossRows].sort((a, b) =>
      String(b['event_date'] ?? '').localeCompare(String(a['event_date'] ?? ''))
    );

    if (q.format === 'csv') {
      const cols = [
        'event_date', 'event_type', 'metrc_plant_batch_uid', 'metrc_tag',
        'strain_name', 'reason', 'wet_weight', 'weight_unit',
        'waste_status', 'disposed_at', 'disposition', 'applicator_name',
        'metrc_sync_status',
      ];
      const dateStr = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="metrc-waste-${dateStr}.csv"`);
      return reply.send(toCsv(rows, cols));
    }

    return reply.send(rows);
  });
};

export default exportsRoutes;
