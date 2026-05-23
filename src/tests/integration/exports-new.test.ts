import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain, createTestBatch, createHarvestBatch, createPlantAssignment,
} from '../helpers/fixtures.js';

// ── /exports/metrc-phases/:batchId ───────────────────────────────────────────

describe('Exports — GET /exports/metrc-phases/:batchId', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/exports/metrc-phases/1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a non-existent batch', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-phases/99999',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns phase-transition array for a valid batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-phases/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    // createTestBatch always writes one phase_history row
    expect(body.length).toBeGreaterThan(0);
    const first = body[0];
    expect(first).toHaveProperty('to_metrc_phase');
    expect(first).toHaveProperty('transitioned_at');
    expect(first).toHaveProperty('phase_history_id');
    expect(first).toHaveProperty('metrc_sync_status');
  });

  it('returns 400 for a non-numeric batch ID', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-phases/notanumber',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns CSV content-type when ?format=csv', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-phases/${b.batch_id}?format=csv`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });
});

// ── /exports/metrc-tag-assignments ───────────────────────────────────────────

describe('Exports — GET /exports/metrc-tag-assignments', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/exports/metrc-tag-assignments' });
    expect(res.statusCode).toBe(401);
  });

  it('returns { total, assignments } with auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-tag-assignments',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('assignments');
    expect(Array.isArray(body.assignments)).toBe(true);
  });

  it('returns tagged assignments for a specific batch_id', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const tag = 'TESTTAG123456789012ABCD'; // 24 chars
    createPlantAssignment(ctx.db, b.batch_id, 'Z1-A-R1-C1', { metrc_plant_tag: tag });

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-tag-assignments?batch_id=${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.filter_batch_id).toBe(b.batch_id);
    const found = body.assignments.find((a: { metrc_plant_tag: string }) => a.metrc_plant_tag === tag);
    expect(found).toBeDefined();
  });

  it('excludes untagged assignments', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    // Untagged assignment (no metrc_plant_tag)
    createPlantAssignment(ctx.db, b.batch_id, 'Z1-A-R1-C2', {});

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-tag-assignments?batch_id=${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // The untagged placement must not appear
    expect(body.assignments.every((a: { metrc_plant_tag: string | null }) => a.metrc_plant_tag !== null)).toBe(true);
  });
});

// ── /exports/metrc-harvest/:batchId ──────────────────────────────────────────

describe('Exports — GET /exports/metrc-harvest/:batchId', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/exports/metrc-harvest/1' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a non-existent batch', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-harvest/99999',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns { batch_id, harvest_batches } for a valid batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    createHarvestBatch(ctx.db, b.batch_id);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-harvest/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.batch_id).toBe(b.batch_id);
    expect(Array.isArray(body.harvest_batches)).toBe(true);
    expect(body.harvest_batches).toHaveLength(1);
  });

  it('returns empty harvest_batches when no harvest batches created', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-harvest/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).harvest_batches).toHaveLength(0);
  });

  it('harvest batch entry has batch_sync_status field', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    createHarvestBatch(ctx.db, b.batch_id);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-harvest/${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const hb = JSON.parse(res.body).harvest_batches[0];
    expect(hb).toHaveProperty('batch_sync_status');
    expect(hb).toHaveProperty('started_at');
    expect(hb).toHaveProperty('weights');
    expect(Array.isArray(hb.weights)).toBe(true);
  });

  it('returns CSV content-type when ?format=csv', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    createHarvestBatch(ctx.db, b.batch_id);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-harvest/${b.batch_id}?format=csv`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });
});

// ── /exports/metrc-waste ─────────────────────────────────────────────────────

describe('Exports — GET /exports/metrc-waste', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/exports/metrc-waste' });
    expect(res.statusCode).toBe(401);
  });

  it('returns array with auth on an empty database', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-waste',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('includes waste_trim events in the response', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const now = new Date().toISOString();
    const { lastInsertRowid } = ctx.db.prepare(`
      INSERT INTO cv_plant_waste_trim_events
        (batch_id, trimmed_at, trim_reason, wet_weight, weight_unit,
         waste_status, waste_status_updated_at, applicator, metrc_sync_status,
         created_by, created_at, updated_at)
      VALUES (?, ?, 'defoliation', 50.0, 'g', 'collected', ?, 1, 'pending', 1, ?, ?)
    `).run(b.batch_id, now, now, now, now);
    const trimId = Number(lastInsertRowid);

    const res = await ctx.app.inject({
      method: 'GET', url: '/api/exports/metrc-waste',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Array<{ event_id: number; event_type: string }>;
    const found = body.find(e => e.event_id === trimId && e.event_type === 'waste_trim');
    expect(found).toBeDefined();
  });

  it('supports batch_id filter — includes target batch, excludes others', async () => {
    const s = createTestStrain(ctx.db);
    const b1 = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z1A' });
    const b2 = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z2A' });
    const now = new Date().toISOString();

    const insertTrim = (batchId: number) => ctx.db.prepare(`
      INSERT INTO cv_plant_waste_trim_events
        (batch_id, trimmed_at, trim_reason, wet_weight, weight_unit,
         waste_status, waste_status_updated_at, applicator, metrc_sync_status,
         created_by, created_at, updated_at)
      VALUES (?, ?, 'defoliation', 20.0, 'g', 'collected', ?, 1, 'pending', 1, ?, ?)
    `).run(batchId, now, now, now, now);

    insertTrim(b1.batch_id);
    insertTrim(b2.batch_id);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/exports/metrc-waste?batch_id=${b1.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Array<{ batch_id: number; event_type: string }>;
    expect(body.some(e => e.event_type === 'waste_trim')).toBe(true);
    // All returned events must belong to b1
    expect(body.every(e => e.batch_id === b1.batch_id)).toBe(true);
  });
});
