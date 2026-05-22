import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../../helpers/db.js';
import { authHeader } from '../../helpers/auth.js';
import { createTestStrain, createTestBatch, insertStageOverride } from '../../helpers/fixtures.js';

// Helper: build a valid single-product foliar payload
function validFoliarPayload(batchId: number, inputId = 1, overrides: Record<string, unknown> = {}) {
  return {
    batch_id: batchId,
    applied_at: new Date().toISOString(),
    input_id: inputId,
    rate_value: 0.5,
    rate_unit: 'tsp_per_gal',
    volume_applied: 10,
    volume_unit: 'gal',
    purpose: 'weekly preventive',
    ...overrides,
  };
}

describe('Foliar applications — required fields', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects when neither foliar_recipe_id nor input_id is provided', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        applied_at: new Date().toISOString(),
        purpose: 'preventive',
        volume_applied: 10,
        volume_unit: 'gal',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when both foliar_recipe_id and input_id are provided', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    // Create a foliar recipe
    const now = new Date().toISOString();
    const r = ctx.db.prepare(`
      INSERT INTO cv_foliar_recipes
        (name, version, active, purpose, approved_by, approved_at, created_by, created_at)
      VALUES ('Test Foliar', '1.0', 1, 'test', 1, ?, 1, ?)
    `).run(now, now);
    const foliarRecipeId = Number(r.lastInsertRowid);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        applied_at: new Date().toISOString(),
        foliar_recipe_id: foliarRecipeId,
        input_id: 1,
        purpose: 'preventive',
        volume_applied: 10,
        volume_unit: 'gal',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when purpose is missing', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        applied_at: new Date().toISOString(),
        input_id: 1,
        rate_value: 0.5,
        rate_unit: 'tsp_per_gal',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when rate_value is missing for single-product application', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        applied_at: new Date().toISOString(),
        input_id: 1,
        rate_unit: 'tsp_per_gal',
        purpose: 'preventive',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Foliar applications — batch status restrictions', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('allows foliar on a field-veg batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });

  it('allows foliar on a field-flower batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-flower', sub_zone_id: 'Z1A' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects foliar on a closed batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'closed' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects foliar on a harvesting batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'harvesting' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Foliar applications — EPA redirect (Rule 13)', () => {
  let ctx: TestContext;
  const OLD_URL = process.env.FARMSTOCK_URL;
  const OLD_KEY = process.env.FARMSTOCK_SERVICE_KEY;

  beforeEach(async () => {
    ctx = await createTestContext();
    process.env.FARMSTOCK_URL = 'http://test-farmstock';
    process.env.FARMSTOCK_SERVICE_KEY = 'test-key';
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
    process.env.FARMSTOCK_URL = OLD_URL;
    process.env.FARMSTOCK_SERVICE_KEY = OLD_KEY;
    vi.unstubAllGlobals();
  });

  it('returns 422 redirect when farmstock product has an EPA number', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-12345',
        phi_days_operational: 14,
        rei_hours: 12,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.redirect).toBe('pesticide');
  });

  it('allows foliar when farmstock product has no EPA number', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: null,
        phi_days_operational: null,
        rei_hours: null,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });

  it('allows foliar when farmstock is unavailable (trusts frontend selection)', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Foliar applications — stage block (Rule 14)', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 422 stage_blocked when input has override for current stage', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    insertStageOverride(ctx.db, 1, 'field_veg', { allowed: 0, reason: 'Not permitted in field-veg' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.stage_blocked).toBe(true);
  });

  it('allows foliar when no stage override exists for input and stage', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    // Use input_id=999 which has no overrides
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id, 999),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Foliar applications — response fields', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns foliar_id in response body', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/foliar',
      headers: authHeader(ctx.app, 'grower'),
      payload: validFoliarPayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.foliar_id).toBeDefined();
    expect(body.batch_id).toBe(b.batch_id);
  });
});
