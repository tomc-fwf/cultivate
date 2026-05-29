/**
 * Integration tests verifying that migration 054 (container ID reformatting) ran correctly.
 *
 * These tests run against the ACTUAL production DB file (not an in-memory test DB).
 * Before migration 054 runs on Railway, these tests will FAIL with assertion errors —
 * that is expected and confirms the test code correctly detects old-format data.
 * After Railway deploys and migration 054 runs, all tests should pass.
 *
 * DB path: process.env.DB_PATH || data/cultivate.db
 */
import { beforeAll, afterAll, describe, test, expect } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { setDB, getDB } from '../../db/index.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'cultivate.db');
const DB_EXISTS = fs.existsSync(DB_PATH);

describe.runIf(DB_EXISTS)('Container ID format verification (migration 054)', () => {
  let rawDb: Database.Database;

  beforeAll(() => {
    // Open without running migrations — we are verifying, not migrating
    rawDb = new Database(DB_PATH, { readonly: true });
    setDB(rawDb);
  });

  afterAll(() => {
    rawDb?.close();
  });

  test('all container_ids match new QR label format Z{n}-{pot}-R{dd}-C{ddd}', () => {
    const db = getDB();
    const rows = db.prepare('SELECT container_id FROM cv_containers').all() as { container_id: string }[];
    const bad = rows.filter(r => !/^Z\d+-(10|30)-R\d{2}-C\d{3}$/.test(r.container_id));
    expect(
      bad,
      `${bad.length} invalid container_ids — first 5: ${bad.slice(0, 5).map(r => r.container_id).join(', ')}`,
    ).toHaveLength(0);
  });

  test('all row_ids match new format Z{n}-{pot}-R{dd}', () => {
    const db = getDB();
    const rows = db.prepare('SELECT row_id FROM cv_rows').all() as { row_id: string }[];
    const bad = rows.filter(r => !/^Z\d+-(10|30)-R\d{2}$/.test(r.row_id));
    expect(
      bad,
      `${bad.length} invalid row_ids — first 5: ${bad.slice(0, 5).map(r => r.row_id).join(', ')}`,
    ).toHaveLength(0);
  });

  test('total container count is 1300', () => {
    // Zones 1-4: 4 × (5 rows × 30 A-containers + 5 rows × 29 B-containers) = 1180
    // Zone 5:    2 rows × 30 = 60
    // Zone 6:    1 row  × 60 = 60
    // Total:     1300
    const db = getDB();
    const { n } = db.prepare('SELECT COUNT(*) as n FROM cv_containers').get() as { n: number };
    expect(n).toBe(1300);
  });

  test('no orphaned container_id FK references', () => {
    const db = getDB();
    const tables = [
      'cv_plant_assignments',
      'cv_container_state',
      'cv_container_state_transitions',
      'cv_container_amendments',
      'cv_container_qr_codes',
      'cv_teardown_events',
      'cv_startup_events',
      'cv_plant_loss_events',
      'cv_planting_plan_items',
      'cv_soil_samples',
      'cv_plant_harvest_events',
      'cv_plant_waste_trim_events',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
    ];
    for (const table of tables) {
      const { n } = db
        .prepare(
          `SELECT COUNT(*) as n FROM ${table}
           WHERE container_id IS NOT NULL
             AND container_id NOT IN (SELECT container_id FROM cv_containers)`,
        )
        .get() as { n: number };
      expect(n, `${table} has ${n} orphaned container_id FK(s)`).toBe(0);
    }
  });

  test('no orphaned row_id FK references', () => {
    const db = getDB();
    const tables = [
      'cv_containers',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
      'cv_plant_waste_trim_events',
    ];
    for (const table of tables) {
      const { n } = db
        .prepare(
          `SELECT COUNT(*) as n FROM ${table}
           WHERE row_id IS NOT NULL
             AND row_id NOT IN (SELECT row_id FROM cv_rows)`,
        )
        .get() as { n: number };
      expect(n, `${table} has ${n} orphaned row_id FK(s)`).toBe(0);
    }
  });

  test('no old-format A/B IDs remain in any table', () => {
    // Old container format: Z1-A-R3-C12 (letter subzone, unpadded row+container)
    // Old row format:       Z1-A-R3
    const OLD_CONTAINER = /^Z\d+-[AB]-R\d+-C\d+$/;
    const OLD_ROW = /^Z\d+-[AB]-R\d+$/;
    const db = getDB();

    const containerTables = [
      'cv_containers',
      'cv_plant_assignments',
      'cv_container_state',
      'cv_container_state_transitions',
      'cv_container_amendments',
      'cv_container_qr_codes',
      'cv_teardown_events',
      'cv_startup_events',
      'cv_plant_loss_events',
      'cv_planting_plan_items',
      'cv_soil_samples',
      'cv_plant_harvest_events',
      'cv_plant_waste_trim_events',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
    ];
    const rowTables = [
      'cv_rows',
      'cv_containers',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
      'cv_plant_waste_trim_events',
    ];

    for (const table of containerTables) {
      const rows = db
        .prepare(`SELECT container_id FROM ${table} WHERE container_id IS NOT NULL`)
        .all() as { container_id: string }[];
      const old = rows.filter(r => OLD_CONTAINER.test(r.container_id));
      expect(old, `${table} has ${old.length} old-format container_id(s)`).toHaveLength(0);
    }
    for (const table of rowTables) {
      const rows = db
        .prepare(`SELECT row_id FROM ${table} WHERE row_id IS NOT NULL`)
        .all() as { row_id: string }[];
      const old = rows.filter(r => OLD_ROW.test(r.row_id));
      expect(old, `${table} has ${old.length} old-format row_id(s)`).toHaveLength(0);
    }
  });

  test('spot-check known container IDs exist', () => {
    const db = getDB();
    const expected = [
      'Z1-30-R01-C001', // zone 1, 30-gal, row 1, first container
      'Z1-30-R05-C030', // zone 1, 30-gal, row 5, last container
      'Z1-10-R01-C001', // zone 1, 10-gal, row 1, first container
      'Z1-10-R05-C029', // zone 1, 10-gal, row 5, last container (B-subzone: 29/row)
      'Z4-10-R05-C029', // zone 4, 10-gal, row 5, last container
      'Z5-10-R02-C030', // zone 5, row 2, last container
      'Z6-30-R01-C060', // zone 6, row 1, last container
    ];
    const placeholders = expected.map(() => '?').join(', ');
    const found = db
      .prepare(`SELECT container_id FROM cv_containers WHERE container_id IN (${placeholders})`)
      .all(...expected) as { container_id: string }[];
    const foundIds = found.map(r => r.container_id);
    const missing = expected.filter(id => !foundIds.includes(id));
    expect(missing, `missing containers: ${missing.join(', ')}`).toHaveLength(0);
  });

  test('cv_container_state has a row for every container', () => {
    const db = getDB();
    const { n } = db.prepare('SELECT COUNT(*) as n FROM cv_container_state').get() as { n: number };
    expect(n).toBe(1300);
  });

  test('row container counts match cv_rows.container_count', () => {
    const db = getDB();
    const mismatches = db
      .prepare(
        `SELECT r.row_id, r.container_count, COUNT(c.container_id) AS actual
         FROM cv_rows r
         LEFT JOIN cv_containers c ON c.row_id = r.row_id
         GROUP BY r.row_id
         HAVING r.container_count != actual`,
      )
      .all() as { row_id: string; container_count: number; actual: number }[];
    expect(
      mismatches,
      mismatches.map(m => `${m.row_id}: expected ${m.container_count} got ${m.actual}`).join('; '),
    ).toHaveLength(0);
  });
});
