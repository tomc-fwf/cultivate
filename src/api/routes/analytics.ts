import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const analyticsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET /applicators — per-applicator application stats.
   * Query params:
   *   ?date_from=YYYY-MM-DD  — inclusive start
   *   ?date_to=YYYY-MM-DD    — inclusive end
   */
  app.get('/applicators', { preHandler: requireAuth }, async (request, reply) => {
    const { date_from, date_to } = request.query as {
      date_from?: string;
      date_to?: string;
    };

    const db = getDB();

    // Build optional date filter clauses.
    // Applied identically to each of the four source tables in the UNION ALL.
    const dateFromSql = date_from ? "AND applied_at >= ?" : '';
    const dateToSql   = date_to   ? "AND applied_at <= ?" : '';
    const dateParams: unknown[] = [];
    if (date_from) dateParams.push(date_from);
    if (date_to)   dateParams.push(date_to);

    // Each sub-query in the UNION ALL needs its own copy of the date params.
    const allParams: unknown[] = [
      ...dateParams, // fertigation
      ...dateParams, // foliar
      ...dateParams, // pesticide
      ...dateParams, // amendments
    ];

    const rows = db.prepare(`
      WITH all_apps AS (
        SELECT
          f.applicator,
          f.applied_at,
          'fertigation' AS app_type,
          CASE
            WHEN r.ec_target_low IS NOT NULL AND r.ec_target_high IS NOT NULL
            THEN ABS(f.ec_measured - (r.ec_target_low + r.ec_target_high) / 2.0)
            ELSE NULL
          END AS ec_deviation
        FROM cv_applications_fertigation f
        LEFT JOIN cv_fertigation_recipes r ON r.recipe_id = f.recipe_id
        WHERE f.applicator IS NOT NULL ${dateFromSql} ${dateToSql}

        UNION ALL

        SELECT applicator, applied_at, 'foliar' AS app_type, NULL AS ec_deviation
        FROM cv_applications_foliar
        WHERE applicator IS NOT NULL ${dateFromSql} ${dateToSql}

        UNION ALL

        SELECT applicator, applied_at, 'pesticide' AS app_type, NULL AS ec_deviation
        FROM cv_applications_pesticide
        WHERE applicator IS NOT NULL ${dateFromSql} ${dateToSql}

        UNION ALL

        SELECT applicator, applied_at, 'amendment' AS app_type, NULL AS ec_deviation
        FROM cv_container_amendments
        WHERE applicator IS NOT NULL ${dateFromSql} ${dateToSql}
      )
      SELECT
        a.applicator                                                              AS user_id,
        u.name                                                                    AS user_name,
        COUNT(*)                                                                  AS application_count,
        SUM(CASE WHEN a.app_type = 'pesticide'   THEN 1 ELSE 0 END)              AS pesticide_count,
        SUM(CASE WHEN a.app_type = 'fertigation' THEN 1 ELSE 0 END)              AS fertigation_count,
        AVG(CASE WHEN a.ec_deviation IS NOT NULL THEN a.ec_deviation ELSE NULL END) AS avg_ec_deviation,
        MIN(a.applied_at)                                                         AS first_application_at,
        MAX(a.applied_at)                                                         AS last_application_at
      FROM all_apps a
      LEFT JOIN cv_users u ON u.id = a.applicator
      GROUP BY a.applicator, u.name
      ORDER BY COUNT(*) DESC
    `).all(...allParams) as Array<Record<string, unknown>>;

    const result = rows.map(row => ({
      user_id:            row['user_id'],
      user_name:          row['user_name'] ?? 'Unknown',
      application_count:  Number(row['application_count']),
      pesticide_count:    Number(row['pesticide_count']),
      fertigation_count:  Number(row['fertigation_count']),
      avg_ec_deviation:   row['avg_ec_deviation'] != null ? Number((row['avg_ec_deviation'] as number).toFixed(3)) : null,
      date_range: {
        first: row['first_application_at'],
        last:  row['last_application_at'],
      },
    }));

    return reply.send(result);
  });
  /**
   * GET /pesticide-summary — annual pesticide use summary for license renewal.
   * Query params:
   *   ?year=YYYY  — 4-digit year (defaults to current year)
   *
   * Groups by input_id and returns per-product aggregates.
   */
  app.get('/pesticide-summary', { preHandler: requireAuth }, async (request, reply) => {
    const { year } = request.query as { year?: string };
    const db = getDB();

    // Default to current calendar year; validate format.
    const yearFilter = year && /^\d{4}$/.test(year) ? year : new Date().getFullYear().toString();

    const rows = db.prepare(`
      SELECT
        ap.input_id,
        -- Use snapshotted name (guaranteed 5-year retention); fall back to generic label.
        COALESCE(MAX(ap.product_name_snapshot), 'Product #' || ap.input_id)   AS product_name,
        MAX(ap.epa_reg_no_snapshot)                                            AS epa_reg_no,
        COUNT(*)                                                               AS application_count,
        SUM(ap.volume_applied)                                                 AS total_volume_applied,
        MAX(ap.volume_unit)                                                    AS volume_unit,
        MIN(ap.applied_at)                                                     AS first_applied_at,
        MAX(ap.applied_at)                                                     AS last_applied_at,
        COUNT(DISTINCT ap.batch_id)                                            AS unique_batches_count,
        GROUP_CONCAT(DISTINCT ap.target_pest)                                  AS target_pests_raw
      FROM cv_applications_pesticide ap
      WHERE strftime('%Y', ap.applied_at) = ?
      GROUP BY ap.input_id
      ORDER BY COUNT(*) DESC
    `).all(yearFilter) as Array<Record<string, unknown>>;

    const result = rows.map(row => ({
      input_id:             row['input_id'],
      product_name:         row['product_name'],
      epa_reg_no:           row['epa_reg_no'] ?? null,
      application_count:    Number(row['application_count']),
      total_volume_applied: row['total_volume_applied'] != null
        ? Number(Number(row['total_volume_applied']).toFixed(2))
        : null,
      volume_unit:          row['volume_unit'] ?? null,
      date_range: {
        first: row['first_applied_at'],
        last:  row['last_applied_at'],
      },
      unique_batches_count: Number(row['unique_batches_count']),
      // Deduplicate pests in JS (GROUP_CONCAT DISTINCT may retain duplicates with whitespace).
      target_pests: row['target_pests_raw']
        ? [...new Set(
            (row['target_pests_raw'] as string)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean),
          )]
        : [],
    }));

    return reply.send({ year: yearFilter, products: result });
  });

  /**
   * GET /annual-tracker — Gantt data: all batches overlapping the given year.
   * Query params:
   *   ?year=YYYY  — 4-digit year (defaults to current year)
   */
  app.get('/annual-tracker', { preHandler: requireAuth }, async (request, reply) => {
    const { year } = request.query as { year?: string };
    const db = getDB();

    const yearFilter = year && /^\d{4}$/.test(year) ? year : new Date().getFullYear().toString();
    const yearNum = parseInt(yearFilter, 10);
    const yearStart = `${yearNum}-01-01`;
    const yearEnd   = `${yearNum}-12-31`;

    // Include a batch if it started during the year, OR started before the year
    // and hasn't closed yet (or closed during or after year start).
    const rows = db.prepare(`
      SELECT
        b.batch_id,
        s.name   AS strain_name,
        s.type   AS strain_type,
        b.sub_zone_id,
        b.status,
        b.sow_date,
        b.closed_date,
        b.plant_count_initial,
        b.metrc_plant_batch_uid
      FROM cv_batches b
      JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.sub_zone_id IS NOT NULL
        AND (
          (b.sow_date >= ? AND b.sow_date <= ?)
          OR (b.sow_date < ? AND (b.closed_date IS NULL OR b.closed_date >= ?))
        )
      ORDER BY b.sub_zone_id, b.sow_date
    `).all(yearStart, yearEnd, yearStart, yearStart) as Array<Record<string, unknown>>;

    const batches = rows.map(row => ({
      batch_id:              row['batch_id'],
      strain_name:           row['strain_name'],
      strain_type:           row['strain_type'],
      sub_zone_id:           row['sub_zone_id'],
      status:                row['status'],
      sow_date:              row['sow_date'],
      closed_date:           row['closed_date'] ?? null,
      plant_count_initial:   Number(row['plant_count_initial']),
      metrc_plant_batch_uid: row['metrc_plant_batch_uid'] ?? null,
    }));

    return reply.send({ year: yearFilter, batches });
  });

  /**
   * GET /recipe-performance — yield correlation by recipe version.
   *
   * Joins batches that have final_harvest events back through
   * cv_batch_stage_recipes → cv_fertigation_recipes to compute
   * per-recipe-version yield aggregates.
   *
   * Only recipes with at least one associated final_harvest event are returned.
   */
  app.get('/recipe-performance', { preHandler: requireAuth }, async (request, reply) => {
    const db = getDB();

    const rows = db.prepare(`
      WITH batch_recipes AS (
        -- One row per (batch_id, recipe_id) with date range of use
        SELECT
          batch_id,
          recipe_id,
          MIN(effective_from) AS first_used_at,
          MAX(effective_from) AS last_used_at
        FROM cv_batch_stage_recipes
        GROUP BY batch_id, recipe_id
      ),
      harvest_totals AS (
        -- Aggregate final_harvest events per batch, converting all weights to grams
        SELECT
          he.batch_id,
          SUM(
            CASE he.weight_unit
              WHEN 'g'  THEN he.wet_weight
              WHEN 'oz' THEN he.wet_weight * 28.3495
              WHEN 'lb' THEN he.wet_weight * 453.592
              ELSE           he.wet_weight
            END
          ) AS weight_g,
          COUNT(*) AS final_harvest_count
        FROM cv_plant_harvest_events he
        WHERE he.event_type = 'final_harvest'
        GROUP BY he.batch_id
      )
      SELECT
        r.recipe_id,
        r.name                                                          AS recipe_name,
        r.version,
        COUNT(DISTINCT br.batch_id)                                     AS batches_used,
        SUM(ht.weight_g)                                               AS total_wet_weight_g,
        SUM(ht.final_harvest_count)                                    AS harvest_count,
        SUM(ht.weight_g) / NULLIF(SUM(b.plant_count_initial), 0)      AS avg_yield_per_plant_g,
        MIN(br.first_used_at)                                          AS first_used_at,
        MAX(br.last_used_at)                                           AS last_used_at
      FROM cv_fertigation_recipes r
      JOIN batch_recipes br ON br.recipe_id = r.recipe_id
      JOIN harvest_totals ht ON ht.batch_id = br.batch_id
      JOIN cv_batches b      ON b.batch_id  = br.batch_id
      GROUP BY r.recipe_id, r.name, r.version
      ORDER BY r.name, r.version
    `).all() as Array<Record<string, unknown>>;

    const result = rows.map(row => ({
      recipe_id:              row['recipe_id'],
      recipe_name:            row['recipe_name'],
      version:                row['version'],
      batches_used:           Number(row['batches_used']),
      total_wet_weight_g:     row['total_wet_weight_g'] != null
                                ? Number(Number(row['total_wet_weight_g']).toFixed(1))
                                : null,
      harvest_count:          Number(row['harvest_count']),
      avg_yield_per_plant_g:  row['avg_yield_per_plant_g'] != null
                                ? Number(Number(row['avg_yield_per_plant_g']).toFixed(1))
                                : null,
      date_range: {
        first: row['first_used_at'],
        last:  row['last_used_at'],
      },
    }));

    return reply.send(result);
  });

  /**
   * GET /compare — cross-batch comparison metrics.
   * Query params:
   *   ?batch_ids=1,2,3,4  — comma-separated batch IDs (max 6)
   */
  app.get('/compare', { preHandler: requireAuth }, async (request, reply) => {
    const { batch_ids } = request.query as { batch_ids?: string };
    const db = getDB();

    if (!batch_ids || !batch_ids.trim()) {
      return reply.status(400).send({ error: 'batch_ids query param is required' });
    }

    const ids = batch_ids
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      return reply.status(400).send({ error: 'No valid batch IDs provided' });
    }
    if (ids.length > 6) {
      return reply.status(400).send({ error: 'Maximum 6 batches can be compared at once' });
    }

    const placeholders = ids.map(() => '?').join(', ');

    // Batch core info + basic metrics in one query
    const batchRows = db.prepare(`
      SELECT
        b.batch_id,
        s.name                                  AS strain_name,
        b.sub_zone_id,
        b.sow_date,
        b.closed_date,
        b.status,
        b.plant_count_initial,
        -- days_to_harvest: NULL when not yet closed
        CASE
          WHEN b.closed_date IS NOT NULL AND b.sow_date IS NOT NULL
          THEN CAST(julianday(b.closed_date) - julianday(b.sow_date) AS INTEGER)
          ELSE NULL
        END AS days_to_harvest,
        -- total_yield_g: sum of final_harvest wet weights, normalized to grams
        (
          SELECT COALESCE(SUM(
            CASE he.weight_unit
              WHEN 'g'  THEN he.wet_weight
              WHEN 'oz' THEN he.wet_weight * 28.3495
              WHEN 'lb' THEN he.wet_weight * 453.592
              ELSE           he.wet_weight
            END
          ), 0)
          FROM cv_plant_harvest_events he
          WHERE he.batch_id = b.batch_id
            AND he.event_type = 'final_harvest'
        ) AS total_yield_g,
        -- plant_loss_count
        (
          SELECT COUNT(*)
          FROM cv_plant_loss_events pl
          WHERE pl.batch_id = b.batch_id
        ) AS plant_loss_count,
        -- pesticide_application_count
        (
          SELECT COUNT(*)
          FROM cv_applications_pesticide ap
          WHERE ap.batch_id = b.batch_id
        ) AS pesticide_application_count,
        -- fertigation_count
        (
          SELECT COUNT(*)
          FROM cv_applications_fertigation af
          WHERE af.batch_id = b.batch_id
        ) AS fertigation_count
      FROM cv_batches b
      JOIN cv_strains s ON s.strain_id = b.strain_id
      WHERE b.batch_id IN (${placeholders})
    `).all(...ids) as Array<Record<string, unknown>>;

    // EC deviation per batch: mean absolute deviation of measured EC from recipe midpoint
    const ecRows = db.prepare(`
      SELECT
        f.batch_id,
        AVG(ABS(f.ec_measured - (r.ec_target_low + r.ec_target_high) / 2.0)) AS avg_ec_deviation
      FROM cv_applications_fertigation f
      LEFT JOIN cv_fertigation_recipes r ON r.recipe_id = f.recipe_id
      WHERE f.batch_id IN (${placeholders})
        AND f.ec_measured IS NOT NULL
        AND r.ec_target_low IS NOT NULL
        AND r.ec_target_high IS NOT NULL
      GROUP BY f.batch_id
    `).all(...ids) as Array<Record<string, unknown>>;

    const ecByBatch: Record<number, number | null> = {};
    for (const row of ecRows) {
      ecByBatch[row['batch_id'] as number] =
        row['avg_ec_deviation'] != null ? Number((row['avg_ec_deviation'] as number).toFixed(3)) : null;
    }

    const result = batchRows.map(row => {
      const batchId        = row['batch_id'] as number;
      const plantCount     = Number(row['plant_count_initial']) || 0;
      const totalYieldG    = Number(row['total_yield_g']) || 0;
      const lossCount      = Number(row['plant_loss_count']) || 0;

      return {
        batch_id:                    batchId,
        strain_name:                 row['strain_name'],
        sub_zone_id:                 row['sub_zone_id'],
        sow_date:                    row['sow_date'],
        status:                      row['status'],
        days_to_harvest:             row['days_to_harvest'] != null ? Number(row['days_to_harvest']) : null,
        total_yield_g:               Number(totalYieldG.toFixed(1)),
        avg_yield_per_plant_g:       plantCount > 0 ? Number((totalYieldG / plantCount).toFixed(1)) : null,
        plant_loss_rate:             plantCount > 0 ? Number((lossCount / plantCount).toFixed(4)) : null,
        pesticide_application_count: Number(row['pesticide_application_count']),
        avg_ec_deviation:            ecByBatch[batchId] ?? null,
        fertigation_count:           Number(row['fertigation_count']),
      };
    });

    // Preserve input order
    result.sort((a, b) => ids.indexOf(a.batch_id) - ids.indexOf(b.batch_id));

    return reply.send(result);
  });

  /**
   * GET /batch/:batchId/ec-ph — EC and pH time-series for a batch.
   *
   * Returns one row per fertigation application ordered by applied_at ASC,
   * including the recipe's target ranges for the chart's reference band.
   */
  app.get('/batch/:batchId/ec-ph', { preHandler: requireAuth }, async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const id = parseInt(batchId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(400).send({ error: 'Invalid batch ID' });
    }

    const db = getDB();

    const rows = db.prepare(`
      SELECT
        fa.applied_at,
        fa.ec_measured,
        fa.ph_measured,
        fa.volume_gallons,
        fr.ec_target_low,
        fr.ec_target_high,
        fr.ph_target_low,
        fr.ph_target_high,
        fr.name    AS recipe_name,
        fr.version AS recipe_version
      FROM cv_applications_fertigation fa
      LEFT JOIN cv_fertigation_recipes fr ON fr.recipe_id = fa.recipe_id
      WHERE fa.batch_id = ?
      ORDER BY fa.applied_at ASC
    `).all(id) as Array<Record<string, unknown>>;

    const result = rows.map(row => ({
      applied_at:      row['applied_at'],
      ec_measured:     row['ec_measured'] != null ? Number(row['ec_measured']) : null,
      ph_measured:     row['ph_measured'] != null ? Number(row['ph_measured']) : null,
      volume_gallons:  row['volume_gallons'] != null ? Number(row['volume_gallons']) : null,
      ec_target_low:   row['ec_target_low']  != null ? Number(row['ec_target_low'])  : null,
      ec_target_high:  row['ec_target_high'] != null ? Number(row['ec_target_high']) : null,
      ph_target_low:   row['ph_target_low']  != null ? Number(row['ph_target_low'])  : null,
      ph_target_high:  row['ph_target_high'] != null ? Number(row['ph_target_high']) : null,
      recipe_name:     row['recipe_name']    ?? null,
      recipe_version:  row['recipe_version'] ?? null,
    }));

    return reply.send(result);
  });

};

export default analyticsRoutes;
