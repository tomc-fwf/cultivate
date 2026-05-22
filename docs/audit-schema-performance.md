# Schema Completeness and Performance Audit

**Generated:** 2026-05-21  
**Scope:** All 14 migrations (001–014) and all 18 route files  
**Database:** SQLite (better-sqlite3 via Knex)

---

## Section 1: Schema Completeness

Legend: **YES** / **NO** / **N/A** / **PARTIAL**  
Enums column: **ENFORCED** (CHECK constraint) / **APP-LAYER** (Zod only) / **UNENFORCED**

| Table | created_at | updated_at | created_by → cv_users | FK constraints | Enums | down() reversible |
|---|---|---|---|---|---|---|
| `cv_users` | YES | YES | N/A (root table) | N/A | role: APP-LAYER | YES |
| `cv_zones` | NO | NO | NO | N/A (seed data) | — | YES |
| `cv_sub_zones` | NO | NO | NO | zone_id: YES | designation: APP-LAYER | YES |
| `cv_rows` | NO | NO | NO | sub_zone_id: YES | — | YES |
| `cv_containers` | NO | NO | NO | row_id: YES | — | YES |
| `cv_strains` | YES | YES | YES | created_by: YES | type: APP-LAYER | YES |
| `cv_batches` | YES | YES | YES | strain_id, sub_zone_id, supervisor, created_by, current_location_id: YES | status: APP-LAYER | PARTIAL (008 DROP COLUMN not reversible in SQLite; 012 leaves current_location_id behind on down) |
| `cv_batch_stage_recipes` | YES | NO | N/A (has authorized_by) | batch_id: YES; **recipe_id: NO FK** (comment defers to 006) | — | YES |
| `cv_plant_assignments` | YES | NO | NO | batch_id, container_id, placed_by, tagged_by, unassigned_by: YES | unassign_reason: APP-LAYER | PARTIAL (down() silently drops rows with null metrc_plant_tag) |
| `cv_plant_loss_events` | YES | NO | NO (has reported_by) | batch_id, container_id, plant_assignment_id, reported_by: YES | loss_type, plant_disposition, metrc_sync_status: APP-LAYER | YES |
| `cv_container_state` | NO | YES | NO (state record, not created record) | container_id, current_batch_id: YES | current_state: APP-LAYER | YES |
| `cv_container_state_transitions` | YES | NO | NO (has transitioned_by) | container_id, transitioned_by, batch_id: YES | trigger_event, from/to_state: APP-LAYER | YES |
| `cv_container_amendments` | YES | NO | YES | container_id, batch_id, applicator, corrects_id, created_by: YES; **soil_sample_id: NO FK** (deferred); input_id/input_lot_id: intentionally no FK (farmstock) | container_state, amendment_type, application_method: APP-LAYER | YES |
| `cv_container_qr_codes` | YES | NO | NO | container_id UNIQUE: YES | qr_format: APP-LAYER | YES |
| `cv_teardown_events` | YES | NO | YES | container_id, batch_id, performed_by, created_by: YES; **soil_sample_id: NO FK** (populated post-insert) | — | YES |
| `cv_soil_samples` | YES | NO | YES | container_id, sub_zone_id, sampled_by, teardown_id, created_by: YES | sample_type: APP-LAYER | YES |
| `cv_soil_sample_results` | YES | NO | NO | sample_id: YES | interpretation: APP-LAYER | YES |
| `cv_startup_events` | YES | NO | YES | container_id, prior_teardown_id, prior_soil_sample_id, ready_sign_off_by, performed_by, created_by: YES | — | YES |
| `cv_fertigation_recipes` | YES | NO | YES | approved_by, created_by: YES | name: APP-LAYER | YES |
| `cv_fertigation_recipe_ingredients` | YES | NO | NO | recipe_id: YES; input_id: intentionally no FK (farmstock) | rate_unit: APP-LAYER | YES |
| `cv_foliar_recipes` | YES | NO | YES | approved_by, created_by: YES | — | YES |
| `cv_foliar_recipe_ingredients` | YES | NO | NO | foliar_recipe_id: YES; input_id: intentionally no FK (farmstock) | — | YES |
| `cv_input_phi_stage_overrides` | YES | NO | YES | created_by: YES; input_id: intentionally no FK (farmstock) | batch_stage: APP-LAYER | YES |
| `cv_applications_fertigation` | YES | NO | YES | batch_id, recipe_id, applicator, corrects_id, created_by: YES | — | YES |
| `cv_applications_foliar` | YES | NO | YES | batch_id, row_id, container_id, foliar_recipe_id, applicator, corrects_id, created_by: YES; input_id/input_lot_id: intentionally no FK (farmstock) | — | YES |
| `cv_applications_pesticide` | YES | NO | YES | batch_id, row_id, container_id, rei_cleared_by, applicator, corrects_id, created_by: YES; input_id/input_lot_id: intentionally no FK (farmstock) | application_method, pest_pressure, metrc_sync_status: APP-LAYER | YES |
| `cv_observations` | YES | NO | YES | batch_id, row_id, container_id, observer, created_by: YES | category, severity: APP-LAYER | YES |
| `cv_metrc_sync_log` | YES | NO | YES | batch_id, created_by: YES | sync_type, status: APP-LAYER | YES |
| `cv_harvest_batches` | YES | YES | YES | batch_id, started_by, closed_by, created_by: YES | status, close_reason, batch_type: APP-LAYER | PARTIAL (010 drops columns on down; pre-010 rows unaffected) |
| `cv_plant_harvest_events` | YES | YES | YES | harvest_batch_id, batch_id, plant_assignment_id, container_id, applicator, created_by: YES | event_type, product_type, metrc_sync_status: APP-LAYER | YES |
| `cv_plant_waste_trim_events` | YES | YES | YES | batch_id, container_id, row_id, plant_assignment_id, harvest_batch_id, harvest_event_id, disposed_by, applicator, created_by: YES | trim_reason, waste_status, disposition, metrc_sync_status: APP-LAYER | YES |
| `cv_locations` | YES | NO | NO | sub_zone_id: YES | location_type: APP-LAYER | YES |
| `cv_sub_locations` | YES | NO | NO | location_id: YES | — | YES |
| `cv_batch_phase_history` | YES | NO | NO (has transitioned_by) | batch_id, transitioned_by: YES | metrc_sync_status: APP-LAYER | YES |
| `cv_batch_location_history` | YES | NO | NO (has moved_by) | batch_id, from_location_id, to_location_id, moved_by: YES; **planting_plan_id: NO FK** (deferred; documented in 013) | trigger, metrc_sync_status: APP-LAYER | PARTIAL (drops table but cv_batches.current_location_id column cannot be removed — SQLite) |
| `cv_planting_plans` | YES | YES | YES | batch_id, sub_zone_id, supersedes_plan_id, created_by: YES | status: APP-LAYER | YES |
| `cv_planting_plan_items` | YES | NO | NO (has committed_by) | plan_id, container_id, committed_by, plant_assignment_id: YES | status: APP-LAYER | YES |

### Notable completeness gaps

1. **`cv_batch_stage_recipes.recipe_id`** — no FK to `cv_fertigation_recipes`. Comment in 003 says "FK added in 006" but 006 does not add it. The column is unguarded. Low risk (validated at app layer on insert) but means SQLite won't catch orphaned recipe_id values.

2. **`cv_teardown_events.soil_sample_id` and `cv_container_amendments.soil_sample_id`** — intentionally deferred FKs, but there is no migration that adds them after the referenced table exists. Application layer must guard this.

3. **`cv_batch_location_history.planting_plan_id`** — explicitly documented as an app-layer integrity column; acceptable.

4. **`updated_at` absent on most tables** — of the 37 tables, only 8 have `updated_at` (cv_users, cv_batches, cv_container_state, cv_harvest_batches, cv_plant_harvest_events, cv_plant_waste_trim_events, cv_planting_plans, cv_container_state_transitions does NOT). The compliance docs reference 5-year retention; missing `updated_at` prevents auditing when records were corrected.

5. **Infrastructure tables (`cv_zones`, `cv_sub_zones`, `cv_rows`, `cv_containers`) have no audit columns** — appropriate for seed/reference data that never changes.

6. **`cv_plant_assignments` missing `updated_at`** — this table is mutated by tag-assignment, unassignment, and reassignment. Mutations are logged via other tables, but the assignment record itself has no last-modified timestamp.

---

## Section 2: Missing Indexes

No custom indexes exist in any migration. SQLite creates automatic indexes only for PRIMARY KEY and UNIQUE constraints. Every non-PK/UNIQUE join or filter column is doing a full table scan.

### Index recommendations

For each entry: **Impact = HIGH / MEDIUM / LOW** based on query frequency × expected table size.

| # | Table | Column(s) | Query pattern | Impact |
|---|---|---|---|---|
| 1 | `cv_plant_assignments` | `(batch_id, unassigned_at)` | `BATCH_SELECT` correlated subquery runs on every batch list load to derive `active_assignment_count`; also `GET /harvest/batch/:id`, plant-loss count checks | **HIGH** |
| 2 | `cv_plant_assignments` | `(container_id, unassigned_at)` | Container detail current-tag lookup; tag-assignment untagged scan; `GET /tag-assignments/container/:id` | **HIGH** |
| 3 | `cv_plant_assignments` | `(metrc_plant_tag)` | Tag deduplication check on every POST to tag-assignments (finds existing active assignment by tag); bulk assignment inner loop | **HIGH** |
| 4 | `cv_batch_stage_recipes` | `(batch_id, effective_to)` | `BATCH_SELECT` LEFT JOIN `WHERE effective_to IS NULL` on every batch list and detail load | **HIGH** |
| 5 | `cv_observations` | `(batch_id, category)` | `GET /observations/readiness-summary` filters `WHERE batch_id = ? AND category = 'harvest_readiness'`; also plain list `WHERE batch_id = ? AND category = ?` | **HIGH** |
| 6 | `cv_plant_harvest_events` | `(plant_assignment_id, event_type)` | EXISTS subquery per assignment in `GET /harvest/batch/:id` — runs N times where N = plant count (up to 300 plants/batch) | **HIGH** |
| 7 | `cv_plant_harvest_events` | `(harvest_batch_id, event_type)` | Two COUNT subqueries per harvest batch row; also `WHERE harvest_batch_id = ?` for event creation validation | **HIGH** |
| 8 | `cv_plant_harvest_events` | `(batch_id)` | `GET /exports/cultivation-record` fetches all harvest events by batch; `WHERE batch_id = ? AND unassigned_at IS NULL` count at auto-close | **HIGH** |
| 9 | `cv_batch_phase_history` | `(batch_id)` | Queried on every `GET /batches/:id`, every transition, and every export | **HIGH** |
| 10 | `cv_batch_location_history` | `(batch_id)` | Same as phase history — on every detail load, every transition, every export | **HIGH** |
| 11 | `cv_applications_fertigation` | `(batch_id, applied_at)` | List route (`WHERE batch_id = ?`), application count on batch detail, export route | **HIGH** |
| 12 | `cv_applications_foliar` | `(batch_id, applied_at)` | Same query patterns as fertigation | **HIGH** |
| 13 | `cv_applications_pesticide` | `(batch_id, applied_at)` | Same query patterns; also `WHERE date(ap.applied_at)` range filter in MDA export | **HIGH** |
| 14 | `cv_container_state_transitions` | `(container_id)` | Container detail loads all transitions; also queried for past batches via DISTINCT JOIN | **MEDIUM** |
| 15 | `cv_container_amendments` | `(container_id)` | Container detail amendment history | **MEDIUM** |
| 16 | `cv_container_amendments` | `(batch_id)` | Exports `GET /metrc-additives` and `GET /cultivation-record/:id` filter by batch | **MEDIUM** |
| 17 | `cv_teardown_events` | `(container_id)` | Container detail | **MEDIUM** |
| 18 | `cv_startup_events` | `(container_id)` | Container detail | **MEDIUM** |
| 19 | `cv_soil_samples` | `(container_id)` | `GET /:containerId/soil-samples` | **MEDIUM** |
| 20 | `cv_plant_loss_events` | `(batch_id)` | List route filter; exports cultivation-record | **MEDIUM** |
| 21 | `cv_plant_loss_events` | `(metrc_sync_status)` | List route `?metrc_sync_status=pending` filter; Today screen surfaces unsynced losses | **MEDIUM** |
| 22 | `cv_harvest_batches` | `(batch_id)` | Harvest status endpoint; export cultivation-record; auto-close MAX(sequence_number) | **MEDIUM** |
| 23 | `cv_plant_waste_trim_events` | `(batch_id)` | List filter; cultivation-record export | **MEDIUM** |
| 24 | `cv_plant_waste_trim_events` | `(waste_status)` | List filter `?waste_status=collected` for Today screen | **MEDIUM** |
| 25 | `cv_metrc_sync_log` | `(status)` | Today screen pending-sync surface | **LOW** |
| 26 | `cv_observations` | `(container_id)` | Observation list `?container_id=` filter (harvest walkthrough) | **LOW** |
| 27 | `cv_planting_plan_items` | `(plan_id, status)` | Commit workflow iterates items by plan; filter to draft/committed status | **LOW** |
| 28 | `cv_applications_foliar` | `(applied_at)` | Date-range filter in export without batch_id; ORDER BY applied_at DESC | **LOW** |
| 29 | `cv_applications_pesticide` | `(applied_at)` | MDA export date range filter `date(applied_at) >= ? AND <= ?` | **LOW** |

---

## Section 3: N+1 Query Risks

| Route | Issue | Estimated scale | Fix |
|---|---|---|---|
| `GET /batches` (BATCH_SELECT) | Correlated subquery `(SELECT COUNT(*) FROM cv_plant_assignments … WHERE batch_id = b.batch_id)` runs once per batch row returned. With the current ~10–15 active batches this is 10–15 extra reads. At scale (archived batches shown) this multiplies. | 10–50 rows typical; index on `(batch_id, unassigned_at)` required | Add index (item #1 above). Single-query approach is fine — the subquery is embedded in the main SELECT, so it avoids a round-trip loop. No change needed beyond the index. |
| `GET /harvest/batch/:batchId` — assignments query | `CASE WHEN EXISTS (SELECT 1 FROM cv_plant_harvest_events WHERE plant_assignment_id = pa.assignment_id AND event_type = 'final_harvest')` — one EXISTS per assignment row. A full 300-plant batch means 300 EXISTS calls. | Up to ~300 exists calls per batch | Add composite index on `(plant_assignment_id, event_type)` (item #6). Alternatively rewrite as a LEFT JOIN with `GROUP BY`. |
| `GET /harvest/batch/:batchId` — harvest batch counts | Two correlated COUNT subqueries per harvest batch: `partial_harvest_count` and `final_harvest_count`. Typical 1–2 harvest batches means 2–4 subqueries. | Low: 1–3 harvest batches per batch | Add index on `(harvest_batch_id, event_type)` (item #7). Acceptable as-is with index. |
| `GET /containers/:id` (container detail) | 8 separate queries to build the detail response (container info, state, current batch, current tag, state history, amendments, teardown events, startup events, past batches). Each is a separate DB call. | Single container, ~10 queries per request | Acceptable for a detail view; SQLite local queries are fast. Not a true N+1 — number of queries is fixed, not proportional to data size. |
| `GET /exports/metrc-additives` | 4 separate unbounded queries (one per application type), then `fetchFarmstockItems` makes one HTTP call per unique input_id (using `Promise.all`). Fetch calls are parallel, but at large scale this could be many parallel HTTP requests. | Up to ~50 unique input_ids | The `Promise.all` pattern is correct. Risk is external HTTP latency, not N+1. Consider batching farmstock catalog fetch as one call if the farmstock API supports it. |
| `GET /containers/summary` | Loads all 1,180 container rows from `cv_container_state` with 3-level joins, then aggregates in JavaScript. | Fixed: 1,180 rows always | Move aggregation to SQL: `GROUP BY r.sub_zone_id, cs.current_state` with a COUNT. Current approach is ~1,180 rows transferred from SQLite to Node on every dashboard refresh. |

---

## Section 4: Large Query Risks (Unbounded Result Sets)

| Route | Table | LIMIT present | Estimated max rows | Risk |
|---|---|---|---|---|
| `GET /harvest/waste-trim` | `cv_plant_waste_trim_events` | **NO** | ~500–1,000 at full season | **MEDIUM** — should add `LIMIT 500` default with pagination |
| `GET /plant-loss` | `cv_plant_loss_events` | **NO** | ~100–300 at full season | **LOW** — but should add `LIMIT` |
| `GET /exports/metrc-additives` | All four application tables | **NO** | ~2,000+ records/year across all types | **MEDIUM** — intentional export endpoint; acceptable for JSON but add a `record_limit` warning header when > 1,000 rows returned |
| `GET /exports/mda-pesticide` | `cv_applications_pesticide` | **NO** | ~50–200/year | **LOW** — acceptable; pesticide applications are infrequent |
| `GET /exports/cultivation-record/:batchId` | 10+ unbounded queries | **NO** | Per batch: up to ~400 fertigation, 50 foliar, 300 observations | **LOW** — intentional audit export; acceptable. Consider streaming response for very large batches. |
| `GET /tag-assignments/untagged` | `cv_plant_assignments` | **NO** | Up to ~600 untagged rows during initial tag walk | **LOW** — acceptable for setup workflow |
| `GET /containers` (sub_zone list) | `cv_containers` + joins | **NO** | Fixed: 145–150 per sub_zone | **LOW** — bounded by sub_zone size |
| `GET /fertigation-applications` | `cv_applications_fertigation` | YES — `LIMIT ?` (default 50, max 500) | N/A | OK |
| `GET /observations` | `cv_observations` | YES — `LIMIT ?` (default 100, max 1000) | N/A | OK but max 1,000 is high |

**Critical finding:** `GET /harvest/waste-trim` with no filters returns the entire `cv_plant_waste_trim_events` table with no LIMIT. This is the only list endpoint with zero protection against growing unboundedly.

---

## Section 5: PRAGMA and Connection Configuration

Current configuration (from `src/db/index.ts` lines 24–25):

```typescript
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

| PRAGMA | Current | Recommended | Impact |
|---|---|---|---|
| `journal_mode` | WAL | WAL ✓ | Enables concurrent readers with one writer. Critical for a web app. |
| `foreign_keys` | ON | ON ✓ | Enforces FK constraints. Critical for data integrity. |
| `synchronous` | FULL (default) | NORMAL | FULL flushes to disk after every transaction. NORMAL is safe with WAL and provides ~2× write throughput with negligible crash-recovery risk (WAL journal covers any uncommitted data). |
| `busy_timeout` | 0 (immediate fail) | 5000 (5 seconds) | Default of 0 means concurrent writes immediately return SQLITE_BUSY. A Railway deployment could have occasional write contention (e.g., two mobile devices submitting simultaneously). A 5-second timeout silently retries instead of returning a 500. |
| `cache_size` | -2000 (2 MB) | -8000 (8 MB) | At 1,180 containers with full history, the working set during a batch detail load is several MB. Increasing cache reduces re-reads for hot pages (batch list, container state). |
| `temp_store` | FILE (default) | MEMORY | Subqueries and ORDER BY operations use temp tables. In-memory temp storage avoids disk I/O for the frequent sorting operations in application list routes. |
| `mmap_size` | 0 (disabled) | 268435456 (256 MB) | Memory-mapped I/O can significantly improve read performance when the database fits in the OS page cache. This DB should stay well under 256 MB for years. |

**Observation:** `PRAGMA foreign_keys = ON` is set on the Knex connection used for migrations, then the migrations run, then Knex is destroyed, and the raw `db` (better-sqlite3) instance is returned. The raw `db` instance has the pragma set via `db.pragma('foreign_keys = ON')` at line 25. This is correct — better-sqlite3 pragmas apply to the connection object. No issue.

**Potential issue:** WAL mode `journal_mode = WAL` is set on the `db` (better-sqlite3) instance at line 24, before migrations run via a *separate* Knex connection at a different path. Knex creates its own SQLite connection, so WAL mode must also apply on that connection. Since WAL is a database-level setting (persisted in the database file), setting it first on `db` means the Knex connection inherits it. This is correct behavior — no fix needed, but worth noting.

---

## Section 6: Recommended Migration — `015_indexes.ts`

**Do not create this file yet. Review content below before implementing.**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── PRAGMA tuning ──────────────────────────────────────────────────────────
  // These apply to the Knex connection used for migrations and normal DB use.
  // The main app also sets these via db.pragma() in initDB(); this ensures
  // the migration connection benefits during any long-running index builds.
  await knex.raw("PRAGMA synchronous = NORMAL");
  await knex.raw("PRAGMA busy_timeout = 5000");
  await knex.raw("PRAGMA cache_size = -8000");
  await knex.raw("PRAGMA temp_store = MEMORY");
  await knex.raw("PRAGMA mmap_size = 268435456");

  // ── cv_plant_assignments ───────────────────────────────────────────────────
  // (batch_id, unassigned_at): BATCH_SELECT correlated subquery (every list load)
  // and harvest/plant-loss active count checks.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_batch_active
    ON cv_plant_assignments (batch_id, unassigned_at)
  `);

  // (container_id, unassigned_at): tag-assignment and container detail current-tag lookup.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_container_active
    ON cv_plant_assignments (container_id, unassigned_at)
  `);

  // (metrc_plant_tag): tag deduplication check on every tag assignment.
  // Covers WHERE metrc_plant_tag = ? AND unassigned_at IS NULL.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_tag
    ON cv_plant_assignments (metrc_plant_tag)
  `);

  // ── cv_batch_stage_recipes ─────────────────────────────────────────────────
  // (batch_id, effective_to): BATCH_SELECT LEFT JOIN WHERE effective_to IS NULL.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_stage_recipes_batch_active
    ON cv_batch_stage_recipes (batch_id, effective_to)
  `);

  // ── cv_observations ────────────────────────────────────────────────────────
  // (batch_id, category): readiness summary query and general list filter.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_observations_batch_category
    ON cv_observations (batch_id, category)
  `);

  // (container_id): harvest walkthrough per-container filter.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_observations_container
    ON cv_observations (container_id)
  `);

  // ── cv_plant_harvest_events ────────────────────────────────────────────────
  // (plant_assignment_id, event_type): EXISTS check per plant in harvest status query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_assignment_type
    ON cv_plant_harvest_events (plant_assignment_id, event_type)
  `);

  // (harvest_batch_id, event_type): COUNT subqueries in harvest status query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_batch_type
    ON cv_plant_harvest_events (harvest_batch_id, event_type)
  `);

  // (batch_id): cultivation-record export and auto-close active-count check.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_batch
    ON cv_plant_harvest_events (batch_id)
  `);

  // ── cv_batch_phase_history ─────────────────────────────────────────────────
  // (batch_id): queried on every batch detail load, transition, and export.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_phase_history_batch
    ON cv_batch_phase_history (batch_id)
  `);

  // ── cv_batch_location_history ──────────────────────────────────────────────
  // (batch_id): same frequency as phase history.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_location_history_batch
    ON cv_batch_location_history (batch_id)
  `);

  // ── cv_applications_fertigation ────────────────────────────────────────────
  // (batch_id, applied_at): list filter + date filter + ORDER BY.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_fertigation_batch_date
    ON cv_applications_fertigation (batch_id, applied_at)
  `);

  // ── cv_applications_foliar ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_foliar_batch_date
    ON cv_applications_foliar (batch_id, applied_at)
  `);

  // ── cv_applications_pesticide ──────────────────────────────────────────────
  // applied_at also used standalone in MDA date-range export.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pesticide_batch_date
    ON cv_applications_pesticide (batch_id, applied_at)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pesticide_date
    ON cv_applications_pesticide (applied_at)
  `);

  // ── cv_container_state_transitions ────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_state_transitions_container
    ON cv_container_state_transitions (container_id)
  `);

  // ── cv_container_amendments ────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_amendments_container
    ON cv_container_amendments (container_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_amendments_batch
    ON cv_container_amendments (batch_id)
  `);

  // ── cv_teardown_events ─────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_teardown_events_container
    ON cv_teardown_events (container_id)
  `);

  // ── cv_startup_events ──────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_startup_events_container
    ON cv_startup_events (container_id)
  `);

  // ── cv_soil_samples ────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_soil_samples_container
    ON cv_soil_samples (container_id)
  `);

  // ── cv_plant_loss_events ───────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_loss_batch
    ON cv_plant_loss_events (batch_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_loss_sync_status
    ON cv_plant_loss_events (metrc_sync_status)
  `);

  // ── cv_harvest_batches ─────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_batches_batch
    ON cv_harvest_batches (batch_id)
  `);

  // ── cv_plant_waste_trim_events ─────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_waste_trim_batch
    ON cv_plant_waste_trim_events (batch_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_waste_trim_status
    ON cv_plant_waste_trim_events (waste_status)
  `);

  // ── cv_metrc_sync_log ──────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_metrc_sync_log_status
    ON cv_metrc_sync_log (status)
  `);

  // ── cv_planting_plan_items ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_planting_plan_items_plan_status
    ON cv_planting_plan_items (plan_id, status)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes in reverse order
  const indexes = [
    'idx_planting_plan_items_plan_status',
    'idx_metrc_sync_log_status',
    'idx_waste_trim_status',
    'idx_waste_trim_batch',
    'idx_harvest_batches_batch',
    'idx_plant_loss_sync_status',
    'idx_plant_loss_batch',
    'idx_soil_samples_container',
    'idx_startup_events_container',
    'idx_teardown_events_container',
    'idx_container_amendments_batch',
    'idx_container_amendments_container',
    'idx_container_state_transitions_container',
    'idx_pesticide_date',
    'idx_pesticide_batch_date',
    'idx_foliar_batch_date',
    'idx_fertigation_batch_date',
    'idx_batch_location_history_batch',
    'idx_batch_phase_history_batch',
    'idx_harvest_events_batch',
    'idx_harvest_events_batch_type',
    'idx_harvest_events_assignment_type',
    'idx_observations_container',
    'idx_observations_batch_category',
    'idx_batch_stage_recipes_batch_active',
    'idx_plant_assignments_tag',
    'idx_plant_assignments_container_active',
    'idx_plant_assignments_batch_active',
  ];
  for (const idx of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${idx}`);
  }

  // Note: PRAGMA changes are not reversible via migration.
  // synchronous/busy_timeout/cache_size/temp_store/mmap_size revert to
  // SQLite defaults when the database file is opened with no PRAGMA set.
  // Ensure initDB() explicitly sets these so they apply at runtime.
}
```

### Required companion change to `src/db/index.ts`

The PRAGMA migration above only affects the Knex connection during migration. Add these pragmas to `initDB()` so they apply on every app start:

```typescript
// After existing pragmas (line 25):
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -8000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456');
```

---

## Section 7: Summary — Top 10 by Impact

| Rank | Issue | Effort | Impact |
|---|---|---|---|
| 1 | **No index on `cv_plant_assignments (batch_id, unassigned_at)`** — correlated subquery runs on every batch list page load. | 5 min | **HIGH** — adds to every `GET /batches` response time; worsens as batch count grows |
| 2 | **No index on `cv_batch_stage_recipes (batch_id, effective_to)`** — same BATCH_SELECT runs on every batch load. | 5 min | **HIGH** — the active recipe is shown on every batch card |
| 3 | **No index on `cv_plant_harvest_events (plant_assignment_id, event_type)`** — EXISTS subquery per plant in harvest status. At 300 plants/batch, this is 300 full table scans per `GET /harvest/batch/:id` call during harvesting. | 5 min | **HIGH** — critical during the harvest window when this endpoint is polled frequently |
| 4 | **No index on `cv_batch_phase_history (batch_id)` and `cv_batch_location_history (batch_id)`** — both queried on every batch detail load and every transition. | 5 min | **HIGH** — compounds with batch count growth; every detail view pays this cost |
| 5 | **No index on application tables `(batch_id, applied_at)`** — fertigation, foliar, pesticide lists and export queries all scan by batch_id. | 15 min | **HIGH** — a batch with 365 fertigation records scans all of them on every list load |
| 6 | **`PRAGMA busy_timeout = 0`** — any concurrent write returns immediate SQLITE_BUSY (HTTP 500). | 2 min | **MEDIUM** — field staff on mobile submit simultaneously; two applicators logging fertigation at the same time will produce silent 500 errors |
| 7 | **`PRAGMA synchronous = FULL` (default)** — doubles write latency vs NORMAL for no practical benefit with WAL mode. | 2 min | **MEDIUM** — each of the daily ~365 fertigation writes pays this cost |
| 8 | **`GET /harvest/waste-trim` has no LIMIT clause** — returns unbounded rows as operation accumulates waste trim events over years. | 20 min | **MEDIUM** — low risk in year 1; grows to hundreds of rows and constitutes tech debt |
| 9 | **`GET /containers/summary` loads all 1,180 state rows into Node for JS aggregation** — should be a SQL `GROUP BY`. | 30 min | **MEDIUM** — the dashboard card refreshes on Today screen load; 1,180 rows × 4-table join transferred to Node on every load |
| 10 | **`updated_at` absent on most compliance tables** — `cv_plant_assignments`, `cv_observations`, `cv_applications_foliar`, `cv_applications_pesticide`, etc. lack `updated_at`. Corrections (via `corrects_id`) are traceable, but the corrected record itself has no last-modified timestamp. | 2–3 hrs (ALTER TABLE per table) | **LOW-MEDIUM** — no immediate operational impact; relevant during regulatory audit when auditor asks "when was this record last modified" |

---

*Audit produced by static code review of migrations 001–014 and route files. No live query plans were captured; impact estimates are based on expected data volume per CLAUDE.md operational parameters (~1,360 plants/year, 1,180 containers, ~365 fertigation applications/batch/year).*
