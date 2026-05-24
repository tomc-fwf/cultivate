import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

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
               b.plant_count_initial AS plant_count_current, b.plant_count_initial, b.sub_zone_id,
               b.sow_date, b.field_move_date,
               lh.to_location_id AS location_id,
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
          AND lh.move_id = (
            SELECT MAX(move_id) FROM cv_batch_location_history WHERE batch_id = b.batch_id
          )
        LEFT JOIN cv_locations loc ON loc.location_id = lh.to_location_id
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
          AND blh.move_id = (
            SELECT MAX(move_id) FROM cv_batch_location_history WHERE batch_id = b.batch_id
          )
        LEFT JOIN cv_locations lh_loc ON lh_loc.location_id = blh.to_location_id
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

    let metrcTodosPending = 0;
    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM cv_metrc_todos WHERE status = 'pending'
      `).get() as Record<string, unknown> | undefined;
      metrcTodosPending = Number(row?.['cnt'] ?? 0);
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

    // Lookup location_id and location_category for indoor locations
    let indoorLocRows: Array<Record<string, unknown>> = [];
    try {
      indoorLocRows = db.prepare(`
        SELECT location_id, name, location_category
        FROM cv_locations
        WHERE name IN ('Germ-01', 'Seedlings', 'Cult-Hoop') AND active = 1
      `).all() as Array<Record<string, unknown>>;
    } catch { /* table may not exist yet */ }

    const indoorLocByName = new Map<string, Record<string, unknown>>();
    for (const row of indoorLocRows) {
      indoorLocByName.set(row['name'] as string, row);
    }

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

    const indoor = PRE_FIELD_DEFS.map(def => {
      const locRow = indoorLocByName.get(def.name);
      return {
        location_id: (locRow?.['location_id'] as number) ?? null,
        location_category: (locRow?.['location_category'] as string) ?? 'indoor',
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
      };
    });

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
        losses_unsynced:      lossesUnsynced,
        teardown_pending:     teardownPending,
        startup_pending:      startupPending,
        lab_samples_awaiting: labSamplesAwaiting,
        metrc_todos_pending:  metrcTodosPending,
      },
    });
  });

  /**
   * GET /tree — full location tree with batches, container counts, REI, and observations.
   * Groups locations by category: indoor | hoop_house | outdoor.
   * Outdoor locations are two-level: Zone (parent) → Sub-zone (child).
   */
  app.get('/tree', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();

    // Step 1 — all active locations
    let locationRows: Array<Record<string, unknown>> = [];
    try {
      locationRows = db.prepare(`
        SELECT * FROM cv_locations WHERE active = 1 ORDER BY display_order ASC, location_id ASC
      `).all() as Array<Record<string, unknown>>;
    } catch {
      locationRows = [];
    }

    // Step 2 — active batches with most recent location
    let batchRows: Array<Record<string, unknown>> = [];
    try {
      batchRows = db.prepare(`
        SELECT b.batch_id, b.name AS batch_name, b.strain_id, s.name AS strain_name, b.status,
               b.plant_count_initial AS plant_count_current, b.plant_count_initial, b.sub_zone_id,
               b.sow_date, b.field_move_date,
               lh.to_location_id AS location_id,
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
          AND lh.move_id = (
            SELECT MAX(move_id) FROM cv_batch_location_history WHERE batch_id = b.batch_id
          )
        LEFT JOIN cv_locations loc ON loc.location_id = lh.to_location_id
        WHERE b.status NOT IN ('closed')
        ORDER BY b.batch_id
      `).all() as Array<Record<string, unknown>>;
    } catch {
      batchRows = [];
    }

    // Step 3 — container state counts per sub_zone_id
    let containerRows: Array<Record<string, unknown>> = [];
    try {
      containerRows = db.prepare(`
        SELECT sz.sub_zone_id, sz.pot_size_gal,
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
      containerRows = [];
    }

    // Step 4 — active REIs per sub_zone_id
    let reiRows: Array<Record<string, unknown>> = [];
    try {
      reiRows = db.prepare(`
        SELECT DISTINCT b.sub_zone_id, MIN(ap.rei_expires_at) AS rei_expires_at
        FROM cv_applications_pesticide ap
        JOIN cv_batches b ON b.batch_id = ap.plant_batch_id
        WHERE ap.rei_expires_at > datetime('now') AND ap.rei_cleared_at IS NULL
        GROUP BY b.sub_zone_id
      `).all() as Array<Record<string, unknown>>;
    } catch {
      reiRows = [];
    }

    // Step 5 — open observation count per location (sub_zone or location name)
    let obsRows: Array<Record<string, unknown>> = [];
    try {
      obsRows = db.prepare(`
        SELECT b.sub_zone_id,
               lh_loc.name AS location_name,
               COUNT(*) AS open_count
        FROM cv_observations o
        JOIN cv_batches b ON b.batch_id = o.plant_batch_id
        LEFT JOIN cv_batch_location_history blh ON blh.batch_id = b.batch_id
          AND blh.move_id = (
            SELECT MAX(lh2.move_id) FROM cv_batch_location_history lh2 WHERE lh2.batch_id = b.batch_id
          )
        LEFT JOIN cv_locations lh_loc ON lh_loc.location_id = blh.to_location_id
        WHERE o.resolved_at IS NULL
        GROUP BY b.sub_zone_id, lh_loc.name
      `).all() as Array<Record<string, unknown>>;
    } catch {
      // resolved_at may not exist or table missing — return 0 for all
      obsRows = [];
    }

    // Step 6 — assemble tree in JS

    type LocationNode = Record<string, unknown> & {
      sub_locations: LocationNode[];
      batches: Array<Record<string, unknown>>;
      container_counts: Record<string, number>;
      container_count: number;
      pot_size_gal: number | null;
      rei_active: boolean;
      rei_expires_at: string | null;
      open_observation_count: number;
    };

    const byId: Record<number, LocationNode> = {};
    for (const r of locationRows) {
      byId[r['location_id'] as number] = {
        ...r,
        sub_locations: [],
        batches: [],
        container_counts: { active: 0, empty: 0, teardown: 0, startup: 0, ready: 0, out_of_service: 0 },
        container_count: 0,
        pot_size_gal: null,
        rei_active: false,
        rei_expires_at: null,
        open_observation_count: 0,
      };
    }

    // Attach field batches to their location node by location_id (reliable for sub-zones)
    const FIELD_STATUSES = new Set(['field-veg', 'field-flower', 'flush', 'harvest_window', 'harvesting']);
    for (const batch of batchRows) {
      if (!FIELD_STATUSES.has(batch['status'] as string)) continue;
      const locId = batch['location_id'] as number | null;
      if (locId != null && byId[locId]) {
        byId[locId].batches.push({
          batch_id: batch['batch_id'],
          batch_name: batch['batch_name'],
          strain_name: batch['strain_name'],
          status: batch['status'],
          plant_count_current: batch['plant_count_current'],
          plant_count_initial: batch['plant_count_initial'],
          days_in_stage: batch['days_in_stage'],
          sub_zone_id: batch['sub_zone_id'],
        });
      }
    }

    // Attach container counts and pot size to leaf sub-zone locations
    for (const sz of containerRows) {
      const szId = sz['sub_zone_id'] as string;
      const loc = Object.values(byId).find(l => l['sub_zone_id'] === szId);
      if (loc) {
        loc.container_counts = {
          active:         Number(sz['active']         ?? 0),
          empty:          Number(sz['empty']          ?? 0),
          teardown:       Number(sz['teardown']       ?? 0),
          startup:        Number(sz['startup']        ?? 0),
          ready:          Number(sz['ready']          ?? 0),
          out_of_service: Number(sz['out_of_service'] ?? 0),
        };
        loc.container_count = Number(sz['container_count'] ?? 0);
        loc.pot_size_gal = Number(sz['pot_size_gal'] ?? null) || null;
      }
    }

    // Attach REI status to sub-zone locations
    for (const rei of reiRows) {
      const szId = rei['sub_zone_id'] as string | null;
      if (!szId) continue;
      const loc = Object.values(byId).find(l => l['sub_zone_id'] === szId);
      if (loc) {
        loc.rei_active = true;
        loc.rei_expires_at = rei['rei_expires_at'] as string;
      }
    }

    // Attach open observation counts
    for (const obs of obsRows) {
      const szId = obs['sub_zone_id'] as string | null;
      const locName = obs['location_name'] as string | null;
      const loc = Object.values(byId).find(
        l => (szId && l['sub_zone_id'] === szId) || (locName && l['name'] === locName)
      );
      if (loc) loc.open_observation_count = Number(obs['open_count'] ?? 0);
    }

    // Build parent-child tree
    const roots: LocationNode[] = [];
    for (const loc of Object.values(byId)) {
      const parentId = loc['parent_location_id'] as number | null;
      if (parentId != null && byId[parentId]) {
        byId[parentId].sub_locations.push(loc);
      } else {
        roots.push(loc);
      }
    }

    // Sort by display_order — Object.values(byId) iterates in numeric key order (location_id),
    // not SQL ORDER BY order, so we must re-sort after assembly.
    const byOrder = (a: LocationNode, b: LocationNode) =>
      (Number(a['display_order'] ?? 999) - Number(b['display_order'] ?? 999)) ||
      (Number(a['location_id']) - Number(b['location_id']));

    roots.sort(byOrder);
    for (const root of roots) root.sub_locations.sort(byOrder);

    // Group roots by category
    const tree: Record<string, LocationNode[]> = { indoor: [], hoop_house: [], outdoor: [] };
    for (const root of roots) {
      const cat = (root['location_category'] as string | null) ?? 'outdoor';
      if (cat in tree) tree[cat].push(root);
    }

    // ── Pre-field batch routing by status/name ────────────────────────────────
    // Route germ/seedling/cult-hoop batches to the right indoor or hoop-house
    // location by matching the batch status against the location name. This is
    // more robust than location_id matching because it handles:
    //   - the seeded Germ-01 (id=1) vs. user-created "Indoor Germination" cards
    //   - operators who rename or recreate indoor locations
    const PRE_FIELD_TERMS: Record<string, { cats: string[]; terms: string[] }> = {
      'germ':      { cats: ['indoor'],               terms: ['germ'] },
      'seedling':  { cats: ['indoor', 'hoop_house'], terms: ['seedling'] },
      'cult-hoop': { cats: ['hoop_house', 'indoor'], terms: ['cult', 'hoop'] },
    };

    // Build status → best-matching location lookup (first match wins per status)
    const statusToLoc = new Map<string, LocationNode>();
    for (const [status, cfg] of Object.entries(PRE_FIELD_TERMS)) {
      for (const cat of cfg.cats) {
        if (statusToLoc.has(status)) break;
        for (const loc of (tree[cat] ?? [])) {
          const n = (loc['name'] as string ?? '').toLowerCase();
          if (n.includes('seed') && (n.includes('vault') || n.includes('package'))) continue;
          if (cfg.terms.some(t => n.includes(t))) {
            statusToLoc.set(status, loc);
            break;
          }
        }
      }
    }

    // Assign pre-field batches to their matching location (deduplication guard)
    for (const batch of batchRows) {
      const status = batch['status'] as string;
      if (!PRE_FIELD_TERMS[status]) continue;
      const target = statusToLoc.get(status);
      if (!target) continue;
      if (!target.batches.some(b => b['batch_id'] === batch['batch_id'])) {
        target.batches.push({
          batch_id: batch['batch_id'],
          batch_name: batch['batch_name'],
          strain_name: batch['strain_name'],
          status: batch['status'],
          plant_count_current: batch['plant_count_current'],
          plant_count_initial: batch['plant_count_initial'],
          days_in_stage: batch['days_in_stage'],
          sub_zone_id: batch['sub_zone_id'],
        });
      }
    }

    // ── Seed package summary for Seed Vault locations ─────────────────────────
    // Packages may not have location_id set, so we count all active packages
    // and assign the total to any location whose name suggests it's a seed vault.
    try {
      const spRow = db.prepare(`
        SELECT COUNT(*) AS cnt, SUM(COALESCE(weight_g_remaining, 0)) AS wt
        FROM cv_seed_packages WHERE active = 1
      `).get() as Record<string, unknown> | undefined;
      const totalPkgs = Number(spRow?.['cnt'] ?? 0);
      const totalWt   = Number(spRow?.['wt']  ?? 0);
      if (totalPkgs > 0) {
        for (const loc of (tree['indoor'] ?? [])) {
          const n = (loc['name'] as string ?? '').toLowerCase();
          if (n.includes('seed') && (n.includes('vault') || n.includes('package'))) {
            loc.seed_package_count    = totalPkgs;
            loc.seed_package_weight_g = totalWt;
          }
        }
      }
    } catch { /* cv_seed_packages may not exist yet */ }

    // Bubble REI up to parent zone cards
    for (const zone of tree['outdoor']) {
      if (!zone.rei_active) {
        zone.rei_active = zone.sub_locations.some(sl => sl.rei_active);
      }
    }

    // Global alerts (same queries as /home-summary)
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

    let metrcTodosPending = 0;
    try {
      const row = db.prepare(`
        SELECT COUNT(*) AS cnt FROM cv_metrc_todos WHERE status = 'pending'
      `).get() as Record<string, unknown> | undefined;
      metrcTodosPending = Number(row?.['cnt'] ?? 0);
    } catch { /* skip */ }

    return reply.send({
      tree,
      global_alerts: {
        losses_unsynced:      lossesUnsynced,
        teardown_pending:     teardownPending,
        startup_pending:      startupPending,
        lab_samples_awaiting: labSamplesAwaiting,
        metrc_todos_pending:  metrcTodosPending,
      },
    });
  });
};

export default locationsRoutes;

// ── Admin routes (registered under /api/admin) ────────────────────────────────

const CreateLocationSchema = z.object({
  name: z.string().min(1).max(100),
  location_category: z.enum(['indoor', 'hoop_house', 'outdoor']),
  parent_location_id: z.number().int().positive().nullable().optional(),
  metrc_name: z.string().optional(),
  description: z.string().optional(),
  display_order: z.number().int().optional(),
  col_span: z.number().int().min(1).max(2).optional(),
});

const UpdateLocationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  metrc_name: z.string().optional(),
  description: z.string().optional(),
  display_order: z.number().int().optional(),
  col_span: z.number().int().min(1).max(4).optional(),
  active: z.boolean().optional(),
});

export const adminLocationsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/admin/locations — create a new location (admin only).
   */
  app.post('/locations', { preHandler: requireAdmin }, async (request, reply) => {
    const result = CreateLocationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
    }
    const data = result.data;

    const location_type =
      data.location_category === 'indoor' ? 'germination' : 'field';

    const db = getDB();
    const row = db.prepare(`
      INSERT INTO cv_locations (name, location_type, location_category, metrc_name, parent_location_id, description, display_order, col_span, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      data.name,
      location_type,
      data.location_category,
      data.metrc_name ?? data.name,
      data.parent_location_id ?? null,
      data.description ?? null,
      data.display_order ?? 999,
      data.col_span ?? 1,
    );

    const created = db.prepare(`SELECT * FROM cv_locations WHERE location_id = ?`).get(row.lastInsertRowid) as Record<string, unknown>;
    return reply.code(201).send(created);
  });

  /**
   * PATCH /api/admin/locations/:id — update a location (admin only).
   */
  app.patch('/locations/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const result = UpdateLocationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });
    }
    const body = result.data;
    const { id } = request.params as { id: string };
    const locationId = parseInt(id, 10);

    const db = getDB();
    const existing = db.prepare('SELECT * FROM cv_locations WHERE location_id = ?').get(locationId);
    if (!existing) return reply.code(404).send({ error: 'Location not found' });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates['name'] = body.name;
    if (body.metrc_name !== undefined) updates['metrc_name'] = body.metrc_name;
    if (body.description !== undefined) updates['description'] = body.description;
    if (body.display_order !== undefined) updates['display_order'] = body.display_order;
    if (body.col_span !== undefined) updates['col_span'] = body.col_span;
    if (body.active !== undefined) updates['active'] = body.active ? 1 : 0;

    if (Object.keys(updates).length === 0) return reply.send(existing);

    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), locationId];
    db.prepare(`UPDATE cv_locations SET ${setClause} WHERE location_id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM cv_locations WHERE location_id = ?').get(locationId) as Record<string, unknown>;
    return reply.send(updated);
  });
};
