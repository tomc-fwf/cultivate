import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../../helpers/db.js';
import { authHeader } from '../../helpers/auth.js';
import { createTestStrain, createTestBatch, insertStageOverride } from '../../helpers/fixtures.js';

// Helper: build a valid pesticide payload with all required fields
function validPesticidePayload(batchId: number, overrides: Record<string, unknown> = {}) {
  return {
    batch_id: batchId,
    applied_at: new Date().toISOString(),
    input_id: 1,
    input_lot_id: 1,
    rate_value: 1.5,
    rate_unit: 'oz_per_gal',
    volume_applied: 10,
    volume_unit: 'gal',
    application_method: 'foliar_spray',
    target_pest: 'spider mites',
    ambient_temp_f: 72,
    wind_speed_mph: 5,
    ...overrides,
  };
}

describe('Pesticide applications — required fields (Zod validation)', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects when input_lot_id is missing', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const payload = validPesticidePayload(b.batch_id);
    delete (payload as Record<string, unknown>).input_lot_id;

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when target_pest is missing', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const payload = validPesticidePayload(b.batch_id);
    delete (payload as Record<string, unknown>).target_pest;

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when ambient_temp_f is missing', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const payload = validPesticidePayload(b.batch_id);
    delete (payload as Record<string, unknown>).ambient_temp_f;

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when wind_speed_mph is missing', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const payload = validPesticidePayload(b.batch_id);
    delete (payload as Record<string, unknown>).wind_speed_mph;

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects for a closed batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'closed' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Pesticide applications — farmstock EPA check (redirect to foliar)', () => {
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

  it('saves successfully when farmstock returns epa_reg_number (pesticide product)', async () => {
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
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns 422 redirect when farmstock item has no EPA number', async () => {
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
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.redirect).toBe('foliar');
  });
});

describe('Pesticide applications — PHI compliance check', () => {
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

  it('returns 422 phi_violation when harvest date is within PHI window', async () => {
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
    // Set harvest_date 5 days from now (within 14-day PHI)
    const harvestDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    ctx.db.prepare(`UPDATE cv_batches SET harvest_date = ? WHERE batch_id = ?`).run(harvestDate, b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.phi_violation).toBe(true);
  });

  it('allows application with phi_override_notes when PHI is violated', async () => {
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
    const harvestDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    ctx.db.prepare(`UPDATE cv_batches SET harvest_date = ? WHERE batch_id = ?`).run(harvestDate, b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id, { phi_override_notes: 'Emergency application approved by supervisor' }),
    });
    expect(res.statusCode).toBe(201);
  });

  it('proceeds without PHI check when harvest_date is not set', async () => {
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
    // No harvest_date set

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Pesticide applications — REI computation', () => {
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

  it('returns rei_expires_at computed from applied_at + rei_hours', async () => {
    const REI_HOURS = 12;
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-12345',
        phi_days_operational: null,
        rei_hours: REI_HOURS,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const appliedAt = new Date().toISOString();

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id, { applied_at: appliedAt }),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.rei_expires_at).toBeDefined();

    const expectedExpiry = new Date(new Date(appliedAt).getTime() + REI_HOURS * 3600000);
    const actualExpiry = new Date(body.rei_expires_at);
    // Allow 5 second tolerance for timing
    expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(5000);
  });

  it('does not return rei_expires_at when product has no REI', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-12345',
        phi_days_operational: null,
        rei_hours: null,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.rei_expires_at).toBeNull();
  });
});

describe('Pesticide applications — RUP (restricted use)', () => {
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

  it('rejects when product is restricted_use and no applicator_license provided', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-RUP-999',
        phi_days_operational: null,
        rei_hours: 48,
        restricted_use: true,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.restricted_use).toBe(true);
  });

  it('allows when product is restricted_use and applicator_license is provided', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-RUP-999',
        phi_days_operational: null,
        rei_hours: 48,
        restricted_use: true,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id, { applicator_license: 'MN-LIC-12345' }),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('Pesticide applications — stage block (Rule 19)', () => {
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

  it('returns 422 stage_blocked when override exists for current stage', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-12345',
        phi_days_operational: null,
        rei_hours: 12,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    insertStageOverride(ctx.db, 1, 'field_veg', { allowed: 0, reason: 'Not permitted in field-veg stage' });

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.stage_blocked).toBe(true);
  });

  it('allows application when no stage override exists', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        epa_reg_number: 'EPA-12345',
        phi_days_operational: null,
        rei_hours: 12,
        restricted_use: false,
      }),
    }));

    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    // No stage override inserted

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/applications/pesticide',
      headers: authHeader(ctx.app, 'grower'),
      payload: validPesticidePayload(b.batch_id),
    });
    expect(res.statusCode).toBe(201);
  });
});
