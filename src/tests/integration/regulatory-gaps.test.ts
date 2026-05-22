import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain, createTestBatch, advanceBatchTo, createHarvestBatch,
  createPlantAssignment, putContainerActive, putContainerEmpty,
} from '../helpers/fixtures.js';

// ─── 4. Batch close cascades all containers to TEARDOWN (Rule 34) ─────────────

describe('Batch close — container cascade to teardown', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('transitions an empty container to teardown when batch auto-closes', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);

    // Two containers: C1 gets final-harvested, C2 had a prior plant loss → empty
    const a1 = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    putContainerEmpty(ctx.db, 'Z1-A-R1-C2', b.batch_id);

    // Final-harvest the only remaining active plant → batch auto-closes
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    const batch = ctx.db.prepare('SELECT status FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(batch.status).toBe('closed');

    // C2 (previously empty) must now be in teardown
    const c2 = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-A-R1-C2') as Record<string, unknown>;
    expect(c2.current_state).toBe('teardown');
  });

  it('C2 teardown transition log includes trigger_event=batch_closed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);

    const a1 = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    putContainerEmpty(ctx.db, 'Z1-A-R1-C2', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    const transition = ctx.db.prepare(`
      SELECT * FROM cv_container_state_transitions
      WHERE container_id = ? AND to_state = 'teardown' AND trigger_event = 'batch_closed'
    `).get('Z1-A-R1-C2') as Record<string, unknown> | undefined;
    expect(transition).toBeDefined();
  });

  it('does not cascade when active plants remain', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);

    // Two active containers
    const a1 = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    putContainerEmpty(ctx.db, 'Z1-A-R1-C2', b.batch_id);
    putContainerActive(ctx.db, 'Z1-A-R1-C3', b.batch_id);

    // Harvest only one of two active plants
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });

    // Batch must still be harvesting, C2 must stay empty
    const batch = ctx.db.prepare('SELECT status FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(batch.status).toBe('harvesting');

    const c2 = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-A-R1-C2') as Record<string, unknown>;
    expect(c2.current_state).toBe('empty');
  });
});

// ─── 5. plants_per_container=2 allows 2 assignments per container ─────────────

describe('Multi-plant containers (plants_per_container=2)', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('container stays active when one of two plants dies', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    ctx.db.prepare('UPDATE cv_batches SET plants_per_container = 2 WHERE batch_id = ?').run(b.batch_id);

    // Place two plants in the same container
    putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    const a2 = createPlantAssignment(ctx.db, b.batch_id, 'Z1-A-R1-C1');

    // Record loss for a2 via API — container should stay active (a1 still lives)
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-A-R1-C1',
        plant_assignment_id: a2.assignment_id,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(201);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-A-R1-C1') as Record<string, unknown>;
    expect(state.current_state).toBe('active');
  });

  it('container goes empty only when the last of two plants is lost', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    ctx.db.prepare('UPDATE cv_batches SET plants_per_container = 2 WHERE batch_id = ?').run(b.batch_id);

    const a1 = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    const a2 = createPlantAssignment(ctx.db, b.batch_id, 'Z1-A-R1-C1');

    // Lose first plant
    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-A-R1-C1', plant_assignment_id: a1, loss_type: 'death_natural', plant_disposition: 'disposed_compost' },
    });

    // Lose second plant
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-A-R1-C1', plant_assignment_id: a2.assignment_id, loss_type: 'death_natural', plant_disposition: 'disposed_compost' },
    });
    expect(res.statusCode).toBe(201);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-A-R1-C1') as Record<string, unknown>;
    expect(state.current_state).toBe('empty');
  });

  it('two active plant assignments can coexist in the same container', () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    createPlantAssignment(ctx.db, b.batch_id, 'Z1-A-R1-C1');

    const activeCount = (ctx.db.prepare(
      'SELECT COUNT(*) AS n FROM cv_plant_assignments WHERE container_id = ? AND unassigned_at IS NULL'
    ).get('Z1-A-R1-C1') as { n: number }).n;

    expect(activeCount).toBe(2);
  });
});

// ─── 6. DELETE on application endpoints returns 404 (Business Rule 5) ─────────
// DELETE handlers have been removed from compliance application routes per Business
// Rule 5 (5-year retention). Fastify returns 404 when no DELETE handler is registered.

describe('DELETE on compliance application endpoints is blocked (Rule 5)', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('DELETE /api/applications/fertigation/:id returns 404 — no handler registered', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE', url: '/api/applications/fertigation/1',
      headers: authHeader(ctx.app, 'admin'),
    });
    // 404 = handler removed; 405 = method not allowed. Either means DELETE is blocked.
    expect([404, 405]).toContain(res.statusCode);
  });

  it('DELETE /api/applications/foliar/:id returns 404 — no handler registered', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE', url: '/api/applications/foliar/1',
      headers: authHeader(ctx.app, 'admin'),
    });
    expect([404, 405]).toContain(res.statusCode);
  });

  it('DELETE /api/applications/pesticide/:id returns 404 — no handler registered', async () => {
    const res = await ctx.app.inject({
      method: 'DELETE', url: '/api/applications/pesticide/1',
      headers: authHeader(ctx.app, 'admin'),
    });
    expect([404, 405]).toContain(res.statusCode);
  });
});

// ─── 7. Waste trim status transitions ────────────────────────────────────────

describe('Waste trim status lifecycle', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('newly created waste trim has waste_status=collected', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).waste_status).toBe('collected');
  });

  it('PATCH dispose transitions waste_status from collected to disposed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const createRes = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'ipm_removal', wet_weight: 20, weight_unit: 'g' },
    });
    const trimId = JSON.parse(createRes.body).waste_trim_id;

    const disposeRes = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/dispose`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { disposition: 'composted', disposed_at: new Date().toISOString() },
    });
    expect(disposeRes.statusCode).toBe(200);
    const body = JSON.parse(disposeRes.body);
    expect(body.waste_status).toBe('disposed');
    expect(body.disposition).toBe('composted');
    expect(body.disposed_by).toBeDefined();
  });

  it('dispose sets disposed_by to the acting user', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const createRes = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 10, weight_unit: 'g' },
    });
    const trimId = JSON.parse(createRes.body).waste_trim_id;

    const disposeRes = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/dispose`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { disposition: 'incinerated', disposed_at: new Date().toISOString() },
    });
    expect(disposeRes.statusCode).toBe(200);
    // User 2 = supervisor in test context
    expect(JSON.parse(disposeRes.body).disposed_by).toBe(2);
  });

  it('GET /waste-trim?waste_status=disposed returns disposed records', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const createRes = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 30, weight_unit: 'g' },
    });
    const trimId = JSON.parse(createRes.body).waste_trim_id;

    await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/dispose`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { disposition: 'composted', disposed_at: new Date().toISOString() },
    });

    const listRes = await ctx.app.inject({
      method: 'GET', url: '/api/harvest/waste-trim?waste_status=disposed',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(listRes.statusCode).toBe(200);
    const records = JSON.parse(listRes.body) as Array<Record<string, unknown>>;
    expect(records.length).toBeGreaterThan(0);
    expect(records.every(r => r.waste_status === 'disposed')).toBe(true);
  });

  it('dispose returns 404 for non-existent waste trim id', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH', url: '/api/harvest/waste-trim/99999/dispose',
      headers: authHeader(ctx.app, 'grower'),
      payload: { disposition: 'composted', disposed_at: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── 8. plant_count_current updates when assignments change ───────────────────

describe('plant_count_current is derived from active assignments', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('reflects active assignment count when assignments exist', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', plant_count_initial: 3 });

    putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    putContainerActive(ctx.db, 'Z1-A-R1-C2', b.batch_id);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).plant_count_current).toBe(2);
  });

  it('plant_count_current decrements after a plant loss', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', plant_count_initial: 2 });

    const a1 = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    putContainerActive(ctx.db, 'Z1-A-R1-C2', b.batch_id);

    // Before loss: 2 active assignments
    const before = await ctx.app.inject({
      method: 'GET', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(JSON.parse(before.body).plant_count_current).toBe(2);

    // Record plant loss for C1
    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-A-R1-C1', plant_assignment_id: a1, loss_type: 'death_natural', plant_disposition: 'disposed_compost' },
    });

    // After loss: 1 active assignment
    const after = await ctx.app.inject({
      method: 'GET', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(JSON.parse(after.body).plant_count_current).toBe(1);
  });

  it('falls back to plant_count_initial when no assignments exist', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ', plant_count_initial: 5 });

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).plant_count_current).toBe(5);
  });
});

// ─── 9. METRC tags rejected if not 24 alphanumeric chars ─────────────────────

describe('METRC tag format validation (tag-assignments endpoint)', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  function setupUntaggedContainer(batchId: number, containerId = 'Z1-A-R1-C1') {
    putContainerActive(ctx.db, containerId, batchId);
    return containerId;
  }

  it('rejects a tag shorter than 24 chars', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: 'ABC123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a tag longer than 24 chars', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: 'A'.repeat(25) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a tag with special characters', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id);

    // 24 chars but includes a hyphen
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: '1A2B3C4D5E6F7G8H9I0J-123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a valid 24-char alphanumeric tag', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id);

    const validTag = 'A'.repeat(24);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: validTag },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).metrc_plant_tag).toBe(validTag);
  });

  it('accepts a tag with uppercase, lowercase, and digits', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id);

    const validTag = 'aB3dE6fG9hI2jK5lM8nO1pQ4'; // 24 mixed alphanumeric
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: validTag },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects duplicate tag assignment (tag already active elsewhere)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    setupUntaggedContainer(b.batch_id, 'Z1-A-R1-C1');
    setupUntaggedContainer(b.batch_id, 'Z1-A-R1-C2');

    const tag = 'A'.repeat(24);

    // Assign tag to C1
    await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C1', metrc_plant_tag: tag },
    });

    // Try to assign same tag to C2 — must be rejected
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
      payload: { container_id: 'Z1-A-R1-C2', metrc_plant_tag: tag },
    });
    expect(res.statusCode).toBe(409);
  });
});
