import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { createTestStrain, createTestBatch } from '../helpers/fixtures.js';

// ── /applicators ─────────────────────────────────────────────────────────────

describe('Analytics — /applicators', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/analytics/applicators' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with auth and array body', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/applicators',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it('accepts date_from and date_to filters without error', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/analytics/applicators?date_from=2026-01-01&date_to=2026-12-31',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
  });
});

// ── /pesticide-summary ────────────────────────────────────────────────────────

describe('Analytics — /pesticide-summary', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/analytics/pesticide-summary' });
    expect(res.statusCode).toBe(401);
  });

  it('returns { year, products } with auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/pesticide-summary',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('year');
    expect(body).toHaveProperty('products');
    expect(Array.isArray(body.products)).toBe(true);
  });

  it('respects ?year= filter', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/pesticide-summary?year=2025',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).year).toBe('2025');
  });

  it('defaults to current year when year param is invalid', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/pesticide-summary?year=notayear',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).year).toBe(new Date().getFullYear().toString());
  });
});

// ── /annual-tracker ───────────────────────────────────────────────────────────

describe('Analytics — /annual-tracker', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/analytics/annual-tracker' });
    expect(res.statusCode).toBe(401);
  });

  it('returns { year, batches } shape with auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/annual-tracker',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('year');
    expect(body).toHaveProperty('batches');
    expect(Array.isArray(body.batches)).toBe(true);
  });

  it('includes a batch created in the current year', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z1A' });
    const currentYear = new Date().getFullYear().toString();
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/analytics/annual-tracker?year=${currentYear}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const found = body.batches.find((bt: { batch_id: number }) => bt.batch_id === b.batch_id);
    expect(found).toBeDefined();
  });

  it('excludes batches from a different year', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/annual-tracker?year=2020',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const found = body.batches.find((bt: { batch_id: number }) => bt.batch_id === b.batch_id);
    expect(found).toBeUndefined();
  });
});

// ── /recipe-performance ───────────────────────────────────────────────────────

describe('Analytics — /recipe-performance', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/analytics/recipe-performance' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an array with auth (empty in a fresh test DB)', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/recipe-performance',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });
});

// ── /compare ─────────────────────────────────────────────────────────────────

describe('Analytics — /compare', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/compare?batch_ids=1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when batch_ids param is missing', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/compare',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when batch_ids is empty string', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/compare?batch_ids=',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with more than 6 batch IDs', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/compare?batch_ids=1,2,3,4,5,6,7',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with no valid numeric batch IDs', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/compare?batch_ids=abc,xyz',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns metrics array for valid batch IDs preserving input order', async () => {
    const s = createTestStrain(ctx.db);
    const b1 = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z1A' });
    const b2 = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z2A' });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics/compare?batch_ids=${b1.batch_id},${b2.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Array<{ batch_id: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].batch_id).toBe(b1.batch_id);
    expect(body[1].batch_id).toBe(b2.batch_id);
  });

  it('each result has expected metric fields', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/analytics/compare?batch_ids=${b.batch_id}`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const entry = JSON.parse(res.body)[0];
    expect(entry).toHaveProperty('strain_name');
    expect(entry).toHaveProperty('total_yield_g');
    expect(entry).toHaveProperty('plant_loss_rate');
    expect(entry).toHaveProperty('pesticide_application_count');
    expect(entry).toHaveProperty('fertigation_count');
  });
});

// ── /batch/:batchId/ec-ph ─────────────────────────────────────────────────────

describe('Analytics — /batch/:batchId/ec-ph', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/analytics/batch/1/ec-ph' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for a non-numeric batch ID', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/api/analytics/batch/abc/ec-ph',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns empty array for a batch with no fertigation applications', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const res = await ctx.app.inject({
      method: 'GET', url: `/api/analytics/batch/${b.batch_id}/ec-ph`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns time-series rows when fertigation applications exist', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    // Insert a fertigation recipe and application
    const now = new Date().toISOString();
    const { lastInsertRowid: recipeId } = ctx.db.prepare(`
      INSERT INTO cv_fertigation_recipes
        (name, version, active, ec_target_low, ec_target_high, ph_target_low, ph_target_high,
         approved_by, approved_at, created_by, created_at)
      VALUES ('BASE', '1.0', 1, 0.4, 0.6, 6.0, 6.5, 1, ?, 1, ?)
    `).run(now, now);
    ctx.db.prepare(`
      INSERT INTO cv_applications_fertigation
        (batch_id, recipe_id, applied_at, volume_gallons, ec_measured, ph_measured,
         applicator, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 50.0, 0.52, 6.1, 1, 1, ?, ?)
    `).run(b.batch_id, Number(recipeId), now, now, now);

    const res = await ctx.app.inject({
      method: 'GET', url: `/api/analytics/batch/${b.batch_id}/ec-ph`,
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].ec_measured).toBe(0.52);
    expect(body[0].ph_measured).toBe(6.1);
    expect(body[0]).toHaveProperty('ec_target_low');
    expect(body[0]).toHaveProperty('ec_target_high');
  });
});
