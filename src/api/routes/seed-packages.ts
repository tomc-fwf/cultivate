import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

const CreateSeedPackageSchema = z.object({
  strain_id: z.number().int().positive(),
  lot_number: z.string().min(1),
  package_name: z.string().nullable().optional(),
  metrc_package_id: z.string().nullable().optional(),
  feminized: z.boolean().optional().default(false),
  season_year: z.number().int().optional(),
  supplier: z.string().nullable().optional(),
  source_detail: z.string().nullable().optional(),
  received_date: z.string().nullable().optional(),
  seed_count_initial: z.number().int().positive(),
  weight_g_initial: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  location_id: z.number().int().positive().nullable().optional(),
});

const UpdateSeedPackageSchema = z.object({
  package_name: z.string().nullable().optional(),
  metrc_package_id: z.string().nullable().optional(),
  lot_number: z.string().min(1).optional(),
  feminized: z.boolean().optional(),
  season_year: z.number().int().nullable().optional(),
  supplier: z.string().nullable().optional(),
  source_detail: z.string().nullable().optional(),
  received_date: z.string().nullable().optional(),
  seed_count_remaining: z.number().int().min(0).optional(),
  weight_g_initial: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const seedPackagesRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET / — list all seed packages, joined with strain info.
   * Optional query: season_year (number) — filter by season year.
   */
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as Record<string, string>;
    const db = getDB();

    let sql = `
      SELECT
        sp.package_id,
        sp.package_name,
        sp.metrc_package_id,
        sp.lot_number,
        sp.strain_id,
        s.name  AS strain_name,
        s.type  AS strain_type,
        sp.supplier,
        sp.source_detail,
        sp.received_date,
        sp.season_year,
        sp.feminized,
        sp.seed_count_initial,
        sp.seed_count_remaining,
        sp.weight_g_initial,
        sp.notes,
        sp.active,
        sp.created_at
      FROM cv_seed_packages sp
      JOIN cv_strains s ON s.strain_id = sp.strain_id
    `;

    const params: unknown[] = [];

    if (query.season_year) {
      const year = Number(query.season_year);
      if (!isNaN(year)) {
        sql += ' WHERE sp.season_year = ?';
        params.push(year);
      }
    }

    sql += ' ORDER BY sp.created_at DESC';

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

    return reply.send(rows.map(r => ({
      ...r,
      feminized: r.feminized === 1 || r.feminized === true,
      active: r.active === 1 || r.active === true,
    })));
  });

  /**
   * GET /:id — get a single seed package.
   */
  app.get<{ Params: IdParams }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid package id' });

    const db = getDB();
    const row = db.prepare(`
      SELECT
        sp.package_id,
        sp.package_name,
        sp.metrc_package_id,
        sp.lot_number,
        sp.strain_id,
        s.name  AS strain_name,
        s.type  AS strain_type,
        sp.supplier,
        sp.source_detail,
        sp.received_date,
        sp.season_year,
        sp.feminized,
        sp.seed_count_initial,
        sp.seed_count_remaining,
        sp.weight_g_initial,
        sp.notes,
        sp.active,
        sp.created_at
      FROM cv_seed_packages sp
      JOIN cv_strains s ON s.strain_id = sp.strain_id
      WHERE sp.package_id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!row) return reply.code(404).send({ error: 'Seed package not found' });

    return reply.send({
      ...row,
      feminized: row.feminized === 1 || row.feminized === true,
      active: row.active === 1 || row.active === true,
    });
  });

  /**
   * POST / — create a new seed package. Requires supervisor role.
   */
  app.post(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      let parsed: z.infer<typeof CreateSeedPackageSchema>;
      try {
        parsed = CreateSeedPackageSchema.parse(request.body);
      } catch (err: unknown) {
        const issues = err instanceof z.ZodError ? err.issues : undefined;
        return reply.code(400).send({ error: 'Validation failed', issues });
      }

      const db = getDB();
      const now = new Date().toISOString();
      const userId = request.user.id;

      const r = db.prepare(`
        INSERT INTO cv_seed_packages (
          strain_id, location_id, lot_number, package_name, metrc_package_id,
          feminized, season_year, supplier, source_detail, received_date,
          seed_count_initial, seed_count_remaining, weight_g_initial,
          notes, active, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        parsed.strain_id,
        parsed.location_id ?? null,
        parsed.lot_number.trim(),
        parsed.package_name ?? null,
        parsed.metrc_package_id ?? null,
        parsed.feminized ? 1 : 0,
        parsed.season_year ?? null,
        parsed.supplier ?? null,
        parsed.source_detail ?? null,
        parsed.received_date ?? null,
        parsed.seed_count_initial,
        parsed.seed_count_initial,
        parsed.weight_g_initial ?? null,
        parsed.notes ?? null,
        now,
        userId,
      );

      const row = db.prepare(`
        SELECT sp.*, s.name AS strain_name, s.type AS strain_type
        FROM cv_seed_packages sp
        JOIN cv_strains s ON s.strain_id = sp.strain_id
        WHERE sp.package_id = ?
      `).get(Number(r.lastInsertRowid)) as Record<string, unknown>;

      return reply.code(201).send({
        ...row,
        feminized: row.feminized === 1 || row.feminized === true,
        active: row.active === 1 || row.active === true,
      });
    },
  );

  /**
   * PATCH /:id — update a seed package. Requires supervisor role.
   */
  app.patch<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid package id' });

      let parsed: z.infer<typeof UpdateSeedPackageSchema>;
      try {
        parsed = UpdateSeedPackageSchema.parse(request.body);
      } catch (err: unknown) {
        const issues = err instanceof z.ZodError ? err.issues : undefined;
        return reply.code(400).send({ error: 'Validation failed', issues });
      }

      const db = getDB();
      const existing = db.prepare('SELECT * FROM cv_seed_packages WHERE package_id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Seed package not found' });

      const fields: string[] = [];
      const values: unknown[] = [];

      const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };

      if (parsed.package_name !== undefined) add('package_name', parsed.package_name);
      if (parsed.metrc_package_id !== undefined) add('metrc_package_id', parsed.metrc_package_id);
      if (parsed.lot_number !== undefined) add('lot_number', parsed.lot_number.trim());
      if (parsed.feminized !== undefined) add('feminized', parsed.feminized ? 1 : 0);
      if (parsed.season_year !== undefined) add('season_year', parsed.season_year);
      if (parsed.supplier !== undefined) add('supplier', parsed.supplier);
      if (parsed.source_detail !== undefined) add('source_detail', parsed.source_detail);
      if (parsed.received_date !== undefined) add('received_date', parsed.received_date);
      if (parsed.seed_count_remaining !== undefined) add('seed_count_remaining', parsed.seed_count_remaining);
      if (parsed.weight_g_initial !== undefined) add('weight_g_initial', parsed.weight_g_initial);
      if (parsed.notes !== undefined) add('notes', parsed.notes);
      if (parsed.active !== undefined) add('active', parsed.active ? 1 : 0);

      if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });

      values.push(id);
      db.prepare(`UPDATE cv_seed_packages SET ${fields.join(', ')} WHERE package_id = ?`).run(...values);

      const row = db.prepare(`
        SELECT sp.*, s.name AS strain_name, s.type AS strain_type
        FROM cv_seed_packages sp
        JOIN cv_strains s ON s.strain_id = sp.strain_id
        WHERE sp.package_id = ?
      `).get(id) as Record<string, unknown>;

      return reply.send({
        ...row,
        feminized: row.feminized === 1 || row.feminized === true,
        active: row.active === 1 || row.active === true,
      });
    },
  );
};

export default seedPackagesRoutes;
