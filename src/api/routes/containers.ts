import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireAdmin, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

const VALID_STATES = ['ready', 'active', 'empty', 'teardown', 'startup', 'out_of_service'] as const;
type ContainerState = (typeof VALID_STATES)[number];

/**
 * Fetch item names from farmstock catalog (best-effort; returns empty map on failure).
 */
async function fetchItemNames(inputIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (inputIds.length === 0) return map;

  const farmstockUrl = process.env.FARMSTOCK_URL;
  const serviceKey = process.env.FARMSTOCK_SERVICE_KEY;
  if (!farmstockUrl || !serviceKey) return map;

  try {
    const res = await fetch(`${farmstockUrl}/api/items/catalog`, {
      headers: { Authorization: `Service ${serviceKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return map;
    const items = (await res.json()) as Array<{ id: number; name: string }>;
    for (const item of items) {
      map.set(item.id, item.name);
    }
  } catch {
    // Farmstock unavailable — continue without names
  }
  return map;
}

const containersRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /summary — state counts per sub-zone (overview for dashboard header cards).
   */
  app.get('/summary', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();

    const rows = db.prepare(`
      SELECT
        cs.container_id,
        c.row_id,
        r.sub_zone_id,
        sz.zone_id,
        sz.designation,
        sz.pot_size_gal,
        sz.container_count,
        cs.current_state
      FROM cv_container_state cs
      JOIN cv_containers c ON c.container_id = cs.container_id
      JOIN cv_rows r ON r.row_id = c.row_id
      JOIN cv_sub_zones sz ON sz.sub_zone_id = r.sub_zone_id
    `).all() as Array<Record<string, unknown>>;

    // Aggregate by sub_zone_id
    const subZoneMap = new Map<string, {
      sub_zone_id: string;
      zone_id: number;
      designation: string;
      pot_size_gal: number;
      container_count: number;
      counts: Record<ContainerState, number>;
    }>();

    for (const row of rows) {
      const szId = row['sub_zone_id'] as string;
      if (!subZoneMap.has(szId)) {
        subZoneMap.set(szId, {
          sub_zone_id: szId,
          zone_id: row['zone_id'] as number,
          designation: row['designation'] as string,
          pot_size_gal: row['pot_size_gal'] as number,
          container_count: row['container_count'] as number,
          counts: { ready: 0, active: 0, empty: 0, teardown: 0, startup: 0, out_of_service: 0 },
        });
      }
      const entry = subZoneMap.get(szId)!;
      const state = row['current_state'] as ContainerState;
      if (state in entry.counts) {
        entry.counts[state]++;
      }
    }

    // Sort by zone_id then designation (A before B)
    const result = Array.from(subZoneMap.values()).sort((a, b) => {
      if (a.zone_id !== b.zone_id) return a.zone_id - b.zone_id;
      return a.designation.localeCompare(b.designation);
    });

    return reply.send(result);
  });

  /**
   * GET / — all containers for one sub-zone. Requires ?sub_zone_id=Z1A.
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const subZoneId = query['sub_zone_id'];
    const stateFilter = query['state'];

    if (!subZoneId) {
      return reply.code(400).send({ error: 'sub_zone_id query param is required' });
    }

    const db = getDB();

    const subZone = db.prepare('SELECT * FROM cv_sub_zones WHERE sub_zone_id = ?').get(subZoneId) as Record<string, unknown> | undefined;
    if (!subZone) {
      return reply.code(404).send({ error: `Sub-zone "${subZoneId}" not found` });
    }

    let sql = `
      SELECT
        c.container_id, c.position, c.notes AS container_notes,
        r.row_id, r.row_number,
        cs.current_state, cs.state_since, cs.current_batch_id, cs.notes AS state_notes,
        b.status AS batch_status,
        s.name AS strain_name, s.type AS strain_type,
        pa.metrc_plant_tag
      FROM cv_containers c
      JOIN cv_rows r ON r.row_id = c.row_id
      JOIN cv_container_state cs ON cs.container_id = c.container_id
      LEFT JOIN cv_batches b ON b.batch_id = cs.current_batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_plant_assignments pa ON pa.container_id = c.container_id AND pa.unassigned_at IS NULL
      WHERE r.sub_zone_id = ?
    `;
    const params: unknown[] = [subZoneId];

    if (stateFilter && VALID_STATES.includes(stateFilter as ContainerState)) {
      sql += ' AND cs.current_state = ?';
      params.push(stateFilter);
    }

    sql += ' ORDER BY r.row_number, c.position';

    const containers = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return reply.send({
      sub_zone: {
        sub_zone_id: subZone['sub_zone_id'],
        pot_size_gal: subZone['pot_size_gal'],
        row_count: subZone['row_count'],
        container_count: subZone['container_count'],
      },
      containers,
    });
  });

  /**
   * GET /:id — full container detail.
   * container_id is a path param like Z1-A-R3-C12.
   */
  app.get<{ Params: IdParams }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const containerId = request.params.id;
    const db = getDB();

    // Base container info
    const container = db.prepare(`
      SELECT
        c.container_id, c.position, c.notes AS container_notes,
        r.row_id, r.row_number,
        sz.sub_zone_id, sz.zone_id, sz.pot_size_gal
      FROM cv_containers c
      JOIN cv_rows r ON r.row_id = c.row_id
      JOIN cv_sub_zones sz ON sz.sub_zone_id = r.sub_zone_id
      WHERE c.container_id = ?
    `).get(containerId) as Record<string, unknown> | undefined;

    if (!container) {
      return reply.code(404).send({ error: `Container "${containerId}" not found` });
    }

    // Current state
    const currentState = db.prepare(`
      SELECT * FROM cv_container_state WHERE container_id = ?
    `).get(containerId) as Record<string, unknown> | undefined;

    // Current batch (if any)
    let currentBatch: Record<string, unknown> | null = null;
    if (currentState && currentState['current_batch_id']) {
      currentBatch = db.prepare(`
        SELECT
          b.batch_id, b.status, b.sow_date, b.plant_count_initial,
          s.name AS strain_name, s.type AS strain_type,
          fr.name AS active_recipe_name
        FROM cv_batches b
        JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_batch_stage_recipes bsr ON bsr.batch_id = b.batch_id AND bsr.effective_to IS NULL
        LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = bsr.recipe_id
        WHERE b.batch_id = ?
      `).get(currentState['current_batch_id']) as Record<string, unknown> | null;
    }

    // Current plant tag (active assignment)
    const currentTag = db.prepare(`
      SELECT * FROM cv_plant_assignments
      WHERE container_id = ? AND unassigned_at IS NULL
    `).get(containerId) as Record<string, unknown> | null;

    // State history (newest first)
    const stateHistory = db.prepare(`
      SELECT t.*, u.name AS transitioned_by_name
      FROM cv_container_state_transitions t
      LEFT JOIN cv_users u ON u.id = t.transitioned_by
      WHERE t.container_id = ?
      ORDER BY t.transitioned_at DESC
    `).all(containerId) as Array<Record<string, unknown>>;

    // Amendment history (newest first)
    const amendments = db.prepare(`
      SELECT a.*, u.name AS applicator_name
      FROM cv_container_amendments a
      LEFT JOIN cv_users u ON u.id = a.applicator
      WHERE a.container_id = ?
      ORDER BY a.applied_at DESC
    `).all(containerId) as Array<Record<string, unknown>>;

    // Enrich amendments with item names from farmstock
    const inputIds = amendments
      .map(a => a['input_id'] as number | null)
      .filter((id): id is number => id != null);
    const nameMap = await fetchItemNames([...new Set(inputIds)]);
    const amendmentsEnriched = amendments.map(a => ({
      ...a,
      item_name: a['input_id'] != null ? (nameMap.get(a['input_id'] as number) ?? null) : null,
    }));

    // Teardown events (newest first)
    const teardownEvents = db.prepare(`
      SELECT t.*, u.name AS performed_by_name
      FROM cv_teardown_events t
      LEFT JOIN cv_users u ON u.id = t.performed_by
      WHERE t.container_id = ?
      ORDER BY t.started_at DESC
    `).all(containerId) as Array<Record<string, unknown>>;

    // Startup events (newest first)
    const startupEvents = db.prepare(`
      SELECT se.*, u.name AS performed_by_name
      FROM cv_startup_events se
      LEFT JOIN cv_users u ON u.id = se.performed_by
      WHERE se.container_id = ?
      ORDER BY se.started_at DESC
    `).all(containerId) as Array<Record<string, unknown>>;

    // Past batches — distinct batches that appear in state transitions for this container
    const pastBatches = db.prepare(`
      SELECT DISTINCT b.batch_id, b.status, b.sow_date, b.harvest_date, b.closed_date,
                      s.name AS strain_name, s.type AS strain_type
      FROM cv_container_state_transitions t
      JOIN cv_batches b ON b.batch_id = t.batch_id
      JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE t.container_id = ?
        AND t.batch_id IS NOT NULL
      ORDER BY b.sow_date DESC
    `).all(containerId) as Array<Record<string, unknown>>;

    return reply.send({
      container,
      current_state: currentState,
      current_batch: currentBatch,
      current_tag: currentTag,
      state_history: stateHistory,
      amendments: amendmentsEnriched,
      teardown_events: teardownEvents,
      startup_events: startupEvents,
      past_batches: pastBatches,
    });
  });

  /**
   * PATCH /:id/state — manual state update (admin only).
   * Only valid manual transitions: any → out_of_service, out_of_service → ready.
   */
  app.patch<{ Params: IdParams; Body: { to_state: string; notes?: string } }>(
    '/:id/state',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const containerId = request.params.id;
      const { to_state, notes } = request.body as { to_state: string; notes?: string };

      if (!to_state || !VALID_STATES.includes(to_state as ContainerState)) {
        return reply.code(400).send({
          error: `to_state must be one of: ${VALID_STATES.join(', ')}`,
        });
      }

      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) {
        return reply.code(404).send({ error: `Container "${containerId}" not found` });
      }

      const state = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(containerId) as Record<string, unknown> | undefined;
      if (!state) {
        return reply.code(404).send({ error: 'Container state record not found' });
      }

      const fromState = state['current_state'] as string;

      // Admins may set any state manually (needed for setup and corrections).
      // Guard: active/empty require a current_batch_id; block if none is set.
      if ((to_state === 'active' || to_state === 'empty') && !state['current_batch_id']) {
        return reply.code(400).send({
          error: `Cannot manually set state to "${to_state}" — a current batch must be assigned first. ` +
                 `Use the batch assignment workflow instead.`,
        });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      db.transaction(() => {
        // Update container state
        db.prepare(`
          UPDATE cv_container_state
          SET current_state = ?, state_since = ?, current_batch_id = NULL, notes = ?, updated_at = ?
          WHERE container_id = ?
        `).run(to_state, now, notes ?? null, now, containerId);

        // Log the transition
        db.prepare(`
          INSERT INTO cv_container_state_transitions
            (container_id, from_state, to_state, transitioned_at, transitioned_by, batch_id, trigger_event, notes, created_at)
          VALUES (?, ?, ?, ?, ?, NULL, 'manual', ?, ?)
        `).run(containerId, fromState, to_state, now, userId, notes ?? null, now);
      })();

      const updated = db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get(containerId);
      return reply.send(updated);
    },
  );

  /**
   * POST /admin/bulk-reset-ready — admin only.
   * Resets all containers with no current_batch_id to "ready" state.
   * Use when the seed data is wrong or after a fresh deployment.
   */
  app.post(
    '/admin/bulk-reset-ready',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const db = getDB();
      const now = new Date().toISOString();
      const userId = request.user.id;

      const toReset = db.prepare(
        `SELECT container_id, current_state FROM cv_container_state
         WHERE current_batch_id IS NULL AND current_state != 'ready'`,
      ).all() as Array<{ container_id: string; current_state: string }>;

      if (toReset.length === 0) {
        return reply.send({ reset_count: 0, message: 'All unoccupied containers are already ready.' });
      }

      const doReset = db.transaction(() => {
        const upd = db.prepare(
          `UPDATE cv_container_state
           SET current_state='ready', state_since=?, updated_at=?
           WHERE container_id=? AND current_batch_id IS NULL`,
        );
        const log = db.prepare(
          `INSERT INTO cv_container_state_transitions
             (container_id, from_state, to_state, transitioned_at, transitioned_by, trigger_event, notes, created_at)
           VALUES (?, ?, 'ready', ?, ?, 'manual', 'Bulk reset to ready', ?)`,
        );
        for (const row of toReset) {
          upd.run(now, now, row.container_id);
          log.run(row.container_id, row.current_state, now, userId, now);
        }
      });
      doReset();

      return reply.send({ reset_count: toReset.length, message: `Reset ${toReset.length} containers to ready.` });
    },
  );

  /**
   * PATCH /:id/notes — update container and/or state notes. Requires supervisor+.
   */
  app.patch<{ Params: IdParams; Body: { notes: string } }>(
    '/:id/notes',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const containerId = request.params.id;
      const { notes } = request.body as { notes: string };

      const db = getDB();

      const container = db.prepare('SELECT container_id FROM cv_containers WHERE container_id = ?').get(containerId);
      if (!container) {
        return reply.code(404).send({ error: `Container "${containerId}" not found` });
      }

      const now = new Date().toISOString();

      db.prepare('UPDATE cv_containers SET notes = ? WHERE container_id = ?').run(notes ?? null, containerId);
      db.prepare('UPDATE cv_container_state SET notes = ?, updated_at = ? WHERE container_id = ?').run(notes ?? null, now, containerId);

      return reply.send({ success: true, notes: notes ?? null });
    },
  );
};

export default containersRoutes;
