# API Coverage & Security Audit

**Generated:** 2026-05-21  
**Scope:** All backend routes (`src/api/routes/`) cross-referenced against `client/src/api.js` and `client/src/App.jsx`/pages

---

## Section 1: Route Inventory

| Route | Auth | Zod Validation | Error Handling | Frontend Consumer | Notes |
|---|---|---|---|---|---|
| `GET /api/auth/users` | **MISSING** | YES (UsersQuerySchema) | consistent | `getUsers` | **CRITICAL — no auth middleware** |
| `POST /api/auth/login` | N/A (public) | YES (LoginBodySchema) | uses `details` not `issues` | `login` | Intentionally public |
| `POST /api/auth/refresh` | requireAuth | — | consistent | `refreshToken` | |
| `GET /api/recipes/fertigation` | requireAuth | — | consistent | `getFertigationRecipes` | |
| `GET /api/recipes/fertigation/by-name/:name` | requireAuth | — | consistent | `getFertigationRecipeByName` | api.js method defined but never called in pages |
| `GET /api/recipes/fertigation/:id` | requireAuth | — | consistent | `getFertigationRecipe` | |
| `POST /api/recipes/fertigation` | requireRole('supervisor') | PARTIAL (body cast, not Zod) | consistent | `createFertigationRecipe` | `request.body as RecipeBody` bypasses Zod |
| `POST /api/recipes/fertigation/:id/version` | requireRole('supervisor') | PARTIAL | consistent | `createFertigationRecipeVersion` | Same body cast pattern |
| `DELETE /api/recipes/fertigation/:id` | requireAdmin | — | consistent (returns 200 not 204) | `deleteFertigationRecipe` | Status code wrong; usage check protects compliance records |
| `GET /api/recipes/foliar` | requireAuth | — | consistent | `getFoliarRecipes` | |
| `GET /api/recipes/foliar/:id` | requireAuth | — | consistent | `getFoliarRecipe` | |
| `POST /api/recipes/foliar` | requireRole('supervisor') | PARTIAL (body cast) | consistent | `createFoliarRecipe` | |
| `POST /api/recipes/foliar/:id/version` | requireRole('supervisor') | PARTIAL | consistent | `createFoliarRecipeVersion` | |
| `DELETE /api/recipes/foliar/:id` | requireAdmin | — | consistent (returns 200 not 204) | `deleteFoliarRecipe` | Never called from pages |
| `GET /api/catalog/items` | requireAuth | — | consistent | `getCatalogItems` | |
| `GET /api/catalog/inventory` | requireAuth | — | consistent | `getInventory` | |
| `GET /api/catalog/inventory/:id` | requireAuth | — | consistent | `getInventoryItem` | |
| `GET /api/strains` | requireAuth | — | consistent | `getStrains` | |
| `POST /api/strains` | requireRole('supervisor') | **NO** (manual if-checks) | consistent | `createStrain` | No Zod; body cast to `StrainBody` |
| `PUT /api/strains/:id` | requireRole('supervisor') | **NO** (manual if-checks) | consistent | `updateStrain` | Same as above |
| `DELETE /api/strains/:id` | requireAdmin | — | consistent | `deleteStrain` | Soft-deletes if batches reference it — safe |
| `GET /api/batches` | requireAuth | — | consistent | `getBatches` | `?status` param not Zod-validated but handled safely |
| `GET /api/batches/:id` | requireAuth | — | consistent | `getBatch` | |
| `POST /api/batches` | requireRole('supervisor') | YES | consistent | `createBatch` | |
| `PATCH /api/batches/:id/transition` | requireRole('supervisor') | YES | consistent | `transitionBatch` | |
| `PATCH /api/batches/:id` | requireRole('supervisor') | YES | consistent | `updateBatch` | |
| `PATCH /api/batches/:id/recipe` | requireRole('supervisor') | YES | consistent | `assignBatchRecipe` | Returns 201 (correct for new record) |
| `GET /api/containers/summary` | requireAuth | — | consistent | `getContainerSummary` | |
| `GET /api/containers` | requireAuth | — | consistent | `getContainers` | |
| `GET /api/containers/:id` | requireAuth | — | consistent | `getContainer` | |
| `PATCH /api/containers/:id/state` | requireAdmin | NO (manual cast) | consistent | `updateContainerState` | |
| `POST /api/containers/admin/bulk-set-state` | requireAdmin | NO (manual cast) | consistent | `bulkSetContainerState` | |
| `POST /api/containers/admin/bulk-reset-ready` | requireAdmin | — | consistent | `bulkResetContainersToReady` | Deprecated alias; never called from pages |
| `PATCH /api/containers/:id/notes` | requireRole('supervisor') | NO (manual cast) | consistent | `updateContainerNotes` | |
| `POST /api/containers/:containerId/teardown` | requireAuth | YES | consistent | `startTeardown` | Returns 201 |
| `PATCH /api/containers/:containerId/teardown/:teardownId` | requireAuth | YES | consistent | `updateTeardown` | Returns 200 |
| `POST /api/containers/:containerId/soil-samples` | requireAuth | YES | consistent | `createSoilSample` | Returns 201 |
| `GET /api/containers/:containerId/soil-samples` | requireAuth | — | consistent | `getSoilSamples` | |
| `POST /api/containers/:containerId/soil-samples/:sampleId/results` | requireAuth | YES | consistent | `addSoilResults` | Returns 201 |
| `POST /api/containers/:containerId/startup` | requireAuth | YES | consistent | `startStartup` | Returns 201 |
| `POST /api/containers/:containerId/startup/:startupId/ready` | requireRole('supervisor') | YES | consistent | `signOffReady` | Returns 200 (PATCH semantics despite POST method) |
| `GET /api/applications/fertigation` | requireAuth | — | consistent | `getFertigationApplications` | |
| `POST /api/applications/fertigation` | requireAuth | YES | consistent | `createFertigationApplication` | requireAuth, not requireRole('grower') — see findings |
| `PATCH /api/applications/fertigation/:id` | requireAuth | YES | consistent | `updateFertigationApplication` | api.js method exists; never called from pages |
| `DELETE /api/applications/fertigation/:id` | requireRole('admin') | — | consistent | `deleteFertigationApplication` | Hard delete of compliance record within 24 h; never called from pages |
| `GET /api/applications/foliar` | requireAuth | — | consistent | `getFoliarApplications` | |
| `POST /api/applications/foliar` | requireAuth | YES | consistent | `createFoliarApplication` | |
| `PATCH /api/applications/foliar/:id` | requireAuth | YES | consistent | `updateFoliarApplication` | Never called from pages |
| `DELETE /api/applications/foliar/:id` | requireRole('admin') | — | consistent | `deleteFoliarApplication` | Hard delete of compliance record; never called from pages |
| `GET /api/applications/amendments` | requireAuth | — | consistent | `getContainerAmendments` | |
| `POST /api/applications/amendments` | requireAuth | YES | consistent | `createContainerAmendment` | |
| `PATCH /api/applications/amendments/:id` | requireAuth | YES | consistent | `updateContainerAmendment` | Never called from pages |
| `DELETE /api/applications/amendments/:id` | requireRole('admin') | — | consistent | `deleteContainerAmendment` | Hard delete; never called from pages |
| `GET /api/applications/pesticide` | requireAuth | — | consistent | `getPesticideApplications` | |
| `POST /api/applications/pesticide` | requireAuth | YES | consistent | `createPesticideApplication` | |
| `POST /api/applications/pesticide/:id/clear-rei` | requireAuth | — | consistent | `clearPesticideREI` | |
| `PATCH /api/applications/pesticide/:id` | requireAuth | YES | consistent | `updatePesticideApplication` | Never called from pages |
| `DELETE /api/applications/pesticide/:id` | requireRole('admin') | — | consistent | `deletePesticideApplication` | Hard delete; never called from pages |
| `GET /api/observations/readiness-summary` | requireAuth | — | consistent | `getReadinessSummary` | |
| `GET /api/observations` | requireAuth | — | consistent | `getObservations` | |
| `POST /api/observations` | requireAuth | YES | consistent | `createObservation` | |
| `PATCH /api/observations/:id` | requireAuth | YES | consistent | `updateObservation` | Never called from pages |
| `DELETE /api/observations/:id` | requireRole('admin') | — | consistent | `deleteObservation` | Hard delete of compliance record; never called from pages |
| `GET /api/planting-plans` | requireAuth | — | consistent | **ORPHANED** | No api.js method |
| `GET /api/planting-plans/:id` | requireAuth | — | consistent | **ORPHANED** | |
| `POST /api/planting-plans` | requireRole('supervisor') | YES | consistent | **ORPHANED** | |
| `POST /api/planting-plans/:id/items` | requireRole('supervisor') | YES | consistent | **ORPHANED** | |
| `DELETE /api/planting-plans/:id/items/:itemId` | requireRole('supervisor') | — | consistent | **ORPHANED** | |
| `POST /api/planting-plans/:id/commit` | requireRole('supervisor') | YES | consistent | **ORPHANED** | |
| `POST /api/planting-plans/:id/supersede` | requireRole('supervisor') | YES | consistent | **ORPHANED** | |
| `PATCH /api/planting-plans/:id/cancel` | requireRole('supervisor') | — | consistent | **ORPHANED** | |
| `GET /api/tag-assignments/untagged` | requireAuth | — | consistent | **ORPHANED** | No api.js method |
| `GET /api/tag-assignments/container/:containerId` | requireAuth | — | consistent | `getContainerAssignments` | |
| `POST /api/tag-assignments` | requireAuth | YES | consistent | **ORPHANED** | No api.js method |
| `POST /api/tag-assignments/bulk` | requireAuth | YES | consistent | **ORPHANED** | |
| `POST /api/tag-assignments/reassign` | requireAuth | YES | consistent | **ORPHANED** | |
| `GET /api/harvest/batch/:batchId` | requireAuth | — | consistent | `getHarvestStatus` | |
| `POST /api/harvest/batches` | requireRole('supervisor') | YES | consistent | `createHarvestBatch` | Returns 201 |
| `POST /api/harvest/batches/:harvestBatchId/events` | requireAuth | YES | consistent | `recordHarvestEvent` | Returns 201 |
| `POST /api/harvest/batches/:harvestBatchId/force-close` | requireRole('supervisor') | YES | consistent | `forceCloseHarvestBatch` | Returns 201 |
| `POST /api/harvest/waste-trim` | requireAuth | YES | consistent | `createWasteTrim` | Returns 201 |
| `GET /api/harvest/waste-trim` | requireAuth | — | consistent | `getWasteTrim` | api.js method defined; never called from pages |
| `PATCH /api/harvest/waste-trim/:id/dispose` | requireAuth | YES | consistent | `disposeWasteTrim` | api.js method defined; never called from pages |
| `POST /api/plant-loss` | requireAuth | YES | consistent | `recordPlantLoss` | Returns 201 |
| `GET /api/plant-loss` | requireAuth | — | consistent | `getPlantLoss` | |
| `POST /api/plant-loss/replacements` | requireAuth | YES | consistent | `recordReplacement` | Returns 201 |
| `GET /api/exports/metrc-additives` | requireAuth | YES (safeParse) | consistent | `getMetrcAdditivesExport` / `downloadMetrcCsv` | |
| `GET /api/exports/mda-pesticide` | requireAuth | YES (safeParse) | consistent | `getMdaPesticideReport` / `downloadMdaCsv` | |
| `GET /api/exports/cultivation-record/:batchId` | requireAuth | — | consistent | `getCultivationRecord` | |
| `GET /health` | **MISSING** | — | N/A | None | Intentional public health check — acceptable |

---

## Section 2: Security Findings

### CRITICAL

**F-01 — `GET /api/auth/users` has no auth middleware**  
- **File:** `src/api/routes/auth.ts:17`  
- **Description:** The users list endpoint returns every active user's `id`, `name`, and `role` to any unauthenticated HTTP client. This enables user enumeration before authentication and exposes role data. The login UI uses a name-picker pattern that requires this list, but the endpoint is unprotected.  
- **Recommended fix:** Add `{ preHandler: requireAuth }`. Alternatively, if the login picker must work before a token exists, create a dedicated narrow public endpoint that returns only `id` and `name` (omit `role`) and apply stricter rate limiting to it separately. A dedicated `POST /api/auth/users/picker` — or inline the user list into `GET /api/auth/session` after first login — keeps the picker working without exposing data to unauthenticated callers.

---

### HIGH

**F-02 — Hard DELETE on compliance records violates business rule 5**  
- **Files:** `fertigation-applications.ts:343`, `foliar-applications.ts:408`, `container-amendments.ts:306`, `pesticide-applications.ts:450`, `observations.ts:301`  
- **Description:** Five DELETE endpoints permanently destroy application and observation records if triggered within 24 hours, even though business rule 5 requires: *"No deletion of audit records. Mistakes get corrected via a follow-up entry with a corrects_id reference. Original record is preserved for the 5-year retention requirement."* These DELETE routes currently have no frontend consumers (never called from pages), but they exist in the API and could be invoked directly. Admin role + 24 h window provides some protection, but hard deletion still violates the retention requirement.  
- **Recommended fix:** Remove all five DELETE handlers. Add `PATCH /:id/void` or enforce the `corrects_id` correction pattern the CLAUDE.md specifies. If a "undo within 24h" escape valve is required, mark the record `voided = 1` and filter it from normal views, preserving the row for audit.

**F-03 — `api.getItems` calls a non-existent backend route**  
- **File:** `client/src/api.js:24`  
- **Description:** `api.getItems` constructs a request to `/api/items` which has no registered handler. The backend registers the catalog at prefix `/api/catalog`. Every call to `api.getItems` returns a 404 from the SPA fallback or the not-found handler. If any component calls this method it silently fails.  
- **Recommended fix:** Either remove `api.getItems` (it is not called in any page) or fix the path to `/catalog/items` and align the method name with `getCatalogItems`.

---

### MEDIUM

**F-04 — Fertigation and foliar recipe POST bodies are not Zod-validated**  
- **Files:** `fertigation-recipes.ts:184`, `foliar-recipes.ts:134`, and their `/version` variants  
- **Description:** These POST handlers cast `request.body as RecipeBody` directly without Zod parsing. Ingredient sub-arrays (`ingredients`) and all numeric fields are accepted without type coercion or format validation. A malformed body (string where number expected, missing fields, negative rates) will cause a DB error rather than a clean 400 response.  
- **Recommended fix:** Add Zod schemas for `RecipeBody` and `IngredientBody` matching the existing pattern in batches, fertigation-applications, etc. Wrap in try/catch and return `reply.code(400).send({ error: 'Validation failed', issues: e.issues })`.

**F-05 — `POST /api/strains` and `PUT /api/strains/:id` use manual validation**  
- **File:** `strains.ts:37–41, 70–75`  
- **Description:** Both mutation handlers use `if (!name || !name.trim())` / `!['auto','photo'].includes(type)` checks instead of Zod. Inconsistent with all other write routes. Fields like `genetics` and `notes` are accepted without length limits.  
- **Recommended fix:** Replace with a `StrainBodySchema = z.object({ name: z.string().min(1).max(200), type: z.enum(['auto','photo']), genetics: z.string().nullable().optional(), notes: z.string().nullable().optional() })` and parse before writing.

**F-06 — Container state mutations lack Zod on request bodies**  
- **Files:** `containers.ts:287` (`PATCH /:id/state`), `containers.ts:348` (bulk-set-state), `containers.ts:467` (`PATCH /:id/notes`)  
- **Description:** Bodies are cast to typed interfaces without Zod parsing. The `to_state` field is manually validated against `VALID_STATES`, but other fields (`notes`, `scope_id`) are accepted without type or length checks.  
- **Recommended fix:** Add inline Zod schemas for these three bodies. These are admin-only routes so the blast radius is lower, but consistency matters for auditability.

**F-07 — Application write routes use `requireAuth` instead of an explicit minimum role**  
- **Files:** `fertigation-applications.ts:149`, `foliar-applications.ts:158`, `container-amendments.ts:128`, `pesticide-applications.ts:172`, `observations.ts:158`, `harvest.ts:206`, `plant-loss.ts:49`, etc.  
- **Description:** CLAUDE.md specifies "mutations that affect compliance records require at minimum `grower` role." Because `grower` is the lowest role in the system, `requireAuth` is functionally equivalent today. However, if a user is ever created without a role (or with a future role below `grower`), these routes would accept their submissions. The code does not express the intent in a machine-verifiable way.  
- **Recommended fix:** Replace `requireAuth` with `requireRole('grower')` on all compliance-record write routes so the invariant is explicit and enforced even if the role hierarchy changes.

**F-08 — Entire planting-plans feature has no frontend API client**  
- **Files:** `planting-plans.ts` (8 routes); `api.js` (no corresponding methods)  
- **Description:** The planting plans feature — including creation, item management, commit, supersede, and cancel — is fully implemented on the backend but has zero coverage in `api.js`. There are no routes in `App.jsx` for planting plan pages. The feature is unreachable from the frontend.  
- **Recommended fix:** Either add the `api.js` methods and frontend routes, or document the gap explicitly. The feature is load-bearing (it owns the `cult-hoop → field-veg` batch transition) but field operators have no way to trigger it from the UI.

**F-09 — Tag assignment write routes (single, bulk, reassign) have no frontend API client**  
- **Files:** `tag-assignments.ts:139` (POST /), `tag-assignments.ts:226` (POST /bulk), `tag-assignments.ts:337` (POST /reassign); `api.js` (not present)  
- **Description:** Three of the four tag-assignment routes are unreachable from the frontend. Only `getContainerAssignments` (the GET read) has an api.js method. METRC tag assignment and the critical reassignment/reconciliation workflows cannot be performed via the app.  
- **Recommended fix:** Add `api.js` methods: `assignTag(data)`, `bulkAssignTags(data)`, `reassignTag(data)` and wire them to the container detail or scan flow. This is a feature gap, not just dead code — METRC tagging is a hard compliance requirement.

---

### LOW

**F-10 — `POST /api/auth/login` error shape uses `details` instead of `issues`**  
- **File:** `auth.ts:28`  
- **Description:** `reply.code(400).send({ error: 'Invalid request', details: parseResult.error.issues })` — the key is `details`, not `issues`, inconsistent with every other Zod validation error in the codebase.  
- **Recommended fix:** Change to `{ error: 'Validation failed', issues: parseResult.error.issues }`.

**F-11 — Recipe DELETE routes return HTTP 200 instead of 204**  
- **Files:** `fertigation-recipes.ts:365`, `foliar-recipes.ts:290`  
- **Description:** Both `DELETE /api/recipes/fertigation/:id` and `DELETE /api/recipes/foliar/:id` call `reply.send({ success: true })` with default status 200. Delete endpoints that return no meaningful body should return 204.  
- **Recommended fix:** Change to `reply.code(204).send()`.

**F-12 — Unvalidated enum query params on list endpoints**  
- **Files:** `plant-loss.ts:175` (`?metrc_sync_status`), `harvest.ts:498` (`?waste_status`)  
- **Description:** These string query params are passed directly to parameterized SQL queries without being checked against the valid enum set. No SQL injection risk (parameterized), but out-of-enum values return an empty array with a 200 instead of a 400. Unvalidated inputs also make the API contract less auditable.  
- **Recommended fix:** Add a whitelist check (e.g., `const VALID_SYNC_STATUSES = new Set(['pending', 'synced', 'failed', 'not_required'])`) before passing to the query, and return 400 on unrecognized values.

**F-13 — `getWasteTrim` and `disposeWasteTrim` defined in api.js but never called in pages**  
- **File:** `client/src/api.js:134–135`  
- **Description:** The waste trim list and disposal methods are defined but not connected to any page component. The waste trim workflow is incomplete from the UI perspective (creation works, but viewing/disposing are dead ends).  
- **Recommended fix:** Wire these methods into the harvest dashboard or a dedicated waste trim view.

**F-14 — Several PATCH/DELETE application methods defined in api.js but never called**  
- **File:** `client/src/api.js`  
- **Description:** The following api.js methods are defined but not called from any page: `getFertigationRecipeByName`, `deleteFertigationRecipe`, `deleteFoliarRecipe`, `updateFertigationApplication`, `deleteFertigationApplication`, `updateFoliarApplication`, `deleteFoliarApplication`, `updateContainerAmendment`, `deleteContainerAmendment`, `updatePesticideApplication`, `deletePesticideApplication`, `updateObservation`, `deleteObservation`, `bulkResetContainersToReady`. Some represent UI gaps (edit/delete flows not yet built); some are deprecated (`bulkResetContainersToReady`).  
- **Recommended fix:** No immediate security action required. Remove deprecated `bulkResetContainersToReady` from api.js (the backend alias already discourages use). For the edit/delete methods, build the UI flows or remove the dead methods.

---

## Section 3: API Contract Consistency

### HTTP Status Codes

Most routes follow the contract correctly. Deviations:

| Issue | Location | Expected | Actual |
|---|---|---|---|
| Recipe DELETE returns body | `fertigation-recipes.ts:365`, `foliar-recipes.ts:290` | 204 (no body) | 200 + `{ success: true }` |
| `POST /api/recipes/fertigation` returns minimal body | `fertigation-recipes.ts:241` | Full resource object | `{ recipe_id: N }` only |
| `POST /api/recipes/foliar` returns minimal body | `foliar-recipes.ts:184` | Full resource object | `{ foliar_recipe_id: N }` only |
| `POST /api/containers/:id/startup/:id/ready` | `container-lifecycle.ts:458` | 200 for update | 200 ✓ (correct, uses POST to trigger state change) |
| `POST /api/auth/login` | `auth.ts:25` | 200 | 200 ✓ (correct) |

All other POST-creates return 201. All PATCH-updates return 200. Not-found cases return 404. Validation failures return 400. Business rule blocks return 400 or 422. Compliance is strong overall.

### Error Response Shape

The standard shape `{ error: string }` is consistent across the codebase with two intentional extensions:

- **Zod validation errors** add `issues: ZodIssue[]` — consistent everywhere *except* `auth.ts:28` which uses `details` (see F-10).
- **Pesticide/foliar redirect** responses add `{ redirect: 'pesticide'|'foliar', input_id }` to 422 responses — this is a deliberate protocol extension, not an inconsistency.
- **Tag assignment conflict** returns `{ error: 'TAG_ALREADY_ASSIGNED', message, existing_assignment }` — extended but reasonable.

No stack traces, internal table names, or DB schema details are leaked in any error response.

### Field Naming (snake_case)

All response fields use snake_case. Computed fields (`metrc_batch_name`, `metrc_phase`, `days_in_stage`, `plant_count_current`, `batch_strain_name`, `applicator_name`, etc.) are consistently snake_case across both list and detail endpoints. No camelCase leaks found.

### List vs Object Contracts

All list endpoints return arrays. All detail endpoints return objects. 404 is used correctly for missing records — no `null` object is returned. Consistent throughout.

### Computed Fields Across List and Detail

`metrc_batch_name` and `metrc_phase` are computed in `enrichBatch()` and applied to both the list (`GET /api/batches`) and detail (`GET /api/batches/:id`) — consistent. `plant_count_current` is derived from active assignment count and applied consistently. `days_in_stage` is a SQL-computed column in `BATCH_SELECT` used by both endpoints — consistent.

---

## Section 4: Frontend Coverage Gaps

### Orphaned Backend Routes (backend exists, no api.js method)

| Route | Backend File | Gap |
|---|---|---|
| `GET /api/tag-assignments/untagged` | `tag-assignments.ts:68` | No api.js method; walk-through tagging workflow unusable from UI |
| `POST /api/tag-assignments` | `tag-assignments.ts:139` | No api.js method; single METRC tag assign unavailable |
| `POST /api/tag-assignments/bulk` | `tag-assignments.ts:226` | No api.js method; bulk tag assignment unavailable |
| `POST /api/tag-assignments/reassign` | `tag-assignments.ts:337` | No api.js method; tag reassignment/reconciliation unavailable |
| `GET /api/planting-plans` | `planting-plans.ts:88` | No api.js method |
| `GET /api/planting-plans/:id` | `planting-plans.ts:112` | No api.js method |
| `POST /api/planting-plans` | `planting-plans.ts:139` | No api.js method |
| `POST /api/planting-plans/:id/items` | `planting-plans.ts:202` | No api.js method |
| `DELETE /api/planting-plans/:id/items/:itemId` | `planting-plans.ts:323` | No api.js method |
| `POST /api/planting-plans/:id/commit` | `planting-plans.ts:361` | No api.js method; field planting workflow broken |
| `POST /api/planting-plans/:id/supersede` | `planting-plans.ts:532` | No api.js method |
| `PATCH /api/planting-plans/:id/cancel` | `planting-plans.ts:619` | No api.js method |
| `GET /health` | `app.ts:83` | Intentional — server-side health check, no frontend consumer needed |

**Priority:** Tag assignment routes and planting plan commit are high-impact gaps. METRC tagging is a compliance requirement. Planting plan commit owns the `cult-hoop → field-veg` batch transition; without it, batches cannot move to field.

### Unused api.js Methods (method exists, never called in JSX/JS files)

| Method | Maps to | Status |
|---|---|---|
| `api.getItems` | `GET /api/items` (non-existent route) | **Broken** — path is wrong, should be `/catalog/items` |
| `api.getFertigationRecipeByName` | `GET /api/recipes/fertigation/by-name/:name` | Dead — backend works, not wired to UI |
| `api.deleteFertigationRecipe` | `DELETE /api/recipes/fertigation/:id` | Dead — UI delete not exposed |
| `api.deleteFoliarRecipe` | `DELETE /api/recipes/foliar/:id` | Dead |
| `api.updateFertigationApplication` | `PATCH /api/applications/fertigation/:id` | Dead — edit flow not built |
| `api.deleteFertigationApplication` | `DELETE /api/applications/fertigation/:id` | Dead |
| `api.updateFoliarApplication` | `PATCH /api/applications/foliar/:id` | Dead |
| `api.deleteFoliarApplication` | `DELETE /api/applications/foliar/:id` | Dead |
| `api.updateContainerAmendment` | `PATCH /api/applications/amendments/:id` | Dead |
| `api.deleteContainerAmendment` | `DELETE /api/applications/amendments/:id` | Dead |
| `api.updatePesticideApplication` | `PATCH /api/applications/pesticide/:id` | Dead |
| `api.deletePesticideApplication` | `DELETE /api/applications/pesticide/:id` | Dead |
| `api.updateObservation` | `PATCH /api/observations/:id` | Dead — edit not exposed |
| `api.deleteObservation` | `DELETE /api/observations/:id` | Dead |
| `api.bulkResetContainersToReady` | `POST /api/containers/admin/bulk-reset-ready` | Dead + deprecated (use bulkSetContainerState instead) |
| `api.getWasteTrim` | `GET /api/harvest/waste-trim` | Dead — waste trim list not wired to any page |
| `api.disposeWasteTrim` | `PATCH /api/harvest/waste-trim/:id/dispose` | Dead — disposal workflow not wired |

---

## Section 5: Recommendations (Prioritized)

### CRITICAL — Act immediately

1. **Add auth to `GET /api/auth/users`** (`auth.ts:17`).  
   This is the only endpoint currently open to unauthenticated access (aside from login). It exposes user IDs, names, and roles. If the login picker needs a user list before a token exists, create a narrow public endpoint that returns only `{ id, name }` with tighter rate limiting and no role field.

### HIGH — Fix before next compliance review or production audit

2. **Remove hard DELETE handlers on compliance tables** (`fertigation-applications.ts:343`, `foliar-applications.ts:408`, `container-amendments.ts:306`, `pesticide-applications.ts:450`, `observations.ts:301`).  
   Replace with a soft-void pattern (`voided = 1`) or enforce the `corrects_id` correction model specified in business rule 5. Even if 24 h gated and admin-only, hard deletion of application records violates the 5-year retention requirement.

3. **Fix `api.getItems` broken route** (`api.js:24`).  
   Change path to `/catalog/items` or remove the method. It silently 404s on every call.

4. **Add api.js methods for planting plans and tag assignments** (see F-08, F-09).  
   These are compliance-critical features: METRC tagging and the field planting workflow are not reachable from the frontend. Both are partially built on the backend; completing the frontend wiring is the remaining work.

### MEDIUM — Fix before next sprint

5. **Add Zod schemas to recipe POST bodies** (`fertigation-recipes.ts:184`, `foliar-recipes.ts:134`, and version variants) — F-04.

6. **Add Zod schemas to strain mutation handlers** (`strains.ts:37, 70`) — F-05.

7. **Add Zod schemas to container state mutation bodies** (`containers.ts:287, 348, 467`) — F-06.

8. **Replace `requireAuth` with `requireRole('grower')` on compliance write routes** — F-07.  
   Explicit role expression prevents future drift if the role model changes.

9. **Wire waste trim list and disposal to UI** — F-13.  
   `getWasteTrim` and `disposeWasteTrim` exist in api.js but no page calls them. The waste disposal lifecycle (collected → held → disposed → reported) cannot be completed from the app.

### LOW — Housekeeping

10. **Fix error shape on login** (`auth.ts:28`): change `details` to `issues` — F-10.

11. **Fix recipe DELETE status codes** to 204 (`fertigation-recipes.ts:365`, `foliar-recipes.ts:290`) — F-11.

12. **Add enum whitelist checks for `?metrc_sync_status` and `?waste_status` query params** — F-12.

13. **Remove deprecated `api.bulkResetContainersToReady`** from api.js — F-14. Remove or wire up the remaining dead api.js methods listed in F-14 as those UI flows are built.
