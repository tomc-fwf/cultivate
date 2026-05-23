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
};

export default analyticsRoutes;
