#!/usr/bin/env tsx
/**
 * Verify that migration 054 (container ID reformatting) ran correctly.
 *
 * Run against the production DB after deploying the migration:
 *   npx tsx scripts/verify-container-id-format.ts
 *
 * Exits 0 if all checks pass, 1 if any fail.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { setDB, getDB } from '../src/db/index.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'cultivate.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: DB not found at ${DB_PATH}`);
  console.error('Set DB_PATH env var or ensure the data/ directory exists.');
  process.exit(1);
}

// Open without running migrations — verification only
const rawDb = new Database(DB_PATH, { readonly: true });
setDB(rawDb);
const db = getDB();

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string): void {
  console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  passed++;
}

function fail(label: string, detail: string): void {
  console.error(`  FAIL  ${label} — ${detail}`);
  failed++;
}

console.log('\nVerifying container ID format (migration 054)\n');

// CHECK 1 — Container ID format compliance
{
  const rows = db.prepare('SELECT container_id FROM cv_containers').all() as { container_id: string }[];
  const bad = rows.filter(r => !/^Z\d+-(10|30)-R\d{2}-C\d{3}$/.test(r.container_id));
  if (bad.length === 0) {
    pass('CHECK 1: container_id format', `${rows.length} containers all valid`);
  } else {
    fail(
      'CHECK 1: container_id format',
      `${bad.length}/${rows.length} invalid — first 10: ${bad.slice(0, 10).map(r => r.container_id).join(', ')}`,
    );
  }
}

// CHECK 2 — Row ID format compliance
{
  const rows = db.prepare('SELECT row_id FROM cv_rows').all() as { row_id: string }[];
  const bad = rows.filter(r => !/^Z\d+-(10|30)-R\d{2}$/.test(r.row_id));
  if (bad.length === 0) {
    pass('CHECK 2: row_id format', `${rows.length} rows all valid`);
  } else {
    fail(
      'CHECK 2: row_id format',
      `${bad.length}/${rows.length} invalid — first 10: ${bad.slice(0, 10).map(r => r.row_id).join(', ')}`,
    );
  }
}

// CHECK 3 — Total container count
// Zones 1–4: 4 × (5 rows × 30 A-containers + 5 rows × 29 B-containers) = 1180
// Zone 5: 2 rows × 30 = 60
// Zone 6: 1 row × 60 = 60 → total 1300
{
  const { n } = db.prepare('SELECT COUNT(*) as n FROM cv_containers').get() as { n: number };
  if (n === 1300) {
    pass('CHECK 3: total container count', '1300');
  } else {
    fail('CHECK 3: total container count', `got ${n}, expected 1300`);
  }
}

// CHECK 4 — FK integrity: container_id references
{
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
  const orphaned: string[] = [];
  for (const table of tables) {
    const { n } = db.prepare(
      `SELECT COUNT(*) as n FROM ${table}
       WHERE container_id IS NOT NULL
         AND container_id NOT IN (SELECT container_id FROM cv_containers)`,
    ).get() as { n: number };
    if (n > 0) orphaned.push(`${table}: ${n}`);
  }
  if (orphaned.length === 0) {
    pass('CHECK 4: no orphaned container_id FKs');
  } else {
    fail('CHECK 4: no orphaned container_id FKs', orphaned.join('; '));
  }
}

// CHECK 5 — FK integrity: row_id references
{
  const tables = [
    'cv_containers',
    'cv_applications_foliar',
    'cv_applications_pesticide',
    'cv_observations',
    'cv_plant_waste_trim_events',
  ];
  const orphaned: string[] = [];
  for (const table of tables) {
    const { n } = db.prepare(
      `SELECT COUNT(*) as n FROM ${table}
       WHERE row_id IS NOT NULL
         AND row_id NOT IN (SELECT row_id FROM cv_rows)`,
    ).get() as { n: number };
    if (n > 0) orphaned.push(`${table}: ${n}`);
  }
  if (orphaned.length === 0) {
    pass('CHECK 5: no orphaned row_id FKs');
  } else {
    fail('CHECK 5: no orphaned row_id FKs', orphaned.join('; '));
  }
}

// CHECK 6 — No old-format IDs remain anywhere
// Old container format: Z1-A-R3-C12 (letter designation, no padding)
// Old row format:       Z1-A-R3
{
  const OLD_CONTAINER = /^Z\d+-[AB]-R\d+-C\d+$/;
  const OLD_ROW = /^Z\d+-[AB]-R\d+$/;

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

  const found: string[] = [];
  for (const table of containerTables) {
    const rows = db
      .prepare(`SELECT container_id FROM ${table} WHERE container_id IS NOT NULL`)
      .all() as { container_id: string }[];
    const old = rows.filter(r => OLD_CONTAINER.test(r.container_id));
    if (old.length > 0) found.push(`${table}.container_id: ${old.length} old-format`);
  }
  for (const table of rowTables) {
    const rows = db
      .prepare(`SELECT row_id FROM ${table} WHERE row_id IS NOT NULL`)
      .all() as { row_id: string }[];
    const old = rows.filter(r => OLD_ROW.test(r.row_id));
    if (old.length > 0) found.push(`${table}.row_id: ${old.length} old-format`);
  }

  if (found.length === 0) {
    pass('CHECK 6: no old-format A/B IDs remain');
  } else {
    fail('CHECK 6: no old-format A/B IDs remain', found.join('; '));
  }
}

// CHECK 7 — Spot-check known containers
{
  const expected = [
    'Z1-30-R01-C001', // zone 1, 30-gal, first container
    'Z1-30-R05-C030', // zone 1, 30-gal, last container in row 5
    'Z1-10-R01-C001', // zone 1, 10-gal, first container
    'Z1-10-R05-C029', // zone 1, 10-gal, last container (B-subzone has 29/row)
    'Z4-10-R05-C029', // zone 4, 10-gal, last container
    'Z5-10-R02-C030', // zone 5, last container
    'Z6-30-R01-C060', // zone 6, last container
  ];
  const placeholders = expected.map(() => '?').join(', ');
  const found = db
    .prepare(`SELECT container_id FROM cv_containers WHERE container_id IN (${placeholders})`)
    .all(...expected) as { container_id: string }[];

  if (found.length === expected.length) {
    pass('CHECK 7: spot-check known container IDs', `all ${expected.length} found`);
  } else {
    const foundSet = new Set(found.map(r => r.container_id));
    const missing = expected.filter(id => !foundSet.has(id));
    fail(
      'CHECK 7: spot-check known container IDs',
      `found ${found.length}/${expected.length} — missing: ${missing.join(', ')}`,
    );
  }
}

// CHECK 8 — cv_container_state row count matches total containers
{
  const { n } = db.prepare('SELECT COUNT(*) as n FROM cv_container_state').get() as { n: number };
  if (n === 1300) {
    pass('CHECK 8: cv_container_state has 1300 rows');
  } else {
    fail('CHECK 8: cv_container_state has 1300 rows', `got ${n}`);
  }
}

// CHECK 9 — Row-container count integrity
{
  const mismatches = db
    .prepare(
      `SELECT r.row_id, r.container_count, COUNT(c.container_id) AS actual
       FROM cv_rows r
       LEFT JOIN cv_containers c ON c.row_id = r.row_id
       GROUP BY r.row_id
       HAVING r.container_count != actual`,
    )
    .all() as { row_id: string; container_count: number; actual: number }[];

  if (mismatches.length === 0) {
    pass('CHECK 9: row container counts match cv_rows.container_count');
  } else {
    fail(
      'CHECK 9: row container counts match cv_rows.container_count',
      mismatches.map(m => `${m.row_id}: expected ${m.container_count} got ${m.actual}`).join('; '),
    );
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
console.log(`Summary: ${passed} passed, ${failed} failed`);
rawDb.close();
process.exit(failed > 0 ? 1 : 0);
