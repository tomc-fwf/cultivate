import { FastifyPluginAsync } from 'fastify';
import { getDB } from '../../db/index.js';
import { requireAuth, requireAdmin, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

interface StrainBody {
  name: string;
  type: 'auto' | 'photo';
  genetics?: string | null;
  notes?: string | null;
}

const strainsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET / — list all active strains with batch count (non-closed batches).
   */
  app.get('/', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();
    const strains = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM cv_batches b WHERE b.strain_id = s.strain_id AND b.status != 'closed') AS batch_count
      FROM cv_strains s
      WHERE s.active = 1
      ORDER BY s.name
    `).all() as Record<string, unknown>[];
    return reply.send(strains);
  });

  /**
   * POST / — create a new strain. Requires supervisor role.
   */
  app.post<{ Body: StrainBody }>(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const { name, type, genetics, notes } = request.body as StrainBody;

      if (!name || !name.trim()) {
        return reply.code(400).send({ error: 'name is required' });
      }
      if (!type || !['auto', 'photo'].includes(type)) {
        return reply.code(400).send({ error: 'type must be "auto" or "photo"' });
      }

      const db = getDB();
      const now = new Date().toISOString();
      const userId = request.user.id;

      const r = db.prepare(`
        INSERT INTO cv_strains (name, type, genetics, notes, active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(name.trim(), type, genetics ?? null, notes ?? null, userId, now, now);

      const strain = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ?').get(Number(r.lastInsertRowid));
      return reply.code(201).send(strain);
    },
  );

  /**
   * PUT /:id — update a strain. Requires supervisor role.
   */
  app.put<{ Params: IdParams; Body: StrainBody }>(
    '/:id',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid strain id' });

      const { name, type, genetics, notes } = request.body as StrainBody;

      if (!name || !name.trim()) {
        return reply.code(400).send({ error: 'name is required' });
      }
      if (!type || !['auto', 'photo'].includes(type)) {
        return reply.code(400).send({ error: 'type must be "auto" or "photo"' });
      }

      const db = getDB();
      const existing = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) return reply.code(404).send({ error: 'Strain not found' });

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE cv_strains SET name = ?, type = ?, genetics = ?, notes = ?, updated_at = ?
        WHERE strain_id = ?
      `).run(name.trim(), type, genetics ?? null, notes ?? null, now, id);

      const strain = db.prepare(`
        SELECT s.*,
               (SELECT COUNT(*) FROM cv_batches b WHERE b.strain_id = s.strain_id AND b.status != 'closed') AS batch_count
        FROM cv_strains s WHERE s.strain_id = ?
      `).get(id);
      return reply.send(strain);
    },
  );

  /**
   * DELETE /:id — deactivate or hard-delete a strain. Requires admin role.
   * Hard-deletes if never used; soft-deletes (active=0) if batches reference it.
   */
  app.delete<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid strain id' });

      const db = getDB();
      const existing = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Strain not found' });

      const batchCount = (
        db.prepare('SELECT COUNT(*) as n FROM cv_batches WHERE strain_id = ?').get(id) as { n: number }
      ).n;

      if (batchCount > 0) {
        // Soft delete — batches reference this strain
        const now = new Date().toISOString();
        db.prepare('UPDATE cv_strains SET active = 0, updated_at = ? WHERE strain_id = ?').run(now, id);
        return reply.send({ success: true, action: 'deactivated' });
      } else {
        // Hard delete — never used
        db.prepare('DELETE FROM cv_strains WHERE strain_id = ?').run(id);
        return reply.send({ success: true, action: 'deleted' });
      }
    },
  );
};

export default strainsRoutes;
