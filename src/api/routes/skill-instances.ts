import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const skillInstancesRoutes: FastifyPluginAsync = async (app) => {

  /**
   * GET / — list skill instances (evidence of SOP compliance).
   *
   * Query params:
   *   skill_id     — filter by skill
   *   output_table — filter by output table (e.g. "cv_applications_pesticide")
   *   output_record_id — filter by specific output record
   *   limit        — max rows (default 50, max 200)
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const {
      skill_id,
      output_table,
      output_record_id,
      limit = '50',
    } = request.query as {
      skill_id?: string;
      output_table?: string;
      output_record_id?: string;
      limit?: string;
    };

    const db = getDB();
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
    const where: string[] = [];
    const params: unknown[] = [];

    if (skill_id) { where.push('si.skill_id = ?'); params.push(skill_id); }
    if (output_table) { where.push('si.output_table = ?'); params.push(output_table); }
    if (output_record_id) { where.push('si.output_record_id = ?'); params.push(output_record_id); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT
        si.*,
        u.name AS completed_by_name
      FROM cv_skill_instances si
      LEFT JOIN cv_users u ON u.id = si.completed_by
      ${whereClause}
      ORDER BY si.created_at DESC
      LIMIT ?
    `).all(...params, limitNum) as Array<Record<string, unknown>>;

    return reply.send(rows.map(r => ({
      ...r,
      context: r['context'] ? (() => { try { return JSON.parse(String(r['context'])); } catch { return r['context']; } })() : null,
      validation_result: r['validation_result'] ? (() => { try { return JSON.parse(String(r['validation_result'])); } catch { return r['validation_result']; } })() : null,
    })));
  });

};

export default skillInstancesRoutes;
