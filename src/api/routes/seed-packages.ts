import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

interface IdParams { id: string }

const SeedPackageQuerySchema = z.object({
  strain_id: z.coerce.number().int().positive().optional(),
  season_year: z.coerce.number().int().optional(),
  active: z.string().default('1'),
});

const CreateSeedPackageSchema = z.object({
  // Inline strain (preferred): provide name + type and the route auto-finds/creates the strain.
  strain_name: z.string().min(1).nullable().optional(),
  strain_type: z.enum(['auto', 'photo']).nullable().optional(),
  // Legacy / explicit: pass a strain_id directly (still accepted).
  strain_id: z.number().int().positive().nullable().optional(),
  location_id: z.number().int().positive().nullable().optional(),
  lot_number: z.string().nullable().optional(),
  package_name: z.string().nullable().optional(),
  metrc_package_id: z.string().nullable().optional(),
  feminized: z.boolean().optional().default(false),
  season_year: z.number().int().optional(),
  supplier: z.string().nullable().optional(),
  source_detail: z.string().nullable().optional(),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  seed_count_initial: z.number().int().positive().nullable().optional(),
  weight_g_initial: z.number().positive(),
  notes: z.string().nullable().optional(),
});
type CreateSeedPackageBody = z.infer<typeof CreateSeedPackageSchema>;

const UpdateSeedPackageSchema = z.object({
  package_name: z.string().nullable().optional(),
  metrc_package_id: z.string().nullable().optional(),
  lot_number: z.string().min(1).optional(),
  feminized: z.boolean().optional(),
  season_year: z.number().int().nullable().optional(),
  supplier: z.string().nullable().optional(),
  source_detail: z.string().nullable().optional(),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  seed_count_remaining: z.number().int().min(0).optional(),
  weight_g_initial: z.number().positive().nullable().optional(),
  weight_g_remaining: z.number().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.number().int().min(0).max(1).optional(),
});
type UpdateSeedPackageBody = z.infer<typeof UpdateSeedPackageSchema>;

const SEED_PACKAGE_SELECT = `
  SELECT sp.*, s.name AS strain_name, s.type AS strain_type
  FROM cv_seed_packages sp
  LEFT JOIN cv_strains s ON s.strain_id = sp.strain_id
`;

function normalizePkg(row: Record<string, unknown>) {
  return {
    ...row,
    feminized: row.feminized === 1 || row.feminized === true,
    active: row.active === 1 || row.active === true,
  };
}

const seedPackagesRoutes: FastifyPluginAsync = async (app) => {

  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = SeedPackageQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query parameters' });

    const { strain_id, season_year, active } = parsed.data;
    const db = getDB();

    const conditions: string[] = ['sp.active = ?'];
    const params: unknown[] = [active === '1' ? 1 : 0];

    if (strain_id != null) {
      conditions.push('sp.strain_id = ?');
      params.push(strain_id);
    }

    if (season_year != null) {
      conditions.push('sp.season_year = ?');
      params.push(season_year);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = db
      .prepare(`${SEED_PACKAGE_SELECT} ${where} ORDER BY sp.received_date DESC, sp.package_id DESC`)
      .all(...params) as Record<string, unknown>[];

    return reply.send(rows.map(normalizePkg));
  });

  app.get<{ Params: IdParams }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number(request.params.id);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid package id' });

    const db = getDB();
    const row = db.prepare(`${SEED_PACKAGE_SELECT} WHERE sp.package_id = ?`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return reply.code(404).send({ error: 'Seed package not found' });
    return reply.send(normalizePkg(row));
  });

  app.post<{ Body: CreateSeedPackageBody }>('/', { preHandler: requireAuth }, async (request, reply) => {
    let body: CreateSeedPackageBody;
    try { body = CreateSeedPackageSchema.parse(request.body); }
    catch (e: unknown) {
      if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
      throw e;
    }

    const db = getDB();

    // Resolve strain_id: explicit ID > inline name+type find-or-create > null
    let resolvedStrainId: number | null = body.strain_id != null ? Number(body.strain_id) : null;

    if (resolvedStrainId != null) {
      const strain = db.prepare('SELECT * FROM cv_strains WHERE strain_id = ? AND active = 1').get(resolvedStrainId);
      if (!strain) return reply.code(400).send({ error: 'strain_id does not exist or is not active' });
    } else if (body.strain_name) {
      const name = body.strain_name.trim();
      const type = body.strain_type ?? 'auto';
      const existing = db.prepare(
        "SELECT strain_id FROM cv_strains WHERE LOWER(name) = LOWER(?) AND type = ? AND active = 1"
      ).get(name, type) as { strain_id: number } | undefined;

      if (existing) {
        resolvedStrainId = existing.strain_id;
      } else {
        const now = new Date().toISOString();
        const ins = db.prepare(
          "INSERT INTO cv_strains (name, type, active, created_at) VALUES (?, ?, 1, ?)"
        ).run(name, type, now);
        resolvedStrainId = Number(ins.lastInsertRowid);
      }
    }

    if (body.location_id != null) {
      const loc = db.prepare('SELECT * FROM cv_locations WHERE location_id = ?').get(Number(body.location_id));
      if (!loc) return reply.code(400).send({ error: 'location_id does not exist' });
    }

    const now = new Date().toISOString();
    const userId = request.user.id;

    const r = db.prepare(`
      INSERT INTO cv_seed_packages
        (strain_id, location_id, lot_number, package_name, metrc_package_id,
         feminized, season_year, supplier, source_detail, received_date,
         seed_count_initial, seed_count_remaining, weight_g_initial, weight_g_remaining,
         notes, active, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      resolvedStrainId,
      body.location_id ?? null,
      body.lot_number?.trim() ?? null,
      body.package_name ?? null,
      body.metrc_package_id ?? null,
      body.feminized ? 1 : 0,
      body.season_year ?? null,
      body.supplier ?? null,
      body.source_detail ?? null,
      body.received_date ?? null,
      body.seed_count_initial != null ? Number(body.seed_count_initial) : null,
      body.seed_count_initial != null ? Number(body.seed_count_initial) : null,
      Number(body.weight_g_initial),
      Number(body.weight_g_initial),
      body.notes ?? null,
      now, userId,
    );

    const pkg = db.prepare(`${SEED_PACKAGE_SELECT} WHERE sp.package_id = ?`)
      .get(Number(r.lastInsertRowid)) as Record<string, unknown>;

    return reply.code(201).send(normalizePkg(pkg));
  });

  app.patch<{ Params: IdParams; Body: UpdateSeedPackageBody }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid package id' });

      const db = getDB();
      const existing = db.prepare('SELECT * FROM cv_seed_packages WHERE package_id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Seed package not found' });

      let body: UpdateSeedPackageBody;
      try { body = UpdateSeedPackageSchema.parse(request.body); }
      catch (e: unknown) {
        if (e instanceof z.ZodError) return reply.code(400).send({ error: 'Validation failed', issues: e.issues });
        throw e;
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if ('package_name' in body)        { updates.push('package_name = ?');        values.push(body.package_name ?? null); }
      if ('metrc_package_id' in body)     { updates.push('metrc_package_id = ?');     values.push(body.metrc_package_id ?? null); }
      if ('lot_number' in body)           { updates.push('lot_number = ?');           values.push((body.lot_number ?? '').trim()); }
      if ('feminized' in body)            { updates.push('feminized = ?');            values.push(body.feminized ? 1 : 0); }
      if ('season_year' in body)          { updates.push('season_year = ?');          values.push(body.season_year ?? null); }
      if ('supplier' in body)             { updates.push('supplier = ?');             values.push(body.supplier ?? null); }
      if ('source_detail' in body)        { updates.push('source_detail = ?');        values.push(body.source_detail ?? null); }
      if ('received_date' in body)        { updates.push('received_date = ?');        values.push(body.received_date ?? null); }
      if ('seed_count_remaining' in body) { updates.push('seed_count_remaining = ?'); values.push(body.seed_count_remaining); }
      if ('weight_g_initial' in body)     { updates.push('weight_g_initial = ?');     values.push(body.weight_g_initial ?? null); }
      if ('weight_g_remaining' in body)   { updates.push('weight_g_remaining = ?');   values.push(body.weight_g_remaining ?? null); }
      if ('notes' in body)                { updates.push('notes = ?');                values.push(body.notes ?? null); }
      if ('active' in body)               { updates.push('active = ?');               values.push(body.active); }

      if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' });

      values.push(id);

      db.prepare(`UPDATE cv_seed_packages SET ${updates.join(', ')} WHERE package_id = ?`).run(...values);

      const pkg = db.prepare(`${SEED_PACKAGE_SELECT} WHERE sp.package_id = ?`)
        .get(id) as Record<string, unknown>;

      return reply.send(normalizePkg(pkg));
    },
  );
};

export default seedPackagesRoutes;
