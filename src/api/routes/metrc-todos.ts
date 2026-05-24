import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

const metrcTodosRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/metrc-todos — list todos, optionally filtered by status or batch.
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const { status, batch_id } = request.query as { status?: string; batch_id?: string };
    const db = getDB();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (batch_id) { conditions.push('t.batch_id = ?'); params.push(Number(batch_id)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT t.*,
             b.name AS batch_name,
             s.name AS strain_name,
             u.name AS created_by_name,
             uc.name AS completed_by_name
      FROM cv_metrc_todos t
      JOIN cv_batches b ON b.batch_id = t.batch_id
      LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
      LEFT JOIN cv_users u ON u.id = t.created_by
      LEFT JOIN cv_users uc ON uc.id = t.completed_by
      ${where}
      ORDER BY t.created_at DESC
    `).all(...params) as Array<Record<string, unknown>>;

    return reply.send(rows);
  });

  /**
   * GET /api/metrc-todos/pending-count — fast count for badges.
   */
  app.get('/pending-count', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    try {
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM cv_metrc_todos WHERE status = 'pending'`
      ).get() as Record<string, unknown> | undefined;
      return reply.send({ count: Number(row?.['cnt'] ?? 0) });
    } catch {
      return reply.send({ count: 0 });
    }
  });

  /**
   * PATCH /api/metrc-todos/:id — mark a todo done or reopen it.
   */
  app.patch<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid todo id' });

      const result = z.object({
        status: z.enum(['pending', 'done']),
      }).safeParse(request.body);
      if (!result.success) return reply.code(400).send({ error: 'Validation failed', issues: result.error.issues });

      const db = getDB();
      const existing = db.prepare('SELECT * FROM cv_metrc_todos WHERE todo_id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Todo not found' });

      const now = new Date().toISOString();
      const userId = request.user.id;
      const { status } = result.data;

      db.prepare(`
        UPDATE cv_metrc_todos
        SET status = ?, completed_at = ?, completed_by = ?
        WHERE todo_id = ?
      `).run(status, status === 'done' ? now : null, status === 'done' ? userId : null, id);

      const updated = db.prepare(`
        SELECT t.*, b.name AS batch_name, s.name AS strain_name,
               u.name AS created_by_name, uc.name AS completed_by_name
        FROM cv_metrc_todos t
        JOIN cv_batches b ON b.batch_id = t.batch_id
        LEFT JOIN cv_strains s ON s.strain_id = b.strain_id
        LEFT JOIN cv_users u ON u.id = t.created_by
        LEFT JOIN cv_users uc ON uc.id = t.completed_by
        WHERE t.todo_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send(updated);
    }
  );
};

export default metrcTodosRoutes;
