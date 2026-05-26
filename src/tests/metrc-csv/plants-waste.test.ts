import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import {
  generatePlantsWasteCsv,
  PLANTS_WASTE_HEADERS,
  type PlantsWasteRow,
} from '../../lib/metrc-csv/generators/plants-waste.js';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';

// ── Unit tests: generator ────────────────────────────────────────────────────

describe('generatePlantsWasteCsv', () => {
  const baseRow: PlantsWasteRow = {
    waste_method_name: 'Clipping',
    waste_weight: 15.69,
    unit_of_measure_name: 'grams',
    reason_name: 'Trim',
    waste_date: '2026-05-26',
  };

  it('produces the exact header row', () => {
    const csv = generatePlantsWasteCsv([baseRow]);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(PLANTS_WASTE_HEADERS);
  });

  it('uses CRLF line endings throughout', () => {
    const csv = generatePlantsWasteCsv([baseRow]);
    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/(?<!\r)\n/);
  });

  it('serializes plant_labels as pipe-delimited in PlantLabels cell', () => {
    const csv = generatePlantsWasteCsv([
      {
        ...baseRow,
        plant_labels: ['ABCDEF012345670000000100', 'ABCDEF012345670000000101'],
      },
    ]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('ABCDEF012345670000000100|ABCDEF012345670000000101');
  });

  it('produces empty PlantLabels cell when plant_labels is undefined', () => {
    const csv = generatePlantsWasteCsv([{ ...baseRow, plant_labels: undefined }]);
    const dataLine = csv.split('\r\n')[1];
    const cols = dataLine.split(',');
    // PlantLabels is the last (10th) column — index 9
    expect(cols[9]).toBe('');
  });

  it('produces empty PlantLabels cell when plant_labels is an empty array', () => {
    const csv = generatePlantsWasteCsv([{ ...baseRow, plant_labels: [] }]);
    const dataLine = csv.split('\r\n')[1];
    const cols = dataLine.split(',');
    expect(cols[9]).toBe('');
  });

  it('location-only event (no plant_labels) is valid and renders empty PlantLabels', () => {
    const row: PlantsWasteRow = {
      waste_method_name: 'Compost',
      waste_weight: 10,
      unit_of_measure_name: 'grams',
      reason_name: 'Waste',
      waste_date: '2026-05-26',
      location_name: 'Veg Room A',
      sublocation_name: 'Sublocation A',
    };
    const csv = generatePlantsWasteCsv([row]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('Veg Room A');
    expect(dataLine).toContain('Sublocation A');
    // PlantLabels cell is empty
    const cols = dataLine.split(',');
    expect(cols[9]).toBe('');
  });

  it('leaves empty strings for null/undefined optional fields', () => {
    const csv = generatePlantsWasteCsv([baseRow]);
    const dataLine = csv.split('\r\n')[1];
    const cols = dataLine.split(',');
    // MixedMaterial is col 1, Note is col 5, LocationName is col 6, SublocationName is col 7
    expect(cols[1]).toBe('');
    expect(cols[5]).toBe('');
    expect(cols[6]).toBe('');
    expect(cols[7]).toBe('');
  });

  it('quotes fields containing commas', () => {
    const csv = generatePlantsWasteCsv([{ ...baseRow, note: 'defoliation, lower canopy' }]);
    expect(csv).toContain('"defoliation, lower canopy"');
  });

  it('produces one data row per event', () => {
    const csv = generatePlantsWasteCsv([baseRow, { ...baseRow, waste_weight: 8.5 }]);
    const dataLines = csv.split('\r\n').filter((l, i) => i > 0 && l.trim().length > 0);
    expect(dataLines).toHaveLength(2);
  });
});

// ── Integration tests: POST /api/metrc/csv/plants-waste ─────────────────────

describe('POST /api/metrc/csv/plants-waste', () => {
  let ctx: TestContext;
  const origOutputDir = process.env.METRC_CSV_OUTPUT_DIR;

  beforeAll(() => {
    process.env.METRC_CSV_OUTPUT_DIR = path.join(
      os.tmpdir(),
      `metrc-plants-waste-test-${process.pid}`,
    );
  });
  afterAll(() => {
    if (origOutputDir === undefined) delete process.env.METRC_CSV_OUTPUT_DIR;
    else process.env.METRC_CSV_OUTPUT_DIR = origOutputDir;
  });

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('generates CSV file and inserts upload record', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 15.69,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.row_count).toBe(1);
    expect(body.upload_id).toBeGreaterThan(0);
    expect(body.csv_file_path).toContain('plants-waste');
    expect(Array.isArray(body.warnings)).toBe(true);

    // Verify upload log row
    const upload = ctx.db
      .prepare('SELECT * FROM cv_metrc_csv_uploads WHERE upload_id = ?')
      .get(body.upload_id) as Record<string, unknown> | undefined;
    expect(upload).toBeDefined();
    expect(upload!['upload_type']).toBe('plants-waste');
    expect(upload!['row_count']).toBe(1);
  });

  it('rejects waste_weight <= 0', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 0,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Validation failed');
  });

  it('rejects waste_weight < 0', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: -5,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid waste_date format', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 5,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '05/26/2026', // wrong format
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects plant_label not 24 alphanumeric chars', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 5,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
            plant_labels: ['SHORT'], // too short
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown location_name (not in cv_locations.metrc_name)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 5,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
            location_name: 'Nonexistent Room XYZ',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Unknown location_name');
  });

  it('rejects empty events array', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects > 500 events', async () => {
    const events = Array.from({ length: 501 }, () => ({
      waste_method_name: 'Clipping',
      waste_weight: 1,
      unit_of_measure_name: 'grams',
      reason_name: 'Trim',
      waste_date: '2026-05-26',
    }));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: { events },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      payload: { events: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('warns when waste methods table is empty', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        events: [
          {
            waste_method_name: 'Clipping',
            waste_weight: 5,
            unit_of_measure_name: 'grams',
            reason_name: 'Trim',
            waste_date: '2026-05-26',
          },
        ],
      },
    });
    // Tables start empty in test DB → should warn but not reject
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.warnings.some((w: string) => w.includes('cv_metrc_plant_waste_methods'))).toBe(true);
  });
});

// ── Integration tests: GET /api/metrc/csv/plants-waste/pending ────────────

describe('GET /api/metrc/csv/plants-waste/pending', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('returns an empty array when no pending events', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/metrc/csv/plants-waste/pending',
      headers: authHeader(ctx.app, 'grower'),
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/metrc/csv/plants-waste/pending',
    });
    expect(res.statusCode).toBe(401);
  });
});
