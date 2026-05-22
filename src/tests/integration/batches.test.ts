import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { createTestStrain, createTestBatch } from '../helpers/fixtures.js';

describe('Batch status transitions — valid paths', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('allows germ → seedling transition', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'seedling' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('seedling');
  });

  it('allows seedling → cult-hoop transition', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'seedling' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'cult-hoop' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('cult-hoop');
  });

  it('allows field-veg → field-flower transition', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'field-flower' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('field-flower');
  });

  it('allows flush → harvest_window transition', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'flush', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'harvest_window' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('harvest_window');
  });

  it('allows harvest_window → harvesting transition with notes', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvest_window', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'harvesting', notes: 'Trichomes showing 90%+ amber across all plants' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('harvesting');
  });
});

describe('Batch status transitions — invalid paths', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects skipping a stage (germ → field-veg)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'field-veg' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects going backward (seedling → germ)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'seedling' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'germ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects transitioning a closed batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'closed' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'harvesting' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects cult-hoop → field-veg when sub_zone_id is not set', async () => {
    const s = createTestStrain(ctx.db);
    // Create batch without sub_zone_id
    const now = new Date().toISOString();
    const r = ctx.db.prepare(`
      INSERT INTO cv_batches
        (strain_id, sub_zone_id, plant_count_initial, plants_per_container, sow_date,
         status, current_stage_since, current_location_id, supervisor,
         created_by, created_at, updated_at)
      VALUES (?, NULL, 3, 1, ?, 'cult-hoop', ?, 1, 1, 1, ?, ?)
    `).run(s.strain_id, now.slice(0, 10), now, now, now);
    const batchId = Number(r.lastInsertRowid);

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${batchId}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'field-veg' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects harvest_window → harvesting without notes', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvest_window', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { to_status: 'harvesting' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects transition by grower role (requires supervisor)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/transition`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_status: 'seedling' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Batch field updates', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('updates notes field', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { notes: 'Updated batch notes' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).notes).toBe('Updated batch notes');
  });

  it('sets a valid 24-char METRC UID', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const uid = 'ABCDEF123456789012345678';
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { metrc_plant_batch_uid: uid },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).metrc_plant_batch_uid).toBe(uid);
  });

  it('rejects a METRC UID that is too short', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { metrc_plant_batch_uid: 'TOOSHORT' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects sub_zone_id change when batch is in field-veg', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { sub_zone_id: 'Z2A' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Batch recipe assignment', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('assigns an active fertigation recipe to a batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });

    // Insert a fertigation recipe for testing
    const now = new Date().toISOString();
    const r = ctx.db.prepare(`
      INSERT INTO cv_fertigation_recipes
        (name, version, active, ec_target_low, ec_target_high, ph_target_low, ph_target_high,
         approved_by, approved_at, created_by, created_at)
      VALUES ('BASE', '1.0', 1, 0.4, 0.5, 6.0, 6.2, 1, ?, 1, ?)
    `).run(now, now);
    const recipeId = Number(r.lastInsertRowid);

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/recipe`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { recipe_id: recipeId },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).recipe_name).toBe('BASE');
  });

  it('rejects recipe assignment with non-existent recipe_id', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'germ' });

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/batches/${b.batch_id}/recipe`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: { recipe_id: 99999 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Batch creation', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('creates a batch with minimum required fields', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        strain_id: s.strain_id,
        plant_count_initial: 30,
        sow_date: '2026-05-01',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('germ');
    expect(body.batch_id).toBeDefined();
  });

  it('rejects creation with invalid sow_date format', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        strain_id: s.strain_id,
        plant_count_initial: 30,
        sow_date: 'not-a-date',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects creation with non-existent strain_id', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        strain_id: 99999,
        plant_count_initial: 30,
        sow_date: '2026-05-01',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects creation by grower role (requires supervisor)', async () => {
    const s = createTestStrain(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/batches',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        strain_id: s.strain_id,
        plant_count_initial: 30,
        sow_date: '2026-05-01',
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
