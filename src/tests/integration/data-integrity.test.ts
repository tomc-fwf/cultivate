import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain,
  createTestBatch,
  createHarvestBatch,
  putContainerActive,
  putContainerStartup,
} from '../helpers/fixtures.js';

// ─── 1. Batch-container relationship integrity ────────────────────────────────

describe('Batch-container relationship — cross-table consistency', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('container_state.current_batch_id matches batch_id of its active assignment', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const state = ctx.db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL').get('Z1-30-R01-C001') as Record<string, unknown>;

    expect(state.current_batch_id).toBe(b.batch_id);
    expect(assignment.batch_id).toBe(b.batch_id);
    expect(state.current_batch_id).toBe(assignment.batch_id);
  });

  it('active container has at least one active assignment in cv_plant_assignments', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const { n } = ctx.db.prepare(
      'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL'
    ).get('Z1-30-R01-C001') as { n: number };
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('container in empty state retains current_batch_id (plant lost but batch still active)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id, container_id: 'Z1-30-R01-C001',
        plant_assignment_id: a1, loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });

    const state = ctx.db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('empty');
    expect(state.current_batch_id).toBe(b.batch_id);
  });

  it('container in teardown state retains current_batch_id', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });

    const state = ctx.db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('teardown');
    expect(state.current_batch_id).toBe(b.batch_id);
  });

  it('container in ready state has current_batch_id IS NULL', async () => {
    const startupId = putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    await ctx.app.inject({
      method: 'POST', url: `/api/containers/Z1-30-R01-C001/startup/${startupId}/ready`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });

    const state = ctx.db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('ready');
    expect(state.current_batch_id).toBeNull();
  });
});

// ─── 2. Recipe versioning integrity ──────────────────────────────────────────

describe('Recipe versioning — at most one active version per name', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  const baseIngredients = [{ input_id: 1, rate_value: 0.5, rate_unit: 'tsp_per_gal', order_index: 1 }];

  it('API rejects creating a second active fertigation recipe for the same name (409)', async () => {
    const payload = { name: 'BASE', ingredients: baseIngredients };

    await ctx.app.inject({
      method: 'POST', url: '/api/recipes/fertigation',
      headers: authHeader(ctx.app, 'supervisor'),
      payload,
    });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/recipes/fertigation',
      headers: authHeader(ctx.app, 'supervisor'),
      payload,
    });
    expect(res.statusCode).toBe(409);
  });

  it('after new version is created, old recipe has active=0 and superseded_at set', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST', url: '/api/recipes/fertigation',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { name: 'BASE', ingredients: baseIngredients },
    });
    const recipeId = JSON.parse(createRes.body).recipe_id as number;

    await ctx.app.inject({
      method: 'POST', url: `/api/recipes/fertigation/${recipeId}/version`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { ingredients: [{ input_id: 1, rate_value: 0.75, rate_unit: 'tsp_per_gal', order_index: 1 }] },
    });

    const old = ctx.db.prepare('SELECT * FROM cv_fertigation_recipes WHERE recipe_id = ?').get(recipeId) as Record<string, unknown>;
    expect(old.active).toBe(0);
    expect(old.superseded_at).not.toBeNull();
  });

  it('at most one active fertigation recipe per name after versioning', async () => {
    const createRes = await ctx.app.inject({
      method: 'POST', url: '/api/recipes/fertigation',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { name: 'SEEDLING', ingredients: baseIngredients },
    });
    const recipeId = JSON.parse(createRes.body).recipe_id as number;

    await ctx.app.inject({
      method: 'POST', url: `/api/recipes/fertigation/${recipeId}/version`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { ingredients: [{ input_id: 1, rate_value: 0.75, rate_unit: 'tsp_per_gal', order_index: 1 }] },
    });

    const { n } = ctx.db.prepare(
      "SELECT COUNT(*) AS n FROM cv_fertigation_recipes WHERE name = 'SEEDLING' AND active = 1"
    ).get() as { n: number };
    expect(n).toBe(1);
  });

  it('batch_stage_recipes has at most one NULL effective_to per batch after reassignment', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const now = new Date().toISOString();

    const r1 = ctx.db.prepare(
      "INSERT INTO cv_fertigation_recipes (name, version, active, approved_by, approved_at, created_by, created_at) VALUES ('BASE', '1.0', 1, 1, ?, 1, ?)"
    ).run(now, now);
    const r2 = ctx.db.prepare(
      "INSERT INTO cv_fertigation_recipes (name, version, active, approved_by, approved_at, created_by, created_at) VALUES ('FLUSH', '1.0', 1, 1, ?, 1, ?)"
    ).run(now, now);

    await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/recipe`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { recipe_id: Number(r1.lastInsertRowid) },
    });

    await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/recipe`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { recipe_id: Number(r2.lastInsertRowid) },
    });

    const { n } = ctx.db.prepare(
      'SELECT COUNT(*) AS n FROM cv_batch_stage_recipes WHERE batch_id = ? AND effective_to IS NULL'
    ).get(b.batch_id) as { n: number };
    expect(n).toBe(1);
  });

  it('recipe ingredient rows reference a valid recipe_id (FK integrity)', () => {
    const now = new Date().toISOString();
    const r = ctx.db.prepare(
      "INSERT INTO cv_fertigation_recipes (name, version, active, approved_by, approved_at, created_by, created_at) VALUES ('AUTO-VEG', '1.0', 1, 1, ?, 1, ?)"
    ).run(now, now);
    const recipeId = Number(r.lastInsertRowid);

    ctx.db.prepare(
      'INSERT INTO cv_fertigation_recipe_ingredients (recipe_id, input_id, rate_value, rate_unit, order_index, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(recipeId, 42, 0.5, 'tsp_per_gal', 1, now);

    const ing = ctx.db.prepare('SELECT * FROM cv_fertigation_recipe_ingredients WHERE recipe_id = ?').get(recipeId) as Record<string, unknown>;
    expect(ing).toBeDefined();
    expect(ing.recipe_id).toBe(recipeId);

    // The recipe still exists — ingredient FK is intact
    const recipe = ctx.db.prepare('SELECT recipe_id FROM cv_fertigation_recipes WHERE recipe_id = ?').get(recipeId) as Record<string, unknown> | undefined;
    expect(recipe).toBeDefined();
  });
});

// ─── 3. Plant assignment integrity ────────────────────────────────────────────

describe('Plant assignment integrity', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('after plant loss, terminated assignment has unassigned_at set', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id, container_id: 'Z1-30-R01-C001',
        plant_assignment_id: a1, loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });

    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(a1) as Record<string, unknown>;
    expect(assignment.unassigned_at).not.toBeNull();
    expect(assignment.unassign_reason).not.toBeNull();
  });

  it('after final harvest, terminated assignment has unassigned_at with reason harvested', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(a1) as Record<string, unknown>;
    expect(assignment.unassigned_at).not.toBeNull();
    expect(assignment.unassign_reason).toBe('harvested');
  });

  it('newly placed assignment (fixture) has metrc_plant_tag IS NULL', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId) as Record<string, unknown>;
    expect(assignment.metrc_plant_tag).toBeNull();
  });

  it('after METRC tag assignment, tagged_at and metrc_plant_tag are both set', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const validTag = 'A'.repeat(24);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-30-R01-C001', metrc_plant_tag: validTag },
    });
    expect(res.statusCode).toBe(201);

    const assignment = ctx.db.prepare(
      'SELECT * FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL'
    ).get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(assignment.metrc_plant_tag).toBe(validTag);
    expect(assignment.tagged_at).not.toBeNull();
  });

  it('no two active assignments share the same metrc_plant_tag (DB state after duplicate rejected)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    putContainerActive(ctx.db, 'Z1-30-R01-C002', b.batch_id);

    const tag = 'B'.repeat(24);

    await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-30-R01-C001', metrc_plant_tag: tag },
    });

    // Duplicate tag on second container — must be rejected
    const dupRes = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-30-R01-C002', metrc_plant_tag: tag },
    });
    expect(dupRes.statusCode).toBe(409);

    // DB invariant: only one active assignment with this tag
    const { n } = ctx.db.prepare(
      'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE metrc_plant_tag = ? AND unassigned_at IS NULL'
    ).get(tag) as { n: number };
    expect(n).toBe(1);
  });
});

// ─── 4. Harvest integrity ─────────────────────────────────────────────────────

describe('Harvest integrity', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('plant_harvest_events reference a valid harvest_batch (cross-table FK check)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    const event = ctx.db.prepare('SELECT * FROM cv_plant_harvest_events WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(event).toBeDefined();

    const harvestBatch = ctx.db.prepare('SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?').get(event.harvest_batch_id as number) as Record<string, unknown> | undefined;
    expect(harvestBatch).toBeDefined();
    expect(harvestBatch?.batch_id).toBe(b.batch_id);
  });

  it('final harvest event leaves container in teardown and assignment unassigned (cross-table)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('teardown');

    const assignment = ctx.db.prepare('SELECT unassigned_at, unassign_reason FROM cv_plant_assignments WHERE assignment_id = ?').get(a1) as Record<string, unknown>;
    expect(assignment.unassigned_at).not.toBeNull();
    expect(assignment.unassign_reason).toBe('harvested');
  });

  it('harvest batches can only be created when batch is in harvesting status', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('harvest batch batch_id references a real batch (referential integrity)', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);

    const hb = ctx.db.prepare('SELECT * FROM cv_harvest_batches WHERE harvest_batch_id = ?').get(harvest_batch_id) as Record<string, unknown>;
    const batch = ctx.db.prepare('SELECT batch_id FROM cv_batches WHERE batch_id = ?').get(hb.batch_id as number) as Record<string, unknown> | undefined;
    expect(batch).toBeDefined();
    expect(batch?.batch_id).toBe(b.batch_id);
  });

  it('harvest batch status is in_progress when first created', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);

    const hb = ctx.db.prepare('SELECT status FROM cv_harvest_batches WHERE harvest_batch_id = ?').get(harvest_batch_id) as Record<string, unknown>;
    expect(hb.status).toBe('in_progress');
  });
});

// ─── 5. Location / phase history integrity ────────────────────────────────────

describe('Location and phase history integrity', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('every batch created via API has exactly one initial phase_history entry', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { strain_id: s.strain_id, plant_count_initial: 10, sow_date: '2026-05-01' },
    });
    expect(res.statusCode).toBe(201);
    const batchId = JSON.parse(res.body).batch_id as number;

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cv_batch_phase_history WHERE batch_id = ?').get(batchId) as { n: number };
    expect(n).toBe(1);
  });

  it('initial phase_history entry has from_status NULL and to_status germ', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { strain_id: s.strain_id, plant_count_initial: 10, sow_date: '2026-05-01' },
    });
    const batchId = JSON.parse(res.body).batch_id as number;

    const entry = ctx.db.prepare('SELECT * FROM cv_batch_phase_history WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    expect(entry.from_status).toBeNull();
    expect(entry.to_status).toBe('germ');
  });

  it('every batch created via API has exactly one initial location_history entry', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { strain_id: s.strain_id, plant_count_initial: 10, sow_date: '2026-05-01' },
    });
    const batchId = JSON.parse(res.body).batch_id as number;

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cv_batch_location_history WHERE batch_id = ?').get(batchId) as { n: number };
    expect(n).toBe(1);
  });

  it('current_location_id on new batch matches to_location_id of the initial location_history entry', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { strain_id: s.strain_id, plant_count_initial: 10, sow_date: '2026-05-01' },
    });
    const batchId = JSON.parse(res.body).batch_id as number;

    const batch = ctx.db.prepare('SELECT current_location_id FROM cv_batches WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    const latestMove = ctx.db.prepare(
      'SELECT to_location_id FROM cv_batch_location_history WHERE batch_id = ? ORDER BY move_id DESC LIMIT 1'
    ).get(batchId) as Record<string, unknown>;

    expect(batch.current_location_id).not.toBeNull();
    expect(batch.current_location_id).toBe(latestMove.to_location_id);
  });

  it('a germ→seedling transition adds a new phase_history entry', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });

    await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'seedling' },
    });

    // Fixture inserts 1 initial entry; transition adds 1 more
    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cv_batch_phase_history WHERE batch_id = ?').get(b.batch_id) as { n: number };
    expect(n).toBe(2);
  });

  it('after germ→seedling transition, current_location_id matches latest location_history entry', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });

    await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'seedling' },
    });

    const batch = ctx.db.prepare('SELECT current_location_id FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    const latestMove = ctx.db.prepare(
      'SELECT to_location_id FROM cv_batch_location_history WHERE batch_id = ? ORDER BY move_id DESC LIMIT 1'
    ).get(b.batch_id) as Record<string, unknown>;

    expect(batch.current_location_id).not.toBeNull();
    expect(batch.current_location_id).toBe(latestMove.to_location_id);
  });

  it('every fixture-created batch has at least one phase_history entry', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cv_batch_phase_history WHERE batch_id = ?').get(b.batch_id) as { n: number };
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it('every fixture-created batch has at least one location_history entry', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM cv_batch_location_history WHERE batch_id = ?').get(b.batch_id) as { n: number };
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
