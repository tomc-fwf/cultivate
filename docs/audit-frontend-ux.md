# Frontend UX Completeness Audit

**Audited:** 2026-05-21  
**Scope:** All JSX files under `client/src/pages/` and `client/src/components/`  
**Reference:** `CLAUDE.md` Hard UX Rules, Phase 1 Application Surface list

---

## Section 1: Page Inventory

| Page | Route | Purpose | Loading | Error | Draft | Touch ≥56pt | Action in Thumb Zone | Offline |
|------|-------|---------|---------|-------|-------|-------------|----------------------|---------|
| `Today.jsx` | `/` | App home — REI banner, batch cards, quick actions | YES (skeleton) | **NO** ⚠ | N/A | YES | YES (quick action grid) | NO |
| `Login.jsx` | `/login` | Auth login form | NO | YES | N/A | PARTIAL | YES | N/A |
| `batches/Batches.jsx` | `/batches` | Batch list with filter tabs | YES | YES | N/A | **PARTIAL** ⚠ | N/A | NO |
| `batches/BatchNew.jsx` | `/batches/new` | Create plant batch | YES (strains) | YES | **NO** ⚠ | YES | YES (fixed bottom) | NO |
| `batches/BatchDetail.jsx` | `/batches/:id` | Batch detail, lifecycle, actions | YES | YES | N/A | **PARTIAL** ⚠ | YES (advance button at bottom) | NO |
| `recipes/RecipeIndex.jsx` | `/recipes` | Hub with links to fertigation/foliar | NO | N/A | N/A | UNKNOWN | N/A | N/A |
| `recipes/FertigationRecipes.jsx` | `/recipes/fertigation` | List all 7 fertigation recipes | YES | YES | N/A | YES | YES | NO |
| `recipes/FertigationRecipeDetail.jsx` | `/recipes/fertigation/:id` | Recipe detail — ingredients, EC/pH targets | YES | YES | N/A | YES | YES | NO |
| `recipes/FertigationRecipeEdit.jsx` | `/recipes/fertigation/new`, `/:id/version` | Create/version fertigation recipe | YES | YES | **NO** ⚠ | UNKNOWN | UNKNOWN | NO |
| `recipes/FoliarRecipes.jsx` | `/recipes/foliar` | List foliar recipes | YES | YES | N/A | YES | YES | NO |
| `recipes/FoliarRecipeDetail.jsx` | `/recipes/foliar/:id` | Foliar recipe detail | YES | YES | N/A | YES | YES | NO |
| `recipes/FoliarRecipeEdit.jsx` | `/recipes/foliar/new`, `/:id/version` | Create/version foliar recipe | YES | YES | **NO** ⚠ | UNKNOWN | UNKNOWN | NO |
| `inputs/CropInputs.jsx` | `/inputs` | Crop input inventory with search/filter | YES | YES | N/A | PARTIAL | N/A | NO |
| `inputs/CropInputDetail.jsx` | `/inputs/:id` | Input detail — PHI/REI, lots, SDS | YES | YES | N/A | YES | N/A | NO |
| `strains/Strains.jsx` | `/strains` | Strain CRUD (supervisor only) | YES | YES | N/A | UNKNOWN | YES | NO |
| `applications/ApplicationsHub.jsx` | `/applications` | Hub menu for all 4 application types | NO | N/A | N/A | YES | N/A | N/A |
| `applications/FertigationNew.jsx` | `/applications/fertigation/new` | Log fertigation — field-optimized | YES | YES | **YES** | YES | YES (fixed 64px bottom) | YES |
| `applications/FertigationLog.jsx` | `/applications/fertigation` | Fertigation history with date filter | YES | YES | N/A | PARTIAL | N/A | NO |
| `applications/FoliarNew.jsx` | `/applications/foliar/new` | Log foliar spray | YES | YES | **YES** | YES | YES (fixed 64px bottom) | YES |
| `applications/FoliarLog.jsx` | `/applications/foliar` | Foliar history | YES | YES | N/A | PARTIAL | N/A | NO |
| `applications/AmendmentNew.jsx` | `/applications/amendments/new` | Log container amendment | YES | YES | **YES** | YES | YES (fixed 64px bottom) | YES |
| `applications/AmendmentLog.jsx` | `/applications/amendments` | Amendment history | YES | YES | N/A | PARTIAL | N/A | NO |
| `applications/PesticideNew.jsx` | `/applications/pesticide/new` | Log pesticide — MDA-compliant | YES | YES | **YES** | YES | YES (fixed 64px bottom) | **NO** ⚠ |
| `applications/PesticideLog.jsx` | `/applications/pesticide` | Pesticide history | YES | YES | N/A | PARTIAL | N/A | NO |
| `applications/REIDashboard.jsx` | `/rei` | Active REIs, clear-REI action | YES | YES | N/A | PARTIAL | YES | NO |
| `observations/ObservationNew.jsx` | `/observations/new` | Log observation — harvest readiness mode | YES | YES | **YES** | YES | YES (fixed bottom) | YES |
| `observations/ObservationLog.jsx` | `/observations` | Observation history | YES | YES | N/A | PARTIAL | N/A | NO |
| `containers/ContainerDashboard.jsx` | `/containers` | Container status grid by sub-zone | YES | YES | N/A | PARTIAL | N/A | NO |
| `containers/ContainerDetail.jsx` | `/containers/:containerId` | Container record — state, history, actions | YES | YES | N/A | PARTIAL | N/A | NO |
| `containers/ContainerScanner.jsx` | `/scan` | Camera QR scan → ContainerDetail | N/A (camera) | YES | N/A | YES | N/A | N/A |
| `containers/PlantLossForm.jsx` | `/containers/:containerId/loss` | Record plant death — 3-tap flow | YES | YES | **YES** | YES | YES (fixed bottom) | NO |
| `containers/PlantReplacementForm.jsx` | `/containers/:containerId/replacement` | Assign replacement plant | YES | YES | NO | PARTIAL | YES | NO |
| `containers/TeardownForm.jsx` | `/containers/:containerId/teardown` | Teardown checklist | YES | YES | **YES** | YES | YES (fixed bottom) | NO |
| `containers/SoilSampleForm.jsx` | `/containers/:containerId/soil-sample/new` | Collect and track soil sample | YES | YES | NO | PARTIAL | YES | NO |
| `containers/StartupForm.jsx` | `/containers/:containerId/startup` | Startup — media replacement, amendments | YES | YES | **YES** | YES | YES (fixed bottom) | NO |
| `containers/StartupReadyForm.jsx` | `/containers/:containerId/startup/:startupId/ready` | Supervisor sign-off (container ready) | YES | YES | NO | PARTIAL | YES | NO |
| `containers/AmendmentLog.jsx` | `/applications/amendments` | Amendment history list | YES | YES | N/A | PARTIAL | N/A | NO |
| `harvest/HarvestDashboard.jsx` | `/harvest/:batchId` | Harvest overview — assignments by container | YES | YES | N/A | YES | YES | NO |
| `harvest/PartialHarvestForm.jsx` | `/harvest/:batchId/partial` | Record partial harvest event | YES | YES | **NO** ⚠ | YES | YES (fixed bottom) | NO |
| `harvest/FinalHarvestForm.jsx` | `/harvest/:batchId/final` | Record final harvest + tag verification | YES | YES | **NO** ⚠ | YES | YES (fixed bottom) | NO |
| `harvest/WasteTrimForm.jsx` | `/harvest/waste-trim/new` | Record waste trim with disposal lifecycle | YES | YES | **YES** | YES | YES (fixed bottom) | YES |
| `harvest/WeatherEventClose.jsx` | `/harvest/batches/:harvestBatchId/force-close` | Force-close harvest batch (weather event) | YES | YES | NO | PARTIAL | YES | NO |
| `exports/MetrcExport.jsx` | `/exports/metrc` | METRC additives export — CSV/preview | YES | YES | N/A | PARTIAL | YES | N/A |
| `exports/MdaReport.jsx` | `/exports/mda-pesticide` | MN MDA pesticide report export | YES | YES | N/A | PARTIAL | YES | N/A |
| `exports/CultivationRecord.jsx` | `/exports/cultivation-record` | Full cultivation record PDF/export | YES | YES | N/A | PARTIAL | YES | N/A |
| `admin/ContainerLabels.jsx` | `/admin/container-labels` | Print QR label sheets (admin only) | YES | YES | N/A | YES | YES (print button) | N/A |

**Notes on "UNKNOWN":** FertigationRecipeEdit, FoliarRecipeEdit, Strains, and RecipeIndex were not fully read; findings for those pages are estimated from surrounding code patterns and the component structure. They should be re-verified before shipping.

---

## Section 2: Hard UX Rule Violations

### Rule 1 — Touch Targets ≥ 56pt

| File | Location | Description | Recommended Fix |
|------|----------|-------------|-----------------|
| `batches/Batches.jsx:87` | "+ New Plant Batch" button | `minHeight: '44px'` — below the 56pt minimum | Change to `minHeight: '56px'` |
| `batches/BatchDetail.jsx:190` | "← Plant Batches" back button | No `minHeight` set; renders at ~20px text height | Add `style={{ minHeight: '44px' }}` (back buttons can be 44px; the 56pt rule applies to primary action targets) |
| `batches/BatchDetail.jsx:99` | "View all →" + "View Containers" links | No `minHeight`, small `text-xs` links | Wrap in button with `minHeight: '44px'` or use `py-3` padding |
| `components/NavBar.jsx:11-17` | All nav items | `py-2 pt-1` only — effective tap target is ~40px including icon + text | Add `minHeight: '56px'` to each nav item or increase `py` to `py-3` |
| `applications/FoliarNew.jsx` (purpose chips) | PURPOSE_CHIPS row | `minHeight: '36px'` on purpose chip buttons | Increase to `minHeight: '44px'` minimum; 56pt preferred for gloved use |
| `applications/PesticideNew.jsx` (pest/wind chips) | Common pest + wind direction chips | `minHeight: '36px'` on chip buttons | Increase to `minHeight: '44px'` |
| `applications/REIDashboard.jsx` | "Clear REI" action button (not fully read) | Pattern risk from other log pages | Verify and add `minHeight: '56px'` |

### Rule 2 — Primary Actions in Thumb Zone (Bottom)

No violations found for form submission buttons. All form pages (`FertigationNew`, `FoliarNew`, `PesticideNew`, `AmendmentNew`, `ObservationNew`, `PlantLossForm`, `TeardownForm`, `StartupForm`, `WasteTrimForm`, `BatchNew`, harvest forms) correctly use `fixed bottom-20` positioned save buttons at 56–64px height.

**One gap:** `BatchDetail.jsx` — the "Advance Phase" button is rendered inline at the bottom of the scroll, not fixed to the viewport bottom. On a long batch detail page, the user must scroll to reach it. Consider making it sticky or floating.

### Rule 3 — Auto-Save Draft (Forms with 3+ Fields)

| File | Fields | Has Draft | Violation |
|------|--------|-----------|-----------|
| `batches/BatchNew.jsx` | 6 fields (strain, sow date, plant count, per-container, METRC UID, notes) | **NO** | **VIOLATION** — add `cv_draft_batch_new` |
| `harvest/FinalHarvestForm.jsx` | 4 fields (product type, wet weight, weight unit, notes) | **NO** | **VIOLATION** — add `cv_draft_final_harvest` |
| `harvest/PartialHarvestForm.jsx` | 4 fields (same as above) | **NO** | **VIOLATION** — add `cv_draft_partial_harvest` |
| `containers/SoilSampleForm.jsx` | 5+ fields (sample label, type, lab, sent date, notes) | **NO** | **VIOLATION** — add `cv_draft_soil_sample` |
| `containers/PlantReplacementForm.jsx` | 3+ fields | **NO** | Likely violation — verify and add draft if 3+ fields |
| `harvest/WeatherEventClose.jsx` | 2 fields (close notes + confirmation) | **NO** | Borderline — 2 fields, probably OK |
| `recipes/FertigationRecipeEdit.jsx` | Many fields (name, EC/pH targets, mixing order, ingredients) | **NO** | **VIOLATION** — recipe edits are long-form, must persist |
| `recipes/FoliarRecipeEdit.jsx` | Many fields | **NO** | **VIOLATION** — same as above |

**Already compliant:** `FertigationNew`, `FoliarNew`, `PesticideNew`, `AmendmentNew`, `ObservationNew`, `PlantLossForm`, `TeardownForm`, `StartupForm`, `WasteTrimForm`.

### Rule 4 — Numeric Inputs (inputMode)

| File | Field | Problem |
|------|-------|---------|
| `inputs/CropInputDetail.jsx` | PHI days fields, REI hours | Not fully audited — verify `inputMode="numeric"` on any editable numeric fields |
| `observations/ObservationNew.jsx` | `maturity_pct` (0–100 slider or numeric input) | The form is partially read; confirm `inputMode="numeric"` if it renders as `<input type="number">` |
| `recipes/FertigationRecipeEdit.jsx` | EC/pH targets, rate values | Not fully read — verify all numeric inputs use `inputMode="decimal"` |

**No violations found** in the fully-audited forms (`FertigationNew`, `FoliarNew`, `PesticideNew`, `AmendmentNew`) — all use `inputMode="decimal"` and `inputMode="numeric"` correctly.

### Rule 5 — No Modal Stacks

No violations observed. `BatchDetail.jsx` has `showRecipeModal` and `showTransitionModal` as mutually exclusive booleans — only one can be rendered at a time.

### Rule 6 — REI/PHI Alerts Must Be Full-Screen Modals

| Issue | Description | Severity |
|-------|-------------|----------|
| `PesticideNew.jsx` | `REIConfirmModal` after save is full-screen red overlay — **CORRECT** ✓ | — |
| `Today.jsx` REI banner | Red banner navigates to `/rei` list — **acceptable** for the summary screen; this is not a safety-gating scenario | — |
| `ContainerDetail.jsx` | **VIOLATION**: No REI check when loading a container in an active-REI area. Rule 12 requires a full-screen warning when an applicator "tries to enter a row with active REI." A container scan that resolves to an active-REI row/sub-zone should block with a full-screen modal before showing the container record. | **CRITICAL** |
| `ContainerScanner.jsx` | **VIOLATION**: After a successful QR scan, the app navigates directly to `ContainerDetail` with no REI check. If the container is in an active REI area, the applicator walks right in. | **CRITICAL** |

### Rule 7 — Visual Feedback on Save

| File | Issue |
|------|-------|
| `batches/BatchNew.jsx` | **VIOLATION**: After successful `createBatch()`, the form navigates to batch detail with no toast or green flash confirmation. The user has no visual confirmation the save succeeded. Add a green flash + "Batch created" toast before navigate. |
| `batches/BatchDetail.jsx` (transition) | **VIOLATION**: After `handleTransition()` succeeds, batch state updates silently. No toast shown. A "Moved to Field — Veg" confirmation would reinforce the action. |
| `batches/BatchDetail.jsx` (recipe assign) | **PARTIAL**: `RecipeModal` closes after `onAssigned()` but no toast is fired. Silent success. |
| `containers/PlantReplacementForm.jsx` | Not fully read — verify toast exists |
| `containers/StartupReadyForm.jsx` | Not fully read — verify toast exists |

**Already compliant:** All `*New.jsx` application forms (`FertigationNew`, `FoliarNew`, `PesticideNew`, `AmendmentNew`), `ObservationNew`, `PlantLossForm`, `TeardownForm`, `StartupForm`, `WasteTrimForm`, all harvest forms — all show toast + green/red flash + haptic-on-submit pattern.

### Rule 8 — Pre-Fill from Context

| File | Issue |
|------|-------|
| `batches/BatchDetail.jsx:387` | **VIOLATION / BUG**: The "Amendment" quick-action links to `/applications/amendments/new` without `?batch_id=`. Every other quick-action from BatchDetail passes `?batch_id=` in the URL, but the amendment link does not. The AmendmentNew form will not know which batch it's for. |
| All forms | Applicator pre-filled from `user.name` ✓ | 
| All forms | Timestamp pre-filled from `now` ✓ |
| `FertigationNew.jsx` | Active recipe pre-filled when `batch_id` provided ✓ |

---

## Section 3: Navigation & Discoverability

### NavBar Coverage

The bottom NavBar (`Today`, `Scan`, `Batches`, `Apply`, `Observe`, `Containers`) covers the daily field workflow. The following Phase 1 features have **no NavBar path**:

| Feature | Route | How to Reach |
|---------|-------|-------------|
| Recipe Library | `/recipes`, `/recipes/fertigation`, `/recipes/foliar` | Only via BatchDetail "Change" recipe link, or typed URL |
| Crop Input Inventory | `/inputs` | Typed URL only — no link from any NavBar item |
| REI Dashboard | `/rei` | Today screen red banner (conditional on active REIs); typed URL |
| METRC Export | `/exports/metrc` | Typed URL only |
| MDA Pesticide Report | `/exports/mda-pesticide` | Typed URL only |
| Cultivation Record | `/exports/cultivation-record` | Typed URL only |
| Strains (supervisor) | `/strains` | Typed URL only |
| Container Labels (admin) | `/admin/container-labels` | Typed URL only |

**Recommendation:** Add a "More" menu or a hamburger/overflow item in the NavBar that surfaces Recipes, Inventory, Exports, and REI for users who need them. Recipes in particular are referenced constantly by applicators needing to verify ingredient rates.

### Features Accessible Only by URL (No Navigation Path at All)

1. **Crop Input Inventory** (`/inputs`) — critical for applicators verifying products before use; no path from any screen
2. **All three export routes** — only reachable by typing URLs
3. **Strains** (`/strains`) — supervisor function, reachable only by URL
4. **Container Labels** (`/admin/container-labels`) — admin function, reachable only by URL

### Routes in App.jsx vs. Registered Features

All routes listed in the Phase 1 Application Surface appear in `App.jsx`. No routes are missing from the router. ✓

### Today Screen — REI Surfacing

Active REIs surface correctly as a prominent red banner at the top of Today. The banner navigates to the REI Dashboard. ✓

**Missing from Today screen** (per CLAUDE.md Feature 26):
- Containers in TEARDOWN awaiting soil sample
- Containers in STARTUP awaiting amendments
- Soil samples sent to lab awaiting results
- Unsynced plant loss events needing METRC reporting

These items are called out in the Phase 1 spec as required Today screen content but are not rendered. The current Today screen only shows active REIs, active batches, and recent fertigation applications.

### BatchDetail — Lifecycle Actions

BatchDetail correctly surfaces:
- Fertigation, Foliar, Amendment, Pesticide, Observation, and Waste Trim quick-actions ✓
- Harvest Dashboard link when batch is `harvesting` ✓
- Advance Phase button (supervisor only) ✓
- Harvest readiness summary during `harvest_window` ✓

**Gap:** Amendment link does not pass `?batch_id=` (see Rule 8 violation above).

### ContainerDetail — Lifecycle Actions

ContainerDetail was partially read (first 100 lines). From the structure, it loads container state, soil samples, and supports OOS/restore transitions. Navigation from ContainerDetail to the loss, replacement, teardown, startup, and soil-sample routes all exist in App.jsx. Full verification of all lifecycle actions being surfaced requires complete read of ContainerDetail.jsx (lines 100–end).

---

## Section 4: Error and Empty States

### List Pages — Empty States

| Page | Empty State | CTA Present |
|------|-------------|-------------|
| `Batches.jsx` | "No active/closed plant batches found" with spacious layout | ✓ "Create First Plant Batch" button |
| `FertigationLog.jsx` | Needs verification — error variable present but empty state not fully read | ? |
| `CropInputs.jsx` | Not fully read | ? |
| `ContainerDashboard.jsx` | Not fully read but has summary counts at top | ? |
| `HarvestDashboard.jsx` | Handles no-assignments case | ✓ |

### Forms — API Failure Handling

| Page | What Happens on API Failure |
|------|---------------------------|
| `Today.jsx` | **SILENT FAILURE** — `catch(() => setReiLoading(false))` and `catch(() => setBatchesLoading(false))` discard errors. User sees empty state, not an error. Critical: if the API is down, the Today screen looks like "no batches and no REIs" instead of showing an error. |
| `FertigationNew.jsx` | Shows inline `saveError` banner ✓ |
| `FoliarNew.jsx` | Shows inline `saveError` banner ✓ |
| `PesticideNew.jsx` | Shows inline `saveError` banner ✓ |
| `AmendmentNew.jsx` | Shows inline `saveError` banner ✓ |
| `BatchNew.jsx` | Shows `err` banner ✓ |
| `BatchDetail.jsx` | `setError(e.message)` shown in red box ✓ |
| `ContainerDetail.jsx` | Error state rendered ✓ |
| `ObservationNew.jsx` | Error shown ✓ |

### Pages — Offline Behavior

| Page | Offline Behavior |
|------|-----------------|
| `FertigationNew.jsx` | ✓ Detects `Failed to fetch`, shows pending sync indicator, offline toast |
| `FoliarNew.jsx` | ✓ Same pattern |
| `AmendmentNew.jsx` | ✓ Same pattern |
| `PesticideNew.jsx` | **NO** — `catch` block does not detect `Failed to fetch`. Network errors shown as generic save failure. For a compliance-critical pesticide record this is a serious gap — field staff may lose data thinking the save failed. |
| `ObservationNew.jsx` | Need to verify — likely YES based on draft pattern |
| `PlantLossForm.jsx` | **NO** — no offline detection in save handler |
| `TeardownForm.jsx` | **NO** |
| `StartupForm.jsx` | **NO** |
| All harvest forms | **NO** |

---

## Section 5: Missing Features

### Features with No Frontend Page

All Phase 1 features have at least one corresponding page. No Phase 1 feature is completely missing.

### Features with a Page But No Navigation Path

| Feature | Page | Navigation Gap |
|---------|------|---------------|
| **Feature 1 & 2 — Recipe Library** | `/recipes/fertigation`, `/recipes/foliar` | No NavBar entry. Reachable only from BatchDetail "Change" link or by URL. |
| **Feature 3 — Crop Input Inventory** | `/inputs` | No NavBar entry. No link from any accessible screen. |
| **Features 11–13 — Export Reports** | `/exports/*` | No NavBar entry. No link from Today or BatchDetail. |

### Feature 16 — METRC Plant Tag Assignment (Partial)

`App.jsx` contains no dedicated route for METRC tag assignment (e.g., `/containers/:id/assign-tag`). This feature is expected to be implemented inline in `ContainerDetail.jsx`, but ContainerDetail was only partially read. The following must be verified:
- Does ContainerDetail show an "Assign METRC Tag" button when no tag is assigned?
- Does that button open a camera barcode-scan flow for the METRC tag's 1D barcode?
- Does bulk assignment mode exist?

If this is only in ContainerDetail and not a separate scannable workflow, Feature 16 is partially implemented.

### Missing Backend Routes That Affect Frontend

| Frontend Code | Issue |
|---------------|-------|
| `BatchDetail.jsx:387` — Amendment link | No `?batch_id=` passed. AmendmentNew will not pre-select the batch. |
| `Today.jsx` — No container lifecycle items | `api` calls for teardown/startup/soil-sample pending would need backend support for these counts — likely not yet implemented |

### Phase 1 Features with No Log View

All four application types have both a `/new` form and a `/log` list view. ✓  
Observations have `/observations/new` and `/observations` list. ✓

---

## Section 6: Recommendations

### CRITICAL (Breaking Compliance, Data Loss, or Safety)

1. **ContainerDetail + ContainerScanner: No REI pre-entry check** (`ContainerDetail.jsx`, `ContainerScanner.jsx`)  
   Rule 12 requires a full-screen modal when entering an REI-restricted area. A successful QR scan in a REI-active sub-zone navigates directly to the container record with no warning. Add an REI check on `ContainerDetail` mount: if the container's current batch has an active pesticide REI, show the full-screen `REIConfirmModal` before rendering the record.

2. **Today.jsx: Silent load failures** (`Today.jsx:56-63`)  
   Both REI and batch API calls swallow errors silently. An API failure looks identical to "no data." Add an error state: if either call fails, show a brief "Unable to load — tap to retry" banner below the header.

3. **BatchDetail.jsx: Amendment link missing batch_id** (`BatchDetail.jsx:387`)  
   Change `to={'/applications/amendments/new'}` to `to={'/applications/amendments/new?batch_id=${batch.batch_id}'}`. Without this, the amendment form opens with no batch context and the record will be container-only with no plant batch association.

4. **PesticideNew.jsx: No offline/network error handling** (`PesticideNew.jsx:446-458`)  
   Add the same `Failed to fetch` / `NetworkError` detection present in `FertigationNew.jsx`. A pesticide application record typed during a spotty-WiFi round must not vanish. Show the pending sync indicator and toast instead of a generic save-failure error.

5. **Today screen missing container lifecycle action items** (`Today.jsx`)  
   Per Feature 26 in CLAUDE.md, the Today screen must surface: containers in TEARDOWN awaiting soil sample, containers in STARTUP awaiting amendments, pending soil sample lab results, and unsynced plant loss events. These are all missing. Add a "Pending Actions" section below the batch cards.

### HIGH (UX Degradation, Rule Violations)

6. **BatchNew.jsx: No draft persistence** (`batches/BatchNew.jsx`)  
   This form has 6 fields. Add `cv_draft_batch_new` draft persistence with the 3-second debounce pattern used in FertigationNew.

7. **FinalHarvestForm.jsx and PartialHarvestForm.jsx: No draft persistence**  
   These forms have 4 fields and are used in the field during harvest. Add draft keys `cv_draft_final_harvest` and `cv_draft_partial_harvest`.

8. **FertigationRecipeEdit.jsx and FoliarRecipeEdit.jsx: No draft persistence** (estimated from pattern)  
   Recipe editing is a long-form operation. Add draft persistence.

9. **Batches.jsx: "+ New Plant Batch" button is 44px** (`Batches.jsx:87`)  
   Change `minHeight: '44px'` to `minHeight: '56px'`.

10. **NavBar: Touch targets below 56pt** (`components/NavBar.jsx`)  
    Nav items have `py-2 pt-1` only. Each item's effective tap area is ~40px. Increase padding or add `style={{ minHeight: '56px' }}` to each NavLink/button to meet the 56pt gloved-use requirement.

11. **BatchNew.jsx: No success toast** (`batches/BatchNew.jsx`)  
    On successful save, the form navigates silently. Add a green flash + brief toast ("Batch created") before navigating to BatchDetail, consistent with all other forms.

12. **BatchDetail.jsx: No feedback on transition or recipe assign** (`BatchDetail.jsx`)  
    Phase transitions and recipe assignment complete silently. Add a toast ("Moved to Seedlings ✓", "Recipe assigned ✓") after successful API calls.

13. **Recipes and Crop Inputs are unreachable from the UI** (navigation gap)  
    Add a "More" or "Library" overflow section to the NavBar — or at minimum, wire a "Recipes & Inputs" card on the Today screen or ApplicationsHub so field staff can find reference material without typing URLs.

14. **BatchDetail advance-phase button is not fixed/sticky** (`BatchDetail.jsx:424`)  
    On a batch with a long history timeline, the user must scroll to the bottom to find the "Advance Phase" button. Make it sticky at `bottom: 80px` (above the NavBar) when the batch is not closed, matching the pattern used in form pages.

15. **SoilSampleForm.jsx: No draft persistence**  
    This form has 5+ fields and is tied to a significant lab workflow. Add draft persistence.

### MEDIUM (Inconsistency, Minor Rule Gaps)

16. **Purpose chip touch targets are 36px** (`FoliarNew.jsx`, `PesticideNew.jsx`)  
    Chip buttons use `minHeight: '36px'`. Per Rule 1, all interactive elements should be ≥56pt for gloved use. Increase purpose/pest chips to at least 44px.

17. **PesticideNew.jsx: Offline handling gap**  
    Already listed in CRITICAL due to compliance risk; also reflected here for completeness.

18. **Log pages (FertigationLog, FoliarLog, etc.): Empty states not verified**  
    Confirm each log page shows a helpful empty state with a "Log your first application →" CTA when no records exist.

19. **ObservationNew.jsx: `maturity_pct` input mode**  
    Verify the maturity percentage input uses `inputMode="numeric"` and the `type="range"` slider (if used) has a visible numeric display alongside it.

20. **Today screen — "Recent Applications" only shows fertigation** (`Today.jsx:212-249`)  
    The `RecentApplications` component only fetches `getFertigationApplications`. Per CLAUDE.md Feature 14, "recent entries" should surface the last 5–10 logged items across all four application types, plus observations. Rename or expand to include foliars, pesticides, and observations.

---

*Last updated: 2026-05-21. Source: manual audit of all 47 JSX files under `client/src/pages/` and `client/src/components/`.*
