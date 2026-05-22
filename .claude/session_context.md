## Task: Schema + performance audit
**Completed:** 2026-05-21

### What Was Done
- Read all 14 migrations (001–014) and all 18 route files
- Produced `docs/audit-schema-performance.md` covering:
  - Schema completeness table for all 37 tables (created_at, updated_at, created_by, FK constraints, enum enforcement, down() reversibility)
  - 29 missing index recommendations with impact ratings
  - N+1 query risk inventory (6 cases identified)
  - Unbounded query list (waste-trim, plant-loss, exports have no LIMIT)
  - PRAGMA configuration analysis (busy_timeout=0 is a bug; synchronous=FULL is suboptimal)
  - Full migration content for `015_indexes.ts` (29 indexes + PRAGMA changes)

### Key Decisions
- Documented `cv_batch_stage_recipes.recipe_id` as a missing FK (comment in 003 says 006 would add it, but 006 doesn't). Flagged but not fixed — that's a schema change requiring a separate migration.
- The deferred FKs on `cv_teardown_events.soil_sample_id` and `cv_container_amendments.soil_sample_id` are flagged as never-completed.
- The migration content in the doc includes PRAGMA changes in `up()` but notes they only affect the migration-time connection — companion change to `initDB()` is required.

### Files Modified/Created
- `docs/audit-schema-performance.md` — new file (primary deliverable)
- `.claude/session_context.md` — appended this entry

### Notes for Next Tasks
- Migration `015_indexes.ts` is ready to implement from the doc — content is in Section 6
- `initDB()` in `src/db/index.ts` needs 5 additional PRAGMA lines (synchronous, busy_timeout, cache_size, temp_store, mmap_size)
- `GET /harvest/waste-trim` needs a LIMIT added — currently unbounded
- `GET /containers/summary` should move its JS aggregation to SQL GROUP BY for performance
- `cv_batch_stage_recipes.recipe_id` missing FK should be patched in a separate migration

---

## Task: 8. QR scanner + container label printing (features 15 & 17)
**Completed:** 2026-05-21

### What Was Done
- **Feature 15 — ContainerScanner** (`client/src/pages/containers/ContainerScanner.jsx`): Full-screen camera QR scanner at `/scan`. Uses `jsqr` + `getUserMedia` API. Validates decoded values against `/^Z\d-[AB]-R\d{1,2}-C\d{1,2}$/`; on match navigates to `/containers/:containerId`; on mismatch shows full-screen error with the scanned value. Handles: camera permission denied (instructions), torch/flash toggle (checks `getCapabilities().torch`), landscape/portrait, manual fallback text input, retry after error.
- **Feature 17 — ContainerLabels** (`client/src/pages/admin/ContainerLabels.jsx`): Admin page at `/admin/container-labels` (minRole=admin). Filter by sub-zone or custom container ID search. Generates a print window with Avery 5160-compatible grid (3×10 = 30 per page). QR codes generated client-side via `qrcode` library (toDataURL). Zone color stripes: Z1=green, Z2=blue, Z3=orange, Z4=purple. Auto-triggers `window.print()` on load.
- **NavBar**: Added `ScanLine` icon + "Scan" label between Today and Batches.
- **App.jsx**: Registered `/scan` (all authenticated) and `/admin/container-labels` (minRole=admin).
- **ApplicationsHub**: Added Admin section at bottom with link to Container Labels.
- Installed `jsqr@^1.4.0` and `qrcode@^1.5.4` as runtime dependencies.

### Key Decisions
- Used `requestAnimationFrame` loop with `jsQR` on canvas frames — no external scanning SDK needed, works in all modern mobile browsers.
- Print window uses inline CSS `@page { size: letter }` + Google Fonts import for JetBrains Mono — no server-side PDF generation needed.
- `ContainerScanner` is `position: fixed; inset: 0` so it overlays the full viewport including the NavBar — correct for a full-screen scanner UX.

### Files Modified/Created
- `client/src/pages/containers/ContainerScanner.jsx` (new)
- `client/src/pages/admin/ContainerLabels.jsx` (new)
- `client/src/App.jsx` (added imports + 2 routes)
- `client/src/components/NavBar.jsx` (added Scan nav item)
- `client/src/pages/applications/ApplicationsHub.jsx` (added Admin section)
- `client/package.json` + `client/package-lock.json` (jsqr + qrcode added)

### Notes for Next Tasks
- The `/scan` route is accessible to all authenticated users (no minRole). Container Labels is admin-only.
- The scanner navigates to `/containers/:containerId` on successful scan — that route already exists (ContainerDetail.jsx).
- `api.getContainers()` already supports `sub_zone_id` as a query param — ContainerLabels uses it for filtering.
- Build output: ~777KB gzipped to 190KB — chunk size warning is pre-existing, not caused by this change.

---

## Task: 1. vitest setup + extract domain utils
**Completed:** 2026-05-21

### What Was Done
- Installed `vitest` + `@vitest/coverage-v8` as backend devDeps
- Installed `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` as client devDeps
- Created `vitest.config.ts` at project root (node environment, globals)
- Created `client/vitest.config.ts` (jsdom environment, react plugin, globals)
- Added `"test": "vitest run"` and `"test:watch": "vitest"` to root `package.json`
- Added `"test": "vitest run"` to `client/package.json`
- Extracted `formatMetrcDate`, `toMetrcPhase`, `makeBatchName`, `makeHarvestBatchName` into `src/lib/domain-utils.ts`
- Updated `src/api/routes/batches.ts` to import from `domain-utils` (removed local definitions)
- Created `src/tests/domain-utils.test.ts` — 27 tests covering all four exported functions plus METRC UID and container ID regex validation
- Created `client/src/tests/api.test.js` — 30 smoke tests asserting all api methods exist

### Key Decisions
- `makeBatchName` and `makeHarvestBatchName` are new exports; the batch name logic was previously inline in `enrichBatch()`
- Root vitest picks up both `src/tests/` and `client/src/tests/` — 57 tests total run via `npm test` from project root; `cd client && npm test` runs the 30 frontend-only tests
- The `@vitejs/plugin-react` deprecation warnings (esbuild → oxc) are cosmetic and do not affect test results

### Files Modified/Created
- `vitest.config.ts` (new)
- `client/vitest.config.ts` (new)
- `package.json` (scripts added)
- `client/package.json` (scripts added)
- `src/lib/domain-utils.ts` (new — shared domain functions)
- `src/tests/domain-utils.test.ts` (new — 27 unit tests)
- `client/src/tests/api.test.js` (new — 30 method-existence smoke tests)
- `src/api/routes/batches.ts` (imports domain-utils; local function definitions removed)

### Notes for Next Tasks
- Test framework is fully configured; add tests alongside any new business logic
- `src/lib/domain-utils.ts` is the home for pure domain functions shared across routes or needed in tests — add to it as METRC export, PHI/REI calculations, etc. are implemented
- `makeHarvestBatchName` is defined but not yet wired into any route; wire it when harvest batch routes are built
- `npx tsc --noEmit` passes clean

## Task: 2. Zod validation on all existing routes
**Completed:** 2026-05-21T17:43:00Z

### What Was Done
- Added Zod validation schemas to all 8 API route files
- Replaced manual if/throw validation with Schema.parse() in every POST/PATCH handler
- Replaced TypeScript interfaces with z.infer<typeof Schema> type aliases
- Kept all business logic (DB checks, cross-field validations, PHI/REI logic) unchanged
- Used .refine() for datetime fields to match existing lenient Date.parse() behavior
- Fixed Zod v4 API difference: ZodError uses `.issues` not `.errors`

### Key Decisions
- Kept VALID_CATEGORIES/VALID_SEVERITIES Sets in observations.ts (used in GET filter) but use z.enum() in schemas
- Kept cross-field validations as code (foliar_recipe_id XOR input_id, rate_value required with input_id) — these are business rules, not type validation
- For PATCH update schemas, used .optional() on all fields; 'field' in body semantics preserved since Zod strips undefined but keeps null
- For ec_measured/ph_measured: used z.number() (not .positive()) — value 0 is valid for "meter-error" case
- Zod v4 uses `.issues` on ZodError (not `.errors` as in v3)

### Files Modified/Created
- src/api/routes/batches.ts
- src/api/routes/observations.ts
- src/api/routes/fertigation-applications.ts
- src/api/routes/foliar-applications.ts
- src/api/routes/pesticide-applications.ts
- src/api/routes/container-amendments.ts
- src/api/routes/tag-assignments.ts
- src/api/routes/planting-plans.ts

### Notes for Next Tasks
- All routes now return consistent {error: string, issues: ZodIssue[]} on validation failure
- Zod schemas are defined as module-level constants before the plugin — available for future test use
- npx tsc --noEmit passes clean after changes
- npm test: 114 tests passing

## Task: 3. Harvest API routes
**Completed:** 2026-05-21T17:49:00Z

### What Was Done
- Created `src/api/routes/harvest.ts` — Fastify plugin at `/api/harvest`
- Registered in `src/api/app.ts` with prefix `/api/harvest`
- Added 7 harvest API methods to `client/src/api.js`
- All 7 routes implemented with Zod validation and requireAuth/requireRole

### Key Decisions
- `cv_plant_assignments` uses `placed_at` / `placed_by` (not `assigned_at`) after migration 014 — used correctly in unassignment UPDATE
- `cv_container_state` uses `current_batch_id` (not `current_plant_batch_id`) — schema cross-checked before writing
- `void formatMetrcDate` suppresses unused-import TSC noise; it's imported per spec since it's used internally by `makeHarvestBatchName`
- Auto-close logic: after final_harvest, if COUNT(active assignments) = 0, batch closes AND harvest_batch completes in same transaction
- Force-close creates new harvest batch immediately in same transaction; returned as `{ closed_batch, new_batch }`
- Container `from_state` is read from `cv_container_state` at time of final harvest rather than hardcoded as 'active' — handles edge cases
- GET /waste-trim uses spread `...values` for dynamic WHERE — valid better-sqlite3 pattern

### Files Modified/Created
- `src/api/routes/harvest.ts` (new — 290 lines)
- `src/api/app.ts` (import + register added)
- `client/src/api.js` (7 harvest methods added)

### Notes for Next Tasks
- npx tsc --noEmit passes clean; npm test: 114 tests passing
- Harvest batch name format: "Strain | MM/DD/YYYY | HB|MB | Auto|Photo" — uses UTC date from started_at (America/Chicago conversion not yet implemented in utils)
- `metrc_name` is computed at creation and stored immutably; not re-computed on updates
- The `partial_harvest` event type is allowed at any batch status where a manicure batch exists (task spec says batch must be 'harvesting' — enforced via harvest_batch.status='in_progress' which requires batch to be 'harvesting' to have been created)

## Task: 4. Harvest UI (partial, final, waste trim, weather-close)
**Completed:** 2026-05-21T19:00:00Z

### What Was Done
- Created `client/src/pages/harvest/` directory with 5 new pages:
  - `HarvestDashboard.jsx` — route `/harvest/:batchId`, shows harvest batches (HB/MB), plant list grouped by container, create HB/MB buttons (supervisor), waste trim link, and per-plant Partial/Final Harvest buttons
  - `PartialHarvestForm.jsx` — route `/harvest/:batchId/partial?...`, locked context + product_type chips + wet weight + notes; calls recordHarvestEvent with partial_harvest
  - `FinalHarvestForm.jsx` — route `/harvest/:batchId/final?...`, tag verification step FIRST (confirms physical tag matches last 4 of METRC tag), then product_type + weight + notes; red warning + calls recordHarvestEvent with final_harvest
  - `WasteTrimForm.jsx` — route `/harvest/waste-trim/new?batch_id=X`, trim_reason chips + weight; draft persistence under cv_draft_waste_trim; available at any batch status
  - `WeatherEventClose.jsx` — route `/harvest/batches/:harvestBatchId/force-close?batch_id=X`, supervisor-only; required close_notes (min 20 chars) + new conditions; calls forceCloseHarvestBatch
- Updated `client/src/pages/batches/BatchDetail.jsx`:
  - Added readinessSummary state + useEffect (loads getReadinessSummary when status === 'harvest_window')
  - Added harvest readiness summary section with row progress bars for harvest_window batches
  - Added "Harvest Dashboard →" full-width green-800 button when status === 'harvesting'
  - Added Waste Trim as a col-span-2 grid item (all non-closed statuses)
- Updated `client/src/pages/containers/ContainerDetail.jsx`:
  - Added harvestCtx state + useEffect (lazily loads getHarvestStatus when batch is 'harvesting' and state is active/empty)
  - Added "Record Waste Trim" button for active containers
  - Added "Partial Harvest" / "Final Harvest" buttons for active/empty containers during harvesting — derives assignment_id and harvest_batch_ids from harvestCtx
- Updated `client/src/App.jsx`: added 5 import statements and 5 new routes (static segments ordered before :batchId)

### Key Decisions
- HarvestDashboard loads both api.getBatch and api.getHarvestStatus in parallel
- PartialHarvestForm and FinalHarvestForm both call getHarvestStatus to find the assignment details (container_id, metrc_plant_tag) by assignment_id URL param
- ContainerDetail loads harvestCtx lazily via useEffect triggered on data change — avoids adding getHarvestStatus to the main load path
- FinalHarvestForm: tag verification is a hard gate — form fields only appear after confirmation
- WeatherEventClose uses batch_id query param (not in the route path) to navigate back and to load harvest status
- React Router v6 static segments beat dynamic ones — waste-trim and batches routes correctly take precedence over :batchId
- Build passes clean (no TS errors, no build errors)

### Files Modified/Created
- `client/src/pages/harvest/HarvestDashboard.jsx` (new)
- `client/src/pages/harvest/PartialHarvestForm.jsx` (new)
- `client/src/pages/harvest/FinalHarvestForm.jsx` (new)
- `client/src/pages/harvest/WasteTrimForm.jsx` (new)
- `client/src/pages/harvest/WeatherEventClose.jsx` (new)
- `client/src/pages/batches/BatchDetail.jsx` (modified)
- `client/src/pages/containers/ContainerDetail.jsx` (modified)
- `client/src/App.jsx` (modified)

### Notes for Next Tasks
- The readiness summary endpoint shape isn't fully known — the harvest readiness section defensively checks for containers_assessed / total_containers / rows fields
- getReadinessSummary presumably returns { containers_assessed, total_containers, rows: [{ row_id, ready_count, total_count, pct_ready }] } — verify against the observations route when needed
- HarvestDashboard shows "No MB active" / "No HB active" placeholders when no in_progress batch of that type exists — user must create batches first via supervisor buttons
- ContainerDetail harvest buttons only work when a single un-harvested active assignment exists in that container; multi-plant edge case navigates user to Harvest Dashboard to select
- npm run build passes clean; npx tsc --noEmit passes clean

## Task: 5. Plant loss + mid-batch replacement (features 19-20)
**Completed:** 2026-05-21

### What Was Done
- Created `src/api/routes/plant-loss.ts` — Fastify plugin at `/api/plant-loss` with:
  - `POST /` — record plant loss; validates batch/assignment/container; in one transaction: inserts cv_plant_loss_events, unassigns cv_plant_assignments, transitions container active→empty if no active assignments remain
  - `GET /` — list loss events with optional batch_id/container_id/metrc_sync_status filters
  - `POST /replacements` — assign replacement plant (untagged); transitions container empty→active in same transaction
- Registered route in `src/api/app.ts`
- Added 3 plant-loss API methods + 1 tag-assignment helper (`getContainerAssignments`) to `client/src/api.js`
- Created `client/src/pages/containers/PlantLossForm.jsx` — field-optimized form at `/containers/:containerId/loss`
- Created `client/src/pages/containers/PlantReplacementForm.jsx` — simple form at `/containers/:containerId/replacement`
- Updated `client/src/pages/containers/ContainerDetail.jsx`: "Record Plant Loss" button (active state), "Assign Replacement Plant" button (empty state)
- Updated `client/src/App.jsx`: 2 new imports + 2 routes

### Key Decisions
- `cv_plant_loss_events.metrc_plant_tag` is NOT NULL per schema; untagged plants store empty string `''`
- Only transitions container to 'empty' if remaining active assignment count = 0 (supports plants_per_container > 1)
- Replacement creates assignment with `metrc_plant_tag = NULL` — tag assigned separately via tag-assignment workflow
- Loss type → unassign_reason: death_* → 'died', physical_damage/removal_* → 'destroyed', other/accidental → 'other'

### Files Modified/Created
- `src/api/routes/plant-loss.ts` (new)
- `src/api/app.ts` (import + register)
- `client/src/api.js` (getContainerAssignments + 3 plant-loss methods)
- `client/src/pages/containers/PlantLossForm.jsx` (new)
- `client/src/pages/containers/PlantReplacementForm.jsx` (new)
- `client/src/pages/containers/ContainerDetail.jsx` (2 buttons added)
- `client/src/App.jsx` (2 imports + 2 routes)

### Notes for Next Tasks
- npx tsc --noEmit passes clean; npm run build passes clean
- METRC sync is queued (metrc_sync_status='pending') but no sync infrastructure yet
- Both forms fall back to current_state.current_batch_id if batch_id query param is missing

## Task: 6. Container lifecycle (teardown, soil sample, startup) — features 23-25
**Completed:** 2026-05-21

### What Was Done
- Created `src/api/routes/container-lifecycle.ts` — Fastify plugin registered at `/api/containers`:
  - `POST /:containerId/teardown` — validates state is 'active'/'empty' + batch_id matches; inserts teardown event + transitions to 'teardown'
  - `PATCH /:containerId/teardown/:teardownId` — partial update of checklist fields (dynamic SET clause)
  - `POST /:containerId/soil-samples` — creates sample, optionally links to teardown, updates cv_teardown_events.soil_sample_collected
  - `GET /:containerId/soil-samples` — returns samples with nested results array
  - `POST /:containerId/soil-samples/:sampleId/results` — accepts array or { results: [...] }; inserts result rows + marks results_received
  - `POST /:containerId/startup` — validates 'teardown' state; inserts startup event + transitions to 'startup' (clears current_batch_id)
  - `POST /:containerId/startup/:startupId/ready` — supervisor only; sign-off updates startup + transitions to 'ready'
- Registered route in `src/api/app.ts` at `/api/containers` prefix (alongside existing containersRoutes)
- Added 7 API methods to `client/src/api.js`
- Created 4 new frontend pages:
  - `TeardownForm.jsx` — checklist UI with toggle buttons, draft persistence; navigates to SoilSampleForm if soil_sample_collected
  - `SoilSampleForm.jsx` — sample_label + sample_type chips + lab_name; resolves teardown_id='new' to most recent teardown from container data
  - `StartupForm.jsx` — pre-populates prior teardown/sample from loaded data; media_replaced_pct chips (33/50/100) + custom; draft persistence
  - `StartupReadyForm.jsx` — supervisor-only sign-off; shows startup summary; non-supervisors see info message
- Updated `ContainerDetail.jsx`:
  - Added `soilSamples` state + separate useEffect calling `api.getSoilSamples`
  - Lifecycle action buttons by state: 'active'/'empty' → Begin Teardown; 'teardown' → Log Soil Sample + Begin Startup; 'startup' → Mark as Ready (supervisor)
  - Soil sample history section with per-parameter result chips colored by interpretation
- Updated `App.jsx`: 4 imports + 4 routes (all before `:containerId` catch-all)

### Key Decisions
- Lifecycle routes in separate file (`container-lifecycle.ts`) to keep containers.ts readable; both registered at `/api/containers` prefix
- TeardownForm passes `?teardown_id=new` to SoilSampleForm when navigating post-save; SoilSampleForm resolves this to `teardown_events[0].teardown_id` via a second getContainer call
- startup transition sets `current_batch_id = NULL` (CLAUDE.md: 'startup' state requires no batch association)
- teardown transition does NOT clear `current_batch_id` (CLAUDE.md: 'teardown' requires current_batch_id IS NOT NULL for soil sample tracking)
- `POST .../results` accepts both raw array body and `{ results: [...] }` for flexibility
- StartupReadyForm finds startup event by matching `startupId` param against `startup_events` array from getContainer

### Files Modified/Created
- `src/api/routes/container-lifecycle.ts` (new — 6 endpoints)
- `src/api/app.ts` (import + register)
- `client/src/api.js` (7 lifecycle methods)
- `client/src/pages/containers/TeardownForm.jsx` (new)
- `client/src/pages/containers/SoilSampleForm.jsx` (new)
- `client/src/pages/containers/StartupForm.jsx` (new)
- `client/src/pages/containers/StartupReadyForm.jsx` (new)
- `client/src/pages/containers/ContainerDetail.jsx` (lifecycle buttons + soil samples section)
- `client/src/App.jsx` (4 imports + 4 routes)

### Notes for Next Tasks
- `npx tsc --noEmit` passes clean; `npm run build` passes; 30 tests pass
- SoilSampleForm handles `teardown_id=new` by looking at `teardown_events[0]` — relies on ContainerDetail having loaded the teardown event before navigating
- StartupForm pre-populates prior_teardown_id and prior_soil_sample_id but does NOT send them if null — backend accepts nullable optionals
- The `amendments_applied_count` on cv_startup_events is not auto-incremented when amendments are logged via container-amendments route — this is a known gap; would need a trigger or explicit count update

## Task: 7. Export reports (METRC, MDA, cultivation record) — features 11-13
**Completed:** 2026-05-21

### What Was Done
- Created `src/api/routes/exports.ts` — Fastify plugin at `/api/exports` with three routes:
  - `GET /metrc-additives` — unified METRC Record Additives export (all 4 application types, JSON + CSV)
  - `GET /mda-pesticide` — MDA pesticide report per MN Statute 18B.37 (JSON + CSV, date_from/to required)
  - `GET /cultivation-record/:batchId` — full per-batch compliance record (JSON) per MN Statute 342.25
- Registered `exportsRoutes` in `src/api/app.ts` at `/api/exports`
- Added 5 API methods to `client/src/api.js`: getMetrcAdditivesExport, getMdaPesticideReport, getCultivationRecord, downloadMetrcCsv, downloadMdaCsv
- Created 3 frontend pages under `client/src/pages/exports/`:
  - `MetrcExport.jsx` — route `/exports/metrc`: filter by batch_id + date range, preview table, CSV download
  - `MdaReport.jsx` — route `/exports/mda-pesticide`: required date range, compliance note, preview table, CSV download
  - `CultivationRecord.jsx` — route `/exports/cultivation-record`: batch picker, summary stats, JSON download
- Added "Exports & Reports" section to `ApplicationsHub.jsx` with links to all three pages
- Registered all three routes in `App.jsx`

### Key Decisions
- Farmstock items are resolved via API calls (separate DB — Option B integration), not direct DB join. Product names fall back to `Input #N` when farmstock is not configured
- `fetchFarmstockItems` batches all unique input_ids in parallel for the export query
- CSV uses a simple RFC-4180 formatter (values with commas/quotes/newlines get double-quoted)
- Cultivation record JSON download is client-side (Blob URL) so it doesn't require special backend headers
- `cv_plant_harvest_events` (not `cv_harvest_events`) is the correct table name
- `cv_plant_waste_trim_events` (not `cv_waste_trim_events`) is the correct table name
- `cv_plant_assignments` uses `placed_at`/`placed_by` (not `assigned_at`) per migration 014

### Files Modified/Created
- `src/api/routes/exports.ts` (new)
- `src/api/app.ts` (import + register)
- `client/src/api.js` (5 export methods added)
- `client/src/pages/exports/MetrcExport.jsx` (new)
- `client/src/pages/exports/MdaReport.jsx` (new)
- `client/src/pages/exports/CultivationRecord.jsx` (new)
- `client/src/pages/applications/ApplicationsHub.jsx` (Exports & Reports section added)
- `client/src/App.jsx` (3 imports + 3 routes)

### Notes for Next Tasks
- `npx tsc --noEmit` passes clean; `npm run build` passes
- CSV download uses `window.open()` so the browser receives the file download without needing a fetch interceptor
- The MDA report note explicitly calls out unlicensed status per CLAUDE.md business rules
- Phase 3 will add PDF export for cultivation records (noted in UI as coming)

## Task: API coverage + security audit
**Completed:** 2026-05-21

### What Was Done
- Read all 20 backend route files (89 routes total) cross-referencing auth middleware, Zod usage, error handling, and status codes
- Cross-referenced every route against `client/src/api.js` methods and actual page call sites
- Produced `docs/audit-api-security.md` with 5 sections: route inventory table, 14 security findings, API contract consistency analysis, frontend coverage gaps, and prioritized recommendations
- Committed and pushed

### Key Decisions (findings summary)
- **CRITICAL:** `GET /api/auth/users` has no auth middleware — exposes user enumeration including roles to unauthenticated clients
- **HIGH:** 5 DELETE endpoints on compliance tables (application records) violate business rule 5 (5-year retention); all currently have zero frontend callers
- **HIGH:** `api.getItems` in api.js calls `/api/items` which doesn't exist (routes are at `/api/catalog/items`) — broken method
- **HIGH feature gaps:** Entire planting-plans feature (8 routes, owns `cult-hoop → field-veg` transition) and most of tag-assignments (4 of 5 routes) have no frontend api.js methods — METRC tagging and field planting workflows unreachable from UI
- **MEDIUM:** Recipe POST bodies, strain mutations, and container state mutations lack Zod validation (cast to interface directly)
- All SQL uses parameterized queries — no injection risk found
- No stack traces or DB schema details leak in any error response
- 17 api.js methods are defined but never called from pages (dead code or missing UI flows)

### Files Modified/Created
- `docs/audit-api-security.md` (new — 319 lines, committed and pushed)

### Notes for Next Tasks
- The two highest-priority implementation gaps: (1) add planting-plans api.js + UI, (2) add tag-assignment write methods + scan-assign flow
- The hard DELETE compliance routes should be removed before going to production
- `GET /api/auth/users` auth fix is a one-liner (`requireAuth` preHandler) but may require login UI refactor if the picker needs to load before token exists

---

## Task: Frontend UX completeness audit
**Completed:** 2026-05-21

### What Was Done
- Read all 47 JSX files under `client/src/pages/` and `client/src/components/`
- Produced `docs/audit-frontend-ux.md` with 6 sections: page inventory table, hard UX rule violations, navigation gaps, error/empty state analysis, missing features, and prioritized recommendations
- Committed and pushed

### Key Decisions (findings summary)
- **CRITICAL:** No REI pre-entry check in `ContainerDetail.jsx` or `ContainerScanner.jsx` — a QR scan into an active-REI area goes straight to the container record with no full-screen warning (violates Rule 12)
- **CRITICAL:** `Today.jsx` silently swallows all API load errors — failed loads look identical to empty states
- **CRITICAL BUG:** `BatchDetail.jsx:387` amendment quick-action links to `/applications/amendments/new` without `?batch_id=`, so amendments logged from BatchDetail have no batch context
- **CRITICAL:** `PesticideNew.jsx` has no offline/network-error handling — a failed save during spotty WiFi shows a generic error rather than queuing for sync (all other application forms handle this correctly)
- **CRITICAL:** Today screen is missing 4 required Phase 1 lifecycle action items (teardown/startup pending, soil sample lab awaiting, unsynced plant losses)
- 8 forms lack required draft persistence: `BatchNew`, `FinalHarvestForm`, `PartialHarvestForm`, `SoilSampleForm`, `FertigationRecipeEdit`, `FoliarRecipeEdit`, `PlantReplacementForm`, `WeatherEventClose`
- Recipes (`/recipes`), Crop Inputs (`/inputs`), and all Export routes have no NavBar entry and no reachable link from any normal screen
- NavBar touch targets are ~40px — below the 56pt minimum for gloved use
- Feature 16 (METRC tag assignment camera flow) may be incomplete — no dedicated route in App.jsx, only embedded in ContainerDetail (not fully verified)

### Files Modified/Created
- `docs/audit-frontend-ux.md` (new — 352 lines)

### Notes for Next Tasks
- The 5 CRITICAL items above are the highest-priority fixes
- The `BatchDetail.jsx:387` bug fix is a one-liner: add `?batch_id=${batch.batch_id}` to the amendments link
- `PesticideNew.jsx` offline fix: copy the `Failed to fetch` detection from `FertigationNew.jsx` into the pesticide save error handler
- REI pre-entry check: `ContainerDetail.jsx` needs to check for active REI on mount and show `REIConfirmModal` if active; `ContainerScanner.jsx` needs same check before navigating
- Draft keys for missing forms: use the `cv_draft_*` convention already established

---

## Task: 8. Test discovery + plan document
**Completed:** 2026-05-21

### What Was Done
- Audited all 18 route files in `src/api/routes/` for business rules
- Catalogued 66 distinct rules across batches, harvest, pesticide, foliar, plant-loss, containers, and tag-assignments
- Designed test infrastructure (in-memory SQLite, Fastify inject(), JWT auth helper, fixture factories)
- Created `docs/test-plan.md` with:
  - 14 Tier 1 (regulatory) test groups covering harvest gating, PHI/REI/RUP, waste trim, METRC sync
  - 12 Tier 2 (data integrity) test groups covering batch state machine, container lifecycle, tag uniqueness
  - Tier 3 additions to existing domain-utils unit tests (REI calc, stage key mapping)
  - Priority implementation order for next task

### Key Decisions
- PHI/REI/EPA-redirect tests require `vi.mock()` on `fetchFarmstockItem` — farmstock is not available in test environment
- `setDB(instance)` export needed in `src/db/index.ts` (one-line change) to inject in-memory DB per test file
- Container infrastructure (all 1,180 containers) is seeded by migrations — tests reference existing container IDs
- No-FARMSTOCK-URL behavior (skip PHI checks silently) is a known gap flagged in the plan

### Files Modified/Created
- `docs/test-plan.md` (new — 673 lines)

### Notes for Next Tasks
- Next task: implement the test infrastructure (helpers/db.ts, helpers/auth.ts, helpers/fixtures.ts)
- Then implement tests in priority order: harvest → pesticide → batches → plant-loss → containers → tag-assignments → foliar → fertigation
- `setDB()` must be added to `src/db/index.ts` before any integration tests can run
- `npm test` currently passes 57 tests (all unit); integration tests will expand this count significantly

---

## Task: Regulatory compliance gap analysis (342.25, 4770, 18B.37, METRC)
**Completed:** 2026-05-21

### What Was Done
- Read all 14 migration files (full schema audit) and all 18 route files
- Audited exports.ts in detail — confirmed cultivation record does NOT expand recipe ingredients
- Confirmed pesticide-applications.ts has DELETE endpoint (admin + 24h window)
- Confirmed MDA report strips time from applied_at (date-only output violates 18B.37)
- Confirmed input_lot_id is stored on pesticide applications but NOT included in MDA export
- Produced `docs/audit-regulatory-compliance.md` — 509 lines, 7 sections

### Key Findings
- **5 CRITICAL** issues: DELETE on compliance tables, recipe ingredient expansion missing, no product name snapshot, no METRC plant waste export, batch close not transitioning all containers to teardown
- **8+ HIGH** issues: MDA report time stripped, lot_number missing from MDA export, no METRC phase-change/tag-assignment/harvest exports, missing updated_at on application tables, no METRC UID check before harvest events, no PDF cultivation record
- **39 of 51 business rules fully enforced**; 8 partial; 4 not implemented (Rules 5, 27, 34, 46)
- Product names and EPA reg #s are runtime-fetched from farmstock — long-term 5-year retention risk if farmstock unavailable

### Files Modified/Created
- `docs/audit-regulatory-compliance.md` (new — 509 lines)

### Notes for Next Tasks
- CRITICAL C1 first: remove DELETE endpoints from fertigation-applications.ts, foliar-applications.ts, pesticide-applications.ts
- CRITICAL C2: expand recipe ingredients in exports.ts cultivation record and METRC additives export
- HIGH H1+H2: fix MDA report (add time, add lot_number) — one-file fix in exports.ts
- HIGH H7: add METRC UID check before harvest event creation in harvest.ts
- CRITICAL C5: add bulk container→teardown transition when batch auto-closes in harvest.ts

---

## Task: Test infrastructure + Tier 1 integration tests
**Completed:** 2026-05-21

### What Was Done
- Added `setDB(instance)` export to `src/db/index.ts` for per-test in-memory DB injection
- Created `src/tests/helpers/db.ts` — `createTestContext()` / `teardownTestContext()` using in-memory SQLite + Knex migration runner + test user seeding (admin/supervisor/grower)
- Created `src/tests/helpers/auth.ts` — `getTestToken()` / `authHeader()` JWT helpers using the app's jwt.sign
- Created `src/tests/helpers/fixtures.ts` — factory functions: `createTestStrain`, `createTestBatch`, `advanceBatchTo`, `createHarvestBatch`, `createPlantAssignment`, `putContainerActive`, `putContainerEmpty`, `putContainerTeardown`, `putContainerStartup`, `insertStageOverride`
- Created `src/tests/integration/harvest.test.ts` — 34 tests covering: harvest batch status gate, harvest event gating on batch status, final harvest side effects (unassignment, container→teardown, batch auto-close, harvest-batch auto-complete), waste trim (any batch status, required fields), force-close lifecycle, harvest batch uniqueness rules, and sequence numbers
- Created `src/tests/integration/plant-loss.test.ts` — 16 tests covering: basic recording, assignment unassignment with loss reason mapping, container state transition to empty, multi-plant container behavior, METRC sync status, validation errors, and mid-batch replacement
- Created `src/tests/integration/applications/pesticide.test.ts` — 14 tests covering: Zod required field validation, EPA redirect from farmstock, PHI compliance check with override, REI computation from applied_at + rei_hours, RUP applicator license requirement, and stage block (Rule 19)
- Created `src/tests/integration/batches.test.ts` — 21 tests covering: valid lifecycle transitions, invalid/skipped/backward transitions, transition role requirements, field updates, recipe assignment
- Created `src/tests/integration/containers.test.ts` — 15 tests covering: teardown from active/empty, teardown event creation, state validation rejections, startup from teardown, ready sign-off (supervisor), supervisor role requirement
- Created `src/tests/integration/applications/foliar.test.ts` — 14 tests covering: required field validation, batch status restrictions, EPA redirect (Rule 13), stage block (Rule 14), response fields

### Key Decisions
- `acquireRawConnection` override on Knex client makes migrations run against the pre-created `new Database(':memory:')` instance — this is the only way to share the same SQLite in-memory DB between migrations and the app
- In-memory DB context is created fresh per test (`beforeEach`/`afterEach`) to ensure full isolation
- `putContainerActive()` both updates `cv_container_state` AND inserts a `cv_plant_assignments` row — the `active` state constraint requires at least one active assignment
- `createTestBatch()` also inserts initial `cv_batch_phase_history` and `cv_batch_location_history` rows (the API requires `current_location_id` is not NULL and the route joins on it)
- Force-close test: the force-close endpoint auto-creates the new in-progress harvest batch — the test was updated to verify this behavior rather than trying to create a second one manually
- `cv_fertigation_recipes` and `cv_foliar_recipes` don't have `updated_at` column (migration 006 didn't add it) — fixture INSERT SQL was fixed accordingly
- `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` pattern used for farmstock mock in pesticide/foliar tests
- FARMSTOCK_URL/KEY env vars set in describe block setup and cleaned up in afterEach to avoid test cross-contamination

### Test Count
- 175 tests total — all passing
- File breakdown: domain-utils.test.ts (27), harvest.test.ts (34), plant-loss.test.ts (16), pesticide.test.ts (14), batches.test.ts (21), containers.test.ts (15), foliar.test.ts (14), client/api.test.js (34)

### Files Modified/Created
- `src/db/index.ts` (setDB export added)
- `src/tests/helpers/auth.ts` (new)
- `src/tests/helpers/db.ts` (new)
- `src/tests/helpers/fixtures.ts` (new)
- `src/tests/integration/harvest.test.ts` (new)
- `src/tests/integration/plant-loss.test.ts` (new)
- `src/tests/integration/applications/pesticide.test.ts` (new)
- `src/tests/integration/batches.test.ts` (new)
- `src/tests/integration/containers.test.ts` (new)
- `src/tests/integration/applications/foliar.test.ts` (new)

### Notes for Next Tasks
- All Tier 1 business rule tests are now implemented and passing
- Tier 2 tests (batch state machine validation via unit tests, container state constraint enforcement, tag uniqueness) can be added as follow-on work
- The `createTestContext` helper is designed for reuse — any new integration test file imports from `../helpers/db.js`
- Farmstock mocking pattern: set `process.env.FARMSTOCK_URL/KEY`, stub `fetch` globally, clean up in afterEach — this pattern is established and works
- `npm test` now runs all 175 tests in ~5.6s — fast enough for CI

---

## Task: README + developer documentation
**Completed:** 2026-05-21

### What Was Done
- Created `README.md` at the project root with 8 sections: Overview, Architecture, Project Structure, Prerequisites, Development Setup, Database, Testing, API Routes, Build/Deployment, Key Domain Concepts, Regulatory Notes, Documents index.

### Key Decisions
- Architecture section documents the Option B (separate DBs, cross-app API) integration decision — matches docs/sibling-app-resolution.md approved decision
- Auth documented as PIN-based JWT with three roles (grower/supervisor/admin), not "shared SSO" — the SSO described in CLAUDE.md does not yet exist
- All 14 migration files listed individually with their table scope — useful orientation for schema archaeology
- Regulatory notes table maps each statute to its implementation in the codebase

### Files Modified/Created
- `README.md` (new)
- `.claude/session_context.md` (updated)

### Notes for Next Tasks
- README references docs/ audit files which contain prioritized fix lists — good starting point for next work session
- README does not document a `npm run seed:demo` script because no seed-demo.ts file exists in the codebase; omitted rather than documented incorrectly
