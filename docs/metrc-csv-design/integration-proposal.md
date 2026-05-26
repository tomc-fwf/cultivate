# METRC CSV Upload Service — Phase 0 Integration Proposal

**Date:** 2026-05-26  
**Author:** Claude Code  
**Status:** Draft — awaiting operator review before any implementation begins

---

## Reading List Completed

Before writing this proposal I read, in full:

1. `CLAUDE_CODE_KICKOFF_v2.md` — project brief and requirements  
2. `METRC_CSV_API_Spec_v1.1.0.xlsx` — all 9 sheets (Overview, Revision History, Fields, Workflow Triggers, Reference Tables, Cultivate Schema, Validation Rules, API Mapping, Open Questions)  
3. All 22 CSV template files in `docs/metrc-csv-design/` — confirmed exact column headers  
4. The Cultivate codebase — schema (migrations 001–041), all `src/api/routes/*.ts`, all relevant `client/src/pages/*.jsx`, existing METRC sync code  

---

## 1. Service Architecture

### Recommendation: In-process module inside Cultivate

The METRC CSV service should be a **module within Cultivate's existing Fastify application**, not a separate process, microservice, or shared library.

**Justification:**

| Factor | What I observed | Implication |
|--------|----------------|-------------|
| Application shape | Single Fastify monolith; no inter-service communication infrastructure exists | A separate microservice would require adding HTTP client, service discovery, and auth handoff from scratch |
| Database | Single SQLite file accessed via `better-sqlite3` directly in route handlers | The CSV generators need to read from `cv_batches`, `cv_plant_assignments`, `harvest_batches`, `plant_harvest_events`, etc. Direct SQLite access is the only practical pattern here |
| Scale | Single-tenant, one facility, ~1,360 plants/year | There is no workload that justifies the operational overhead of a separate deployment |
| Deployment | Railway — one service, one container | Two services would require a second Railway service, environment coordination, and cross-service networking |
| Auth | JWT decoded by `requireAuth` middleware in `auth.middleware.ts`; `req.user = { id, name, role }` | The service module uses the same middleware; no auth handoff needed |
| Existing exports | Current METRC Export (`GET /api/exports/metrc`) is an in-process route that reads from the DB directly | This service follows the same pattern |

**Module layout:**

```
src/
  lib/
    metrc-csv/
      generators/          # One file per upload type (e.g., additive-template.ts)
      writers/             # CSV file writing utility (atomic write, CRLF, UTF-8 no BOM)
      validators/          # Per-type validation (Zod schemas + cross-field rules)
      ref-data/            # In-memory or DB-backed lookup cache for ref tables
      index.ts             # Public API of the module
  api/
    routes/
      metrc-csv.ts         # Route handlers; thin — delegate to lib/metrc-csv/
```

**Authentication:** The module uses Cultivate's existing `requireAuth`/`requireRole` middleware. All `/api/metrc/csv/*` routes require `grower` role minimum; admin-only routes (ref data management) require `admin`. No new auth layer is needed.

**Data access:** Direct `better-sqlite3` queries against Cultivate's SQLite database, same as all other routes. The generators read from both existing Cultivate tables (batches, locations, strains) and new METRC-specific tables (see Section 2).

**Deployment:** Same Railway artifact as Cultivate. Zero additional deployment overhead. The new routes register into `app.ts` just like existing routes.

**CSV output path:** Environment-configurable via `METRC_CSV_OUTPUT_DIR` env var, defaulting to `./Metrc-csv-uploads`. Railway writes to ephemeral filesystem; the directory path should be documented as requiring a Railway volume mount for persistence. Without a volume, files survive only until the container restarts. **This is a deployment gap to address before Phase 1 ships.**

---

## 2. Data Model Reconciliation

The spec proposes 14 domain tables plus a CSV audit table and ~12 reference tables. Below is the full categorization.

### Already Exists — Use As-Is

| Spec table | Cultivate equivalent | Column differences | Action |
|-----------|---------------------|-------------------|--------|
| `locations` | `cv_locations` | Cultivate already has `metrc_name` column (migration 011). Exact match for METRC location name lookups. | None |
| `strains` | `cv_strains` | Column names differ (`name`, `type` match the spec). Cultivate also has `genetics`, `notes`. | None |

### Needs Extending — Existing Table, Missing Columns

**`cv_batches` → spec's `plant_batches`**

`cv_batches` covers the full lifecycle (germ → closed). The spec's `plant_batches` focuses on the immature phase and source provenance. The following columns need to be added:

| Add to `cv_batches` | Type | Nullable | Purpose |
|---------------------|------|----------|---------|
| `metrc_source_type` | TEXT | Yes | `none \| package \| plant \| batch_split \| ingredient_batches` — how the batch originated in METRC |
| `metrc_source_package_label` | TEXT (24) | Yes | Source package tag when `metrc_source_type = package` |
| `metrc_source_plant_label` | TEXT (24) | Yes | Source plant tag when `metrc_source_type = plant` |
| `metrc_source_batch_name` | TEXT | Yes | Source batch name when `metrc_source_type = batch_split` |
| `metrc_ingredient_batch_names` | TEXT (JSON) | Yes | Array of source batch names for Create Plantings (#2) multi-source pattern |
| `metrc_package_adjustment_amount` | REAL | Yes | Package adjustment when sourced from a package (#17) |
| `metrc_package_adjustment_uom` | TEXT | Yes | UoM for the adjustment |
| `metrc_id` | INTEGER | Yes | METRC-assigned batch ID (Phase 5) |
| `metrc_csv_generated_at` | TEXT | Yes | Timestamp of last CSV generation |
| `metrc_csv_file_path` | TEXT | Yes | Path to last generated CSV |
| `metrc_submitted_at` | TEXT | Yes | Timestamp of last successful API submission (Phase 5) |

Note: `cv_batches.metrc_plant_batch_uid` already exists (migration 004) — this serves as the `metrc_id` equivalent for the existing schema. These are the same concept; we should use `metrc_plant_batch_uid` rather than adding a duplicate `metrc_id` column.

**`harvest_batches` → spec's `harvests`**

`harvest_batches` is the direct equivalent of the spec's `harvests` table (METRC harvest lot). Missing:

| Add to `harvest_batches` | Type | Nullable | Purpose |
|--------------------------|------|----------|---------|
| `is_auto_generated_name` | INTEGER (bool) | No | True when HarvestName was left blank and METRC auto-generated it |
| `metrc_harvest_id` | INTEGER | Yes | METRC-assigned harvest ID (distinct from existing `metrc_harvest_batch_uid`) |
| `total_packaged_weight` | REAL | No (default 0) | Sum of weights packaged from this harvest via #15 |
| `metrc_csv_generated_at` | TEXT | Yes | |
| `metrc_submitted_at` | TEXT | Yes | |

**`plant_harvest_events` → spec's `harvest_events`**

The spec's `harvest_events` covers both full harvest (`full_harvest` = #5 Harvest Plants) and manicure (`manicure` = #11 Manicure Plants). Cultivate's `plant_harvest_events` covers `partial_harvest` and `final_harvest`. The mapping is:

- Cultivate `final_harvest` = METRC `full_harvest` (plant ends)
- Cultivate `partial_harvest` = METRC `manicure` (plant survives)

Missing columns to add:

| Add to `plant_harvest_events` | Type | Nullable | Purpose |
|-------------------------------|------|----------|---------|
| `metrc_event_id` | INTEGER | Yes | From API response for manicure (#11 returns Ids); NULL for full harvest (#5 returns nothing) |
| `plant_count` | INTEGER | Yes | PlantCount field for manicure events only (Q42 semantics unclear) |
| `metrc_csv_generated_at` | TEXT | Yes | |
| `metrc_csv_file_path` | TEXT | Yes | |
| `metrc_submitted_at` | TEXT | Yes | |

**`plant_waste_trim_events` → partial spec `waste_events`**

Cultivate's `plant_waste_trim_events` covers individual plant waste trim (defoliation, IPM removal, etc.) — this maps to the spec's `waste_events` with `waste_type = plant` (#21 Plants Waste). However, the spec also covers immature batch waste (#9 Immature Plants Waste) which Cultivate doesn't have.

Missing on `plant_waste_trim_events`:

| Add | Type | Nullable | Purpose |
|-----|------|----------|---------|
| `metrc_waste_method` | TEXT | Yes | FK to `cv_metrc_plant_waste_methods`; the METRC-specific waste method (e.g., "Clipping", "Compost") — distinct from Cultivate's `trim_reason` |
| `metrc_mixed_material` | TEXT | Yes | Material mixed with cannabis waste (e.g., "Soil", "Cardboard") |
| `metrc_waste_reason` | TEXT | Yes | FK to `cv_metrc_plant_waste_reasons` (e.g., "Trim", "Waste") |
| `metrc_plant_labels_pipe` | TEXT | Yes | Pipe-delimited list of plant tags for this waste event (generated from plant_assignment_id at CSV time) |
| `metrc_csv_generated_at` | TEXT | Yes | |
| `metrc_csv_file_path` | TEXT | Yes | |
| `metrc_submitted_at` | TEXT | Yes | |

**`plant_loss_events` → partial spec `destruction_events`**

Cultivate's `plant_loss_events` covers individually tagged plants destroyed mid-batch (spec type #4 Destroy Plants). However, the spec also covers immature batch destruction (#3 Destroy Immature Plants) which Cultivate doesn't separate as a distinct record type.

Missing on `plant_loss_events`:

| Add | Type | Nullable | Purpose |
|-----|------|----------|---------|
| `metrc_waste_method` | TEXT | Yes | METRC waste method |
| `metrc_waste_material_mixed` | TEXT | Yes | Mixed material |
| `metrc_waste_reason` | TEXT | Yes | FK to `cv_metrc_plant_waste_reasons` |
| `metrc_waste_weight` | REAL | No (default 0) | Waste weight; 0 = no-waste destruction |
| `metrc_waste_uom` | TEXT | Yes | UoM for waste weight |
| `metrc_reason_note` | TEXT | Yes | Optional METRC-specific reason note |
| `metrc_csv_generated_at` | TEXT | Yes | |
| `metrc_csv_file_path` | TEXT | Yes | |
| `metrc_submitted_at` | TEXT | Yes | |

### Truly New — No Existing Equivalent

All new tables should live in **Cultivate's main SQLite database** (not a separate database). They reference existing Cultivate tables and are read by existing Cultivate routes. A separate database would require cross-database queries that SQLite does not support.

Table naming convention: prefix `cv_metrc_` to distinguish from existing Cultivate tables.

---

**`cv_metrc_plant_state`** — The spec's `plants` table

This is the most important new table. Cultivate tracks the container-to-tag mapping via `cv_plant_assignments`, but it doesn't track "the plant" as a standalone entity with lifecycle state. For METRC, a plant has: current tag, growth phase, location, status (active/harvested/destroyed), and tag history.

This table is separate from `cv_plant_assignments` because:
- A plant tag can be reassigned to different containers (same plant, new container) — `cv_plant_assignments` creates a new row; this table updates in place
- Phase transitions (#19) change the plant's tag — this needs `previous_plant_tag` on the plant entity
- METRC operations reference the plant tag directly, not the container

```sql
cv_metrc_plant_state
  plant_state_id      INTEGER PK AUTOINCREMENT
  plant_tag           TEXT(24) NOT NULL UNIQUE          -- current 24-char METRC tag
  previous_plant_tag  TEXT(24) NULLABLE                -- tag before last growth phase transition
  tag_change_date     TEXT NULLABLE                    -- date of last tag replacement
  plant_batch_id      INTEGER NOT NULL REFERENCES cv_batches(batch_id)  -- source immature batch
  strain_id           INTEGER NOT NULL REFERENCES cv_strains(strain_id)
  growth_phase        TEXT NOT NULL                    -- Vegetative | Flowering
  location_id         INTEGER NOT NULL REFERENCES cv_locations(location_id)
  sublocation_id      INTEGER NULLABLE                 -- Cultivate sub-zone (mapped to METRC sublocation)
  phase_transition_date TEXT NOT NULL                  -- when plant entered current phase
  is_mother_plant     INTEGER NOT NULL DEFAULT 0
  patient_license_number TEXT NULLABLE
  status              TEXT NOT NULL DEFAULT 'active'   -- active | harvested | manicured | destroyed | packaged
  metrc_id            INTEGER NULLABLE                 -- METRC-assigned plant ID (Phase 5)
  metrc_csv_generated_at TEXT NULLABLE
  metrc_submitted_at  TEXT NULLABLE
  created_at          TEXT NOT NULL
  updated_at          TEXT NOT NULL
```

**Relationship with `cv_plant_assignments`:** When a plant is tagged (via Immature Plants Growth Phase #7), both a `cv_plant_assignments` row and a `cv_metrc_plant_state` row are created. They share the `metrc_plant_tag` value as the join key. When the plant moves containers, `cv_plant_assignments` gets a new row; `cv_metrc_plant_state` is updated in place (location_id updates). When the tag changes (#19), `cv_metrc_plant_state.plant_tag` = NewTag, `previous_plant_tag` = old Label.

---

**`cv_metrc_additive_templates`** — No equivalent exists

METRC Additive Templates are product registrations that define the active ingredients of a fertilizer, pesticide, or supplement. Cultivate's `cv_crop_inputs` overlaps conceptually (it also tracks products and EPA numbers) but has a different structure and purpose (REI enforcement, PHI tracking, lot-level inventory). These serve different masters and should remain separate tables.

The METRC-facing concept (additive template) must use METRC's exact field names internally because the CSV generator reads directly from this table. Cultivate-facing concept (crop input) must preserve full regulatory compliance data.

**Cross-reference:** When an additive template is created, operators should ideally link it to an existing `cv_crop_inputs` record (`crop_input_id FK`). This is optional but enables the UI to pre-fill template fields from the existing product catalog.

```sql
cv_metrc_additive_templates
  template_id                           INTEGER PK AUTOINCREMENT
  name                                  TEXT(100) NOT NULL UNIQUE
  additive_type                         TEXT(50) NOT NULL     -- Fertilizer | Pesticide | Other
  product_trade_name                    TEXT(200) NULLABLE
  epa_registration_number               TEXT(50) NULLABLE
  note                                  TEXT NULLABLE
  rei_quantity                          TEXT(10) NULLABLE
  rei_time_unit                         TEXT(50) NULLABLE
  product_supplier                      TEXT(200) NULLABLE
  application_device                    TEXT(200) NULLABLE
  active_ingredients                    TEXT NOT NULL         -- JSON: [{name, percentage}]
  crop_input_id                         INTEGER NULLABLE REFERENCES cv_crop_inputs(input_id)
  metrc_id                              INTEGER NULLABLE      -- Phase 5
  metrc_csv_generated_at               TEXT NULLABLE
  metrc_csv_file_path                   TEXT NULLABLE
  metrc_submitted_at                    TEXT NULLABLE
  created_by                            INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                            TEXT NOT NULL
  updated_at                            TEXT NOT NULL
```

---

**`cv_metrc_additive_applications`** — No equivalent exists

METRC additive applications (upload types #6, #10, #16) are simplified records that say "template X was applied to target Y on date Z at total_amount W." Cultivate's detailed application tables (`cv_applications_fertigation`, `cv_applications_foliar`, etc.) track much more (EC, pH, lot numbers, REI, weather data). These are parallel records serving different purposes — compliance vs. METRC reporting. Do not merge.

```sql
cv_metrc_additive_applications
  application_id              INTEGER PK AUTOINCREMENT
  application_type            TEXT(20) NOT NULL       -- immature_batch | plant | location
  template_id                 INTEGER NOT NULL REFERENCES cv_metrc_additive_templates(template_id)
  target_plant_batch_id       INTEGER NULLABLE REFERENCES cv_batches(batch_id)
  target_plant_tag            TEXT(24) NULLABLE
  target_location_id          INTEGER NULLABLE REFERENCES cv_locations(location_id)
  target_sublocation          TEXT NULLABLE
  rate                        TEXT(100) NULLABLE      -- opaque string "5 Pounds"
  volume                      TEXT(100) NULLABLE      -- opaque string "1000 Sq. ft."
  total_amount_applied        REAL NOT NULL
  total_amount_uom            TEXT(50) NOT NULL
  actual_date                 TEXT NOT NULL           -- stored as ISO-8601, serialized as M/D/YYYY h:mm:ss tt
  -- Links to Cultivate application records (optional cross-reference)
  cultivate_application_id    INTEGER NULLABLE        -- loose FK to whichever app table drove this
  cultivate_application_table TEXT NULLABLE           -- 'fertigation' | 'foliar' | 'pesticide'
  metrc_csv_generated_at      TEXT NULLABLE
  metrc_csv_file_path         TEXT NULLABLE
  created_by                  INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                  TEXT NOT NULL
```

---

**`cv_metrc_packages`** — No equivalent exists

Cultivate doesn't currently track METRC packages (immature plant packages, harvest packages, etc.). These are METRC inventory units distinct from plant batches.

```sql
cv_metrc_packages
  package_id                  INTEGER PK AUTOINCREMENT
  package_tag                 TEXT(24) NOT NULL UNIQUE
  item_name                   TEXT(200) NOT NULL
  source_type                 TEXT(30) NOT NULL   -- immature_batch|plant_group|mother_plant|harvest
  source_plant_batch_id       INTEGER NULLABLE REFERENCES cv_batches(batch_id)
  source_plant_group_label    TEXT(24) NULLABLE
  source_plant_label          TEXT(24) NULLABLE
  source_harvest_ingredients  TEXT NULLABLE       -- JSON: [{harvest_name, weight, unit_of_weight}]
  plant_batch_type            TEXT(20) NULLABLE   -- Clone | Seed (for mother_plant source)
  count                       INTEGER NULLABLE
  weight_amount               REAL NULLABLE
  weight_uom                  TEXT(50) NULLABLE
  location_id                 INTEGER NULLABLE REFERENCES cv_locations(location_id)
  sublocation                 TEXT NULLABLE
  patient_license_number      TEXT NULLABLE
  note                        TEXT NULLABLE
  is_trade_sample             INTEGER NOT NULL DEFAULT 0
  is_donation                 INTEGER NOT NULL DEFAULT 0
  production_batch_number     TEXT NULLABLE
  actual_date                 TEXT NOT NULL
  expiration_date             TEXT NULLABLE
  sell_by_date                TEXT NULLABLE
  use_by_date                 TEXT NULLABLE
  status                      TEXT NOT NULL DEFAULT 'active'
  metrc_id                    INTEGER NULLABLE
  metrc_csv_generated_at      TEXT NULLABLE
  metrc_csv_file_path         TEXT NULLABLE
  metrc_submitted_at          TEXT NULLABLE
  created_by                  INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                  TEXT NOT NULL
  updated_at                  TEXT NOT NULL
```

---

**`cv_metrc_package_adjustments`** — No equivalent exists

```sql
cv_metrc_package_adjustments
  adjustment_id               INTEGER PK AUTOINCREMENT
  package_id                  INTEGER NOT NULL REFERENCES cv_metrc_packages(package_id)
  quantity_change             REAL NOT NULL               -- signed; non-zero
  unit_of_measure             TEXT(50) NOT NULL
  adjustment_reason           TEXT(100) NOT NULL
  reason_note                 TEXT NULLABLE
  adjustment_date             TEXT NOT NULL
  employee_id                 INTEGER NOT NULL REFERENCES cv_employees(employee_id)
  metrc_id                    INTEGER NULLABLE
  metrc_csv_generated_at      TEXT NULLABLE
  metrc_csv_file_path         TEXT NULLABLE
  metrc_submitted_at          TEXT NULLABLE
  created_by                  INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                  TEXT NOT NULL
```

---

**`cv_metrc_immature_waste_events`** — No equivalent exists

Cultivate's `plant_waste_trim_events` covers individually tagged plants only. Immature batch waste (#9) is a different concept — waste from untagged seedlings/clones tracked at the batch level.

```sql
cv_metrc_immature_waste_events
  waste_event_id              INTEGER PK AUTOINCREMENT
  plant_batch_id              INTEGER NOT NULL REFERENCES cv_batches(batch_id)
  waste_method                TEXT(100) NOT NULL
  mixed_material              TEXT(100) NULLABLE
  waste_weight                REAL NOT NULL               -- > 0
  waste_uom                   TEXT(50) NOT NULL
  waste_reason                TEXT(100) NOT NULL
  note                        TEXT NULLABLE
  waste_date                  TEXT NOT NULL               -- YYYY-MM-DD
  metrc_csv_generated_at      TEXT NULLABLE
  metrc_csv_file_path         TEXT NULLABLE
  metrc_submitted_at          TEXT NULLABLE
  created_by                  INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                  TEXT NOT NULL
```

---

**`cv_metrc_immature_destruction_events`** — No equivalent exists

Cultivate's `plant_loss_events` covers individually tagged plants only. Immature batch destruction (#3) operates on the batch count level and has different semantics.

```sql
cv_metrc_immature_destruction_events
  destruction_id              INTEGER PK AUTOINCREMENT
  plant_batch_id              INTEGER NOT NULL REFERENCES cv_batches(batch_id)
  count                       INTEGER NOT NULL            -- plants destroyed
  waste_method                TEXT(100) NULLABLE          -- NULL when waste_weight = 0
  waste_material_mixed        TEXT(100) NULLABLE
  waste_reason                TEXT(100) NOT NULL
  reason_note                 TEXT NULLABLE
  waste_weight                REAL NOT NULL DEFAULT 0
  waste_uom                   TEXT(50) NULLABLE           -- NULL when waste_weight = 0
  actual_date                 TEXT NOT NULL
  metrc_id                    INTEGER NULLABLE
  metrc_csv_generated_at      TEXT NULLABLE
  metrc_csv_file_path         TEXT NULLABLE
  metrc_submitted_at          TEXT NULLABLE
  created_by                  INTEGER NOT NULL REFERENCES cv_users(id)
  created_at                  TEXT NOT NULL
```

---

**`cv_employees`** — No equivalent exists

Required for Package Adjustment (#12). `cv_users` doesn't track MN OCM employee license numbers.

```sql
cv_employees
  employee_id                 INTEGER PK AUTOINCREMENT
  license_number              TEXT(50) NOT NULL UNIQUE    -- e.g., "M12345", "C67890"
  name                        TEXT(200) NOT NULL
  role                        TEXT(50) NULLABLE
  user_id                     INTEGER NULLABLE REFERENCES cv_users(id)  -- optional link to Cultivate user
  is_active                   INTEGER NOT NULL DEFAULT 1
  created_at                  TEXT NOT NULL
  updated_at                  TEXT NOT NULL
```

---

**`cv_metrc_csv_uploads`** — No equivalent exists

Audit log of every CSV file generated.

```sql
cv_metrc_csv_uploads
  upload_id                   INTEGER PK AUTOINCREMENT
  upload_type                 TEXT(50) NOT NULL           -- e.g., "Plants Waste"
  file_path                   TEXT(500) NOT NULL
  row_count                   INTEGER NOT NULL
  generated_at                TEXT NOT NULL
  generated_by                INTEGER NOT NULL REFERENCES cv_users(id)
  metrc_submitted_at          TEXT NULLABLE
  metrc_response              TEXT NULLABLE               -- JSON
  status                      TEXT NOT NULL DEFAULT 'generated'  -- generated | submitted | failed
```

---

### Reference Tables — All New

These are small lookup tables populated by admin interface or seed data. All live in the main Cultivate SQLite DB.

| Table | Columns | Values | Population |
|-------|---------|--------|-----------|
| `cv_metrc_additive_types` | `name` | Fertilizer, Pesticide, Other | Seed data (confirmed from spec) |
| `cv_metrc_plant_types` | `name` | Clone, Seed | Seed data (confirmed from samples) |
| `cv_metrc_growth_phases` | `name` | Vegetative, Flowering | Seed data (confirmed from samples) |
| `cv_metrc_plant_waste_methods` | `name`, `description` | Clipping, Compost, Grinder, … | Admin-entered from MN METRC UI dropdown |
| `cv_metrc_plant_waste_reasons` | `name`, `applies_to` | Trim, Waste, Destroy, … | Admin-entered from MN METRC UI dropdown |
| `cv_metrc_batch_waste_reasons` | `name` | Trim, Waste, … | Admin-entered from MN METRC UI dropdown |
| `cv_metrc_package_adjustment_reasons` | `name` | Drying, Scale Variance, Spillage, … | Admin-entered from MN METRC UI dropdown |
| `cv_metrc_units_of_measure` | `name`, `type` | Grams, Ounces, Pounds, Kilograms, Gallons, Liters, … | Admin-entered from MN METRC GET /unitsofmeasure |
| `cv_metrc_available_plant_tags` | `tag` (24-char), `status` | Facility-specific | Admin-entered (imported from METRC tag pool) |
| `cv_metrc_available_package_tags` | `tag` (24-char), `status` | Facility-specific | Admin-entered (imported from METRC tag pool) |
| `cv_metrc_items` | `name`, `category`, `is_active` | Immature Plants, Clones, Buds, Trim, … | Admin-entered from MN METRC item catalog |

**`cv_sublocations`** — The spec references "sublocations" as a distinct concept from Cultivate's `cv_sub_zones`. Cultivate's sub-zones (Z1A, Z2B, etc.) are the physical sub-zones within irrigation zones. METRC "sublocations" are a different (simpler) concept: named areas within a location for tracking purposes. These are distinct and should be a separate table (`cv_metrc_sublocations`) populated by the admin interface with values matching the facility's METRC configuration (e.g., "Row 1", "Table A", "Sublocation 1").

---

## 3. Workflow Surface Mapping

For each of the 22 upload types, the table below identifies the existing Cultivate UI screen where the trigger belongs, what affordance is needed, and whether the endpoint in the spec matches Cultivate's conventions.

| # | Upload Type | Mode | Existing Cultivate Screen | Affordance Needed | Notes |
|---|------------|------|--------------------------|------------------|-------|
| 1 | Additive Template | Interactive | **None** — new admin screen needed | New screen: METRC Reference Data Admin → "Additive Templates" tab | One-time setup per product. Consider cross-referencing `cv_crop_inputs` to pre-fill |
| 2 | Create Plantings | Interactive | `BatchNew` | New "Export to METRC" button on batch create confirmation; or auto-generate CSV when batch is created | Requires `metrc_source_type` selection (none/package/plant/ingredient_batches) |
| 3 | Destroy Immature Plants | Interactive | `BatchDetail` | New "Destroy Batch Plants" action button (for batches in germ/seedlings/cult-hoop status) | Different from #4 — operates on count, not individual tags |
| 4 | Destroy Plants | Interactive | `PlantLossForm` | Add "Generate METRC CSV" step to existing plant loss form | Existing form captures the right fields; needs METRC waste method/reason cross-reference |
| 5 | Harvest Plants | Interactive | `FinalHarvestForm` | Add CSV generation to existing final harvest save flow | Existing form captures `metrc_plant_tag`, wet weight, applicator — good fit |
| 6 | Immature Plant Additives using Template | Batch | `FertigationNew` or Today End-of-Day | "Generate Daily METRC Report" button; groups today's immature batch applications into CSV | CSV-only; no API. Links `cv_applications_fertigation` → additive templates |
| 7 | Immature Plants Growth Phase | Interactive | `BatchDetail` | New "Move to Growth Phase" action button (for batches moving from immature to Vegetative/Flowering) | Tags assigned via StartingTag range; Cultivate reserves tags from `cv_metrc_available_plant_tags` |
| 8 | Immature Plant Packages | Interactive | `BatchDetail` | New "Package This Batch" action button | Only relevant when batch needs to be packaged (e.g., selling clones) |
| 9 | Immature Plants Waste | Batch | Today Screen "End of Shift" | "Submit Today's Immature Waste" section in end-of-day workflow | New record type (`cv_metrc_immature_waste_events`); not linked to any existing application table |
| 10 | Location Additives using Template | Batch | `FertigationNew` or Today End-of-Day | "Add Location-Level Application" section in end-of-day workflow | CSV-only. Currently Cultivate has no location-level (room-wide) application concept |
| 11 | Manicure Plants | Interactive | `PartialHarvestForm` | Add "Generate METRC CSV" to existing partial harvest save flow | METRC calls this "manicure"; Cultivate UI says "partial harvest" — no term conflict in code |
| 12 | Package Adjustment | Interactive | **None** — new screen needed | New screen: "Package Adjustment" under METRC section | Requires employee license number; new concept for Cultivate |
| 13 | Package from Vegetative Plants | Interactive | **None** — new screen needed | New screen or action button on `BatchDetail` for veg plants | Uncommon operation; uses Plant Group Tagging (METRC feature). Low priority. |
| 14 | Package Planting from Plant | Interactive | `ContainerDetail` or **New screen** | "Clone and Package from Mother Plant" action | Mother plant designation needed; low frequency operation |
| 15 | Packages From Harvest | Interactive | **None** — new screen needed | New "Post-Harvest Packaging" workflow screen | Fired 1-2 weeks post-harvest after drying; major post-harvest step |
| 16 | Plant Additives using Template | Batch | `FertigationNew` or Today End-of-Day | "Generate Daily METRC Report" for tagged plant applications | CSV-only; groups per-plant applications. Links to existing fertigation/foliar records |
| 17 | Plantings from Package | Interactive | `BatchNew` | New "Create Batch from Package" source type option in BatchNew | Sourced from a received METRC seed/clone package |
| 18 | Plantings from Plant | Interactive | `BatchNew` | New "Clone from Mother Plant" source type option in BatchNew | Mother plant designation in `cv_metrc_plant_state.is_mother_plant` |
| 19 | Plants Growth Phase | Interactive | `BatchDetail` | "Flip to Flower" or "Change Growth Phase" action button | Tag replacement (NewTag from available pool). Room-wide operation affecting many plants |
| 20 | Plants Location | Interactive | `BatchDetail` or `ContainerDetail` | "Move Plants to Location" action | Often fired alongside #19 (room flip implies location change) |
| 21 | Plants Waste | Batch | `WasteTrimForm` + Today "End of Shift" | "Submit Today's Plant Waste" aggregation | Existing `plant_waste_trim_events` needs METRC fields; combine daily entries into one CSV |
| 22 | Split Planting | Interactive | `BatchDetail` | "Split Batch" action button | Splits immature batch into two; creates new batch record |

**Upload types with no existing UI home (require new screens):**

High priority (likely needed in Phase 1 for operational completeness):
- #1 Additive Template admin
- #7 Immature Plants Growth Phase (the tagging event when clones become Veg plants)
- #9 Immature Plants Waste (daily compliance)
- #15 Packages From Harvest (post-harvest packaging)
- #19 Plants Growth Phase ("flip to flower")
- #21 Plants Waste (daily compliance)

Lower priority (less frequent operations):
- #8 Immature Plant Packages
- #12 Package Adjustment
- #13 Package from Vegetative Plants
- #14 Package Planting from Plant
- #22 Split Planting

---

## 4. Cultivate-Facing API Design

The spec uses `/api/metrc/*` as a draft prefix. Reconciling with Cultivate's existing conventions (`/api/batches`, `/api/applications/...`, `/api/exports/...`):

**Proposed prefix: `/api/metrc/csv/`**

This clearly namespaces the new routes, distinguishes them from the existing `/api/exports/metrc` export endpoint, and will accommodate Phase 5 API submission variants at `/api/metrc/submit/*` later.

### Admin / Setup Endpoints

| Method | Path | Request (high-level) | Response | Mode |
|--------|------|---------------------|----------|------|
| GET | `/api/metrc/csv/ref-data` | — | All reference table contents | — |
| POST | `/api/metrc/csv/additive-templates` | `{name, additive_type, active_ingredients[], ...}` | `{template_id, csv_file_path, row_count}` | Immediate CSV |
| GET | `/api/metrc/csv/additive-templates` | — | `[{template_id, name, additive_type, ...}]` | — |
| POST | `/api/metrc/csv/plant-tags/pool` | `{tags: [24-char, ...]}` | `{added_count}` | Immediate DB insert |
| POST | `/api/metrc/csv/package-tags/pool` | `{tags: [24-char, ...]}` | `{added_count}` | Immediate DB insert |
| POST | `/api/metrc/csv/employees` | `{license_number, name, role}` | `{employee_id}` | Immediate DB insert |
| POST | `/api/metrc/csv/items` | `{name, category}` | `{item_id}` | Immediate DB insert |

### Operational Endpoints (Interactive)

| Method | Path | Request (high-level) | Response | Mode |
|--------|------|---------------------|----------|------|
| POST | `/api/metrc/csv/create-plantings` | `{name, type, count, strain, location, actual_date, ingredient_batches[]}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/destroy-immature` | `{plant_batch_id, count, waste_method, waste_reason, waste_weight, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/destroy-plants` | `{plant_tags: [...], waste_method, waste_reason, waste_weight, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/harvest-plants` | `{plant_events: [{plant_tag, weight, uom, drying_location, harvest_name, actual_date}]}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/immature-growth-phase` | `{batch_id, count, starting_tag, growth_phase, new_location, growth_date}` | `{csv_file_path, row_count, tags_reserved: [...]}` | Immediate |
| POST | `/api/metrc/csv/immature-packages` | `{plant_batch_id, item_name, package_tag, count, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/manicure-plants` | `{plant_events: [{plant_tag, weight, uom, drying_location, harvest_name, actual_date, plant_count}]}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/package-adjustment` | `{package_tag, quantity, uom, adjustment_reason, employee_license_number, adjustment_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/package-from-veg` | `{plant_group_label, package_tag, item_name, quantity, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/package-planting-from-plant` | `{plant_label, package_tag, plant_batch_type, item_name, location, count, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/packages-from-harvest` | `{packages: [{tag, item_name, uom, ingredients: [{harvest_name, weight, weight_uom}]}], actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/plantings-from-package` | `{package_label, plant_batch_name, plant_type, count, strain, location, planted_date, unpackaged_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/plantings-from-plant` | `{plant_label, plant_batch_name, plant_type, count, strain, location, actual_date}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/plants-growth-phase` | `{plants: [{label, new_tag, growth_phase, new_location, growth_date}]}` | `{csv_file_path, row_count, tags_consumed: [...]}` | Immediate |
| POST | `/api/metrc/csv/plants-location` | `{plants: [{label, location, sublocation, actual_date}]}` | `{csv_file_path, row_count}` | Immediate |
| POST | `/api/metrc/csv/split-planting` | `{plant_batch_id, new_batch_name, count, location, actual_date}` | `{csv_file_path, row_count}` | Immediate |

### Batch (End-of-Day) Endpoints

| Method | Path | Request (high-level) | Response | Mode |
|--------|------|---------------------|----------|------|
| POST | `/api/metrc/csv/additive-applications/immature-batch` | `{applications: [{plant_batch_id, template_name, total_amount, uom, actual_date}]}` | `{csv_file_path, row_count}` | Batch (today's) |
| POST | `/api/metrc/csv/additive-applications/plants` | `{applications: [{plant_tag, template_name, total_amount, uom, actual_date}]}` | `{csv_file_path, row_count}` | Batch (today's) |
| POST | `/api/metrc/csv/additive-applications/location` | `{applications: [{location_name, sublocation_name, template_name, total_amount, uom, actual_date}]}` | `{csv_file_path, row_count}` | Batch (today's) |
| POST | `/api/metrc/csv/immature-waste` | `{events: [{plant_batch_id, waste_method, waste_weight, waste_uom, waste_reason, waste_date}]}` | `{csv_file_path, row_count}` | Batch (today's) |
| POST | `/api/metrc/csv/plants-waste` | `{events: [{waste_method, waste_weight, waste_uom, waste_reason, location_id?, plant_tags?: [...], waste_date}]}` | `{csv_file_path, row_count}` | Batch (today's) |

### Audit Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/metrc/csv/uploads` | `[{upload_id, upload_type, file_path, row_count, generated_at, status}]` |
| GET | `/api/metrc/csv/uploads/:upload_id` | Full upload record including METRC response |

**Response shape for all CSV-generating endpoints:**
```json
{
  "csv_file_path": "Metrc-csv-uploads/20260526/plants-waste-1716739200000.csv",
  "row_count": 12,
  "upload_id": 47,
  "warnings": [],
  "metrc_submission": { "status": "csv_only" }
}
```

For CSV-only upload types (#6, #10, #16), `metrc_submission.status = "csv_only"` is always returned; `options.submit_to_metrc` is silently ignored.

---

## 5. Reference Data Strategy

### Tables That Already Exist in Cultivate

| Reference concept | Cultivate table | Status |
|------------------|----------------|--------|
| Locations (METRC rooms) | `cv_locations` | Exists with `metrc_name` column — **already correct** |
| Strains | `cv_strains` | Exists |
| Sub-zones (METRC sublocations?) | `cv_sub_zones` | Exists but is not the same concept — see below |

**Sub-zone vs. sublocation mismatch:** Cultivate's sub-zones (Z1A, Z2B, etc.) are physical irrigation partitions. METRC "sublocations" are named areas within a METRC location. These are not the same. The facility needs to define METRC-facing sublocations (e.g., "Row 1" or just the sub-zone codes) and store them in `cv_metrc_sublocations`. The admin interface should let operators map Cultivate sub-zones to METRC sublocation names.

### Tables That Are Missing

The following reference tables need to be created and populated before any upload type that uses them can generate a valid CSV:

| Table | Populated how | Priority |
|-------|--------------|----------|
| `cv_metrc_additive_types` | Seed data (3 fixed values: Fertilizer, Pesticide, Other) | Phase 1 scaffolding |
| `cv_metrc_plant_types` | Seed data (Clone, Seed) | Phase 1 scaffolding |
| `cv_metrc_growth_phases` | Seed data (Vegetative, Flowering) | Phase 1 scaffolding |
| `cv_metrc_plant_waste_methods` | Admin UI — from MN METRC UI dropdown | Phase 2 |
| `cv_metrc_plant_waste_reasons` | Admin UI — from MN METRC UI dropdown | Phase 2 |
| `cv_metrc_batch_waste_reasons` | Admin UI — from MN METRC UI dropdown | Phase 2 |
| `cv_metrc_package_adjustment_reasons` | Admin UI — from MN METRC UI dropdown | Phase 2 |
| `cv_metrc_units_of_measure` | Admin UI — from MN `GET /unitsofmeasure/v2/active` response | Phase 2 |
| `cv_metrc_available_plant_tags` | Admin UI — batch import of unordered/ordered plant tag ranges | Phase 1 (needed for #7) |
| `cv_metrc_available_package_tags` | Admin UI — batch import of package tag ranges | Phase 1 (needed for packages) |
| `cv_metrc_items` | Admin UI — operator enters from METRC item catalog | Phase 2 |
| `cv_metrc_sublocations` | Admin UI — operator defines facility-specific sublocation names | Phase 2 |
| `cv_employees` | Admin UI — enter MN OCM employee license numbers | Phase 1 (needed for #12) |

### Admin UI Placement

All METRC reference data admin belongs in a new **"METRC Setup"** section under the existing admin navigation (alongside `SensorManagement`). Tabs:
1. **Additive Templates** — create/edit templates (primary #1 upload)
2. **Reference Data** — waste methods, waste reasons, units, adjustment reasons, items
3. **Tag Pools** — plant tags, package tags
4. **Sublocations** — map Cultivate sub-zones to METRC sublocation names
5. **Employees** — MN OCM employee license roster

### Initial Population Strategy

For the first use of the service:

1. **Waste methods/reasons:** Admin navigates to MN METRC UI, opens each dropdown, and manually enters the values into Cultivate's admin interface. ~10–20 values total. One-time setup.
2. **Units of measure:** Same manual approach, OR Phase 5 can fetch `GET /unitsofmeasure/v2/active` from the METRC API and populate automatically.
3. **Tag pools:** METRC tags are ordered in sequential ranges. Admin enters the starting tag and count, or uploads a text file of tags.
4. **Additive templates:** Created in Cultivate for each product the facility applies (fertilizers, pesticides, supplements). Cross-referenced to existing `cv_crop_inputs` records where possible.
5. **Items:** Admin enters item names exactly as configured in METRC (e.g., "Immature Plants", "Buds", "Trim"). Must match METRC account configuration exactly.

---

## 6. State Synchronization and Side-Effects

### Timing: Apply side-effects at CSV generation time (optimistic)

**Recommendation:** Apply all Cultivate-side state changes **when the CSV is generated** (not after METRC API confirmation). Rationale:

- In Phase 1–4, there is no API submission — the CSV is manually uploaded by the operator. Waiting for confirmation is impossible.
- Even in Phase 5, METRC API responses are usually synchronous and fast. Waiting for confirmation before applying state changes would block the operator unnecessarily.
- All state changes should be **wrapped in the same database transaction** as the `cv_metrc_csv_uploads` row insert, so that if CSV writing fails, no state changes are committed.

```
Transaction:
  1. Validate all inputs
  2. Write CSV to .tmp file
  3. Apply all Cultivate state changes (batch count, plant status, tag reservation, etc.)
  4. Insert cv_metrc_csv_uploads row
  5. Rename .tmp → final path
  Commit
```

If step 5 (file rename) fails after the transaction commits, the DB state is applied but the CSV doesn't exist. This is acceptable — the operator can regenerate.

### Side-effect inventory by upload type

| # | Upload Type | Cultivate state changes |
|---|------------|------------------------|
| 1 | Additive Template | Insert `cv_metrc_additive_templates` row |
| 2 | Create Plantings | Insert `cv_batches` row; set `metrc_source_type` |
| 3 | Destroy Immature Plants | Decrement `cv_batches.plant_count_current` by Count; if Count = total, set `cv_batches.status = 'closed'`; insert `cv_metrc_immature_destruction_events` |
| 4 | Destroy Plants | Set `cv_metrc_plant_state.status = 'destroyed'`; unassign `cv_plant_assignments`; insert `plant_loss_events` (or METRC extension) |
| 5 | Harvest Plants | Set `cv_metrc_plant_state.status = 'harvested'`; create/update `harvest_batches`; insert `plant_harvest_events` |
| 6 | Imm. Plant Additives | Insert `cv_metrc_additive_applications` |
| 7 | Imm. Growth Phase | Reserve `Count` tags from `cv_metrc_available_plant_tags` (mark used); create `cv_metrc_plant_state` rows; reduce `cv_batches.plant_count_current` |
| 8 | Imm. Plant Packages | Insert `cv_metrc_packages`; reduce `cv_batches.plant_count_current` by Count |
| 9 | Imm. Plants Waste | Insert `cv_metrc_immature_waste_events` |
| 10 | Location Additives | Insert `cv_metrc_additive_applications` |
| 11 | Manicure Plants | Create/update `harvest_batches`; insert `plant_harvest_events` (event_type = partial_harvest); `cv_metrc_plant_state.status` remains 'active' |
| 12 | Package Adjustment | Insert `cv_metrc_package_adjustments`; update `cv_metrc_packages.weight_amount` |
| 13 | Package from Veg Plants | Insert `cv_metrc_packages`; mark plant group consumed |
| 14 | Package Planting from Plant | Insert `cv_metrc_packages` + new `cv_batches` row inside the package |
| 15 | Packages From Harvest | Insert `cv_metrc_packages`; update `harvest_batches.total_packaged_weight` |
| 16 | Plant Additives | Insert `cv_metrc_additive_applications` |
| 17 | Plantings from Package | Insert `cv_batches`; reduce source `cv_metrc_packages.count` |
| 18 | Plantings from Plant | Insert `cv_batches`; mother plant remains active |
| 19 | Plants Growth Phase | For each plant: mark old tag as used-replaced, mark new tag from pool as consumed; update `cv_metrc_plant_state.plant_tag = NewTag`, `previous_plant_tag = Label`, `growth_phase`, `location_id`, `tag_change_date`; update `cv_plant_assignments.metrc_plant_tag` to NewTag |
| 20 | Plants Location | Update `cv_metrc_plant_state.location_id`, `sublocation_id`; update `cv_plant_assignments` location if tracked |
| 21 | Plants Waste | Insert `plant_waste_trim_events` with METRC fields populated |
| 22 | Split Planting | Insert new `cv_batches`; reduce source `cv_batches.plant_count_current` by Count |

### What happens if the CSV is generated but never uploaded, or METRC rejects it?

**Phase 1–4 (manual upload):** Cultivate applies state changes optimistically. If the operator never uploads the CSV, METRC and Cultivate are out of sync. Resolution: the `cv_metrc_csv_uploads` table provides an audit trail of all generated CSVs with `status = 'generated'`. The METRC Reconciliation screen (already built) can surface these. Manual correction by the operator.

**Phase 5 (API submission):** If METRC returns an error:
- Cultivate logs the error in `cv_metrc_csv_uploads.metrc_response` and sets `status = 'failed'`
- **Does not auto-rollback** the optimistic state changes — manual data entry errors and METRC rejections require human judgment to resolve, not automatic DB rollback
- The error message surfaces to the operator with the METRC error detail
- Operator corrects the data and re-generates/re-submits

**Rollback is explicitly NOT provided in Phase 1.** This is a deliberate scope decision. If Cultivate's state diverges from METRC, the METRC Reconciliation screen (already built) provides visibility. Full two-way sync with automatic reconciliation is a Phase 5 concern.

---

## 7. Conflicts and Open Issues

### Conflicts with Existing Codebase

**C1: "Partial Harvest" vs "Manicure"**

Cultivate uses the term `partial_harvest` for what METRC calls "manicure." The codebase correctly avoids the word "manicure" in the UI. The `plant_harvest_events.event_type` column uses `partial_harvest`. The METRC CSV generator for #11 reads these records and generates a `ManicurePlants` CSV. No code conflict — the terminology translation happens only in the generator layer.

**C2: Batch lifecycle mismatch**

Cultivate's `cv_batches` tracks the full lifecycle (germ → closed). METRC's `plant_batches` is primarily an immature batch concept — once plants are individually tagged (via #7), they move to the `plants` table in METRC. Cultivate's `cv_batches` doesn't have this split. The proposal adds `cv_metrc_plant_state` as a parallel tracking mechanism for tagged plants, while `cv_batches` continues to represent the cultivation unit of work. The two are linked via the batch-to-plant-state relationship (a batch produces a set of plant_state records when it transitions through growth phase).

**C3: Harvest names conflict with auto-generation**

For upload type #5 (Harvest Plants), if `HarvestName` is left blank, METRC auto-generates a name. But `PUT /plants/v2/harvest` returns no response body, so Cultivate can't learn the generated name. For upload type #11 (Manicure Plants), `POST /plants/v2/manicure` returns `Ids` but not names.

**Recommendation from spec (Q43):** Always provide `HarvestName` from Cultivate. Use Cultivate's existing `harvest_batches.harvest_name` (or derive one from `plant_batch.strain + sow_date + sequence_number`). This avoids the auto-generation problem entirely and is the recommended approach for Phase 1.

**C4: `cv_locations.metrc_name` already exists — good**

The Cultivate schema already has `cv_locations.metrc_name` (migration 011), which stores the exact METRC room name. This is the value to use in all CSV `Location`/`DryingLocation`/`NewLocation` columns. The service reads `cv_locations.metrc_name`, not `cv_locations.name`. No conflict.

**C5: The METRC "additive applications" vs Cultivate's compliance records are intentionally separate**

Cultivate's detailed application tables (`cv_applications_fertigation`, `cv_applications_foliar`, `cv_applications_pesticide`) capture full compliance data. The METRC additive applications are a simplified layer for METRC reporting. These must remain separate — do not try to generate METRC additive CSVs directly from the Cultivate application records without mapping through the additive templates table, because Cultivate's records don't store the METRC template name or additive type.

A light cross-reference is provided (`cv_metrc_additive_applications.cultivate_application_id`) to allow the UI to show "this METRC additive application was derived from fertigation application #123."

**C6: Railway ephemeral filesystem**

The CSV output directory (`./Metrc-csv-uploads/YYYYMMDD/`) requires a **Railway Volume** to survive container restarts. Without a volume, all generated CSVs are lost on redeploy. This must be addressed before Phase 1 ships. The team should provision a Railway Volume and set `METRC_CSV_OUTPUT_DIR` to the volume mount path.

### Ambiguities Needing Clarification Before Implementation

**A1 (Q3/Q4 from Open Questions):** CSV line endings (`\r\n` vs `\n`) and BOM status need byte-level inspection of a real METRC-downloaded CSV. The spec assumes `\r\n`, no BOM — verify this before writing the CSV writer utility.

**A2 (Q5/Q6):** Date-only format (`YYYY-MM-DD` or `MM/DD/YYYY`?) confirmed by sample CSV headers, but not by a real populated sample. Template CSVs have no data rows. Verify with a real METRC download.

**A3 (Q31):** Whether destruction reasons and waste reasons share the same lookup table. This affects whether `cv_metrc_plant_waste_reasons` and `cv_metrc_batch_waste_reasons` are two tables or one. Inspect the MN METRC UI dropdown before Phase 1 implementation.

**A4 (Q46):** `EmployeeLicenseNumber` appears in Package Adjustment CSV but NOT in the API JSON example. It's unclear whether the API accepts it, ignores it, or auto-populates from the API key. This must be verified in the MN METRC sandbox before Phase 5 implementation for #12.

**A5 (Q18):** Several API endpoints are assumed from MO (Missouri) METRC docs. The MN sandbox should be checked to confirm: `/packages/v2/plantings` (#17), `/plants/v2/plantings` (#18), `/plantbatches/v2/split` (#22), `/plantbatches/v2/growthphase` (#7), `/harvests/v2/packages` (#15). These are Phase 5 concerns only.

**A6 (Q13 — Package from Veg Plants):** The MN API endpoint for #13 is unknown. Since this is a rare operation (packaging vegetative plant material for transfer), it's low priority and can be deferred to Phase 3.

**A7 — Sublocation mapping:** How do Cultivate's physical sub-zones (Z1A, Z2B) map to METRC sublocations? The spec lists sublocations as facility-specific ("Sublocation 1" through "Sublocation 5" in the sample). The operator needs to define this mapping. The admin UI should let them configure it.

### Spec Changes Recommended

**R1:** Remove `employees` from the core upload types spec and make it an admin-only reference table concern. The concept only appears in #12 Package Adjustment. It's not a batch concept.

**R2:** The spec's `Cultivate Schema` sheet proposes `plant_batches.count` as the running count (adjusted by waste/destroy/split). In Cultivate, `cv_batches.plant_count_current` is derived from active `cv_plant_assignments`. Recommend: for immature batches (before individual tagging), maintain a `plant_count_current` counter directly on `cv_batches` that is decremented by destruction and waste events. After tagging (via #7), the count becomes derived from plant_state records.

**R3:** Consolidate the "End of Day" workflow for all 5 batch upload types (#6, #9, #10, #16, #21) into a single "Submit Daily METRC Report" screen rather than 5 separate endpoints. The operator should be able to see all pending daily items in one place and submit them together.

---

## 8. Revised Phasing

The spec's original 5-phase plan is appropriate. This proposal revises the sub-tasks within each phase based on Cultivate's actual state.

### Phase 0: Integration Proposal ✓
*This document.*

### Phase 1: Scaffolding + Reference Implementation (Weeks 1–3)

**Milestone:** Two upload types end-to-end as reference implementations, plus the CSV writer infrastructure.

Tasks:
1. **Infrastructure:**
   - Create `src/lib/metrc-csv/` module structure
   - Implement CSV writer utility (atomic write, CRLF, UTF-8 no BOM, header validation)
   - Implement `cv_metrc_csv_uploads` table and logging
   - Register `/api/metrc/csv/` route prefix in `app.ts`
   - Resolve Railway Volume requirement for output directory

2. **Migrations:**
   - Migration: `cv_metrc_additive_templates`, `cv_metrc_additive_applications`, `cv_metrc_plant_state`, `cv_metrc_csv_uploads`
   - Migration: Reference tables with seed data (additive_types, plant_types, growth_phases)
   - Migration: Extend `cv_batches`, `harvest_batches`, `plant_harvest_events` with METRC columns
   - Migration: `cv_metrc_available_plant_tags`, `cv_metrc_available_package_tags`, `cv_employees`

3. **Reference implementations:**
   - **#1 Additive Template** — the foundational upload that all application types depend on; tests the active_ingredients denormalization pattern
   - **#21 Plants Waste** — tests pipe-delimited list pattern, flexible targeting, and the batch (end-of-day) mode; most frequent compliance-critical operation

4. **Tests:** Row count limit (500), header validation, CSV-safe string rejection, atomic write, CRLF/UTF-8 encoding

### Phase 2: Reference Data Admin Interface (Weeks 2–4, concurrent with Phase 1)

**Milestone:** Admin can populate all reference tables through the UI before Phase 3 uploads need them.

Tasks:
- New "METRC Setup" section in admin navigation
- Tabs: Additive Templates, Reference Data (waste methods/reasons/units/adjustment reasons/items), Tag Pools, Sublocations, Employees
- Additive Template form with active ingredients sub-form
- Tag pool batch import (enter range: starting tag + count)
- Waste methods/reasons data entry (populate from MN METRC UI)

### Phase 3: Remaining 20 Upload Types (Weeks 3–8)

Implement by family to share validation logic:

**Batch A: Planting family (#2, #17, #18, #22)** — all create plant batches; share strain/location validation
**Batch B: Destruction family (#3, #4)** — share waste method/reason validation; different UoM column names
**Batch C: Immature batch operations (#7, #8, #9)** — immature batch waste, packages, growth phase
**Batch D: Plant lifecycle (#19, #20)** — growth phase (tag replacement), location move
**Batch E: Harvest family (#5, #11, #15)** — harvest plants, manicure, post-harvest packaging
**Batch F: Additive applications (#6, #10, #16)** — immature batch, location, plant-level additive CSVs
**Batch G: Packages (#12, #13, #14)** — adjustment, from veg plants, planting from plant

### Phase 4: Validation Engine (Weeks 7–9)

- Per-type Zod schemas for all 22 upload types
- Cross-field rules (REI pair coherence, waste method/weight dependency)
- Cross-record rules (tag availability, package tag uniqueness, batch count checks)
- 500-row limit enforcement
- Warning system (vs. hard errors) for warn-severity rules
- Integration tests for each rule category

### Phase 5: METRC API Submission (Later — no timeline commitment)

- HTTP client for `https://api-mn.metrc.com/` with Basic auth
- Per-type submission handlers (POST/PUT/DELETE per API Mapping sheet)
- Response capture into `cv_metrc_csv_uploads.metrc_response`
- `metrc_id` backfill after successful submission
- Handle CSV-only types (#6, #10, #16) — always skip submission
- Error surfacing and retry mechanism

---

## Appendix: Upload Type → CSV File Naming Convention

```
Metrc-csv-uploads/
  YYYYMMDD/
    additive-template-{timestamp}.csv
    create-plantings-{timestamp}.csv
    destroy-immature-{timestamp}.csv
    destroy-plants-{timestamp}.csv
    harvest-plants-{timestamp}.csv
    immature-additive-applications-{timestamp}.csv
    immature-growth-phase-{timestamp}.csv
    immature-packages-{timestamp}.csv
    immature-waste-{timestamp}.csv
    location-additive-applications-{timestamp}.csv
    manicure-plants-{timestamp}.csv
    package-adjustment-{timestamp}.csv
    package-from-veg-{timestamp}.csv
    package-planting-from-plant-{timestamp}.csv
    packages-from-harvest-{timestamp}.csv
    plant-additive-applications-{timestamp}.csv
    plantings-from-package-{timestamp}.csv
    plantings-from-plant-{timestamp}.csv
    plants-growth-phase-{timestamp}.csv
    plants-location-{timestamp}.csv
    plants-waste-{timestamp}.csv
    split-planting-{timestamp}.csv
```

Multiple CSV files of the same type can exist in a day (timestamp = Unix epoch ms). The operator uploads whichever file corresponds to the operation being reported.
