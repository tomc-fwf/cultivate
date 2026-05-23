import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const PRE_FIELD_TYPES = ['germination', 'seedling', 'veg'];

const locationsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /home-summary — combined summary for the Locations Home screen.
   * Returns indoor locations (Germ-01, Seedlings, Cult-Hoop), field zone/sub-zone data,
   * REI status, open observation counts, and global alerts.
   */
  app.get('/home-summary', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();

    // a) Active batches with current location
    let batchRows: Array<Record<string, unknown>> = [];
    try {
      batchRows = db.prepare(`
        SELECT b.batch_id, b.strain_id, s.name AS strain_name, b.status,
               b.plant_count_current, b.plant_count_initial, b.sub_zone_id,
               b.sow_date, b.field_move_date,
               lh.location_id,
               loc.name AS current_location_name,
               loc.location_type AS current_location_type,
               CAST((julianday('now') - julianday(
                 CASE WHEN b.status IN ('field-veg','field-flower','flush','harvest_window','harvesting')
                      THEN b.field_move_date
                      ELSE b.sow_date END
               )) AS INTEGER) AS days_in_stage
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_location_history lh ON lh.batch_id = b.batch_id
          AND lh.location_history_id = (
            SELECT MAX(location_history_id) FROM cv_batch_location_history WHERE batch_id = b.batch_id
          )
        LEFT JOIN cv_locations loc ON loc.location_id = lh.location_id
        WHERE b.status NOT IN ('closed')
        ORDER BY b.batch_id
      `).all() as Array<Record<string, unknown>>;
    } catch {
      // table may not exist yet — skip
    }

    // b) Container state counts per sub-zone
    let containerRows: Array<Record<string, unknown>> = [];
    try {
      containerRows = db.prepare(`
        SELECT sz.sub_zone_id, sz.pot_size_gal, sz.row_count,
               (sz.row_count * CASE WHEN sz.designation = 'A' THEN 30 ELSE 29 END) AS container_count,
               SUM(CASE WHEN cs.current_state = 'active'         THEN 1 ELSE 0 END) AS active,
               SUM(CASE WHEN cs.current_state = 'empty'          THEN 1 ELSE 0 END) AS empty,
               SUM(CASE WHEN cs.current_state = 'teardown'       THEN 1 ELSE 0 END) AS teardown,
               SUM(CASE WHEN cs.current_state = 'startup'        THEN 1 ELSE 0 END) AS startup,
               SUM(CASE WHEN cs.current_state = 'ready'          THEN 1 ELSE 0 END) AS ready,
               SUM(CASE WHEN cs.current_state = 'out_of_service' THEN 1 ELSE 0 END) AS out_of_service
        FROM cv_sub_zones sz
        LEFT JOIN cv_containers c ON c.sub_zone_id = sz.sub_zone_id
        LEFT JOIN cv_container_state cs ON cs.container_id = c.container_id
        GROUP BY sz.sub_zone_id
      `).all() as Array<Record<string, unknown>>;
    } catch {
      // table may not exist yet — skip
    }

    // c) Active REIs per sub-zone
    let reiRows: Array<Record<string, unknown>> = [];
    try {
      reiRows = db.prepare(`
        SELECT b.sub_zone_id, MIN(ap.rei_expires_at) AS rei_expires_at
        FROM cv_applications_pesticide ap
        JOIN cv_batches b ON b.batch_id = ap.plant_batch_id
        WHERE ap.rei_expires_at > datetime('now')
          AND ap.rei_cleared_at IS NULL
        GROUP BY b.sub_zone_id
      `).all() as Array<Record<string, unknown>>;
    } catch {
      // table may not exist yet — skip
    }

    // d) Open observation count per sub-zone and location name
    let obsRows: Array<Record<string, unknown>> = [];
    try {
      obsRows = db.prepare(`
        SELECT b.sub_zone_id, lh_loc.name AS location_name,
               COUNT(*) AS open_count
        FROM cv_observations o
        JOIN cv_batches b ON b.batch_id = o.plant_batch_id
        LEFT JOIN cv_batch_location_history blh ON blh.batch_id = b.batch_id
          AND blh.location_history_id = (
            SELECT MAX(location_history_id) FROM cv_batch_location_history WHERE batch_id = b.batch_id
          )
        LEFT JOIN cv_locations lh_loc ON lh_loc.location_id = blh.location_id
        WHERE o.resolved_at IS NULL
        GROUP BY b.sub_zone_id, lh_loc.name
      `).all() as Array<Record<string, unknown>>;
    } catch {
      // table may not exist yet — skip
    }

    // e) Global alerts (same queries as pending-actions)
    let teardownPending = 0;
    let startupPending = 0;
    let labSamplesAwaiting = 0;
    let lossesUnsynced = 0;

    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM cv_container_state cs
        LEFT JOIN cv_teardown_events te ON te.container_id = cs.container_id
          AND te.teardown_id = (
            SELECT MAX(teardown_id) FROM cv_teardown_events WHERE container_id = cs.container_id
          )
        WHERE cs.current_state = 'teardown'
          AND (te.soil_sample_collected = 0 OR te.teardown_id IS NULL)
      `).get() as Record<string, unknown> | undefined;
      teardownPending = Number(row?.['cnt'] ?? 0);
    } catch { /* skip */ }

    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM cv_container_state WHERE current_state = 'startup'
      `).get() as Record<string, unknown> | undefined;
      startupPending = Number(row?.['cnt'] ?? 0);
    } catch { /* skip */ }

    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM cv_soil_samples
        WHERE results_received = 0 AND lab_sent_at IS NOT NULL
      `).get() as Record<string, unknown> | undefined;
      labSamplesAwaiting = Number(row?.['cnt'] ?? 0);
    } catch { /* skip */ }

    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM cv_plant_loss_events WHERE metrc_sync_status = 'pending'
      `).get() as Record<string, unknown> | undefined;
      lossesUnsynced = Number(row?.['cnt'] ?? 0);
    } catch { /* skip */ }

    // ── Index results ──────────────────────────────────────────────────────────

    // Container counts by sub-zone
    const containerBySubZone = new Map<string, Record<string, unknown>>();
    for (const row of containerRows) {
      containerBySubZone.set(row['sub_zone_id'] as string, row);
    }

    // REI by sub-zone
    const reiBySubZone = new Map<string, string>();
    for (const row of reiRows) {
      if (row['sub_zone_id']) {
        reiBySubZone.set(row['sub_zone_id'] as string, row['rei_expires_at'] as string);
      }
    }

    // Open observation count by sub-zone and location name
    const obsBySubZone = new Map<string, number>();
    const obsByLocationName = new Map<string, number>();
    for (const row of obsRows) {
      const sz = row['sub_zone_id'] as string | null;
      const locName = row['location_name'] as string | null;
      const cnt = Number(row['open_count'] ?? 0);
      if (sz) obsBySubZone.set(sz, (obsBySubZone.get(sz) ?? 0) + cnt);
      if (locName) obsByLocationName.set(locName, (obsByLocationName.get(locName) ?? 0) + cnt);
    }

    // ── Build indoor section ───────────────────────────────────────────────────
    const PRE_FIELD_DEFS = [
      { name: 'Germ-01',   type: 'germination' },
      { name: 'Seedlings', type: 'seedling'    },
      { name: 'Cult-Hoop', type: 'veg'         },
    ];

    // Batches for each indoor location
    const batchesByLocation = new Map<string, Array<Record<string, unknown>>>();
    for (const b of batchRows) {
      const locType = b['current_location_type'] as string | null;
      const locName = b['current_location_name'] as string | null;
      if (locType && PRE_FIELD_TYPES.includes(locType) && locName) {
        if (!batchesByLocation.has(locName)) batchesByLocation.set(locName, []);
        batchesByLocation.get(locName)!.push(b);
      }
    }

    const indoor = PRE_FIELD_DEFS.map(def => ({
      name: def.name,
      type: def.type,
      batches: (batchesByLocation.get(def.name) ?? []).map(b => ({
        batch_id: b['batch_id'],
        strain_name: b['strain_name'],
        status: b['status'],
        plant_count_current: b['plant_count_current'],
        plant_count_initial: b['plant_count_initial'],
        days_in_stage: b['days_in_stage'],
        sub_zone_id: b['sub_zone_id'],
      })),
      open_observation_count: obsByLocationName.get(def.name) ?? 0,
    }));

    // ── Build field section ────────────────────────────────────────────────────
    // Batches by sub_zone_id (field status batches)
    const batchBySubZone = new Map<string, Record<string, unknown>>();
    for (const b of batchRows) {
      const locType = b['current_location_type'] as string | null;
      const szId = b['sub_zone_id'] as string | null;
      if (locType === 'field' && szId) {
        batchBySubZone.set(szId, b);
      }
    }

    const zones = [1, 2, 3, 4].map(zoneNum => ({
      zone: zoneNum,
      sub_zones: ['A', 'B'].map(designation => {
        const szId = `Z${zoneNum}${designation}`;
        const containerData = containerBySubZone.get(szId);
        const batch = batchBySubZone.get(szId) ?? null;
        const reiExpiresAt = reiBySubZone.get(szId) ?? null;

        return {
          sub_zone_id: szId,
          pot_size_gal: Number(containerData?.['pot_size_gal'] ?? (designation === 'A' ? 30 : 10)),
          container_count: Number(containerData?.['container_count'] ?? 0),
          container_counts: {
            active:         Number(containerData?.['active']         ?? 0),
            empty:          Number(containerData?.['empty']          ?? 0),
            teardown:       Number(containerData?.['teardown']       ?? 0),
            startup:        Number(containerData?.['startup']        ?? 0),
            ready:          Number(containerData?.['ready']          ?? 0),
            out_of_service: Number(containerData?.['out_of_service'] ?? 0),
          },
          batch: batch ? {
            batch_id:           batch['batch_id'],
            strain_name:        batch['strain_name'],
            status:             batch['status'],
            plant_count_current: batch['plant_count_current'],
            plant_count_initial: batch['plant_count_initial'],
            days_in_stage:      batch['days_in_stage'],
          } : null,
          rei_active:     reiExpiresAt !== null,
          rei_expires_at: reiExpiresAt,
          open_observation_count: obsBySubZone.get(szId) ?? 0,
        };
      }),
    }));

    return reply.send({
      indoor,
      zones,
      global_alerts: {
        losses_unsynced:     lossesUnsynced,
        teardown_pending:    teardownPending,
        startup_pending:     startupPending,
        lab_samples_awaiting: labSamplesAwaiting,
      },
    });
  });
};

export default locationsRoutes;
