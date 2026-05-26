import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import { generateAdditiveTemplateCsv, ADDITIVE_TEMPLATE_HEADERS } from '../../lib/metrc-csv/generators/additive-template.js';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';

// ── Unit tests: generator ────────────────────────────────────────────────────

describe('generateAdditiveTemplateCsv', () => {
  it('produces the exact header row', () => {
    const csv = generateAdditiveTemplateCsv([
      { name: 'T1', additive_type: 'Fertilizer', active_ingredients: [{ name: 'N', percentage: 5 }] },
    ]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(ADDITIVE_TEMPLATE_HEADERS);
  });

  it('uses CRLF line endings', () => {
    const csv = generateAdditiveTemplateCsv([
      { name: 'T1', additive_type: 'Fertilizer', active_ingredients: [{ name: 'N', percentage: 5 }] },
    ]);
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/(?<!\r)\n/); // no bare LF
  });

  it('emits one row per active ingredient', () => {
    const csv = generateAdditiveTemplateCsv([
      {
        name: 'Wonder Grow',
        additive_type: 'Fertilizer',
        active_ingredients: [
          { name: 'Nitrogen', percentage: 15 },
          { name: 'Phosphorus', percentage: 10 },
          { name: 'Potassium', percentage: 8 },
        ],
      },
    ]);
    const dataLines = csv.split('\r\n').filter((l, i) => i > 0 && l.trim().length > 0);
    expect(dataLines).toHaveLength(3);
  });

  it('repeats non-ingredient fields identically across all rows for one template', () => {
    const csv = generateAdditiveTemplateCsv([
      {
        name: 'FishFeed',
        additive_type: 'Fertilizer',
        product_trade_name: 'Fish Pro',
        product_supplier: 'Sea Labs',
        active_ingredients: [
          { name: 'N', percentage: 3 },
          { name: 'P', percentage: 2 },
        ],
      },
    ]);
    const [, row1, row2] = csv.split('\r\n').filter((l) => l.trim().length > 0);
    const cols1 = row1.split(',');
    const cols2 = row2.split(',');
    // Columns 0–8 (non-ingredient) must match; columns 9–10 (ingredient) may differ
    for (let i = 0; i <= 8; i++) {
      expect(cols1[i]).toBe(cols2[i]);
    }
    // Active ingredient names differ
    expect(cols1[9]).not.toBe(cols2[9]);
  });

  it('writes multiple templates as sequential rows', () => {
    const csv = generateAdditiveTemplateCsv([
      { name: 'T1', additive_type: 'Fertilizer', active_ingredients: [{ name: 'N', percentage: 5 }] },
      { name: 'T2', additive_type: 'Pesticide', epa_registration_number: 'EPA-001', active_ingredients: [{ name: 'X', percentage: 2 }, { name: 'Y', percentage: 1 }] },
    ]);
    const dataLines = csv.split('\r\n').filter((l, i) => i > 0 && l.trim().length > 0);
    expect(dataLines).toHaveLength(3); // 1 + 2
    expect(dataLines[0]).toContain('T1');
    expect(dataLines[1]).toContain('T2');
    expect(dataLines[2]).toContain('T2');
  });

  it('quotes field values containing commas', () => {
    const csv = generateAdditiveTemplateCsv([
      {
        name: 'FishFeed',
        additive_type: 'Fertilizer',
        note: 'Use 5, maybe 6',
        active_ingredients: [{ name: 'N', percentage: 3 }],
      },
    ]);
    expect(csv).toContain('"Use 5, maybe 6"');
  });

  it('leaves empty string for null/undefined optional fields', () => {
    const csv = generateAdditiveTemplateCsv([
      { name: 'Bare', additive_type: 'Other', active_ingredients: [{ name: 'Z', percentage: 0 }] },
    ]);
    const dataLine = csv.split('\r\n')[1];
    const cols = dataLine.split(',');
    // product_trade_name (index 2) should be empty
    expect(cols[2]).toBe('');
  });
});

// ── Integration tests: POST /api/metrc/csv/additive-templates ─────────────────

describe('POST /api/metrc/csv/additive-templates', () => {
  let ctx: TestContext;
  const origOutputDir = process.env.METRC_CSV_OUTPUT_DIR;

  beforeAll(() => {
    process.env.METRC_CSV_OUTPUT_DIR = path.join(os.tmpdir(), `metrc-csv-test-${process.pid}`);
  });
  afterAll(() => {
    if (origOutputDir === undefined) delete process.env.METRC_CSV_OUTPUT_DIR;
    else process.env.METRC_CSV_OUTPUT_DIR = origOutputDir;
  });

  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('creates DB rows and returns file path', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [
          {
            name: 'Fish Hydrolysate',
            additive_type: 'Fertilizer',
            product_trade_name: 'Organic Gem',
            active_ingredients: [
              { name: 'Nitrogen', percentage: 3 },
              { name: 'Phosphorus', percentage: 1 },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.template_ids).toHaveLength(1);
    expect(body.row_count).toBe(2);
    expect(body.upload_id).toBeGreaterThan(0);
    expect(body.csv_file_path).toContain('additive-template');

    // Verify DB row
    const row = ctx.db
      .prepare('SELECT * FROM cv_metrc_additive_templates WHERE template_id = ?')
      .get(body.template_ids[0]) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!['name']).toBe('Fish Hydrolysate');
    expect(JSON.parse(row!['active_ingredients'] as string)).toHaveLength(2);

    // Verify upload log
    const upload = ctx.db
      .prepare('SELECT * FROM cv_metrc_csv_uploads WHERE upload_id = ?')
      .get(body.upload_id) as Record<string, unknown> | undefined;
    expect(upload).toBeDefined();
    expect(upload!['upload_type']).toBe('additive-template');
    expect(upload!['row_count']).toBe(2);
  });

  it('rejects pesticide without EPA registration number', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [
          {
            name: 'Bad Pesticide',
            additive_type: 'Pesticide',
            // epa_registration_number intentionally omitted
            active_ingredients: [{ name: 'X', percentage: 1 }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Validation failed');
  });

  it('rejects REI pair incoherence — quantity without unit', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [
          {
            name: 'REI Broken',
            additive_type: 'Fertilizer',
            rei_quantity: '3',
            // rei_time_unit missing
            active_ingredients: [{ name: 'N', percentage: 5 }],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Validation failed');
  });

  it('rejects duplicate name within the same request', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [
          { name: 'SameName', additive_type: 'Fertilizer', active_ingredients: [{ name: 'N', percentage: 5 }] },
          { name: 'SameName', additive_type: 'Other', active_ingredients: [{ name: 'K', percentage: 2 }] },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Duplicate template names');
  });

  it('rejects duplicate name already in DB', async () => {
    // First create it
    await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [{ name: 'Existing Template', additive_type: 'Fertilizer', active_ingredients: [{ name: 'N', percentage: 5 }] }],
      },
    });

    // Try to create again
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [{ name: 'Existing Template', additive_type: 'Other', active_ingredients: [{ name: 'K', percentage: 2 }] }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('already exist');
  });

  it('rejects total ingredient count > 500', async () => {
    const ingredients = Array.from({ length: 501 }, (_, i) => ({ name: `Ing${i}`, percentage: 0.1 }));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [{ name: 'Huge', additive_type: 'Fertilizer', active_ingredients: ingredients }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      payload: { templates: [] },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Integration tests: GET /api/metrc/csv/additive-templates ─────────────────

describe('GET /api/metrc/csv/additive-templates', () => {
  let ctx: TestContext;
  const origOutputDir = process.env.METRC_CSV_OUTPUT_DIR;

  beforeAll(() => {
    process.env.METRC_CSV_OUTPUT_DIR = path.join(os.tmpdir(), `metrc-csv-test-get-${process.pid}`);
  });
  afterAll(() => {
    if (origOutputDir === undefined) delete process.env.METRC_CSV_OUTPUT_DIR;
    else process.env.METRC_CSV_OUTPUT_DIR = origOutputDir;
  });

  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns an empty array when no templates exist', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('returns templates with active_ingredients parsed from JSON', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        templates: [
          {
            name: 'Cal-Mag',
            additive_type: 'Fertilizer',
            active_ingredients: [
              { name: 'Calcium', percentage: 5 },
              { name: 'Magnesium', percentage: 3 },
            ],
          },
        ],
      },
    });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/metrc/csv/additive-templates',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]['name']).toBe('Cal-Mag');
    expect(Array.isArray(body[0]['active_ingredients'])).toBe(true);
    expect((body[0]['active_ingredients'] as unknown[]).length).toBe(2);
  });
});
