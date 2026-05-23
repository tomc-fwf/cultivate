import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../../db/index.js';
import { requireAuth, requireAdmin, requireRole } from '../middleware/auth.middleware.js';

const RECIPE_NAMES = ['BASE', 'SEEDLING', 'AUTO-VEG', 'AUTO-FLOWER', 'PHOTO-VEG', 'PHOTO-FLOWER', 'FLUSH'] as const;
type RecipeName = (typeof RECIPE_NAMES)[number];

interface IdParams { id: string }
interface NameParams { name: string }

const IngredientSchema = z.object({
  input_id: z.number().int().positive(),
  rate_value: z.number().positive(),
  rate_unit: z.string().min(1),
  order_index: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
});

const RecipeCreateSchema = z.object({
  name: z.enum(RECIPE_NAMES),
  ec_target_low: z.number().nullable().optional(),
  ec_target_high: z.number().nullable().optional(),
  ph_target_low: z.number().nullable().optional(),
  ph_target_high: z.number().nullable().optional(),
  mixing_order: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ingredients: z.array(IngredientSchema).min(1, 'At least one ingredient is required'),
});

const RecipeVersionSchema = z.object({
  ec_target_low: z.number().nullable().optional(),
  ec_target_high: z.number().nullable().optional(),
  ph_target_low: z.number().nullable().optional(),
  ph_target_high: z.number().nullable().optional(),
  mixing_order: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ingredients: z.array(IngredientSchema).min(1, 'At least one ingredient is required'),
});

type RecipeCreateBody = z.infer<typeof RecipeCreateSchema>;
type RecipeVersionBody = z.infer<typeof RecipeVersionSchema>;

/**
 * Increment version string: "1.0" → "1.1", "1.9" → "1.10", "2.0" → "2.1"
 */
function nextVersion(v: string): string {
  const parts = v.split('.');
  const major = parseInt(parts[0] ?? '1', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  return `${major}.${minor + 1}`;
}

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

const fertigationRecipesRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET / — list active recipe for each of the 7 fixed names.
   * Returns all 7 slots; entries without a recipe show name + null recipe fields.
   */
  app.get('/', { preHandler: requireAuth }, async (_request, reply) => {
    const db = getDB();

    const activeRecipes = db
      .prepare(
        `SELECT r.*,
                (SELECT COUNT(*) FROM cv_fertigation_recipe_ingredients i WHERE i.recipe_id = r.recipe_id) AS ingredient_count,
                (SELECT COUNT(*) FROM cv_fertigation_recipes r2 WHERE r2.name = r.name) AS version_count
         FROM cv_fertigation_recipes r
         WHERE r.active = 1
         ORDER BY r.name`,
      )
      .all() as Record<string, unknown>[];

    const byName = new Map(activeRecipes.map((r) => [r['name'] as string, r]));

    const result = RECIPE_NAMES.map((name) => {
      const recipe = byName.get(name);
      if (recipe) return recipe;
      return { name, active: null, recipe_id: null };
    });

    return reply.send(result);
  });

  /**
   * GET /by-name/:name — active recipe for a given name, with ingredients.
   */
  app.get<{ Params: NameParams }>(
    '/by-name/:name',
    { preHandler: requireAuth },
    async (request, reply) => {
      const name = request.params.name.toUpperCase();
      if (!RECIPE_NAMES.includes(name as RecipeName)) {
        return reply.code(400).send({ error: `Invalid recipe name. Must be one of: ${RECIPE_NAMES.join(', ')}` });
      }

      const db = getDB();
      const recipe = db
        .prepare('SELECT * FROM cv_fertigation_recipes WHERE name=? AND active=1')
        .get(name) as Record<string, unknown> | undefined;

      if (!recipe) return reply.code(404).send({ error: `No active recipe for ${name}` });

      const ingredients = db
        .prepare(
          'SELECT * FROM cv_fertigation_recipe_ingredients WHERE recipe_id=? ORDER BY order_index',
        )
        .all(recipe['recipe_id']) as Array<Record<string, unknown>>;

      const nameMap = await fetchItemNames(ingredients.map((i) => i['input_id'] as number));
      const enriched = ingredients.map((i) => ({
        ...i,
        item_name: nameMap.get(i['input_id'] as number) ?? null,
      }));

      return reply.send({ ...recipe, ingredients: enriched });
    },
  );

  /**
   * GET /:id — single recipe with ingredients and version history.
   */
  app.get<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const db = getDB();
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid recipe id' });

      const recipe = db
        .prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id=?')
        .get(id) as Record<string, unknown> | undefined;

      if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });

      const ingredients = db
        .prepare(
          'SELECT * FROM cv_fertigation_recipe_ingredients WHERE recipe_id=? ORDER BY order_index',
        )
        .all(id) as Array<Record<string, unknown>>;

      const nameMap = await fetchItemNames(ingredients.map((i) => i['input_id'] as number));
      const enriched = ingredients.map((i) => ({
        ...i,
        item_name: nameMap.get(i['input_id'] as number) ?? null,
      }));

      const versionHistory = db
        .prepare(
          `SELECT r.recipe_id, r.version, r.active, r.created_at, r.approved_at, r.superseded_at,
                  u.name as created_by_name
           FROM cv_fertigation_recipes r
           LEFT JOIN cv_users u ON u.id = r.created_by
           WHERE r.name = ?
           ORDER BY r.created_at DESC`,
        )
        .all(recipe['name'] as string) as Array<Record<string, unknown>>;

      return reply.send({ ...recipe, ingredients: enriched, version_history: versionHistory });
    },
  );

  /**
   * POST / — create first version of a recipe for a name.
   * Returns 409 if an active recipe already exists for that name (use /version instead).
   */
  app.post<{ Body: RecipeCreateBody }>(
    '/',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      let body: RecipeCreateBody;
      try {
        body = RecipeCreateSchema.parse(request.body);
      } catch (err: unknown) {
        const issues = err instanceof z.ZodError ? err.issues : undefined;
        return reply.code(400).send({ error: 'Validation failed', issues });
      }
      const { name, ec_target_low, ec_target_high, ph_target_low, ph_target_high, mixing_order, notes, ingredients } = body;

      const db = getDB();
      const existing = db
        .prepare('SELECT recipe_id FROM cv_fertigation_recipes WHERE name=? AND active=1')
        .get(name);
      if (existing) {
        return reply.code(409).send({
          error: `An active recipe for ${name} already exists. Use POST /:id/version to create a new version.`,
        });
      }

      const now = new Date().toISOString();
      const userId = request.user.id;

      const r = db
        .prepare(
          `INSERT INTO cv_fertigation_recipes
             (name, version, active, ec_target_low, ec_target_high, ph_target_low, ph_target_high,
              mixing_order, notes, approved_by, approved_at, created_by, created_at)
           VALUES (?, '1.0', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          name,
          ec_target_low ?? null,
          ec_target_high ?? null,
          ph_target_low ?? null,
          ph_target_high ?? null,
          mixing_order ?? null,
          notes ?? null,
          userId,
          now,
          userId,
          now,
        );

      const recipeId = Number(r.lastInsertRowid);

      const insertIngredient = db.prepare(
        `INSERT INTO cv_fertigation_recipe_ingredients
           (recipe_id, input_id, rate_value, rate_unit, order_index, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const ing of ingredients) {
        insertIngredient.run(recipeId, ing.input_id, ing.rate_value, ing.rate_unit, ing.order_index, ing.notes ?? null, now);
      }

      return reply.code(201).send({ recipe_id: recipeId });
    },
  );

  /**
   * POST /:id/version — create new version, superseding the given recipe_id.
   */
  app.post<{ Params: IdParams; Body: RecipeVersionBody }>(
    '/:id/version',
    { preHandler: requireRole('supervisor') },
    async (request, reply) => {
      const db = getDB();
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid recipe id' });

      let body: RecipeVersionBody;
      try {
        body = RecipeVersionSchema.parse(request.body);
      } catch (err: unknown) {
        const issues = err instanceof z.ZodError ? err.issues : undefined;
        return reply.code(400).send({ error: 'Validation failed', issues });
      }
      const { ec_target_low, ec_target_high, ph_target_low, ph_target_high, mixing_order, notes, ingredients } = body;

      const existing = db
        .prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id=? AND active=1')
        .get(id) as Record<string, unknown> | undefined;

      if (!existing) {
        return reply.code(404).send({ error: 'Active recipe not found with that id' });
      }

      const newVersion = nextVersion(existing['version'] as string);
      const now = new Date().toISOString();
      const userId = request.user.id;

      const insertAndSupersede = db.transaction(() => {
        // Supersede the existing recipe
        db.prepare(
          "UPDATE cv_fertigation_recipes SET active=0, superseded_at=? WHERE recipe_id=?",
        ).run(now, id);

        // Insert the new version
        const r = db
          .prepare(
            `INSERT INTO cv_fertigation_recipes
               (name, version, active, ec_target_low, ec_target_high, ph_target_low, ph_target_high,
                mixing_order, notes, approved_by, approved_at, created_by, created_at)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            existing['name'] as string,
            newVersion,
            ec_target_low ?? null,
            ec_target_high ?? null,
            ph_target_low ?? null,
            ph_target_high ?? null,
            mixing_order ?? null,
            notes ?? null,
            userId,
            now,
            userId,
            now,
          );

        const newId = Number(r.lastInsertRowid);

        const insertIngredient = db.prepare(
          `INSERT INTO cv_fertigation_recipe_ingredients
             (recipe_id, input_id, rate_value, rate_unit, order_index, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const ing of ingredients) {
          insertIngredient.run(newId, ing.input_id, ing.rate_value, ing.rate_unit, ing.order_index, ing.notes ?? null, now);
        }

        return newId;
      });

      const newId = insertAndSupersede();
      return reply.code(201).send({ recipe_id: newId });
    },
  );

  /**
   * DELETE /:id — hard delete only if recipe has never been used in applications or batch stage records.
   * Requires admin role.
   */
  app.delete<{ Params: IdParams }>(
    '/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const db = getDB();
      const id = Number(request.params.id);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid recipe id' });

      const recipe = db
        .prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id=?')
        .get(id);
      if (!recipe) return reply.code(404).send({ error: 'Recipe not found' });

      const usedInApplications = (
        db
          .prepare('SELECT COUNT(*) as n FROM cv_applications_fertigation WHERE recipe_id=?')
          .get(id) as { n: number }
      ).n;
      if (usedInApplications > 0) {
        return reply.code(409).send({
          error: 'Cannot delete recipe: it has been used in fertigation applications. Immutability is required for compliance.',
        });
      }

      const usedInBatchStage = (
        db
          .prepare('SELECT COUNT(*) as n FROM cv_batch_stage_recipes WHERE recipe_id=?')
          .get(id) as { n: number }
      ).n;
      if (usedInBatchStage > 0) {
        return reply.code(409).send({
          error: 'Cannot delete recipe: it is referenced in batch stage records.',
        });
      }

      db.prepare('DELETE FROM cv_fertigation_recipe_ingredients WHERE recipe_id=?').run(id);
      db.prepare('DELETE FROM cv_fertigation_recipes WHERE recipe_id=?').run(id);

      return reply.code(204).send();
    },
  );
};

export default fertigationRecipesRoutes;
