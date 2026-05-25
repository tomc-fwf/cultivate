import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

// Hours of grace before a task flips from 'due' to 'overdue'.
// A daily task becomes 'overdue' after 30 hours (24h threshold + 6h grace).
const OVERDUE_GRACE_HOURS = 6;

interface TodayTask {
  task_key: string;
  protocol_id: number;
  batch_id: number;
  batch_name: string | null;
  strain_name: string | null;
  sub_zone_id: string | null;
  stage: string;
  days_in_stage: number;
  task_type: string;
  title: string;
  description: string | null;
  frequency_days: number;
  last_performed_at: string | null;
  hours_since: number | null;
  urgency: 'overdue' | 'due';
  action_path: string;
}

function actionPath(taskType: string, batchId: number): string {
  switch (taskType) {
    case 'fertigation': return `/applications/fertigation/new?batch_id=${batchId}`;
    case 'observation':  return `/observations/new?batch_id=${batchId}`;
    case 'foliar':       return `/applications/foliar/new?batch_id=${batchId}`;
    case 'amendment':    return `/applications/amendments/new?batch_id=${batchId}`;
    default:             return `/batches/${batchId}`;
  }
}

const tasksRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /today — generate today's task queue across all active batches.
   *
   * For each active batch, finds matching stage protocols and checks when each
   * task was last performed. Returns tasks that are due or overdue, sorted by
   * urgency (overdue first) then by batch name.
   */
  app.get('/today', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const now = Date.now();

    // All active (non-closed) batches with days_in_stage computed
    const batches = db.prepare(`
      SELECT b.batch_id, b.status, b.name AS batch_name, b.sub_zone_id,
             s.name AS strain_name,
             CAST(julianday('now') - julianday(COALESCE(b.current_stage_since, b.sow_date)) AS INTEGER) AS days_in_stage
      FROM cv_batches b
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.status NOT IN ('closed')
      ORDER BY b.name
    `).all() as Array<Record<string, unknown>>;

    if (batches.length === 0) return reply.send([]);

    // All active protocols, keyed by stage for quick lookup
    const allProtocols = db.prepare(`
      SELECT * FROM cv_stage_protocols WHERE active = 1 ORDER BY order_index ASC
    `).all() as Array<Record<string, unknown>>;

    const protocolsByStage = new Map<string, Array<Record<string, unknown>>>();
    for (const p of allProtocols) {
      const stage = p['stage'] as string;
      if (!protocolsByStage.has(stage)) protocolsByStage.set(stage, []);
      protocolsByStage.get(stage)!.push(p);
    }

    // Prepared statements for last-performed lookups
    const lastFertigation = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_applications_fertigation WHERE batch_id = ?`
    );
    const lastObservation = db.prepare(
      `SELECT MAX(observed_at) AS last FROM cv_observations WHERE batch_id = ?`
    );
    const lastFoliar = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_applications_foliar WHERE batch_id = ?`
    );
    const lastAmendment = db.prepare(
      `SELECT MAX(applied_at) AS last FROM cv_container_amendments WHERE batch_id = ?`
    );

    const tasks: TodayTask[] = [];

    for (const batch of batches) {
      const batchId    = batch['batch_id'] as number;
      const stage      = batch['status'] as string;
      const daysInStage = batch['days_in_stage'] as number ?? 0;
      const protocols  = protocolsByStage.get(stage) ?? [];

      for (const protocol of protocols) {
        const dayMin = protocol['day_min'] as number | null;
        const dayMax = protocol['day_max'] as number | null;

        // Skip if outside the day window for this protocol
        if (dayMin != null && daysInStage < dayMin) continue;
        if (dayMax != null && daysInStage > dayMax) continue;

        const taskType      = protocol['task_type'] as string;
        const frequencyDays = protocol['frequency_days'] as number;
        const thresholdMs   = frequencyDays * 24 * 3600 * 1000;

        // Look up last performed time for this task type on this batch
        let lastPerformedAt: string | null = null;
        if (taskType === 'fertigation') {
          const row = lastFertigation.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'observation') {
          const row = lastObservation.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'foliar') {
          const row = lastFoliar.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        } else if (taskType === 'amendment') {
          const row = lastAmendment.get(batchId) as Record<string, unknown> | undefined;
          lastPerformedAt = (row?.['last'] as string) ?? null;
        }

        const lastMs = lastPerformedAt ? new Date(lastPerformedAt).getTime() : null;
        const hoursSince = lastMs != null ? (now - lastMs) / 3600000 : null;
        const hoursThreshold = frequencyDays * 24;

        // Only include tasks that are actually due (past threshold)
        const isDue = hoursSince === null || hoursSince >= hoursThreshold;
        if (!isDue) continue;

        const isOverdue = hoursSince === null
          ? false  // never done — show as 'due' not 'overdue' (first time)
          : hoursSince >= hoursThreshold + OVERDUE_GRACE_HOURS;

        tasks.push({
          task_key: `${batchId}-${protocol['protocol_id']}`,
          protocol_id: protocol['protocol_id'] as number,
          batch_id: batchId,
          batch_name: batch['batch_name'] as string | null,
          strain_name: batch['strain_name'] as string | null,
          sub_zone_id: batch['sub_zone_id'] as string | null,
          stage,
          days_in_stage: daysInStage,
          task_type: taskType,
          title: protocol['title'] as string,
          description: protocol['description'] as string | null,
          frequency_days: frequencyDays,
          last_performed_at: lastPerformedAt,
          hours_since: hoursSince != null ? Math.round(hoursSince) : null,
          urgency: isOverdue ? 'overdue' : 'due',
          action_path: actionPath(taskType, batchId),
        });
      }
    }

    // Sort: overdue first, then due; within each group sort by batch name
    tasks.sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === 'overdue' ? -1 : 1;
      return (a.batch_name ?? '').localeCompare(b.batch_name ?? '');
    });

    return reply.send(tasks);
  });

  /**
   * GET /protocols — list all stage protocols (read-only for now).
   */
  app.get('/protocols', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const protocols = db.prepare(`
      SELECT * FROM cv_stage_protocols ORDER BY stage, order_index
    `).all();
    return reply.send(protocols);
  });
};

export default tasksRoutes;
