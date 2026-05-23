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

};

export default analyticsRoutes;
