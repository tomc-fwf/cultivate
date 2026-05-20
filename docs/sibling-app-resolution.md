# Sibling App Resolution Document
## Cultivate ↔ Farmstock Integration Plan

**Prepared:** 2026-05-20  
**Status:** APPROVED 2026-05-20 — Phase 1 implementation may proceed  
**Author:** Claude Code (first session)

### Operator Decisions (2026-05-20)

| Question | Decision |
|---|---|
| Integration pattern | **Option A approved** — shared SQLite database at `/data/farmstock.db` |
| Crop inputs / items relationship | **Farmstock `items` is the master catalog**; cultivate's crop inputs are a subset of inventory, referenced directly from `items` — no separate `crop_inputs` table |
| Auth | **Standalone auth for cultivate** (own `users` table, own PIN-based JWT, matching farmstock's pattern) — SSO across all siblings is a future initiative as the family matures |

---

## 1. Executive Summary

Farmstock is a production inventory and METRC compliance app. Cultivate is a new cultivation-record app. They share one underlying domain (cannabis inputs applied to plants) but serve distinct regulatory purposes. After thoroughly reading both codebases and the CLAUDE.md brief, the recommended integration pattern is **Option A: Shared SQLite Database**, with farmstock's `items` and `stock` tables extended to satisfy cultivate's richer catalog requirements.

Farmstock's recipe/mix-batch/application workflow predates cultivate and partially overlaps with it. That workflow stays live in farmstock through Phase 1 (to avoid breaking production), then is retired from farmstock's UI in Phase 2 once cultivate's four-class application system has full coverage.

**Three decisions the operator must approve before Phase 1 begins:**
1. Shared database path (Option A) vs. cross-app API (Option B)
2. Extending farmstock's `items` table vs. cultivate maintaining a parallel `crop_inputs` table
3. Auth approach (see §6 — the "shared auth" described in CLAUDE.md does not currently exist)

---

## 2. Current Farmstock State — Concrete Inventory

### 2.1 Database Tables (farmstock, as of migration 009)

| Table | Purpose | Relevant to Cultivate? |
|---|---|---|
| `users` | PIN-based JWT auth; roles: worker, manager, admin | Reference model only — see §6 |
| `categories` | PEST, FERT, BIOL, AMEND, FOLIAR, ADDITIVE; color-coded | Mapping needed — see §3.1 |
| `suppliers` | Vendor master | Farmstock owns; cultivate references |
| `locations` | Storage rooms with REI tracking | Farmstock owns; NOT grow zones |
| `settings` | Key-value config | Each app has its own |
| `items` | Crop input catalog with EPA/MDA reg, REI, PHI, max_rate | **Primary integration point** |
| `stock` | Quantity by item/location/lot with expiry | **Primary integration point** |
| `metrc_tags` | Plant/package tag inventory; status only | Farmstock's tag inventory only; cultivate owns plant assignment lifecycle |
| `transactions` | Receives, uses, adjusts, disposes; includes spray fields | Legacy application record; retire in Phase 2 |
| `audit_log` | All mutations; before/after values | Each app will maintain its own |
| `waste_batches` | Waste state machine (waste_hold → rendered → disposed) | Farmstock owns; out of cultivate scope |
| `waste_events` | Append-only waste transitions | Farmstock owns |
| `loss_theft_reports` | 8-hour OCM escalation | Farmstock owns |
| `recipes` | Named recipes (pesticide, nutrient, biological, etc.) | **Migrate/retire — see §4** |
| `recipe_ingredients` | Per-recipe items with rates | **Migrate/retire — see §4** |
| `mix_batches` | Created from recipe; tracks remaining volume | **Migrate/retire — see §4** |
| `mix_batch_ingredients` | Per-batch ingredient tracking | **Migrate/retire — see §4** |
| `applications` | Mix applied to locations; derives REI/PHI | **Migrate/retire — see §4** |
| `application_locations` | Junction: applications × locations; rei_expires_at | **Migrate/retire — see §4** |
| `metrc_queue` | All crop input applications auto-enqueued for METRC | Farmstock's inventory events only; cultivate has separate METRC needs |

### 2.2 Farmstock Features (UI Screens)

| Screen | Purpose | Migrate to Cultivate? |
|---|---|---|
| Login | PIN auth | Keep (per-app auth) |
| Dashboard | Today's applications, REIs, low stock, METRC queue | Keep in farmstock (inventory focus) |
| Items | Crop input catalog CRUD | Keep in farmstock; extend schema |
| ItemDetail | Stock by location + transaction history | Keep in farmstock |
| Receive | Create receipt transaction | Keep in farmstock |
| Use — Mix Recipe Tab | Select recipe → create mix batch | **Retire from farmstock in Phase 2** |
| Use — Apply Tab | Apply mix batch to locations | **Retire from farmstock in Phase 2** |
| MetrcTags | Tag inventory | Keep in farmstock (inventory) |
| Waste | Waste state machine | Keep in farmstock |
| MetrcQueue | Pending METRC events | Keep in farmstock (inventory events); cultivate gets its own queue for cultivation events |
| Reports | Spray log export | **Replace with cultivate's MDA-ready export in Phase 2** |
| Admin | CRUD for items, categories, locations, suppliers, users | Keep in farmstock; cultivate UI links to farmstock for catalog admin |
| NavBar | Bottom navigation | Each app has its own |

### 2.3 Farmstock Tech Stack

- **Backend:** Fastify 5.x + TypeScript + Zod, served on Railway
- **Database:** SQLite via `better-sqlite3` + Knex migrations, WAL mode, foreign keys ON
- **Frontend:** React 18 + React Router 6 + Vite + Tailwind CSS (minimal config)
- **Auth:** Local PIN-based JWT per app (NOT a family-wide SSO)
- **Deployment:** Docker multi-stage build → Railway, volume at `/data/farmstock.db`

---

## 3. Table-by-Table Comparison: Farmstock vs. Cultivate Needs

### 3.1 Crop Input Catalog

**Farmstock has:** `items` + `categories`

| Farmstock `items` column | Cultivate `crop_inputs` column | Status |
|---|---|---|
| `item_id` | `input_id` | Rename |
| `name` | `name` | Match |
| — | `manufacturer` | **Missing — add to farmstock** |
| `sku` | — | Farmstock-only (inventory) |
| `unit` | — | Moves to `input_lots` |
| `category_id` → categories | `category` (enum inline) | **Schema divergence — see below** |
| `epa_reg_no` | `epa_reg_no` | Match |
| `mda_reg_no` | `mn_state_reg_no` | Rename |
| — | `omri_no` | **Missing — add** |
| — | `omri_listed` (bool) | **Missing — add** |
| — | `epa_registered` (computed) | **Missing — add** |
| — | `restricted_use` (bool) | **Missing — add** |
| — | `signal_word` (enum) | **Missing — add** |
| `phi_days` | `phi_days_label` | Rename |
| — | `phi_days_operational` | **Missing — add** |
| — | `phi_notes` | **Missing — add** |
| `rei_hours` | `rei_hours` | Match |
| `max_rate` | — | Farmstock-only (label compliance) |
| `approved_targets` | `target_organisms` | Rename |
| — | `active_ingredients` | **Missing — add** |
| — | `form` | **Missing — add** |
| `sds_url` | `sds_url` | Match |
| `storage_notes` | `storage_notes` | Match |
| — | `shelf_life_months` | **Missing — add** |
| `active` | `active` | Match |
| `deleted_at` | — | Farmstock soft-delete pattern |

**Category divergence:** Farmstock uses a FK to a `categories` table with codes `PEST, FERT, BIOL, AMEND, FOLIAR, ADDITIVE`. Cultivate needs an inline enum with finer granularity: `fertilizer | foliar_nutrient | amendment | biocontrol_non_pesticide | pesticide | fungicide | biocontrol_pesticide | plant_regulator | other`.

**Mapping:**

| Farmstock category code | Cultivate category enum values |
|---|---|
| PEST | pesticide, fungicide, biocontrol_pesticide |
| FERT | fertilizer |
| BIOL | biocontrol_non_pesticide, biocontrol_pesticide (split by EPA reg presence) |
| AMEND | amendment |
| FOLIAR | foliar_nutrient |
| ADDITIVE | fertilizer, other |

The split within BIOL and ADDITIVE requires product-by-product review. EPA registration presence is the deterministic split signal (EPA reg → pesticide family).

### 3.2 Input Lots (Stock Tracking)

**Farmstock has:** `stock` — quantity by item/location/lot with expiry

| Farmstock `stock` column | Cultivate `input_lots` column | Status |
|---|---|---|
| `stock_id` | `lot_id` | Rename |
| `item_id` | `input_id` | FK rename |
| `lot_number` | `lot_number` | Match |
| `location_id` | — | Farmstock storage location; not in cultivate schema |
| `quantity` | `quantity_on_hand` | Rename |
| `unit` | `unit` | Match |
| `expires_at` | `expiration_date` | Rename |
| — | `received_date` | **Missing — add** |
| — | `notes` | **Missing — add** |

Farmstock's `stock` ties quantities to storage **locations** (a storage-room concept). Cultivate's `input_lots` is location-agnostic — it tracks the lot as a supply entity, and depletion happens when Cultivate logs an application. These two can coexist: farmstock tracks the physical on-hand quantity by storage room; cultivate references the lot for compliance traceability.

### 3.3 Suppliers

**Farmstock has:** `suppliers` (vendor master, address, contact info)  
**Cultivate needs:** Reference to supplier for crop input catalog entries  
**Resolution:** Farmstock owns `suppliers` entirely. Cultivate does not need a supplier concept beyond the FK on `items`. No change needed.

### 3.4 Recipes

**Farmstock has:** `recipes` + `recipe_ingredients` — generic named recipes (any type) used for mix-batch workflow

**Cultivate needs:**
- `fertigation_recipes` + `fertigation_recipe_ingredients` — 7 named stage templates (BASE, SEEDLING, AUTO-VEG, AUTO-FLOWER, PHOTO-VEG, PHOTO-FLOWER, FLUSH); versioned; EC/pH targets; immutable after approval
- `foliar_recipes` + `foliar_recipe_ingredients` — repeat foliar mixes; versioned; approved

These are fundamentally different in purpose and structure. They are **not the same concept** as farmstock's recipes, which drive inventory depletion through mix batches. Farmstock's recipe/mix-batch system is an inventory workflow; cultivate's recipes are cultivation-stage protocols.

**Resolution:** Cultivate creates its own recipe tables from scratch. No migration of farmstock recipe data is required or appropriate. Farmstock's recipe/mix-batch workflow continues as-is through Phase 1, then its **UI is retired** from farmstock in Phase 2 (see §5 Sequencing).

### 3.5 Applications

**Farmstock has:** `applications` + `application_locations` — crop input applications from mix batches to storage locations; derives REI/PHI; auto-queues METRC events

**Cultivate needs:**
- `applications_fertigation` — batch-level, sub-zone granularity, EC/pH measured
- `applications_foliar` — row/container granularity, PHI/stage enforcement
- `applications_pesticide` — row/container granularity, full MDA compliance fields
- `container_amendments` — container-scoped soil amendments (not batch-scoped)

Farmstock's `applications` table stores applications to **storage locations** (inventory depletion perspective). Cultivate's application tables store applications to **plant batches and containers** (cultivation record / compliance perspective). They represent the same physical event (applying a product to cannabis) recorded from different angles.

**Resolution:** Both application systems exist temporarily in parallel (through Phase 1). Cultivate's application tables are authoritative for the cultivation record. In Phase 2, farmstock's recipe/apply UI is retired; the data in farmstock's `applications` table is retained as historical record for the 5-year retention requirement but no longer actively written to for field operations.

### 3.6 Entities Exclusive to Cultivate (no farmstock analog)

All of the following are greenfield for cultivate — farmstock has no equivalent tables:

- `zones`, `sub_zones`, `rows`, `containers`, `container_qr_codes`
- `strains`, `batches`, `batch_stage_recipes`
- `plant_assignments`, `plant_loss_events`
- `container_state`, `container_state_transitions`, `container_amendments`
- `soil_samples`, `soil_sample_results`
- `teardown_events`, `startup_events`
- `fertigation_recipes`, `fertigation_recipe_ingredients`
- `foliar_recipes`, `foliar_recipe_ingredients`
- `input_phi_stage_overrides`
- `observations`
- `metrc_sync_log`

---

## 4. What to Migrate, What to Keep, What to Rebuild

### 4.1 Keep in Farmstock (Farmstock remains source of truth)

| Farmstock entity | Cultivate's relationship |
|---|---|
| `items` (crop input catalog) | Read reference — cultivate FKs to `items.item_id` as `input_id` |
| `stock` (lot quantities) | Read reference — cultivate FKs to `stock.stock_id` as `input_lot_id` for lot traceability |
| `suppliers` | No direct FK in cultivate schema |
| `categories` | Cultivate uses inline enum; farmstock categories kept for farmstock's own use |
| `waste_batches`, `waste_events` | Farmstock owns waste workflow entirely |
| `loss_theft_reports` | Farmstock owns |
| `metrc_tags` (tag inventory) | Farmstock owns the tag inventory; cultivate's `plant_assignments` references `metrc_plant_tag` as a text field (the UID), not a FK to farmstock's `metrc_tags` |
| `metrc_queue` (inventory events) | Farmstock continues queuing its own inventory application events. Cultivate gets its own `metrc_sync_log` for cultivation events (plant batch, harvest, waste from plant loss). These are separate METRC workflows. |
| `audit_log` | Each app maintains its own |
| `transactions` (receives/adjusts) | Farmstock owns receiving and adjustment workflow |

### 4.2 Retire from Farmstock (Phase 2, after Cultivate has coverage)

| Farmstock feature | When to retire | Retirement action |
|---|---|---|
| `recipes` UI (Mix Recipe tab) | After cultivate fertigation/foliar recipe library ships | Hide from farmstock nav; keep data for history |
| `mix_batches` + `recipe_ingredients` UI | After cultivate application entry ships | Hide from farmstock nav; keep data for history |
| `applications` + `application_locations` UI (Apply tab) | After cultivate all four application types ship | Hide from farmstock nav; keep data for 5-year retention |
| Spray log report in farmstock | After cultivate MDA-ready export ships | Remove from farmstock nav |

Schema tables are **not dropped** — they stay for historical data retention. Only the farmstock UI routes and nav items are removed.

### 4.3 Extend in Farmstock (Schema changes farmstock must accept)

To enable cultivate to properly reference farmstock's catalog with the richer metadata it needs, farmstock's `items` table must be extended via a new migration (010+):

**New columns to add to `items`:**

```sql
ALTER TABLE items ADD COLUMN manufacturer TEXT;
ALTER TABLE items ADD COLUMN omri_no TEXT;
ALTER TABLE items ADD COLUMN omri_listed INTEGER NOT NULL DEFAULT 0;  -- boolean
ALTER TABLE items ADD COLUMN restricted_use INTEGER NOT NULL DEFAULT 0;  -- boolean (RUP designation)
ALTER TABLE items ADD COLUMN signal_word TEXT CHECK (signal_word IN ('CAUTION','WARNING','DANGER'));
ALTER TABLE items ADD COLUMN phi_days_operational REAL;  -- operator-enforced PHI, ≥ phi_days
ALTER TABLE items ADD COLUMN phi_notes TEXT;
ALTER TABLE items ADD COLUMN active_ingredients TEXT;
ALTER TABLE items ADD COLUMN form TEXT;  -- liquid, powder, granular, etc.
ALTER TABLE items ADD COLUMN shelf_life_months INTEGER;
```

**Rename clarification (backward-compatible, done via column alias in queries):**
- `phi_days` → treat as `phi_days_label` in cultivate queries (no actual rename to avoid breaking farmstock)
- `mda_reg_no` → treat as `mn_state_reg_no` in cultivate queries
- `approved_targets` → treat as `target_organisms` in cultivate queries

Also add to `stock` for cultivate lot tracking:
```sql
ALTER TABLE stock ADD COLUMN received_date TEXT;  -- ISO-8601
ALTER TABLE stock ADD COLUMN notes TEXT;
```

### 4.4 Rebuild in Cultivate (New tables, no migration from farmstock)

Everything in §3.6 — all plant/batch/container lifecycle entities and cultivate-specific recipes and applications — is new construction. No farmstock data is migrated into these tables; they start empty.

---

## 5. Recommended Integration Pattern: Option A (Shared Database)

### Rationale

Both apps run on Railway (same infrastructure tier). SQLite WAL mode supports concurrent readers from multiple processes. For a single-tenant operation at this scale, the operational simplicity of a shared file outweighs the coupling risk.

- No network overhead
- No cross-app auth tokens to manage
- Instant consistency when cultivate reads a newly received lot from farmstock
- One backup target
- When cultivate logs a pesticide application with `input_lot_id` = farmstock's `stock.stock_id`, the depletion record is visible from both apps immediately

### Shared Database Configuration

```
Shared volume path: /data/cultivate-farm.db   (new unified path)
  OR
Cultivate connects to: /data/farmstock.db      (reuse farmstock's existing volume)
```

**Recommendation:** Cultivate connects to the same volume path as farmstock (`/data/farmstock.db`). This avoids data migration. Farmstock continues to own that file; cultivate opens it read-write for its own tables while reading farmstock-owned tables.

In Railway: add the farmstock volume to cultivate's service, mount at the same path, and configure `DB_PATH` in cultivate's environment to point to it.

### Database Partitioning Convention

To prevent table name collisions and make ownership clear, cultivate's new tables use a `cv_` prefix for its own entities:

| Namespace | Tables |
|---|---|
| No prefix (farmstock owns) | `items`, `stock`, `suppliers`, `categories`, `locations`, `users`, `transactions`, `audit_log`, `waste_batches`, `waste_events`, `loss_theft_reports`, `recipes`, `recipe_ingredients`, `mix_batches`, `mix_batch_ingredients`, `applications`, `application_locations`, `metrc_queue`, `metrc_tags`, `settings` |
| `cv_` prefix (cultivate owns) | `cv_zones`, `cv_sub_zones`, `cv_rows`, `cv_containers`, `cv_strains`, `cv_batches`, `cv_batch_stage_recipes`, `cv_plant_assignments`, `cv_plant_loss_events`, `cv_container_state`, `cv_container_state_transitions`, `cv_container_amendments`, `cv_soil_samples`, `cv_soil_sample_results`, `cv_teardown_events`, `cv_startup_events`, `cv_fertigation_recipes`, `cv_fertigation_recipe_ingredients`, `cv_foliar_recipes`, `cv_foliar_recipe_ingredients`, `cv_input_phi_stage_overrides`, `cv_observations`, `cv_metrc_sync_log`, `cv_container_qr_codes` |

### Cross-Table Foreign Keys

Cultivate tables that reference farmstock tables:

| Cultivate table.column | References |
|---|---|
| `cv_fertigation_recipe_ingredients.input_id` | `items.item_id` |
| `cv_foliar_recipe_ingredients.input_id` | `items.item_id` |
| `cv_applications_fertigation.input_lot_id` | `stock.stock_id` |
| `cv_applications_foliar.input_id` | `items.item_id` |
| `cv_applications_foliar.input_lot_id` | `stock.stock_id` |
| `cv_applications_pesticide.input_id` | `items.item_id` |
| `cv_applications_pesticide.input_lot_id` | `stock.stock_id` (required) |
| `cv_container_amendments.input_id` | `items.item_id` |
| `cv_container_amendments.input_lot_id` | `stock.stock_id` |

> **Note on FK enforcement:** SQLite's `PRAGMA foreign_keys = ON` applies per connection. Cross-app FKs work because both apps open the same file. However, SQLite does not prevent one app from deleting a farmstock row that cultivate depends on. Convention rule: **farmstock must never hard-delete `items` or `stock` rows that have been referenced by cultivate**. Farmstock already uses soft-delete (`deleted_at`) for items, which satisfies this requirement.

### Inventory Depletion

When cultivate logs an application that consumes a farmstock lot, cultivate does NOT decrement `stock.quantity` directly. Instead:

- Cultivate records the `input_lot_id` reference for traceability
- Farmstock continues to own physical quantity tracking via its `transactions` table
- The operator reconciles periodically: "how much did we use per cultivate records vs. how much farmstock shows depleted"
- In Phase 3, a reconciliation report can automate this comparison

This avoids cultivate modifying farmstock-owned data while still capturing all the compliance fields cultivate needs.

---

## 6. Auth: A Critical Discrepancy

**CLAUDE.md states:** "Authentication and session management — shared across all hatstak.app subdomains (single sign-on)" and "Do not create a new user table."

**What actually exists:** Farmstock uses per-app PIN-based JWT with a local `users` table. No shared auth service or SSO infrastructure was found anywhere in `C:\projects\`. The `users` table in farmstock is specific to farmstock and is not shared.

**Options:**

| Option | Description | Tradeoff |
|---|---|---|
| **A. Match farmstock** | Cultivate creates its own `users` table and PIN-based JWT auth, identical to farmstock's pattern | Simple to build; staff have separate PINs per app; no SSO |
| **B. Shared users table** | Cultivate reads farmstock's `users` table (shared DB makes this trivial); cultivate issues its own JWT but validates user from the shared table | One user record for both apps; still separate JWTs; no SSO |
| **C. Build SSO** | A third service issues tokens; both apps validate against it | Correct architecture for the long term; non-trivial to build |

**Recommendation: Option B (Shared `users` table via shared database)**

Since we're adopting the shared database (Option A from §5), cultivate can read the existing `users` table from farmstock. Cultivate issues its own JWT on login but authenticates the user from the shared table. This gives:

- One place to manage staff accounts (in farmstock's Admin screen)
- Consistent user identity across both apps (same `user_id` in both `applicator` FK columns)
- No SSO complexity for Phase 1

The `users` table in farmstock has: `user_id`, `name`, `email`, `pin_hash`, `role`, `active`, `last_login_at`, `failed_attempts`, `locked_until`, `created_at`. Cultivate adds `cultivate_role` as an optional column (via migration) if cultivation-specific roles are needed.

---

## 7. Breaking Changes Required in Farmstock

These are changes farmstock must accept before cultivate Phase 1 can launch:

| Change | Migration # | Risk | Required for |
|---|---|---|---|
| Add columns to `items` (manufacturer, omri_no, omri_listed, restricted_use, signal_word, phi_days_operational, phi_notes, active_ingredients, form, shelf_life_months) | 010 | Low — all nullable or with defaults | Cultivate recipe ingredients, PHI enforcement |
| Add columns to `stock` (received_date, notes) | 010 | Low — all nullable | Cultivate lot traceability |
| Add `cultivate_role` column to `users` | 010 | Low — nullable | If cultivate needs roles beyond farmstock's worker/manager/admin |
| Mount shared volume in cultivate's Railway service | Ops | Low | Shared database |

These changes are **additive only** — farmstock's existing queries and UI are unaffected.

---

## 8. What Cultivate Does NOT Need to Build

Because farmstock owns these and cultivate will reference them:

- Crop input catalog CRUD (Items screen)
- Lot receiving workflow (Receive screen)
- Supplier management
- Inventory adjustment / cycle count
- Waste state machine
- Loss/theft escalation
- METRC tag inventory management (the tag pool)
- Farmstock's METRC queue (cultivate has its own `cv_metrc_sync_log` for cultivation-side events)

From day one, cultivate's "Add Product" and "Select Lot" flows are **pickers that read from farmstock's `items` and `stock` tables**. No duplicate data entry.

---

## 9. Proposed Migration Sequence

### Pre-Phase 1 (Before any cultivate code)

1. **Operator approves this document**
2. **Deploy farmstock migration 010** — extends `items`, `stock`, `users` with the additional columns listed in §7
3. **Back-fill key item metadata** — for existing farmstock items that cultivate will reference (PHI operational, OMRI status, active ingredients, etc.)
4. **Set up Railway shared volume** — mount farmstock's `/data/farmstock.db` volume on cultivate's service
5. **Verify concurrent access** — confirm both farmstock and cultivate can open the SQLite file simultaneously in WAL mode without errors

### Phase 1 — Cultivate MVP (Parallel to farmstock production)

Implement all Phase 1 screens from CLAUDE.md in priority order. Key cross-app behaviors:

- Crop input picker reads from `items` (farmstock's table)
- Lot picker reads from `stock` (farmstock's table), filtered by item
- All cultivate-native data writes to `cv_*` tables
- Farmstock's recipe/apply workflow continues unchanged (staff can still use it)
- Cultivate becomes the **preferred** entry point for new application records

### Phase 2 — Farmstock UI Retirement

After all four cultivate application types are live and staff have adopted them:

1. Remove "Mix Recipe" and "Apply" tabs from farmstock's Use screen
2. Remove Spray Log report from farmstock's Reports screen
3. Add nav link from farmstock to cultivate for application entry
4. Update farmstock's Dashboard to exclude application counts (they're in cultivate now)
5. Existing `applications`, `mix_batches`, `recipes` data stays in DB for 5-year retention

### Phase 3 — Intelligence & Reconciliation

- Inventory reconciliation report: cultivate's `input_lot_id` usage vs. farmstock's `stock` depletion
- Trend charts, batch comparisons
- Applicator performance metrics

### Phase 4 — METRC API Unification

- Cultivate's `cv_metrc_sync_log` pushes cultivation events to METRC API
- Farmstock's `metrc_queue` pushes inventory events to METRC API
- Both streams handled in their respective apps (separate METRC workflows, same credentials)

---

## 10. Open Questions for Operator

**Resolved 2026-05-20:**

1. ~~**Integration pattern**~~ → **Option A approved** (shared `/data/farmstock.db`)
2. ~~**Auth approach**~~ → **Standalone auth for cultivate** (own `users` table, own JWT); SSO deferred
3. ~~**Crop inputs vs. items**~~ → **Farmstock `items` is the master catalog**; cultivate reads directly from it as a subset of inventory

**Still open (low urgency, can resolve during Phase 1):**

4. **Table prefix:** `cv_` prefix for cultivate's tables in the shared database — confirm acceptable or prefer another convention.

5. **Inventory depletion:** Cultivate records `stock.stock_id` as `input_lot_id` for lot traceability but does NOT decrement `stock.quantity` (farmstock owns that via its `transactions` table). Periodic reconciliation. Acceptable?

6. **Farmstock recipe/apply retirement timing:** Phase 2 (after cultivate application entry ships), or retire sooner?

---

## 11. Summary Diagram

```
FARMSTOCK (farmstock.hatstak.app)          CULTIVATE (cultivate.hatstak.app)
══════════════════════════════════          ══════════════════════════════════

SOURCE OF TRUTH:                            SOURCE OF TRUTH:
  items          ─────────────────────────►   cv_fertigation_recipes
  stock          ─────────────────────────►   cv_foliar_recipes
  suppliers                                   cv_batches
  users ◄──────────────────────────────────   cv_plant_assignments
  waste_batches                               cv_applications_pesticide
  loss_theft_reports                          cv_applications_fertigation
  metrc_queue (inventory events)              cv_applications_foliar
                                              cv_container_amendments
LEGACY (retire Phase 2):                     cv_containers / cv_sub_zones
  recipes                                     cv_soil_samples
  mix_batches                                 cv_plant_loss_events
  applications                                cv_metrc_sync_log (cultivation)
  application_locations

                  ┌─────────────────────┐
                  │  /data/farmstock.db │  ← SHARED SQLite file
                  │  (Railway volume)   │     mounted by both apps
                  └─────────────────────┘
```

---

*This document is the gate to Phase 1. No schema work, migrations, or feature implementation should begin until the operator reviews and approves the decisions in §10.*
