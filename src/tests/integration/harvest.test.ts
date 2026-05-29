import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain, createTestBatch, advanceBatchTo, createHarvestBatch, putContainerActive,
} from '../helpers/fixtures.js';

describe('Harvest batch creation — batch status gate', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  async function tryCreate(batchId: number) {
    return ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: batchId, batch_type: 'harvest' },
    });
  }

  it('rejects harvest batch creation when batch is in germ', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await tryCreate(b.batch_id);
    expect(res.statusCode).toBe(400);
  });

  it('rejects harvest batch creation when batch is in field-veg', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await tryCreate(b.batch_id);
    expect(res.statusCode).toBe(400);
  });

  it('rejects harvest batch creation when batch is in harvest_window', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvest_window' });
    const res = await tryCreate(b.batch_id);
    expect(res.statusCode).toBe(400);
  });

  it('allows harvest batch creation when batch is in harvesting', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const res = await tryCreate(b.batch_id);
    expect(res.statusCode).toBe(201);
  });
});

describe('Harvest event — harvest_batch gate', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects event when harvest batch is force_closed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    ctx.db.prepare(`UPDATE cv_harvest_batches SET status='force_closed' WHERE harvest_batch_id=?`).run(harvest_batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects event when harvest batch is completed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    ctx.db.prepare(`UPDATE cv_harvest_batches SET status='completed' WHERE harvest_batch_id=?`).run(harvest_batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows partial_harvest event when harvest_batch is in_progress', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('allows final_harvest event when harvest_batch is in_progress', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Harvest event — batch status gate', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('partial_harvest is allowed when batch is field-veg', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id, 1, { batch_type: 'manicure' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('partial_harvest is blocked when batch is germ', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id, 1, { batch_type: 'manicure' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('partial_harvest is blocked when batch is seedling', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'seedling' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id, 1, { batch_type: 'manicure' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('partial_harvest is blocked when batch is cult-hoop', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'cult-hoop' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id, 1, { batch_type: 'manicure' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('partial_harvest is blocked when batch is closed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id, 1, { batch_type: 'manicure' });
    advanceBatchTo(ctx.db, b.batch_id, 'closed');
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'partial_harvest', product_type: 'flower', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('final_harvest is blocked when batch is harvest_window', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvest_window' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('final_harvest is blocked when batch is flush', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'flush' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Final harvest side effects', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('unassigns the plant assignment with reason=harvested after final_harvest', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId) as Record<string, unknown>;
    expect(assignment.unassigned_at).not.toBeNull();
    expect(assignment.unassign_reason).toBe('harvested');
  });

  it('transitions container to teardown after final_harvest', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('teardown');
  });

  it('auto-closes cultivation batch when last plant is final-harvested', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    const batch = ctx.db.prepare('SELECT status FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(batch.status).toBe('closed');
  });

  it('auto-closes harvest batch when last plant is final-harvested', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    const hb = ctx.db.prepare('SELECT status FROM cv_harvest_batches WHERE harvest_batch_id = ?').get(harvest_batch_id) as Record<string, unknown>;
    expect(hb.status).toBe('completed');
  });

  it('does NOT auto-close batch when other active plants remain', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    // Two plants: Z1-30-R01-C001 and Z1-30-R01-C002
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    putContainerActive(ctx.db, 'Z1-30-R01-C002', b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { plant_assignment_id: a1, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' },
    });
    const batch = ctx.db.prepare('SELECT status FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(batch.status).toBe('harvesting');
  });

  it('rejects a second final_harvest for the same plant assignment', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    const payload = { plant_assignment_id: assignmentId, event_type: 'final_harvest', product_type: 'flower', wet_weight: 100, weight_unit: 'g' };
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'), payload,
    });
    // Second attempt — assignment is now unassigned, so expect 400
    const res2 = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/events`,
      headers: authHeader(ctx.app, 'grower'), payload,
    });
    expect(res2.statusCode).toBe(400);
  });
});

describe('Waste trim', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('allows waste trim on a field-veg batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('allows waste trim on a harvesting batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'ipm_removal', wet_weight: 30, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects waste trim with missing trim_reason', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects waste trim with wet_weight = 0', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 0, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects waste trim for a non-existent batch', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: 99999, trim_reason: 'defoliation', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sets initial waste_status to collected', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 50, weight_unit: 'g' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.waste_status).toBe('collected');
  });

  it('sets metrc_sync_status to pending', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/waste-trim',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, trim_reason: 'defoliation', wet_weight: 50, weight_unit: 'g' },
    });
    const body = JSON.parse(res.body);
    expect(body.metrc_sync_status).toBe('pending');
  });
});

describe('Force-close harvest batch', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects force-close with missing close_notes', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects force-close with close_notes shorter than 10 chars', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects force-close of a completed harvest batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    ctx.db.prepare(`UPDATE cv_harvest_batches SET status='completed' WHERE harvest_batch_id=?`).run(harvest_batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Major storm rolled in from the north' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('force-closes the harvest batch and creates a new one', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Major storm rolled in from the north' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.closed_batch.status).toBe('force_closed');
    expect(body.new_batch).toBeDefined();
  });

  it('new harvest batch has sequence_number one higher than the closed one', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Major storm rolled in from the north' },
    });
    const body = JSON.parse(res.body);
    expect(body.new_batch.sequence_number).toBe(body.closed_batch.sequence_number + 1);
  });

  it('cultivation batch remains in harvesting status after force-close', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const { harvest_batch_id } = createHarvestBatch(ctx.db, b.batch_id);
    await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${harvest_batch_id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Major storm rolled in from the north' },
    });
    const batch = ctx.db.prepare('SELECT status FROM cv_batches WHERE batch_id = ?').get(b.batch_id) as Record<string, unknown>;
    expect(batch.status).toBe('harvesting');
  });
});

describe('Harvest batch — in-progress uniqueness', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects a second in-progress harvest batch when one already exists', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    const res2 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('allows a second manicure batch when one already exists', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'manicure' },
    });
    const res2 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'manicure' },
    });
    expect(res2.statusCode).toBe(201);
  });

  it('force-close auto-creates a new in-progress harvest batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const r1 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    const hb1 = JSON.parse(r1.body).harvest_batch_id;
    const r2 = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${hb1}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Storm forced early close of this batch' },
    });
    expect(r2.statusCode).toBe(201);
    // The force-close response contains the new_batch that was auto-created
    const body = JSON.parse(r2.body);
    expect(body.new_batch).toBeDefined();
    expect(body.new_batch.status).toBe('in_progress');
  });

  it('allows a new harvest batch after the existing one is manually set to completed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const r1 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    const hb1 = JSON.parse(r1.body).harvest_batch_id;
    // Manually mark as completed (simulates all plants being final-harvested)
    ctx.db.prepare(`UPDATE cv_harvest_batches SET status='completed' WHERE harvest_batch_id=?`).run(hb1);
    const res2 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    expect(res2.statusCode).toBe(201);
  });
});

describe('Harvest batch sequence numbers', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('first harvest batch has sequence_number=1', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    expect(JSON.parse(res.body).sequence_number).toBe(1);
  });

  it('force-closed replacement has sequence_number=2', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const r1 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    const hb1Id = JSON.parse(r1.body).harvest_batch_id;
    const r2 = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${hb1Id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Storm came through and ended the harvest early' },
    });
    expect(JSON.parse(r2.body).new_batch.sequence_number).toBe(2);
  });

  it('second force-close replacement has sequence_number=3', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const r1 = await ctx.app.inject({
      method: 'POST', url: '/api/harvest/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { batch_id: b.batch_id, batch_type: 'harvest' },
    });
    const hb1Id = JSON.parse(r1.body).harvest_batch_id;
    const r2 = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${hb1Id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'First storm forced early close today' },
    });
    const hb2Id = JSON.parse(r2.body).new_batch.harvest_batch_id;
    const r3 = await ctx.app.inject({
      method: 'POST', url: `/api/harvest/batches/${hb2Id}/force-close`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { close_notes: 'Second storm also forced an early close' },
    });
    expect(JSON.parse(r3.body).new_batch.sequence_number).toBe(3);
  });
});
