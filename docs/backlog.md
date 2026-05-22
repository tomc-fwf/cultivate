# Cultivate — Comprehensive Backlog & Known Issues

**Generated:** 2026-05-21  
**Sources:** audit-api-security.md, audit-frontend-ux.md, audit-regulatory-compliance.md, audit-schema-performance.md, roadmap-phase2-4.md, CLAUDE.md  
**Format:** Each item has effort (S=hours, M=1–2 days, L=3–5 days, XL=1+ week) and priority (P0=production blocker, P1=pre-launch, P2=near-term, P3=future)

---

## Critical — Must Fix Before Production

_Violations of statute, business rules, or safety rules that make the system non-compliant or unsafe to use. All are P0._

---

### CRIT-01 — `GET /api/auth/users` has no auth middleware
**Source:** audit-api-security.md F-01  
**File:** `src/api/routes/auth.ts:17`  
Returns every user's ID, name, and role to unauthenticated HTTP clients. Enables user enumeration and role discovery before authentication.  
**Fix:** Add `{ preHandler: requireAuth }`. If the login picker must work pre-token, create a narrow public endpoint returning only `{ id, name }` (no role field) with stricter rate limiting.  
**Effort:** S | **Priority:** P0

---

### CRIT-02 — DELETE endpoints on compliance application tables violate 5-year retention
**Source:** audit-regulatory-compliance.md C1, audit-api-security.md F-02  
**Files:** `fertigation-applications.ts:343`, `foliar-applications.ts:408`, `pesticide-applications.ts:450`  
Admin-role users can permanently destroy compliance records within 24 hours. Violates MN Statute 342.25 and Business Rule 5. DELETE on `cv_observations` is lower risk but inconsistent.  
**Fix:** Remove all three DELETE handlers. The `corrects_id` schema columns are already present — enforce the correction-record pattern instead. Add `PATCH /:id/void` as a soft-delete if needed.  
**Effort:** S | **Priority:** P0

---

### CRIT-03 — Fertigation recipe ingredients not expanded in compliance exports
**Source:** audit-regulatory-compliance.md C2  
**File:** `src/api/routes/exports.ts`  
Cultivation record and METRC additives export represent fertigation as "BASE v1.2 at 100 gal" without per-product quantities. MN Statute 342.25 requires quantity of every fertilizer used. Regulators cannot verify ingredient-level compliance without manual recipe calculation.  
**Fix:** In both exports, join `cv_fertigation_recipe_ingredients` for each fertigation application row and compute `rate_value × volume_gallons` per ingredient. Emit one row per ingredient per application.  
**Effort:** M | **Priority:** P0

---

### CRIT-04 — Product name and EPA reg# not snapshotted at application save time
**Source:** audit-regulatory-compliance.md C3  
**Files:** All four application route POST handlers  
Product names, EPA registration numbers, PHI values, and REI hours live only in farmstock. A cultivation record from 2026 produced in 2031 for an audit will show "Input #12" if farmstock is unavailable. Violates 5-year retention intent of MN Statute 342.25.  
**Fix:** At application save time, fetch from farmstock and store `product_name_snapshot TEXT` (and `epa_reg_no_snapshot TEXT` for pesticides) in the application record. Migration required for: `cv_applications_foliar`, `cv_applications_pesticide`, `cv_container_amendments`.  
**Effort:** M | **Priority:** P0

---

### CRIT-05 — No METRC plant waste/loss export
**Source:** audit-regulatory-compliance.md C4  
**File:** `src/api/routes/exports.ts` (missing route)  
`cv_plant_waste_trim_events` and `cv_plant_loss_events` both have `metrc_sync_status='pending'` for all records, but there is no export route for METRC plant waste submission. Waste cannot be reported to METRC without this.  
**Fix:** Add `GET /api/exports/metrc-waste` aggregating both tables in METRC Waste Report format: plant METRC tag, batch UID, weight, reason, disposal method, disposal date.  
**Effort:** M | **Priority:** P0

---

### CRIT-06 — Batch close does not transition all containers to TEARDOWN (Business Rule 34)
**Source:** audit-regulatory-compliance.md C5  
**File:** `src/api/routes/harvest.ts` (auto-close logic)  
When a batch auto-closes (last final_harvest recorded), only the container of the final harvest event transitions to TEARDOWN. All EMPTY containers from mid-batch losses remain in EMPTY state permanently — zombie containers that are never cleaned up.  
**Fix:** In the auto-close transaction and in `batches.ts` manual-close handler, UPDATE all `cv_container_state` rows where `current_batch_id = batch_id` AND `current_state IN ('active', 'empty')` to `current_state = 'teardown'` and INSERT corresponding state transition records.  
**Effort:** S | **Priority:** P0

---

### CRIT-07 — ContainerDetail and ContainerScanner have no REI pre-entry check
**Source:** audit-frontend-ux.md Section 2 Rule 6  
**Files:** `client/src/pages/containers/ContainerDetail.jsx`, `client/src/pages/containers/ContainerScanner.jsx`  
A QR scan into a sub-zone with an active pesticide REI navigates directly to the container record with no warning. CLAUDE.md UX Rule 12 and Business Rule 20 require a full-screen modal before entering an REI-restricted area. This is a worker safety violation.  
**Fix:** In `ContainerDetail.jsx` on mount, check if the container's current batch has an active pesticide application with `rei_expires_at > NOW() AND rei_cleared_at IS NULL`. If so, show `REIConfirmModal` before rendering the record. Add the same check in `ContainerScanner.jsx` before navigation.  
**Effort:** M | **Priority:** P0

---

### CRIT-08 — `Today.jsx` silently swallows all API load errors
**Source:** audit-frontend-ux.md Section 4  
**File:** `client/src/pages/Today.jsx:56-63`  
Both REI and batch API calls swallow errors silently: `catch(() => setReiLoading(false))`. An API failure is indistinguishable from "no data." Field staff see an empty Today screen and assume everything is fine when the API may be down.  
**Fix:** Add error state: if either call fails, show a "Unable to load — tap to retry" banner. Set `setError(e.message)` and render it below the header.  
**Effort:** S | **Priority:** P0

---

### CRIT-09 — `BatchDetail.jsx` amendment quick-action link missing `?batch_id=`
**Source:** audit-frontend-ux.md Section 2 Rule 8 / Section 3  
**File:** `client/src/pages/batches/BatchDetail.jsx:387`  
The amendment link navigates to `/applications/amendments/new` without `?batch_id=`. Every other quick-action from BatchDetail passes `?batch_id=`. Amendments logged from batch context have no plant batch association — a compliance gap since container amendments need `plant_batch_id` set when applied during an active batch.  
**Fix:** Change to `/applications/amendments/new?batch_id=${batch.batch_id}`.  
**Effort:** S | **Priority:** P0

---

### CRIT-10 — `PesticideNew.jsx` has no offline/network error handling
**Source:** audit-frontend-ux.md Section 4  
**File:** `client/src/pages/applications/PesticideNew.jsx:446-458`  
A compliance-critical pesticide record typed during spotty-WiFi shows a generic "save failed" error instead of queuing for sync. The record is lost. `FertigationNew.jsx`, `FoliarNew.jsx`, and `AmendmentNew.jsx` all handle this correctly.  
**Fix:** Copy the `Failed to fetch` / `NetworkError` detection and pending-sync indicator pattern from `FertigationNew.jsx` into the pesticide save error handler.  
**Effort:** S | **Priority:** P0

---

## High Priority — Fix Before First Real Users

_Items marked HIGH in audit docs. UX violations, data integrity gaps, missing compliance pieces. All are P1._

---

### HIGH-01 — MDA pesticide report strips time-of-day from `applied_at`
**Source:** audit-regulatory-compliance.md H1  
**File:** `src/api/routes/exports.ts:315`  
`application_date: String(r['applied_at'] ?? '').slice(0, 10)` outputs date-only. MN Statute 18B.37 requires date AND time for pesticide application records.  
**Fix:** Include full timestamp: `application_date: r['applied_at']` or add a separate `application_time` field. Update CSV column headers accordingly.  
**Effort:** S | **Priority:** P1

---

### HIGH-02 — `input_lot_id` missing from MDA pesticide report output
**Source:** audit-regulatory-compliance.md H2  
**File:** `src/api/routes/exports.ts:311`  
Lot tracking for pesticides is required at entry (`input_lot_id` is NOT NULL via Zod — Business Rule 16) but the lot number is not included in the MDA export. Auditors routinely ask which specific product lot was applied.  
**Fix:** Add `lot_id: r['input_lot_id'] ?? null` to the MDA output map and include `lot_number` as a CSV column (requires a JOIN to `cv_input_lots` via farmstock or a stored lot_number snapshot).  
**Effort:** S | **Priority:** P1

---

### HIGH-03 — METRC UID not verified before harvest event creation (Business Rule 6)
**Source:** audit-regulatory-compliance.md H7  
**File:** `src/api/routes/harvest.ts`  
Harvest events can be created on batches with no `metrc_plant_batch_uid`. Business Rule 6 states METRC UID is required before harvest. The system warns during batch display but does not enforce this gate.  
**Fix:** In `POST /api/harvest/batches/:id/events`, check `batch.metrc_plant_batch_uid IS NOT NULL` and return 422 with a clear message if not set. This blocks harvest entry rather than just warning.  
**Effort:** S | **Priority:** P1

---

### HIGH-04 — All compliance application tables missing `updated_at`
**Source:** audit-regulatory-compliance.md H6, audit-schema-performance.md Section 1  
**Tables:** `cv_applications_fertigation`, `cv_applications_foliar`, `cv_applications_pesticide`, `cv_container_amendments`, `cv_observations`, `cv_plant_loss_events`  
When PATCH edits occur (within 24h), there is no modification timestamp. For a 5-year retention system, the audit trail should reflect when records were changed. A migration is required to add `updated_at` and the PATCH routes must set it.  
**Effort:** M | **Priority:** P1

---

### HIGH-05 — No METRC batch phase-change export
**Source:** audit-regulatory-compliance.md H3  
`cv_batch_phase_history` has all data (from_status, to_status, transitioned_at, metrc_sync_status) but no export route formats it for METRC "Change Growth Phase" submission. Phase changes must be manually entered in METRC with no tooling assistance.  
**Fix:** Add `GET /api/exports/metrc-phases/:batchId` returning phase transitions in METRC format.  
**Effort:** M | **Priority:** P1

---

### HIGH-06 — No METRC plant tag assignment export
**Source:** audit-regulatory-compliance.md H4  
`cv_plant_assignments` has `metrc_plant_tag`, `placed_at`, `container_id`, `batch_id` but no `metrc_sync_status` column and no export route. METRC requires tag assignments to be submitted.  
**Fix:** Migration to add `metrc_sync_status` to `cv_plant_assignments`. Add `GET /api/exports/metrc-tag-assignments` route.  
**Effort:** M | **Priority:** P1

---

### HIGH-07 — No METRC harvest export
**Source:** audit-regulatory-compliance.md H5  
Harvest events tracked in `cv_plant_harvest_events` with `metrc_sync_status` but no route aggregates and formats them for METRC harvest batch submission. Aggregate wet weight per harvest batch is not pre-computed in any export.  
**Fix:** Add `GET /api/exports/metrc-harvest/:batchId` aggregating harvest events by harvest_batch with sum of wet weights.  
**Effort:** M | **Priority:** P1

---

### HIGH-08 — Cultivation record has no PDF output
**Source:** audit-regulatory-compliance.md H8  
`GET /api/exports/cultivation-record/:batchId` returns JSON only. For regulatory handoff, a signed PDF is the expected deliverable. CLAUDE.md specifies "designed for regulator handoff." Regulators and state compliance reviews expect a printable document, not raw JSON.  
**Fix:** Implement PDF generation for the cultivation record. Use Playwright headless or a server-side HTML-to-PDF library. Apply the Fraunces/JetBrains Mono/earthy-palette print style.  
**Effort:** L | **Priority:** P1

---

### HIGH-09 — Planting plans feature is unreachable from the frontend
**Source:** audit-api-security.md F-08  
8 backend planting-plan routes have no `api.js` methods and no frontend pages. The planting plans feature owns the `cult-hoop → field-veg` batch transition — without it, batches cannot move to the field via the UI.  
**Fix:** Add `api.js` methods for all 8 planting-plan routes. Build frontend pages: PlanningList, PlanDetail, PlanCommit. Wire the "Move to Field" transition through the plan commit flow.  
**Effort:** L | **Priority:** P1

---

### HIGH-10 — METRC tag assignment write routes unreachable from frontend
**Source:** audit-api-security.md F-09  
`POST /api/tag-assignments` (single), `POST /api/tag-assignments/bulk`, and `POST /api/tag-assignments/reassign` have no `api.js` methods. METRC tagging and the reconciliation/reassignment workflow cannot be performed via the app. METRC tagging is a hard compliance requirement.  
**Fix:** Add `assignTag(data)`, `bulkAssignTags(data)`, `reassignTag(data)` to `api.js`. Wire to `ContainerDetail.jsx` "Assign METRC Tag" button and a new bulk assignment page.  
**Effort:** M | **Priority:** P1

---

### HIGH-11 — Waste trim list and disposal workflow not wired to any UI
**Source:** audit-api-security.md F-13  
`api.getWasteTrim` and `api.disposeWasteTrim` exist in `api.js` but no page calls them. The waste disposal lifecycle (collected → held → disposed → reported) cannot be completed from the app. Waste trim records accumulate as `collected` indefinitely.  
**Fix:** Add a waste trim list view to HarvestDashboard or a standalone `/harvest/waste-trim` page. Wire `disposeWasteTrim` to a "Mark Disposed" action.  
**Effort:** M | **Priority:** P1

---

### HIGH-12 — Recipes and Crop Inputs are unreachable from normal navigation
**Source:** audit-frontend-ux.md Section 3  
Recipe Library (`/recipes`), Crop Input Inventory (`/inputs`), REI Dashboard (`/rei`), and all export routes have no NavBar entry and are accessible only by typing URLs. Field staff cannot find recipe reference material or product information without URL knowledge.  
**Fix:** Add a "More" overflow item or "Library" section to the NavBar surfacing Recipes, Inputs, Exports, and REI. At minimum, add a "Recipes & Inputs" card on ApplicationsHub.  
**Effort:** S | **Priority:** P1

---

### HIGH-13 — Today screen missing container lifecycle action items
**Source:** audit-frontend-ux.md Section 3  
CLAUDE.md Feature 26 requires the Today screen to surface: containers in TEARDOWN awaiting soil sample, containers in STARTUP awaiting amendments, soil samples sent to lab awaiting results, and unsynced plant loss events. None of these are rendered. The Today screen only shows active REIs, batch cards, and recent fertigation.  
**Fix:** Add a "Pending Actions" section to `Today.jsx` below batch cards. Query for each category on load; show count badges with "tap to view" navigation.  
**Effort:** M | **Priority:** P1

---

### HIGH-14 — 8 forms missing required draft persistence
**Source:** audit-frontend-ux.md Section 2 Rule 3  
CLAUDE.md UX Rule 3 requires auto-save draft for forms with 3+ fields. The following forms violate this:
- `BatchNew.jsx` (6 fields) — `cv_draft_batch_new`
- `FinalHarvestForm.jsx` (4 fields) — `cv_draft_final_harvest`
- `PartialHarvestForm.jsx` (4 fields) — `cv_draft_partial_harvest`
- `SoilSampleForm.jsx` (5+ fields) — `cv_draft_soil_sample`
- `FertigationRecipeEdit.jsx` (many fields) — `cv_draft_fertigation_recipe`
- `FoliarRecipeEdit.jsx` (many fields) — `cv_draft_foliar_recipe`
- `PlantReplacementForm.jsx` (3 fields) — verify and add if needed  
**Fix:** Add 3-second debounce localStorage persistence using the `cv_draft_*` convention established in the other forms. Clear on successful submit.  
**Effort:** M | **Priority:** P1

---

### HIGH-15 — NavBar touch targets below 56pt minimum
**Source:** audit-frontend-ux.md Section 2 Rule 1  
**File:** `client/src/components/NavBar.jsx`  
All NavBar items render at ~40px effective tap area (`py-2 pt-1`). CLAUDE.md UX Rule 1 requires 56pt minimum for gloved use. Affects all daily-use navigation.  
**Fix:** Add `style={{ minHeight: '56px' }}` to each NavLink/button, or increase padding to `py-4`.  
**Effort:** S | **Priority:** P1

---

### HIGH-16 — `BatchNew.jsx` has no success toast; `BatchDetail.jsx` has no transition feedback
**Source:** audit-frontend-ux.md Section 2 Rule 7  
**Files:** `client/src/pages/batches/BatchNew.jsx`, `client/src/pages/batches/BatchDetail.jsx`  
After batch creation, the form navigates silently. After phase transitions and recipe assignment, state updates silently. All other save flows show green flash + toast. Inconsistent with UX Rule 8 (visual feedback on every save).  
**Fix:** Add `"Batch created"` toast before navigate in BatchNew. Add `"Moved to Seedlings ✓"` toast after successful transitions and `"Recipe assigned ✓"` after recipe modal close in BatchDetail.  
**Effort:** S | **Priority:** P1

---

### HIGH-17 — `api.getItems` calls non-existent backend route
**Source:** audit-api-security.md F-03  
**File:** `client/src/api.js:24`  
`api.getItems` constructs a request to `/api/items` — no route exists there. All catalog routes are at `/api/catalog/`. Every call silently 404s. This method is not called in any page, but it is a latent bug.  
**Fix:** Remove `api.getItems` or fix the path to `/catalog/items` and rename to `getCatalogItems`.  
**Effort:** S | **Priority:** P1

---

## Phase 1 Remaining

_Features specified in CLAUDE.md Phase 1 that are partially or completely unimplemented._

---

### P1R-01 — Feature 16: METRC tag assignment camera flow needs verification
**Source:** audit-frontend-ux.md Section 5  
No dedicated route in `App.jsx` for METRC tag assignment. Feature expected to be in `ContainerDetail.jsx`. Must verify: (1) "Assign METRC Tag" button appears when no tag assigned, (2) button opens camera barcode-scan mode for 24-char UID, (3) bulk assignment mode is accessible. Tag write `api.js` methods are missing (see HIGH-10).  
**Effort:** M | **Priority:** P1

---

### P1R-02 — Planting plans UI — field planting workflow broken
**Source:** audit-api-security.md F-08 (see also HIGH-09)  
Backend fully implemented; no frontend. The `cult-hoop → field-veg` transition can only be done by manually calling the API. This is a blocking gap for normal batch lifecycle operation.  
**Effort:** L | **Priority:** P1 (same as HIGH-09 — duplicate entry for emphasis)

---

### P1R-03 — `Today.jsx` recent applications only shows fertigation
**Source:** audit-frontend-ux.md Section 6  
**File:** `client/src/pages/Today.jsx:212-249`  
The `RecentApplications` component only fetches `getFertigationApplications`. CLAUDE.md Feature 14 specifies "recent entries" should surface the last 5–10 items across all four application types plus observations.  
**Fix:** Expand Today's recent-activity section to query all application types (or use a new `/api/activity/recent` endpoint) and show the merged, time-sorted list.  
**Effort:** M | **Priority:** P2

---

### P1R-04 — `BatchDetail.jsx` Advance Phase button not fixed/sticky
**Source:** audit-frontend-ux.md Section 6  
On a batch with a long history timeline, the user must scroll to the bottom to reach the "Advance Phase" button. CLAUDE.md UX Rule 2 requires primary actions in the thumb zone.  
**Fix:** Make the button sticky at `bottom: 80px` (above NavBar) when the batch is not closed.  
**Effort:** S | **Priority:** P2

---

### P1R-05 — Batches.jsx `+ New Plant Batch` button is 44px (below 56pt)
**Source:** audit-frontend-ux.md Section 2 Rule 1  
**File:** `client/src/pages/batches/Batches.jsx:87`  
`minHeight: '44px'` — below the 56pt gloved-use minimum.  
**Fix:** Change to `minHeight: '56px'`.  
**Effort:** S | **Priority:** P1

---

## Technical Debt

---

### DEBT-01 — Missing indexes (29 indexes) and PRAGMA tuning
**Source:** audit-schema-performance.md Section 2, 5, 6  
No custom indexes exist on any query column — every filter and join does a full table scan. Critical missing indexes include `cv_plant_assignments(batch_id, unassigned_at)`, `cv_plant_harvest_events(plant_assignment_id, event_type)`, `cv_batch_phase_history(batch_id)`, and all three application tables' `(batch_id, applied_at)`. `PRAGMA busy_timeout = 0` causes immediate SQLITE_BUSY (HTTP 500) on concurrent writes from multiple field devices. `PRAGMA synchronous = FULL` (default) doubles write latency vs. NORMAL with WAL mode.  
**Fix:** Implement migration `015_indexes.ts` (full content in audit-schema-performance.md Section 6). Add 5 PRAGMA lines to `initDB()` in `src/db/index.ts`.  
**Effort:** S | **Priority:** P1

---

### DEBT-02 — Recipe POST bodies lack Zod validation
**Source:** audit-api-security.md F-04  
**Files:** `fertigation-recipes.ts:184`, `foliar-recipes.ts:134`, and their `/version` variants  
`request.body as RecipeBody` cast directly without Zod parsing. Malformed bodies (string where number expected, missing fields, negative rates) cause DB errors instead of clean 400 responses.  
**Fix:** Add `RecipeBodySchema` and `IngredientBodySchema` Zod schemas matching the existing route patterns.  
**Effort:** S | **Priority:** P2

---

### DEBT-03 — Strain mutation routes lack Zod validation
**Source:** audit-api-security.md F-05  
**File:** `strains.ts:37–41, 70–75`  
`POST /api/strains` and `PUT /api/strains/:id` use manual `if (!name)` checks. No length limits on `genetics` or `notes`.  
**Fix:** Replace with `StrainBodySchema = z.object({ name: z.string().min(1).max(200), type: z.enum(['auto','photo']), genetics: z.string().nullable().optional(), notes: z.string().nullable().optional() })`.  
**Effort:** S | **Priority:** P2

---

### DEBT-04 — Container state mutation routes lack Zod validation
**Source:** audit-api-security.md F-06  
**Files:** `containers.ts:287` (PATCH /:id/state), `containers.ts:348` (bulk-set-state), `containers.ts:467` (PATCH /:id/notes)  
Bodies cast to typed interfaces without Zod. `to_state` validated by a manual VALID_STATES Set; other fields unchecked.  
**Fix:** Add inline Zod schemas for these three bodies.  
**Effort:** S | **Priority:** P2

---

### DEBT-05 — Application write routes use `requireAuth` instead of `requireRole('grower')`
**Source:** audit-api-security.md F-07  
CLAUDE.md specifies compliance-record mutations require at minimum `grower` role. Using `requireAuth` is functionally equivalent today but does not express the intent and creates drift risk if the role model changes.  
**Fix:** Replace `requireAuth` with `requireRole('grower')` on all compliance-record write routes.  
**Effort:** S | **Priority:** P2

---

### DEBT-06 — `GET /harvest/waste-trim` has no LIMIT clause
**Source:** audit-schema-performance.md Section 4  
**File:** `src/api/routes/harvest.ts`  
The only list endpoint with zero protection against unbounded result sets. Will grow to hundreds of rows across a full season.  
**Fix:** Add `LIMIT 500` default with a `limit`/`offset` query parameter.  
**Effort:** S | **Priority:** P2

---

### DEBT-07 — `GET /containers/summary` loads all 1,180 rows into Node for JS aggregation
**Source:** audit-schema-performance.md Section 3  
**File:** `src/api/routes/containers.ts`  
1,180 container rows + 4-table joins transferred to Node on every dashboard refresh. Should be a SQL `GROUP BY r.sub_zone_id, cs.current_state` with COUNT.  
**Fix:** Replace JS aggregation with a SQL GROUP BY query.  
**Effort:** S | **Priority:** P2

---

### DEBT-08 — Missing `updated_at` on 6 compliance tables (schema migration needed)
**Source:** audit-regulatory-compliance.md H6 (also tracked as HIGH-04)  
See HIGH-04. Separate entry here as a schema/migration debt item.  
Migration: ALTER TABLE for `cv_applications_fertigation`, `cv_applications_foliar`, `cv_applications_pesticide`, `cv_container_amendments`, `cv_observations`, `cv_plant_loss_events`.  
**Effort:** M | **Priority:** P1

---

### DEBT-09 — Tier 2 integration tests not yet written
**Source:** docs/test-plan.md  
The test infrastructure is in place (helpers, fixtures, 175 passing tests). Tier 2 tests (data integrity rules) not yet implemented:
- Container state constraint enforcement (active requires active assignment, etc.)
- Tag uniqueness unit tests (METRC tag format validation edge cases)
- Batch state machine completeness (all invalid transitions)
- Recipe versioning (immutable once approved)
- Fertigation EC/pH required fields (zero is valid; null is not)  
**Effort:** M | **Priority:** P2

---

### DEBT-10 — `cv_batch_stage_recipes.recipe_id` missing FK to `cv_fertigation_recipes`
**Source:** audit-schema-performance.md Section 1  
Migration 003 comment says "FK added in 006" but migration 006 does not add it. The column is unguarded — SQLite won't catch orphaned recipe_id values.  
**Fix:** Migration to add the FK via table recreation (SQLite doesn't support ADD CONSTRAINT).  
**Effort:** S | **Priority:** P3

---

### DEBT-11 — Deferred FK constraints never completed
**Source:** audit-schema-performance.md Section 1  
`cv_teardown_events.soil_sample_id` and `cv_container_amendments.soil_sample_id` were marked as deferred FKs in the migrations but no subsequent migration adds them.  
**Fix:** Add FKs in a new migration once the circular-reference issue (teardown → soil_sample → teardown) is resolved via nullable FKs.  
**Effort:** S | **Priority:** P3

---

### DEBT-12 — Deprecated `api.bulkResetContainersToReady` method
**Source:** audit-api-security.md F-14  
**File:** `client/src/api.js`  
Calls a deprecated backend alias. Never used in any page component.  
**Fix:** Remove from `api.js`.  
**Effort:** S | **Priority:** P3

---

### DEBT-13 — Login error shape uses `details` instead of `issues`
**Source:** audit-api-security.md F-10  
**File:** `src/api/routes/auth.ts:28`  
`reply.code(400).send({ error: 'Invalid request', details: ... })` — inconsistent with every other Zod validation error in the codebase which uses `issues`.  
**Fix:** Change `details` to `issues`.  
**Effort:** S | **Priority:** P3

---

### DEBT-14 — Recipe DELETE routes return HTTP 200 instead of 204
**Source:** audit-api-security.md F-11  
**Files:** `fertigation-recipes.ts:365`, `foliar-recipes.ts:290`  
Delete endpoints with no meaningful response body should return 204.  
**Fix:** Change to `reply.code(204).send()`.  
**Effort:** S | **Priority:** P3

---

### DEBT-15 — Unvalidated enum query params on two list endpoints
**Source:** audit-api-security.md F-12  
**Files:** `plant-loss.ts:175` (`?metrc_sync_status`), `harvest.ts:498` (`?waste_status`)  
Unrecognized enum values return an empty 200 instead of a 400. No injection risk (parameterized queries), but a bad API contract.  
**Fix:** Add whitelist Set check and return 400 on unrecognized values.  
**Effort:** S | **Priority:** P3

---

### DEBT-16 — Several PATCH/UPDATE api.js methods never called from pages (dead code)
**Source:** audit-api-security.md F-14  
Methods defined in `api.js` but not wired to any page: `updateFertigationApplication`, `updateFoliarApplication`, `updateContainerAmendment`, `updatePesticideApplication`, `updateObservation`, `deleteObservation`, `getFertigationRecipeByName`. Build the edit/correction UI flows or remove the dead methods.  
**Effort:** varies | **Priority:** P3

---

### DEBT-17 — Missing `down()` reversibility on 3 migrations
**Source:** audit-schema-performance.md Section 1  
- Migration 008: `DROP COLUMN` not reversible in SQLite  
- Migration 010: drops columns on down without recreation  
- Migration 012: leaves `current_location_id` behind on down  
These affect the ability to roll back in development. Not a production blocker but worth noting.  
**Effort:** M | **Priority:** P3

---

## Phase 2 Features

_From docs/roadmap-phase2-4.md. Estimated effort from the roadmap._

---

### P2-01 — Sub-zone Field Maps
Visual CSS grid of all containers per sub-zone with color coding by state (active/empty/teardown/startup/ready/OOS), REI indicators, and open-observation flags. Tap a cell → ContainerDetail; long-press → quick-action sheet; tap row header → Inspection Mode. Route: `/containers/map/:subZoneId`.  
Backend: add `has_open_observation` and `rei_active_until` computed fields to `GET /api/containers`.  
**Effort:** M | **Priority:** P2

---

### P2-02 — Inspection Mode (row-walk)
Full-screen single-container view with swipe navigation (TouchEvent), progress bar ("5/30 reviewed"), per-container action sheet. Harvest Readiness Mode for `harvest_window` batches with maturity slider and priority. Landscape split-pane on tablet. Route: `/inspect/:rowId`.  
**Effort:** L | **Priority:** P2

---

### P2-03 — Offline Mode Hardening (IndexedDB + Service Worker)
Replace the current "show error on failure" pattern with true offline persistence: IndexedDB pending_writes queue, BackgroundSync service worker, flush loop with exponential backoff, conflict resolution modal, NavBar sync status badge, per-form "Saved locally" indicator. Uses `idb` library.  
All 7 application entry forms migrated to `useOfflineSubmit()` hook.  
**Effort:** XL (5 days) | **Priority:** P2

---

### P2-04 — Bulk METRC Tag Assignment
Scan-container/scan-tag loop for tagging entire batches. Container list with tagged/untagged status, full-screen QR scanner per container, barcode scanner for METRC tag, progress display, error recovery for duplicate tags. Route: `/tag-assignment/bulk`. Links from BatchDetail (supervisor).  
Uses existing `POST /api/tag-assignments`. Requires HIGH-10 api.js methods.  
**Effort:** M | **Priority:** P2

---

### P2-05 — Move/Transplant Tracking
When a plant must move containers: scan source, scan destination, confirm with reason, single transaction (unassign source, create new assignment, update container states). New backend endpoint: `POST /api/tag-assignments/:assignmentId/move`. Route: `/containers/:containerId/move`.  
**Effort:** M | **Priority:** P2

---

### P2-06 — Soil Sample Tracker Dashboard
Three-tab view: Awaiting Collection (teardown containers without samples), Sent to Lab (with days-waiting alerts >14 days), Results Received (last 90 days with key results). New backend: `GET /api/soil-samples?status=...`. Route: `/soil-samples`.  
**Effort:** M | **Priority:** P2

---

### P2-07 — Photo Capture (any screen, persistent toolbar button)
Camera icon in NavBar toolbar. Opens photo capture modal attached to current page context via URL params. Requires upload infrastructure: `POST /api/uploads` → returns URL. Photos auto-tagged with batch/container context.  
**Effort:** M | **Priority:** P2

---

### P2-08 — Bulk Teardown/Startup
"Close Batch & Start Teardown" action on BatchDetail transitioning all containers in batch to teardown in one call. Requires CRIT-06 to be implemented first.  
**Effort:** S | **Priority:** P2

---

### P2-09 — Audit/Reconciliation Mode
Guided container-by-container METRC tag verification walk with discrepancy report output. Similar to Inspection Mode but outputs confirmed/missing/mismatch counts per row.  
**Effort:** M | **Priority:** P2

---

### P2-10 — Voice Input for Notes Fields
Long-press any notes field → SpeechRecognition API transcription. `VoiceInput.jsx` wrapper component for all text areas. Especially valuable for observation notes during row walks.  
**Effort:** S | **Priority:** P3

---

### P2-11 — Photo Galleries per Container
ContainerDetail photo history section aggregating photos from all application records, observations, and teardown/startup events for a container. Chronological gallery view.  
**Effort:** M | **Priority:** P3

---

### P2-12 — Improved Global Search
NavBar global search bar. `GET /api/search?q=` multi-table LIKE query searching batches (strain, sub-zone), containers (position), applications (date, type).  
**Effort:** M | **Priority:** P3

---

## Phase 3 Features

_From docs/roadmap-phase2-4.md. Prerequisites: Phase 1 complete, Phase 2 offline stable._

---

### P3-01 — Annual Batch Tracker (Gantt View)
CSS grid Gantt showing all batches across the season by sub-zone. X-axis: calendar weeks. Y-axis: 8 sub-zones. Bars span sow_date → closed_date, color-coded by strain type. Tooltip: strain, plant count, days open, status. Route: `/analytics/annual`. Backend: `GET /api/analytics/annual-tracker?year=`.  
**Effort:** M | **Priority:** P3

---

### P3-02 — EC/pH Trend Charts
Line charts of EC and pH measurements from fertigation applications over batch life, overlaid with target range bands from the active recipe at each measurement time. Plus volume chart showing missed days. Uses `recharts`. Route: `/analytics/batch/:batchId/trends`. Backend: `GET /api/analytics/batch/:batchId/ec-ph`.  
**Effort:** M | **Priority:** P3

---

### P3-03 — Recipe Performance Analysis
Table correlating recipe versions with harvest outcomes (avg yield per plant per recipe version). Notes that correlation ≠ attribution due to environmental variables. Backend: multi-table join. Route: `/analytics/recipe-performance`.  
**Effort:** M | **Priority:** P3

---

### P3-04 — Cross-batch Comparisons
Compare batches along dimensions: same strain/different sub-zones, different strains/same sub-zone, same sub-zone across seasons. Metrics: yield, days to harvest, pesticide count, EC/pH deviation, loss rate. Radar or grouped bar chart. Route: `/analytics/compare`. Backend: `GET /api/analytics/compare`.  
**Effort:** L | **Priority:** P3

---

### P3-05 — Applicator Performance Metrics
Per-applicator: application count, timing consistency, EC/pH measurement variance. Used for training feedback. Simple aggregation table. Backend: new `analytics.ts` route.  
**Effort:** S | **Priority:** P3

---

### P3-06 — Annual Pesticide Use Summary
Aggregate view for license renewal: total applications per product, total volume, total treated area, date range. Roll-up of the existing MDA export data. Printable view.  
**Effort:** S | **Priority:** P3

---

## Phase 4 Features

_METRC API Integration. Full design in docs/metrc-integration-design.md. Prerequisites: Phase 1 critical fixes, migration 016, MN OCM sandbox credentials._

---

### P4-01 — Migration 016: Add `metrc_sync_status` to 3 application tables
Add `metrc_sync_status` and `metrc_synced_at` columns to `cv_applications_fertigation`, `cv_applications_foliar`, `cv_container_amendments`. Default `not_required` for existing records. Migration content is in docs/roadmap-phase2-4.md.  
**Effort:** S | **Priority:** P3

---

### P4-02 — Step 4.1: METRC API Client (`src/sync/metrc-client.ts`)
Authenticated HTTP client for MN METRC API. Test connection endpoint `GET /api/metrc/test-connection`. Sandbox URL: `https://sandbox-api-mn.metrc.com`.  
**Effort:** M | **Priority:** P3

---

### P4-03 — Step 4.2: Sync Worker (`src/sync/metrc-worker.ts`)
Background worker polling `metrc_sync_status = 'pending'` records. Processing state, retry logic, error surfacing, startup reset of stale 'processing' records.  
**Effort:** M | **Priority:** P3

---

### P4-04 — Step 4.3: Plant batch create/update sync
Sync `cv_batches` to METRC: create immature plant batch, update name/count on changes. Admin "backfill" workflow for existing batches.  
**Effort:** L | **Priority:** P3

---

### P4-05 — Step 4.4: Phase change and location move sync
Sync `cv_batch_phase_history` and `cv_batch_location_history` records to METRC "Change Growth Phase" and "Move Plants" endpoints.  
**Effort:** M | **Priority:** P3

---

### P4-06 — Step 4.5: Plant tag assignment sync
Sync `cv_plant_assignments` (place/tag) to METRC. Requires HIGH-06 (metrc_sync_status column on assignments).  
**Effort:** M | **Priority:** P3

---

### P4-07 — Step 4.6: Harvest batch and event sync
Sync `cv_harvest_batches` (create harvest in METRC) and `cv_plant_harvest_events` (submit wet weights). Aggregate weight per harvest batch. Requires CRIT-06 (all containers → teardown on batch close).  
**Effort:** L | **Priority:** P3

---

### P4-08 — Step 4.7: Record Additives sync
Sync all four application types to METRC "Record Additives." Requires migration 016 (P4-01) for fertigation/foliar/amendments.  
**Effort:** L | **Priority:** P3

---

### P4-09 — Step 4.8: Plant waste/loss sync
Sync `cv_plant_waste_trim_events` and `cv_plant_loss_events` to METRC waste/destruction events.  
**Effort:** M | **Priority:** P3

---

### P4-10 — Step 4.9: Reconciliation and two-way read
Read METRC state back to detect manual edits. Reconciliation report showing cultivate vs. METRC discrepancies. Resolution workflow.  
**Effort:** L | **Priority:** P3

---

### P4-11 — Step 4.10: Sync dashboard UI
UI surfacing all pending/failed/synced metrc_sync_status records. Per-record retry/dismiss. Global sync status bar. `GET /api/metrc/sync-status` aggregation endpoint.  
**Effort:** M | **Priority:** P3

---

## Nice to Have

_Not yet part of any phase specification. Low priority unless business need arises._

- **Voice input for notes fields** — already in Phase 2 tail (P2-10 above)
- **Photo galleries per container** — already in Phase 2 tail (P2-11 above)
- **Advanced global search** — already in Phase 2 tail (P2-12 above)
- **Applicator performance metrics** — already in Phase 3 (P3-05)
- **Annual pesticide use reporting for license renewal** — already in Phase 3 (P3-06)
- **NFC tags on containers** — tap-instead-of-scan supplement to QR. ~$0.10/tag. Not recommended as primary; QR is better. Defer until demand is demonstrated.
- **Computer vision UID reading** — OCR of METRC tag printed UID without barcode. Future OS capability.
- **Per-applicator license stored on user profile** — `applicator_license_number` on `cv_users` auto-populates pesticide form. Add when operator obtains private applicator license.
- **Harvest batch date range enforcement (Business Rule 46)** — No enforcement on 1–2 day harvest window. Low risk in practice; could be a soft warning.
- **`corrects_id` UI workflow** — Schema is ready; no UI. Full correction-record creation flow (see compliance audit M1). Replace PATCH handlers long-term.
- **REI posting physical log** — Currently digital-only. Worker safety: physical sign on the row in addition to app modal. Not a code change.
- **Total area treated field (18B.37)** — For container grows, derive from container count or sub-zone area. MEDIUM priority per compliance audit M7.

---

## Known Issues

---

**Issue:** ContainerScanner navigates to ContainerDetail without REI check  
**Impact:** Any field worker scanning a container QR in a REI-active sub-zone proceeds directly without the required full-screen warning. Safety and compliance risk.  
**Workaround:** Manually check REI Dashboard before scanning  
**Fix:** See CRIT-07

---

**Issue:** `GET /api/auth/users` is unauthenticated  
**Impact:** Any network-accessible client can enumerate all user names, IDs, and roles without credentials  
**Workaround:** Restrict firewall/Cloudflare access to the app origin only  
**Fix:** See CRIT-01

---

**Issue:** `BatchDetail.jsx` Amendment link missing `?batch_id=`  
**Impact:** Every amendment logged via the batch detail quick-action has no batch association. The amendment goes into the container record only, breaking the batch-scoped application history used by METRC and cultivation record exports.  
**Workaround:** Log amendments via the Applications Hub (`/applications`) and manually select the batch  
**Fix:** See CRIT-09

---

**Issue:** EMPTY containers within a closed batch are never transitioned to TEARDOWN  
**Impact:** When a plant dies mid-batch and the batch later closes, the container stays in EMPTY state. It cannot receive a new batch (requires READY), and the teardown/soil-sample/startup workflow is never triggered. Container is stuck until an admin manually resets state.  
**Workaround:** Admin manually uses bulk-set-state to transition stuck containers  
**Fix:** See CRIT-06

---

**Issue:** No indexes on any query column — full table scans on every load  
**Impact:** `GET /batches` loads a correlated subquery per batch; `GET /harvest/batch/:id` runs an EXISTS per plant (up to 300 at harvest). Performance is acceptable now but will degrade linearly with data growth.  
**Workaround:** None  
**Fix:** See DEBT-01 — implement migration 015

---

**Issue:** `PRAGMA busy_timeout = 0` causes SQLITE_BUSY on concurrent writes  
**Impact:** Two field staff submitting simultaneously (common during fertigation rounds) produces a HTTP 500 for one of them. No retry — the record is lost.  
**Workaround:** Applicators avoid submitting at exactly the same second  
**Fix:** See DEBT-01 — add `busy_timeout = 5000` in PRAGMA migration

---

**Issue:** Pesticide application record survives save but loses network without queuing  
**Impact:** A pesticide application entered during spotty WiFi shows "save failed" and the record is lost. No offline queue exists for this form (unlike fertigation/foliar/amendments).  
**Workaround:** Submit from a stable WiFi area, or note on paper and re-enter  
**Fix:** See CRIT-10

---

**Issue:** Fertigation exports do not expand recipe ingredients  
**Impact:** A compliance review requesting "list all fertilizers applied" gets recipe names, not product names. The auditor cannot verify whether the operation used specific products at the required quantities without manual calculation.  
**Workaround:** Print the recipe card alongside the cultivation record for manual cross-reference  
**Fix:** See CRIT-03

---

**Issue:** MDA pesticide report shows date-only, not date+time  
**Impact:** The MN Statute 18B.37-formatted report is technically non-compliant. Low immediate risk (operator not currently a commercial applicator), but will fail an MDA inspection once licensed.  
**Workaround:** Field staff record time in the notes field as a manual supplement  
**Fix:** See HIGH-01

---

**Issue:** Planting plan frontend is completely missing  
**Impact:** Batches cannot advance from `cult-hoop` to `field-veg` status through the UI. The planting plan backend (8 routes) works but is unreachable. Field planting requires either direct API calls or the admin bulk-set-state endpoint as a workaround.  
**Workaround:** Admin uses `PATCH /api/batches/:id/transition` directly or bulk-set-state to force the status  
**Fix:** See HIGH-09 / P1R-02

---

*Last updated: 2026-05-21. Generated from static audit of all route files, migration files, and JSX components.*
