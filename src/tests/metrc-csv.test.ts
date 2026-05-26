/**
 * METRC CSV Phase 4 — Validation Engine Integration Tests
 *
 * 8 required test cases:
 * 1. 500-row limit
 * 2. Header validation
 * 3. METRC tag format
 * 4. Tag availability (plants-growth-phase)
 * 5. Batch status gate (harvest-plants)
 * 6. Zero-waste destruction warning
 * 7. CSV-safe escaping
 * 8. CRLF line endings + no BOM
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import { createTestContext, teardownTestContext, type TestContext } from './helpers/db.js';
import { authHeader } from './helpers/auth.js';
import {
  createTestStrain,
  createTestBatch,
  createHarvestBatch,
  advanceBatchTo,
} from './helpers/fixtures.js';
import { validateHeaders, CsvHeaderMismatchError, escapeCell } from '../lib/metrc-csv/validators/csv-rules.js';
import { generatePlantsWasteCsv } from '../lib/metrc-csv/generators/plants-waste.js';
import { generateDestroyImmatureCsv, DESTROY_IMMATURE_HEADERS } from '../lib/metrc-csv/generators/destroy-immature.js';
import { writeCsv } from '../lib/metrc-csv/writer.js';
import fs from 'fs';

// ── Set up temp output dir for file-writing tests ────────────────────────────

const tmpDir = path.join(os.tmpdir(), `metrc-csv-phase4-test-${process.pid}`);

beforeAll(() => {
  process.env.METRC_CSV_OUTPUT_DIR = tmpDir;
});
afterAll(() => {
  delete process.env.METRC_CSV_OUTPUT_DIR;
});

// ── Test 1: 500-row limit ────────────────────────────────────────────────────

describe('Test 1 — 500-row limit on plants-waste', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('rejects 501 events with 400 and row count error', async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      waste_method_name: 'Clipping',
      waste_weight: 1,
      unit_of_measure_name: 'grams',
      reason_name: 'Trim',
      waste_date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-waste',
      headers: authHeader(ctx.app, 'grower'),
      payload: { events },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    // Zod's .max(500) produces a Validation failed error
    expect(body.error).toContain('Validation failed');
  });
});

// ── Test 2: Header validation ────────────────────────────────────────────────

describe('Test 2 — validateHeaders throws CsvHeaderMismatchError on wrong headers', () => {
  it('throws CsvHeaderMismatchError when headers do not match', () => {
    expect(() =>
      validateHeaders('WrongColumn,AnotherWrong', DESTROY_IMMATURE_HEADERS),
    ).toThrowError(CsvHeaderMismatchError);
  });

  it('does not throw when headers match exactly', () => {
    expect(() =>
      validateHeaders(DESTROY_IMMATURE_HEADERS, DESTROY_IMMATURE_HEADERS),
    ).not.toThrow();
  });
});

// ── Test 3: METRC tag format ─────────────────────────────────────────────────

describe('Test 3 — METRC tag format validation', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('rejects a 23-char tag in plants-waste with 400', async () => {
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
            plant_labels: ['ABCDEF0123456700000001'], // only 22 chars
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Validation failed');
  });

  it('rejects a tag containing special chars in plants-growth-phase with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-growth-phase',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        plants: [
          {
            label: 'ABCDEF012345670000000!00', // contains '!'
            new_tag: 'ABCDEF012345670000000101',
            growth_phase: 'Vegetative',
            new_location: 'Field',
            growth_date: '2026-05-26',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── Test 4: Tag availability (plants-growth-phase) ───────────────────────────

describe('Test 4 — Tag availability gate on plants-growth-phase', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('rejects when new_tag status is "used"', async () => {
    const now = new Date().toISOString();
    const db = ctx.db;

    const strain = createTestStrain(db);
    createTestBatch(db, strain.strain_id, { status: 'field-veg' });

    // Seed an active plant in plant_state
    const loc = db
      .prepare(`SELECT location_id FROM cv_locations LIMIT 1`)
      .get() as { location_id: number } | undefined;
    const locationId = loc?.location_id ?? 1;

    const oldTag = 'AAAAAA000000000000000001';
    db.prepare(
      `INSERT INTO cv_metrc_plant_state
         (plant_tag, batch_id, strain_id, growth_phase, location_id, status, created_at, updated_at)
       VALUES (?, 1, ?, 'Vegetative', ?, 'active', ?, ?)`,
    ).run(oldTag, strain.strain_id, locationId, now, now);

    // Insert a 'used' tag as new_tag
    const usedTag = 'BBBBBB000000000000000001';
    db.prepare(
      `INSERT INTO cv_metrc_available_plant_tags (tag, status) VALUES (?, 'used')`,
    ).run(usedTag);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/plants-growth-phase',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        plants: [
          {
            label: oldTag,
            new_tag: usedTag,
            growth_phase: 'Vegetative',
            new_location: 'Field',
            growth_date: '2026-05-26',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain(usedTag);
  });
});

// ── Test 5: Batch status gate (harvest-plants) ───────────────────────────────

describe('Test 5 — Batch status gate on harvest-plants', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('rejects harvest-plants when cultivation batch status is field-flower', async () => {
    const now = new Date().toISOString();
    const db = ctx.db;

    db.prepare(
      `INSERT INTO cv_strains (strain_id, name, type, created_at, updated_at)
       VALUES (1, 'Test Strain', 'auto', ?, ?)`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO cv_batches (batch_id, strain_id, plant_count_initial, plant_count_current,
       status, sow_date, created_by, created_at, updated_at)
       VALUES (1, 1, 10, 10, 'field-flower', '2026-01-01', 1, ?, ?)`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO cv_harvest_batches
         (harvest_batch_id, batch_id, sequence_number, status, started_at, started_by, created_at, updated_at)
       VALUES (1, 1, 1, 'in_progress', ?, 1, ?, ?)`,
    ).run(now, now, now);

    const plantTag = 'CCCCCC000000000000000001';
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/harvest-plants',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        harvest_batch_id: 1,
        plant_events: [
          {
            plant_tag: plantTag,
            weight: 200,
            unit_of_weight: 'Grams',
            drying_location: 'Field',
            actual_date: '2026-05-26',
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('harvesting');
  });
});

// ── Test 6: Zero-waste destruction warning ───────────────────────────────────

describe('Test 6 — Zero-waste destruction produces warning, not error', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });
  afterEach(async () => {
    await teardownTestContext(ctx);
  });

  it('returns 201 with a warning when waste_weight = 0', async () => {
    const now = new Date().toISOString();
    const db = ctx.db;

    db.prepare(
      `INSERT INTO cv_strains (strain_id, name, type, created_at, updated_at)
       VALUES (1, 'Test Strain', 'auto', ?, ?)`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO cv_batches (batch_id, strain_id, plant_count_initial, plant_count_current,
       status, sow_date, created_by, created_at, updated_at)
       VALUES (1, 1, 10, 10, 'germ', '2026-01-01', 1, ?, ?)`,
    ).run(now, now);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/metrc/csv/destroy-immature',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {
        plant_batch_id: 1,
        count: 2,
        waste_reason_name: 'Disease',
        waste_weight: 0,
        actual_date: '2026-05-26',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(body.warnings[0]).toContain('waste_weight is 0');
  });
});

// ── Test 7: CSV-safe escaping ────────────────────────────────────────────────

describe('Test 7 — CSV-safe cell escaping', () => {
  it('escapeCell wraps value with comma in double-quotes', () => {
    const result = escapeCell('defoliation, lower canopy');
    expect(result).toBe('"defoliation, lower canopy"');
  });

  it('escapeCell doubles internal double-quotes', () => {
    const result = escapeCell('said "hello"');
    expect(result).toBe('"said ""hello"""');
  });

  it('escapeCell wraps value containing newline', () => {
    const result = escapeCell('line1\nline2');
    expect(result).toBe('"line1\nline2"');
  });

  it('escapeCell returns empty string for null', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('generator quotes field containing comma in CSV output', () => {
    const csv = generatePlantsWasteCsv([
      {
        waste_method_name: 'Clipping',
        waste_weight: 10,
        unit_of_measure_name: 'grams',
        reason_name: 'Trim',
        waste_date: '2026-05-26',
        note: 'defoliation, lower canopy',
      },
    ]);
    expect(csv).toContain('"defoliation, lower canopy"');
  });
});

// ── Test 8: CRLF line endings + no BOM ──────────────────────────────────────

describe('Test 8 — CRLF line endings and no BOM in written CSV file', () => {
  it('every data row ends with CRLF (0x0D 0x0A) and no UTF-8 BOM', async () => {
    const csv = generateDestroyImmatureCsv({
      plant_batch_name: 'TEST-BATCH-001',
      count: 3,
      waste_reason_name: 'Disease',
      waste_weight: 0,
      actual_date: '2026-05-26',
    });

    const { filePath } = await writeCsv(csv, 'destroy-immature-test');
    const raw = fs.readFileSync(filePath);

    // No UTF-8 BOM: first 3 bytes must NOT be EF BB BF
    expect(raw[0]).not.toBe(0xef);
    expect(raw[1]).not.toBe(0xbb);
    expect(raw[2]).not.toBe(0xbf);

    // All line endings are CRLF: no bare LF (0x0A not preceded by 0x0D)
    const content = raw.toString('utf8');
    expect(content).toContain('\r\n');
    // Ensure no bare LF outside of CRLF pairs
    expect(content).not.toMatch(/(?<!\r)\n/);
  });
});
