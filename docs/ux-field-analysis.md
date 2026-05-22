# Field UX Design Analysis
## Cultivation Tracking Application — Comprehensive UX Review

**Produced:** 2026-05-21  
**Scope:** All 53 JSX pages and 3 components under `client/src/`  
**Reference:** CLAUDE.md §Field UX Requirements, §Application Surface (Phase 1), existing `docs/audit-frontend-ux.md`  
**Context:** All Phase 1 features are now built. This document evaluates field readiness, identifies gaps, and prioritizes the improvement roadmap for real-world growing-season use.

---

## Section 1: Feature Inventory and Field Readiness

Rating scale: **A** = field-ready, **B** = usable in field, **C** = desk-only as built, **F** = broken for field use

| Page | Route | Purpose | Field Use? | Touch ≥56pt | Thumb Zone | Draft Save | Offline | Pre-fill | Rating |
|------|-------|---------|-----------|-------------|------------|------------|---------|----------|--------|
| `Today.jsx` | `/` | App home, REI banner, batch cards | YES | ✓ | ✓ | N/A | **NO** | N/A | **B** |
| `Login.jsx` | `/login` | PIN auth | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `batches/Batches.jsx` | `/batches` | Batch list | NO | **NO** (44px button) | N/A | N/A | NO | N/A | B |
| `batches/BatchNew.jsx` | `/batches/new` | Create plant batch | NO | ✓ | ✓ | **NO** | NO | Partial | C |
| `batches/BatchDetail.jsx` | `/batches/:id` | Batch detail, lifecycle, actions | YES | PARTIAL | PARTIAL | N/A | NO | N/A | B |
| `recipes/RecipeIndex.jsx` | `/recipes` | Hub to recipe libraries | NO | ✓ | N/A | N/A | NO | N/A | A |
| `recipes/FertigationRecipes.jsx` | `/recipes/fertigation` | List 7 fertigation recipes | NO | ✓ | ✓ | N/A | NO | N/A | A |
| `recipes/FertigationRecipeDetail.jsx` | `/recipes/fertigation/:id` | Recipe detail, print card, mix calc | YES | ✓ | ✓ | N/A | NO | N/A | A |
| `recipes/FertigationRecipeEdit.jsx` | `/recipes/fertigation/new`, `/:id/version` | Create/version recipe | NO | Unknown | Unknown | **NO** | NO | N/A | C |
| `recipes/FoliarRecipes.jsx` | `/recipes/foliar` | List foliar recipes | NO | ✓ | ✓ | N/A | NO | N/A | A |
| `recipes/FoliarRecipeDetail.jsx` | `/recipes/foliar/:id` | Foliar recipe detail, mix calc | YES | ✓ | ✓ | N/A | NO | N/A | A |
| `recipes/FoliarRecipeEdit.jsx` | `/recipes/foliar/new`, `/:id/version` | Create/version foliar recipe | NO | Unknown | Unknown | **NO** | NO | N/A | C |
| `recipes/MixCalculatorPage.jsx` | `/recipes/calculator` | Mix volume calculator | YES | ✓ | ✓ | ✓ | NO | ✓ | A |
| `inputs/CropInputs.jsx` | `/inputs` | Crop input inventory, search/filter | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `inputs/CropInputDetail.jsx` | `/inputs/:id` | Input detail, PHI/REI, lots | YES | ✓ | N/A | N/A | NO | N/A | A |
| `strains/Strains.jsx` | `/strains` | Strain CRUD (supervisor) | NO | Unknown | ✓ | N/A | NO | N/A | B |
| `applications/ApplicationsHub.jsx` | `/applications` | Hub menu for all 4 app types | YES | ✓ | N/A | N/A | N/A | N/A | A |
| `applications/FertigationNew.jsx` | `/applications/fertigation/new` | Log fertigation — field-optimized | YES | ✓ | ✓ (fixed 64px) | **✓** | **✓** | ✓ | **A** |
| `applications/FertigationLog.jsx` | `/applications/fertigation` | Fertigation history | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `applications/FoliarNew.jsx` | `/applications/foliar/new` | Log foliar spray | YES | ✓ | ✓ (fixed 64px) | **✓** | **✓** | ✓ | **A** |
| `applications/FoliarLog.jsx` | `/applications/foliar` | Foliar history | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `containers/AmendmentNew.jsx` | `/applications/amendments/new` | Log container amendment | YES | ✓ | ✓ (fixed 64px) | **✓** | **✓** | ✓ | **A** |
| `containers/AmendmentLog.jsx` | `/applications/amendments` | Amendment history | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `applications/PesticideNew.jsx` | `/applications/pesticide/new` | Log pesticide (MDA-compliant) | YES | ✓ | ✓ (fixed 64px) | **✓** | **NO** ⚠ | ✓ | **B** |
| `applications/PesticideLog.jsx` | `/applications/pesticide` | Pesticide history | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `applications/REIDashboard.jsx` | `/rei` | Active REIs, clear REI | YES | PARTIAL | ✓ | N/A | NO | N/A | B |
| `observations/ObservationNew.jsx` | `/observations/new` | Log observation, harvest readiness | YES | ✓ | ✓ (fixed bottom) | **✓** | **✓** | ✓ | **A** |
| `observations/ObservationLog.jsx` | `/observations` | Observation history | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `containers/ContainerDashboard.jsx` | `/containers` | Container status grid by sub-zone | NO | PARTIAL | N/A | N/A | NO | N/A | B |
| `containers/ContainerDetail.jsx` | `/containers/:containerId` | Container record, lifecycle actions | YES | PARTIAL | N/A | N/A | NO | ✓ | B |
| `containers/ContainerScanner.jsx` | `/scan` | Camera QR scan entry point | YES | ✓ | N/A | N/A | N/A | N/A | **A** |
| `containers/PlantLossForm.jsx` | `/containers/:containerId/loss` | Record plant death, 3-tap target | YES | ✓ | ✓ (fixed bottom) | **✓** | **NO** ⚠ | ✓ | **B** |
| `containers/PlantReplacementForm.jsx` | `/containers/:containerId/replacement` | Assign replacement plant | NO | PARTIAL | ✓ | NO | NO | ✓ | C |
| `containers/TeardownForm.jsx` | `/containers/:containerId/teardown` | Teardown checklist | NO | ✓ | ✓ (fixed bottom) | **✓** | **NO** | ✓ | B |
| `containers/SoilSampleForm.jsx` | `/containers/:containerId/soil-sample/new` | Soil sample collection | NO | PARTIAL | ✓ | **NO** | NO | ✓ | C |
| `containers/StartupForm.jsx` | `/containers/:containerId/startup` | Media replacement, amendments | NO | ✓ | ✓ (fixed bottom) | **✓** | **NO** | ✓ | B |
| `containers/StartupReadyForm.jsx` | `/containers/:containerId/startup/:id/ready` | Supervisor sign-off | NO | PARTIAL | ✓ | NO | NO | ✓ | B |
| `containers/ContainerQuickSheet.jsx` | (admin) | Quick reference card | NO | N/A | N/A | N/A | N/A | N/A | A |
| `harvest/HarvestDashboard.jsx` | `/harvest/:batchId` | Harvest overview by container | YES | PARTIAL (44px inner) | ✓ | N/A | **NO** ⚠ | ✓ | **B** |
| `harvest/PartialHarvestForm.jsx` | `/harvest/:batchId/partial` | Record partial harvest | YES | ✓ | ✓ (fixed bottom) | **NO** ⚠ | **NO** | ✓ | **C** |
| `harvest/FinalHarvestForm.jsx` | `/harvest/:batchId/final` | Record final harvest + tag verify | YES | PARTIAL (32px units) | ✓ (fixed bottom) | **NO** ⚠ | **NO** ⚠ | ✓ | **C** |
| `harvest/WasteTrimForm.jsx` | `/harvest/waste-trim/new` | Record waste trim | YES | ✓ | ✓ (fixed bottom) | **✓** | **✓** | ✓ | **A** |
| `harvest/WeatherEventClose.jsx` | `/harvest/batches/:id/force-close` | Force-close harvest batch | NO | PARTIAL | ✓ | NO | NO | N/A | B |
| `containers/PlantLossForm.jsx` | `/containers/:containerId/loss` | Record plant loss | YES | ✓ | ✓ | ✓ | NO | ✓ | B |
| `exports/MetrcExport.jsx` | `/exports/metrc` | METRC additives export | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `exports/MdaReport.jsx` | `/exports/mda-pesticide` | MN MDA pesticide report | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `exports/CultivationRecord.jsx` | `/exports/cultivation-record` | Full compliance record | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `admin/ContainerLabels.jsx` | `/admin/container-labels` | Print QR label sheets | NO | ✓ | ✓ | N/A | N/A | N/A | A |
| `compliance/ComplianceDashboard.jsx` | `/compliance` | RAG compliance panel | NO | PARTIAL | ✓ | N/A | NO | N/A | A |
| `compliance/PlantInventory.jsx` | `/compliance/plant-inventory` | All batches, plant counts, tagging | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `compliance/TagVerification.jsx` | `/compliance/tag-verification` | Active assignments, last-4 display | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `compliance/MetrcReconciliation.jsx` | `/compliance/metrc-reconciliation` | Sync status, pending/failed items | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |
| `admin/SensorManagement.jsx` | `/admin/sensors` | Sensor assign/unassign | NO | ✓ | ✓ | N/A | N/A | N/A | A |
| `admin/EnvironmentalHistory.jsx` | `/admin/environmental-history` | Sensor reading history | NO | PARTIAL | ✓ | N/A | N/A | N/A | A |

### C / F Rating Deep-Dive

**BatchNew.jsx (C) — Create Batch**
- No draft persistence on a 6-field form. Interruption mid-form loses all data.
- No success toast after save — silent navigation to BatchDetail.
- Fix: Add `cv_draft_batch_new` persistence + "Batch created ✓" toast before navigate.

**FertigationRecipeEdit / FoliarRecipeEdit (C) — Recipe Editing**
- Long-form (EC/pH targets, mixing order, multiple ingredient rows) with no draft persistence.
- Recipe editing is typically done at a desk, but losing partial work is expensive since creating a new version is a significant event.
- Fix: Add `cv_draft_recipe_*` draft with debounce.

**SoilSampleForm.jsx (C) — Soil Sample Collection**
- 5+ fields (label, type, lab name, sent date, notes) with no draft persistence.
- Soil samples are tied to lab workflows; losing entry data is costly.
- Fix: Add `cv_draft_soil_sample_${containerId}` persistence.

**PartialHarvestForm.jsx (C) — Partial Harvest**
- 4 fields (product type, weight, unit, notes) with no draft persistence.
- Harvest workflow is high-pressure; connectivity may be spotty.
- No offline handling — network error produces generic save-fail message.
- Fix: Add `cv_draft_partial_harvest`, add `Failed to fetch` detection.

**FinalHarvestForm.jsx (C) — Final Harvest**
- 4 fields post-tag-verification with no draft persistence.
- Weight unit buttons are `minHeight: '32px'` — below 36pt minimum, impossible with gloves.
- No offline handling — one of the most compliance-critical operations in the app.
- Fix: Draft persistence, weight unit buttons to 44px+, offline detection, explicit error for tag mismatch.

---

## Section 2: The Three-Tap Audit

Target: complete the most common daily workflows in 3 taps from any starting point. "Tap" = one meaningful interaction (picking from a list, entering a value, pressing save). Context navigation counts as 1 tap.

### 1. Daily Fertigation Log

**Current flow (from Today screen, no batch pre-selected):**
1. Tap "Fertigation" Quick Action → navigates to FertigationNew with no batch context
2. Scroll through batch list, tap to select batch
3. Batch loads, recipe pre-fills
4. Enter volume (tap field, type)
5. Enter EC (tap field, type)
6. Enter pH (tap field, type)
7. Tap Save

**Current count: 7 taps.** Target: 3.

**Flow (from BatchDetail with batch context):**
1. Tap "Fertigation" quick action (passes `?batch_id=`) → FertigationNew with locked batch
2. Enter volume, EC, pH (3 fields minimum)
3. Tap Save

**Current count: 5 taps** from BatchDetail. Still not 3.

**Blockers preventing 3-tap:**
- Volume/EC/pH are separate fields requiring individual taps — unavoidable for measurement data
- EC and pH require physical meter readings — no sensor can fill these

**Achievable minimum: 3-4 taps** if the operator is already on BatchDetail. The Today screen Quick Action path is inherently 5+ taps.

**Redesign to approach 3 taps:**
- Make Today screen batch cards directly link to FertigationNew with `?batch_id=` pre-filled — skip the BatchDetail detour
- Add a "last applied" defaults chip: if the same batch was fertigated today, pre-fill the last EC/pH as suggested values (operator just confirms or overrides)
- Today card → tap "Log Fertigation" inline (not via Apply hub) → locked form → volume/EC/pH → Save = **4 taps**. This is as close to 3 as the measurement requirement allows.

### 2. Foliar Application (from container scan)

**Current flow:**
1. Scan container QR → ContainerDetail (REI check missing — see P0)
2. Tap "Log Foliar" button (if visible — ContainerDetail shows this for active containers)
3. FoliarNew opens with `?batch_id=` (batch context) but `?container_id=` may not be passed
4. Select purpose chips → select product → enter volume → Save

**Current count: 6+ taps** (scan + ContainerDetail + navigate + purpose + product + volume + save).

**Blocker:** FoliarNew requires product selection (not pre-filled from container context). The product picker involves a sheet with search.

**Redesign:**
- ContainerDetail: "Log Foliar" should pre-fill `?container_id=` in the URL so FoliarNew locks the target
- Add "Recent products" section to product picker sheet — last 3 products used for this batch appear as one-tap chips at the top
- Achievable: scan → ContainerDetail → Log Foliar → (recent product chip) → volume → save = **5 taps**

### 3. Pest Observation (walking a row, spot a pest)

**Current flow:**
1. Tap "Observe" in NavBar → ObservationNew
2. Select batch from list
3. Select row from chips
4. Tap "Pest" category chip
5. Tap "High" severity chip
6. Type or voice-input note
7. Tap Save

**Current count: 7 taps** (not counting typing the note). Target: 3.

**Blocker:** Batch selection is the big friction point. Without a container scan, the operator must scroll a batch list.

**Redesign:**
- If arriving from a container scan (ContainerDetail → "Observe"), pre-fill batch, container/row from container context. Reduces to: (from scan) → ContainerDetail → Observe → Pest chip → severity → note → Save = **5 taps**
- Add a "Quick Observe" mode: single tap on a category chip on ContainerDetail triggers a micro-form (severity + note) inline, without leaving the container record.
- Achievable minimum with scan + quick observe: **3 taps** (scan → container → category chip → inline save)

### 4. Plant Loss (find a dead plant)

**Current flow:**
1. Scan container QR → ContainerDetail
2. Tap "Record Plant Loss"
3. Select loss type chip
4. (Optional) fill loss cause + disposition
5. Tap Save

**Current count: 4-5 taps.** Close to target.

**Blocker:** Loss cause is free-text (voice helps). Disposition is a picker.

**Already close:** PlantLossForm has draft persistence, fixed bottom save, and chip selection for loss type. This is the best-optimized field workflow in the app.

**Achievable: 3-4 taps** with scan — already at or near target.

### 5. Harvest Readiness Observation (walking rows in harvest_window)

**Current flow:**
1. Today → tap a harvest_window batch card → BatchDetail
2. Scroll to observations section, tap "Add Observation"
3. ObservationNew opens (no batch context from BatchDetail observations link — verify)
4. Select batch, select row, select "Harvest Readiness" category
5. Set maturity_pct slider
6. Toggle "Ready" yes/no
7. Tap Save

**Current count: 7+ taps.** Target: 3.

**Blockers:**
- No dedicated harvest readiness mode that bypasses general observation form
- No scan-based container-level readiness flow
- BatchDetail "observations" quick action may not pre-fill batch_id

**Redesign:**
- Add "Harvest Readiness Walk" button to BatchDetail when status is `harvest_window`. This opens a dedicated carousel mode: scan container → one-tap readiness (ready/not ready) + maturity slider → auto-advances to next container
- Achievable target with dedicated mode: scan container → slider (1) → ready toggle (2) → auto-save + next (3) = **3 taps per plant**

### 6. Waste Trim (trimming during harvest)

**Current flow:**
1. From HarvestDashboard: tap "Record Waste Trim" link
2. WasteTrimForm opens with batch_id pre-filled
3. Select trim reason chip
4. Enter wet weight
5. Tap Save

**Current count: 4-5 taps.** Near target.

**Already good:** WasteTrimForm has draft persistence, chip selection, fixed bottom save, offline detection. Reasonable field flow.

**Remaining friction:** No container/row pre-fill — waste trim at container granularity requires typing the container ID.

### 7. Partial Harvest (harvesting a plant)

**Current flow:**
1. HarvestDashboard (requires MB to exist — supervisor prerequisite)
2. Scroll to the target container in the plant list
3. Tap "Partial Harvest" link for the assignment
4. PartialHarvestForm opens: select product_type chip
5. Enter wet weight
6. Tap Save

**Current count: 5-6 taps.** Plus supervisor prerequisite to create MB.

**Blockers:**
- MB must exist before "Partial Harvest" link appears (shows "No MB active" placeholder otherwise)
- Scrolling through 30+ containers in HarvestDashboard to find specific one is friction

**Redesign:**
- ContainerDetail (during harvesting batch) shows "Partial Harvest" directly from container record — already implemented. This path is better: scan → ContainerDetail → Partial Harvest → chips → weight → save = **4 taps**

### 8. Amendment (adding compost to a container)

**Current flow:**
1. Scan container QR → ContainerDetail
2. ContainerDetail — look for "Add Amendment" button (verify it exists and passes container_id)
3. AmendmentNew with container pre-filled
4. Select amendment_type chip
5. Select product (picker sheet)
6. Enter quantity
7. Tap Save

**Current count: 6-7 taps.** Target: 3.

**Blocker:** Product picker for amendments is a full search sheet — no recent products cache.

**Redesign:** Same pattern as foliar — add "Recent products" one-tap chips to the picker. Achievable: **4-5 taps** with scan context and recent products.

---

## Section 3: Navigation and Discoverability

### Current NavBar (7 items)

```
[Today] [Scan] [Batches] [Apply] [Observe] [Containers] [Logout]
```

**Problem 1 — Touch targets too small.** NavBar uses `py-2 pt-1` resulting in ~40px effective tap height. CLAUDE.md requires 56pt minimum for gloved use. With 7 items in the NavBar, each item is ~14% of a 390px-wide phone — approximately 54px wide × 40px tall. Width is fine; height is the violation.

**Problem 2 — Too many items creating crowding.** 7 items is the maximum a bottom NavBar can handle before icons become too small. The "Logout" action should not occupy a primary NavBar slot — it belongs in a settings or profile menu. This would free a slot for a critical missing feature.

**Problem 3 — Critical features completely absent.** Recipes, Crop Inputs, REI Dashboard, and Compliance have no NavBar presence. A grower who needs to look up a recipe PHI before applying cannot find it without typing a URL.

**Problem 4 — "Apply" navigates to a hub (ApplicationsHub), not directly to a form.** A grower starting their day needs 2 taps to reach FertigationNew from the NavBar. The hub is understandable but adds friction for the highest-frequency action.

### Proposed NavBar (revised)

Remove "Logout" → add "More" overflow. Reprioritize based on daily use frequency:

```
[Today] [Scan] [Apply] [Observe] [More ···]
```

The "More" menu (slide-up sheet) surfaces:
- Batches
- Containers
- Recipes & Inputs
- REI Dashboard
- Compliance / Reports
- Admin
- Logout

This reduces primary NavBar to 5 items, increases each item's effective width to ~78px, and allows `minHeight: '60px'` on each item without crowding.

### Today Screen — Effectiveness as Front Door

**What works:**
- REI banner is prominent, red, and navigates correctly
- Batch cards are compact and navigable
- Quick Actions grid is well-sized (56px height, thumb zone)
- Current Conditions section exists (collapsed on mobile)

**What doesn't work:**

1. **Silent load failures.** Both `catch(() => setReiLoading(false))` and `catch(() => setBatchesLoading(false))` produce an empty screen when the API is down. An operator opening the app in the field sees what looks like "no batches, no REIs" — they have no way to know the app failed to load.

2. **RecentApplications shows fertigation only.** The bottom section says "Recent Applications" but calls only `getFertigationApplications`. Per CLAUDE.md Feature 14, this should show the last 5–10 items across all four application types plus observations.

3. **Container lifecycle actions are missing.** Per CLAUDE.md Feature 26, the Today screen must surface:
   - Containers in TEARDOWN awaiting soil sample
   - Containers in STARTUP awaiting amendments  
   - Soil samples sent to lab awaiting results
   - Unsynced plant loss events needing METRC reporting

4. **Current Conditions is collapsed by default on mobile.** Operators arrive to the Today screen not knowing if VPD is in range. Environmental conditions are safety-relevant; they should be expanded by default (with a "collapse" option), not collapsed.

5. **"View all →" link next to Active Batches is ~20px.** Tap target is too small for gloved use.

### Proposed Today Screen Layout (revised)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Thursday, May 21, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━
[ ⚠ 2 ACTIVE REIs — tap to view ] (red, full-width)

━━ CURRENT CONDITIONS ━━━━  (expanded, not collapsed)
  Z1A: 78°F / 62% RH / VPD 1.8 kPa ✓
  Z2A: 84°F / 58% RH / VPD 2.3 kPa ⚠ HIGH

━━ PENDING ACTIONS ━━━━━━━  (new section — before batches)
  • 3 containers in teardown awaiting soil sample
  • 1 unsynced plant loss needs METRC reporting
  • 2 containers in startup — sign-off needed

━━ QUICK ACTIONS ━━━━━━━━━  (2x2 grid)
  [💧 Fertigation] [🌿 Foliar]
  [⚗️ Pesticide]   [📝 Observe]

━━ ACTIVE BATCHES ━━━━━━━━  (batch cards with inline "Log Fert" tap)
  Strain A · Z1A · Field Veg · Day 34
    [💧 Log] [📝 Obs] [→ Detail]

━━ RECENT ACTIVITY ━━━━━━━  (last 8 items, all types)
```

### Can a New Staff Member Log Their First Fertigation in Under 60 Seconds?

**Current answer: No.** The path is Today → "Apply" (hub) → "Fertigation" → select batch from list → fill 3 required fields → save. At a minimum this is 30-40 seconds with no errors, and probably 90+ seconds for a first-time user who doesn't know batch terminology.

**With proposed Today screen:** Today → inline "💧 Log" on batch card → FertigationNew with locked batch → 3 fields → save. 20-30 seconds achievable.

### Critical Features More Than 2 Taps From Today

| Feature | Current Tap Count | Problem |
|---------|-------------------|---------|
| Recipe Library | 3+ taps (URL required) | No NavBar path |
| Crop Inputs | 4+ taps (URL required) | No NavBar path |
| REI Dashboard | 1 tap (Today red banner) when active; URL only when no active REI | Acceptable |
| Compliance / Reports | 3+ taps via Apply → ApplicationsHub | Not visible to daily growers |
| Observations Log | 2 taps (Observe → ObservationLog) | Acceptable |

---

## Section 4: Form Design Critique

### FertigationNew.jsx — Field Grade: A

**Field order:** Batch → recipe display → volume → EC → pH → optional fields. Correct for field use — most critical measurements are at top.

**Pre-fill:** Excellent. Locked batch, active recipe, EC/pH targets displayed inline, sensor auto-fill for ambient conditions. Volume from Mix Calculator via sessionStorage. Applicator pre-filled from auth.

**Input types:** All numeric fields use `inputMode="decimal"`. ✓

**Keyboard avoidance:** Fixed save button at `bottom-20` (above NavBar) — stays visible even when keyboard covers lower portion of screen. ✓

**Voice input:** Notes field has no voice input. **Gap**: add `useVoiceInput` hook (already implemented in ObservationNew) to the notes textarea.

**Error recovery:** Draft persists on 3s debounce, online recovery works. `Failed to fetch` → shows pending sync indicator. ✓

**Confirmation:** Green flash + "Saved · Synced" toast + navigate after 1.2s. ✓

**Specific improvements:**
- Add "last-used EC/pH" suggestion chips below each field when the batch was fertigated recently (reduces typing for consistent measurements)
- Move the "Optional fields" accordion to be open by default when sensor auto-fill has populated ambient temp/RH, so operator can see the values that were filled for them
- Add voice input to notes

---

### FoliarNew.jsx — Field Grade: A

**Field order:** Batch/container → purpose → product → rate/volume → optional. Purpose chips first is correct — determines what product category to show.

**Pre-fill:** Good. Batch locked from URL param. Container_id pre-fills target. Applicator from auth.

**Gap:** Purpose chip buttons are `minHeight: '36px'` — below 44pt minimum. For gloved use these are too small.

**Gap:** No "Calculate mix" link to MixCalculator (FertigationNew has this — add the same pattern).

**Gap:** EPA redirect works by message detection from 422, but the UX of "you picked the wrong form" is jarring. Better: show a non-destructive banner "This product is EPA-registered. Tap here to switch to Pesticide Application →" with the ability to save draft and transfer.

**Specific improvements:**
- Purpose chips: minHeight 36→48px
- Add MixCalculator link when `foliar_recipe_id` is selected
- Replace hard EPA redirect with a soft banner + option to switch (preserving already-entered rate/volume data)

---

### PesticideNew.jsx — Field Grade: B

This is the most complex form in the app and handles it well overall. Key strengths: Skill Validation Panel (real-time precondition badges), REI preview, PHI check, full-screen REI modal after save.

**Field order:** Batch → product → lot → RUP license (conditional) → target → pest → rate → volume → method → environmental → optional. This order is good but produces a very long form.

**Critical gap — no offline handling:** The save handler has no `Failed to fetch` detection. A network error during save shows a generic error; the draft is preserved but the operator sees a failure message with no indication it was saved locally. For a compliance-critical pesticide record, this is serious. The form must follow the same pattern as FertigationNew (detect network errors, show "Saved locally · Pending sync").

**Gap — Lot ID field usability:** The lot ID is a numeric database ID (`input_lot_id`) that the operator must know in advance. This requires operators to look up the lot number in farmstock before logging the application. A better UX: show a lot picker sheet (similar to the product picker) that lists available lots for the selected product with lot number, expiration, and quantity on hand.

**Gap — Pest chip touch targets:** COMMON_PESTS chips use `minHeight: '36px'`. Increase to 44px.

**Gap — Wind direction chips:** Same issue — 36px chips.

**Positive note:** The SkillValidationPanel is a genuinely excellent field UX addition — precondition badges load immediately after batch selection and tell the operator exactly what's blocking their application before they fill 10+ fields.

**Specific improvements (ranked by field impact):**
1. Add `Failed to fetch` offline detection (P0 — compliance risk)
2. Replace lot ID text field with a lot picker sheet showing lot#/expiry/qty (P1)
3. Pest chips: 36→44px (P2)
4. Wind direction chips: 36→44px (P2)
5. Add "What does this block mean?" expandable explanation to SkillValidationPanel blocked checks (P2)

---

### ObservationNew.jsx — Field Grade: A

**Standout feature:** Voice input implemented via `useVoiceInput` hook — long-press notes field opens speech recognition. This is the one form that implements voice input correctly.

**Pre-fill:** Strong. Batch from URL, container from URL, category pre-selectable from URL, applicator from auth.

**Harvest readiness mode:** Category pre-set to `harvest_readiness`, maturity_pct slider shown, ready/not-ready toggle. ReadinessSummary component shows row progress after logging. ✓

**Field order:** Batch → row/container target → category chips → severity chips → note → optional fields. Correct for field use.

**Gap:** ReadinessSummary only appears after form save — not accessible without logging. Consider showing the running readiness count at the top of the form when in `harvest_window` mode.

**Gap:** Maturity pct input — verify `inputMode="numeric"` on the number input (if used) or range slider has visible numeric display.

---

### WasteTrimForm.jsx — Field Grade: A

Well-designed for field use. Chips for trim_reason, single numeric weight input, draft persistence, offline detection, fixed save button. 

**Gap:** No container/row pre-fill path from ContainerDetail (must navigate from HarvestDashboard which passes only batch_id).

---

### FinalHarvestForm.jsx — Field Grade: C

**Strength:** Tag verification step is correct — large font display of last 4 digits, explicit confirm/mismatch buttons. This is the right safety design.

**Critical gap 1 — No draft persistence.** Tag confirmation + product type + weight + notes = 4+ fields. If the operator confirms the tag, enters the weight, and the network drops before save, the draft is lost. Must add `cv_draft_final_harvest_${batchId}_${assignmentId}`.

**Critical gap 2 — No offline handling.** A failed network during final harvest produces a generic error. The operator may try again and create a duplicate. Add offline detection: if network error, show "Save failed — network issue. Do NOT tap Save again until you verify no record was created." This is the most important offline gap in the app.

**Critical gap 3 — Weight unit buttons are 32px.** The weight unit selector (g/oz/lb) uses `minHeight: '32px'` — impossibly small for gloved operation.

**Gap 4 — autoFocus on weight input may clash with tag verification.** The weight field has `autoFocus` but only appears after tag confirmation. On mobile, this triggers the keyboard immediately after confirmation — the operator may not have seen the product type chips. Consider removing autoFocus or delaying it.

**Specific improvements:**
1. Draft persistence (P0)
2. Offline detection with "do not retry" warning (P0)
3. Weight unit buttons: 32→48px (P1)
4. Remove or delay autoFocus on weight field (P2)

---

### PartialHarvestForm.jsx — Field Grade: C

Same issues as FinalHarvestForm minus the tag verification step. Missing draft persistence, missing offline detection. Weight unit buttons need verification — likely same 32px pattern from copied code.

---

### PlantLossForm.jsx — Field Grade: B

**Strength:** Well-optimized for speed. Chip selection for loss_type, draft persistence, fixed save button.

**Gap:** No offline detection. A plant loss must be recorded even with spotty WiFi — losing this record has METRC consequences (unsynced losses pile up).

**Gap:** Plant disposition picker — "composted | incinerated | quarantined | tested | other" is an important compliance field but adding it as required makes the 3-tap target impossible. Make it optional (saved as 'collected' by default) with a fast "quick update" action from ContainerDetail to set disposition later.

---

### AmendmentNew.jsx — Field Grade: A

Well-designed. Has draft persistence, offline detection, chip selections for amendment_type and application_method. Container pre-filled from URL.

**Gap:** From BatchDetail, the amendment link does not pass `?batch_id=` — this is the well-documented CRITICAL bug. The fix is one line: `to={'/applications/amendments/new?batch_id=${batch.batch_id}'}`.

---

## Section 5: Sensor Integration UX Opportunities

SensorPush integration is implemented and provides ambient_temp_f, humidity_rh, dew_point_f, and VPD per sub-zone assignment.

### Forms Where Sensor Auto-Fill Is Active

| Form | Auto-fills | Status |
|------|-----------|--------|
| `PesticideNew.jsx` | ambient_temp_f, ambient_rh | ✓ Wired via `useCurrentConditions` + fallback from skill validate endpoint |
| `FertigationNew.jsx` | ambient_temp_f, ambient_rh | ✓ Wired (in Optional section — hidden by default) |
| `HarvestDashboard.jsx` | harvest batch ambient_temp_f, ambient_rh | ✓ Wired (in collapsible conditions section) |

### Where Auto-Fill Should Be Added

| Form | Environmental Fields | Recommended Action |
|------|---------------------|-------------------|
| `FoliarNew.jsx` | ambient_temp_f, ambient_rh | Add useCurrentConditions hook — same pattern as PesticideNew |
| `ObservationNew.jsx` | No environmental fields needed | No action |
| `WasteTrimForm.jsx` | No environmental fields | No action |
| `FinalHarvestForm.jsx` | No environmental fields | No action (harvest conditions captured on harvest_batch) |

### CurrentConditionsCard Placement

**Current placements:**
- Today.jsx: one card per sub-zone from active batches (collapsed on mobile by default)
- BatchDetail.jsx: below METRC identity card when sub_zone_id is set

**Missing placement:** ContainerScanner.jsx — when the operator opens the scan view, showing a compact conditions bar for each occupied sub-zone would let them make IPM decisions before starting a row walk without navigating away.

**VPD alerts during field work:** The ComplianceDashboard shows VPD alerts, but this is not surfaced during active field operations. Recommendation: When VPD is out of range for any active batch's sub-zone, show a persistent amber banner on the Today screen (above batch cards, below REI banner) rather than only in the compliance dashboard. Format: "⚠ Z1A VPD high — 2.3 kPa (optimal: 1.0–1.8)".

### Today Screen Conditions Panel Recommendation

The CurrentConditionsSection is collapsed by default on mobile (`hidden md:block`). This means operators walking the field — where conditions matter most — must manually expand it each time. **Invert the default:** expand on mobile, collapse on tablet (where more screen real estate is available and the batch list competes less for space).

Additionally, today the conditions section appears _after_ the Quick Actions grid in the DOM order. Given that out-of-range VPD should drive the operator's IPM decisions for that day, move conditions to _before_ Quick Actions when any sub-zone shows VPD out of range.

---

## Section 6: Harvest Workflow UX

### HarvestDashboard Assessment

**What works:**
- Plant list grouped by container is the right structure for field use
- Final harvested counter (N/Total) at top right provides immediate progress feedback
- METRC batch name copyable via tap
- Clear visual states per assignment (active=green, harvested=gray)
- Waste trim link is prominent

**Issues:**

1. **"Manicure Batch (MB)" terminology.** CLAUDE.md explicitly prohibits the term "manicure" in the UI. The create button says "Create Manicure Batch (MB)" and the card header says "Manicure Batch (MB)". Must change to "Partial Harvest Batch" or "PHB".

2. **Supervisor prerequisite blocks field workers.** A grower who arrives to harvest a plant sees "No HB active" or "No MB active" placeholders on every plant card. They cannot proceed until a supervisor creates the harvest batch. In practice, the supervisor should create these before the harvest crew starts — but there is no alert or reminder on Today or BatchDetail telling the supervisor to do this. Add a "Harvest batch needed — tap to create" action on BatchDetail when status is `harvesting` and no active harvest batch exists.

3. **Scrolling through 30+ containers.** When a batch has 150 containers (Z1A full), finding a specific container in the plant list requires scrolling. Add a search/filter field at the top of the plant list: "Filter by container or tag last-4". The filter is 1 field that eliminates scrolling for targeted harvest work.

4. **Partial harvest vs. final harvest button sizes are 44px.** These are active-harvest buttons that will be tapped dozens of times during a harvest session. Increase to 56px minimum.

5. **No progress by row.** The plant list is a flat list by container. During harvest, operators work row-by-row. A row-grouped view with collapse/expand ("Z1-A-R1 — 28/30 harvested") would match the physical workflow better.

### Tag Verification Assessment

The tag verification step in FinalHarvestForm is well-designed:
- 5xl font for the last 4 digits — clearly legible in sunlight
- Both "confirm match" (green, prominent) and "mismatch — investigate" (red, border-only) buttons present
- Logical flow: context card → tag step → form fields

**Gap:** When a container has no METRC tag assigned (`hasTag = false`), the fallback path shows an amber warning and a separate "I acknowledge — no tag" button. This path appears twice (lines 202-210 have a duplicate condition that may render the button when `!hasTag && !tagConfirmed`). Verify there's no UI glitch in this edge case.

**Gap:** No way to navigate to the METRC tag assignment flow from FinalHarvestForm. If the operator discovers the container has no tag at harvest time, they should be able to tap "Assign tag now →" and return to complete the harvest. Currently they must navigate away manually.

### Multi-Plant Container (plants_per_container > 1)

HarvestDashboard correctly renders all assignments per container in a nested list. When a container has 2 plants (common for autoflowers), both appear with their own Partial/Final Harvest buttons. This is correct.

**Gap:** In ContainerDetail, the harvest button logic uses `harvestCtx?.plant_assignments?.filter(a => a.container_id === containerId && a.unassigned_at === null)` to find assignments. When there's more than one active assignment, ContainerDetail navigates the user to HarvestDashboard. The user-facing message for this case should clearly explain why ("Multiple plants in this container — select which to harvest in the Harvest Dashboard").

### Weather Event Force-Close Discoverability

The "Force Close" button is visible on each in-progress harvest batch card in HarvestDashboard, but only to supervisors. This is the correct gate. The button is small (`minHeight: '40px'`) — increase to 48px for gloved use.

The WeatherEventClose form requires `close_notes` (minimum 20 chars) — good compliance gate. But the form does not explain what happens after force-close (new harvest batch is created). Add a summary: "This will create a new Harvest Batch (#2) for the remaining unharvested plants."

### Proposed Active Harvest Mode

A dedicated mode for working through a row of containers during harvest, accessible from HarvestDashboard:

**Entry:** HarvestDashboard → "Start Row Walk" → select row (e.g., Z1-A-R1)

**Mode layout:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━
  Row Z1-A-R1 · 30 containers
  ◀ C12 (12/30) C14 ▶
━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  Tag: …6789 ✓  [Flower ▼]  [Weight: ___g]
  
  [⬅ Skip] [✂ Partial Harvest] [✗ Final Harvest]

  Progress: ████████████░░░░ 12/30
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Features:
- Swipe left/right or ◀▶ buttons to advance between containers in row order
- Tag display at top (last 4 — operator confirms visually)
- Product type selector pre-fills from previous container (most common pattern)
- Weight input auto-focused, numeric keyboard
- Partial/Final harvest buttons are full-width at bottom
- "Skip" for already-harvested or empty containers
- Progress bar shows row completion
- Auto-saves and auto-advances on save

This mode would bring a 30-container row harvest from 30×5 = 150 taps to approximately 30×3 = 90 taps, and requires no scrolling.

---

## Section 7: Compliance Workflow UX

### ComplianceDashboard Assessment

**Layout:** 8 RAG-status panels in a grid. Panels include active REIs, PHI watch, METRC sync, untagged plants, missing UIDs, unsynced losses, waste pending disposal, environmental alerts.

**For daily staff monitoring:** The overall status banner (GREEN/AMBER/RED) at the top is effective. Staff can glance at it and know if anything needs attention. However, the 8-panel detail is too much for a quick daily check — it reads like a supervisor dashboard.

**For inspector handoff:** Better. Inspectors can see at a glance which compliance dimensions are current. However, the panel labels use internal terminology ("cv_plant_assignments", "REI active") that an OCM inspector would not recognize. Replace internal labels with plain-language equivalents ("Active re-entry intervals", "Plants needing METRC tags").

**Report production time:** Not benchmarked. The compliance dashboard makes 3 API calls in parallel (Promise.all). The cultivation record JSON download is a client-side Blob from the API call result — no separate file generation needed. For large batches (150+ plants, full season of applications), the cultivation record API call may be slow. Add a loading indicator and time-out handling for calls > 10 seconds.

**Print formatting:** MetrcExport and MdaReport produce CSV downloads. CultivationRecord produces JSON. None produce a print-ready PDF. Per CLAUDE.md Feature 13, the cultivation record should be a "PDF designed for regulator handoff." The current JSON download is not suitable for physical handoff. This is a Phase 1 gap noted in the backlog.

### Recommendations

- ComplianceDashboard: Add a "Print Summary" button that formats the 8 panels as a letter-sized PDF using the earthy palette (Fraunces headers, JetBrains Mono for numbers)
- Replace internal terminology with plain English in panel titles and body text
- Add a "Pre-Harvest Checklist" page (CLAUDE.md §OCM reporting) accessible from BatchDetail when status is `harvest_window` — a 7-item checklist that confirms the batch is ready for harvest from a compliance standpoint

---

## Section 8: Tablet vs. Phone Layout Gaps

### Current State

All pages render a single-column layout with a `max-w-2xl mx-auto` container. On tablet (768px+), this means a 672px content column centered in a wider viewport with unused space on both sides. There are no split-pane layouts, no multi-column forms, and no tablet-specific interaction patterns.

The one concession to tablet: `Today.jsx` uses `hidden md:block` to auto-expand the CurrentConditionsSection on tablet. Everything else is identical across form factors.

**This means:** A tablet user working through a 30-container harvest row sees the same scrolling list as a phone user. There is no productivity gain from the larger screen.

### Where Split-Pane Would Meaningfully Help

| Page | Phone Layout | Recommended Tablet Layout |
|------|-------------|--------------------------|
| `HarvestDashboard` | Harvest batches (scroll) → plant list (scroll) | Left pane: harvest batch status + controls. Right pane: plant list (no scroll needed for 30 containers). |
| `BatchDetail` | Tabs/sections stacked | Left: batch info + status. Right: activity feed (applications, observations). |
| `ObservationNew` | Full-screen form | Left: batch context + row map (containers color-coded). Right: observation form. |
| `ContainerDashboard` | Card grid (mobile) | Full 8-column grid showing all containers in a sub-zone at once on a 10" tablet. |

### Inspection Mode Status

Per CLAUDE.md Feature 22 (Phase 2), Inspection Mode is not yet implemented. The spec calls for:
- Container grid view as large tap buttons
- Swipe right to advance between containers
- Long-press for photo capture
- Status colors per container (green/amber/red)

The closest existing feature is the plant list in HarvestDashboard, but it's a scrollable list, not a swipeable grid. The "Active Harvest Mode" proposed in Section 6 of this document would fulfill the harvest-specific variant of Inspection Mode.

For a 30-container row walk in under 5 minutes, Inspection Mode is essential. At current throughput (6-7 taps per observation), 30 containers = 180-210 taps = 10+ minutes. With swipe-based Inspection Mode at 2 taps per container (category + severity), 30 containers = 60 taps = 3-4 minutes. **This is the highest-leverage Phase 2 feature.**

---

## Section 9: Offline and Sync UX

### What's Implemented

**Draft persistence (offline writing, not syncing):**
- FertigationNew, FoliarNew, PesticideNew, AmendmentNew, ObservationNew, PlantLossForm, TeardownForm, StartupForm, WasteTrimForm: ✓ localStorage draft on 3s debounce

**Network error detection (partial offline handling):**
- FertigationNew, FoliarNew, AmendmentNew, ObservationNew, WasteTrimForm: ✓ detect `Failed to fetch`, show "Saved locally · Pending sync" indicator, preserve draft

**Missing network error detection:**
- PesticideNew: generic error message on network failure (P0 — compliance risk)
- PlantLossForm: generic error (METRC consequence)
- All harvest forms: generic error
- TeardownForm, StartupForm, SoilSampleForm: generic error

### Critical Gap: "Pending sync" is cosmetic

The current implementation shows a "Saved locally · Pending sync" banner but does not actually queue the record for retry. If the user closes the app, the draft is preserved but the record is not sent. When they reopen the app, the banner is gone and they may not realize the record was never saved to the server.

**What's needed (Phase 2):** A proper sync queue using IndexedDB (or a simple queue table in SQLite via the native app layer) that retries on connection restoration. Until Phase 2, the "pending sync" UX is misleading — it should say "Failed to save — tap to retry when online" to avoid false confidence.

### What Happens When Connection Drops Mid-Form

**Scenario:** Applicator is filling PesticideNew. They've selected the product, entered the lot, pest, rate, environmental conditions. They tap Save. Network drops mid-request. Current behavior: generic "Failed to save" error. Draft preserved. No indication whether the record was partially committed.

**Better behavior:**
1. Detect network error (check `e.message.includes('Failed to fetch') || e.message.includes('NetworkError')`)
2. Show: "Network lost — record NOT saved. Draft preserved. Tap Save when connected."
3. Preserve draft with explicit "unsaved" status
4. When connection restores (navigator.onLine change event), prompt: "Connection restored — tap to retry your pesticide application."

### Sync Status Indicator

The Today screen has no global sync status indicator. Per CLAUDE.md Rule 4: a small sync status indicator showing queue depth and last successful sync time should be persistent.

**Recommendation:** Add a sync status chip below the date header on Today: `● Synced 2m ago` (green) / `● 3 pending` (amber) / `● Sync failed` (red, with retry tap). Small, unobtrusive, but always present.

---

## Section 10: Prioritized Improvement Roadmap

### P0 — Field-Breaking Issues (must fix before real-world use)

| ID | Page/Component | Issue | Fix | Effort |
|----|---------------|-------|-----|--------|
| P0-01 | `Today.jsx:59,63` | Silent API failures — empty screen on API down | Add error state to both catch blocks: `setReiError` / `setBatchError` with retry button | S |
| P0-02 | `BatchDetail.jsx:387` | Amendment link missing `?batch_id=` — amendments logged with no batch context | Change `to={'/applications/amendments/new'}` to `to={'/applications/amendments/new?batch_id=${batch.batch_id}'}` | S (one line) |
| P0-03 | `PesticideNew.jsx:572-584` | No offline detection — pesticide records silently fail on network error | Add `Failed to fetch` detection identical to FertigationNew; show "Saved locally · Pending sync" | S |
| P0-04 | `ContainerDetail.jsx` | No REI pre-entry check — scanning into REI zone shows record with no warning | On mount, check `api.getPesticideApplications({rei_active:'1', container_id})`, show `REIConfirmModal` if active | M |
| P0-05 | `ContainerScanner.jsx` | No REI check after successful QR scan | Before navigating to ContainerDetail, query REI status for scanned container's sub-zone; show full-screen warning if active | M |
| P0-06 | `FinalHarvestForm.jsx` | No offline detection + no draft persistence — compliance-critical, high data-loss risk | Add offline detection with "do not retry" warning; add `cv_draft_final_harvest_${batchId}_${assignmentId}` | S |
| P0-07 | `Today.jsx:267-302` | RecentApplications shows fertigation only — misleads operators about what was logged | Replace with unified recent activity (last 8 items across all 4 application types) | M |
| P0-08 | `HarvestDashboard.jsx:263-272` | "Manicure Batch (MB)" terminology — prohibited by CLAUDE.md | Replace with "Partial Harvest Batch (PHB)" everywhere in UI | S |
| P0-09 | `Today.jsx` | Missing lifecycle action items (teardown/startup/soil samples/unsynced losses) | Add "Pending Actions" section with 4 API calls | M |

### P1 — Significant Friction (fix before first growing season)

| ID | Page/Component | Issue | Fix | Effort |
|----|---------------|-------|-----|--------|
| P1-01 | `NavBar.jsx:10` | Touch targets ~40px — below 56pt gloved minimum | Increase `py-2 pt-1` → `py-3`, add `minHeight: '60px'` to nav container | S |
| P1-02 | `NavBar.jsx` | 7 items crowding, "Logout" taking primary slot | Collapse to 5 primary items + "More ···" sheet; move Logout to More menu | M |
| P1-03 | `batches/BatchNew.jsx` | No draft persistence (6-field form) | Add `cv_draft_batch_new` localStorage persistence | S |
| P1-04 | `harvest/PartialHarvestForm.jsx` | No draft persistence, no offline detection | Add `cv_draft_partial_harvest`, add network error handling | S |
| P1-05 | `harvest/FinalHarvestForm.jsx:266-278` | Weight unit buttons `minHeight: '32px'` | Change to `minHeight: '48px'` | S |
| P1-06 | `harvest/FinalHarvestForm.jsx` | No draft persistence | Add `cv_draft_final_harvest_${batchId}_${assignmentId}` | S |
| P1-07 | `containers/PlantLossForm.jsx` | No offline detection | Add `Failed to fetch` detection — METRC sync consequences | S |
| P1-08 | Navigation | Recipes and Crop Inputs unreachable from NavBar | Implement "More ···" overflow menu in NavBar | M |
| P1-09 | `batches/BatchNew.jsx` | No success toast after save | Add green flash + "Batch created ✓" toast before navigate | S |
| P1-10 | `batches/BatchDetail.jsx` | No feedback on phase transition or recipe assignment | Add toast: "Moved to Field — Veg ✓" / "Recipe assigned ✓" | S |
| P1-11 | `batches/BatchDetail.jsx:424` | "Advance Phase" button not sticky — buried under scroll | Make button `position: sticky, bottom: 80px` when batch is not closed | S |
| P1-12 | `containers/SoilSampleForm.jsx` | No draft persistence (5+ fields) | Add `cv_draft_soil_sample_${containerId}` | S |
| P1-13 | `Today.jsx` | Current Conditions collapsed by default on mobile | Invert default: expanded on mobile, collapsible. Add VPD alert banner above Quick Actions when out of range | S |
| P1-14 | `recipes/FertigationRecipeEdit.jsx`, `FoliarRecipeEdit.jsx` | No draft persistence on long-form recipe editor | Add `cv_draft_recipe_fert_${id}` / `cv_draft_recipe_foliar_${id}` | M |
| P1-15 | `PesticideNew.jsx` | Lot ID is a raw numeric field requiring prior DB lookup | Replace with lot picker sheet showing lot#, expiry, qty on hand | M |
| P1-16 | `applications/FoliarNew.jsx` | Missing `useCurrentConditions` auto-fill for ambient conditions | Wire `useCurrentConditions` hook same as PesticideNew | S |
| P1-17 | `HarvestDashboard.jsx` | Plant list lacks container search/filter | Add search field: filter plant list by container ID or tag last-4 | S |
| P1-18 | `HarvestDashboard.jsx` | Harvest/Partial Harvest buttons are 44px | Increase to 56px per Rule 1 | S |
| P1-19 | `HarvestDashboard.jsx` | No warning when no harvest batch exists (blocks all growers) | Add "Create Harvest Batch" action item to BatchDetail Today card when status is `harvesting` and no active HB | M |

### P2 — Polish (ongoing improvement)

| ID | Page/Component | Issue | Fix | Effort |
|----|---------------|-------|-----|--------|
| P2-01 | `FoliarNew.jsx`, `PesticideNew.jsx` | Purpose/pest chips at 36px | Increase to 44px | S |
| P2-02 | `FoliarNew.jsx` | No MixCalculator link | Add same "Calculate mix →" link as FertigationNew | S |
| P2-03 | `FertigationNew.jsx`, `FoliarNew.jsx` | Notes field has no voice input | Add `useVoiceInput` hook (already in ObservationNew) | S |
| P2-04 | All log pages | Empty states not verified | Add "Log your first X →" CTA on empty log pages | S |
| P2-05 | `HarvestDashboard.jsx` | Plant list flat — no row grouping | Group containers by row with collapse/expand headers | M |
| P2-06 | `Today.jsx` | "View all →" near Active Batches is ~20px | Wrap in button with minHeight: '44px' | S |
| P2-07 | `ComplianceDashboard.jsx` | Internal terminology in panel labels | Replace cv_ table names with plain language | S |
| P2-08 | `PesticideNew.jsx` | SkillValidationPanel blocked reasons not expandable | Add "Learn more →" on each blocked check | S |
| P2-09 | `FinalHarvestForm.jsx` | No link to assign METRC tag when plant is untagged | Add "Assign tag now →" navigation from untagged warning | S |
| P2-10 | `Today.jsx` | No global sync status indicator | Add sync chip below date header | S |
| P2-11 | `HarvestDashboard.jsx` | Weather event force-close button at 40px | Increase to `minHeight: '48px'` | S |
| P2-12 | `containers/ContainerScanner.jsx` | No sub-zone conditions visible from scan view | Add compact conditions bar to scanner overlay | M |

### P3 — Future Enhancements (Phase 2+)

| ID | Feature | Value | Effort | Phase |
|----|---------|-------|--------|-------|
| P3-01 | **Inspection Mode** — swipeable container grid for row walks | Highest-leverage UX improvement in the app. 30-container row in 5 min | L | 2 |
| P3-02 | **Active Harvest Mode** — streamlined per-row harvest carousel | Reduces harvest session taps by 40% | L | 2 |
| P3-03 | **Split-pane layouts for tablet** — HarvestDashboard, BatchDetail | Meaningful productivity gain on 10" tablets used in field | L | 2 |
| P3-04 | **Sub-zone Field Maps** — visual grid showing container status | Makes REI/PHI status spatial and intuitive | M | 2 |
| P3-05 | **IndexedDB sync queue** — actual offline retry, not cosmetic | Fixes the "pending sync" false confidence problem | XL | 2 |
| P3-06 | **Voice input on all notes fields** | Extends ObservationNew's voice input to other forms | M | 2 |
| P3-07 | **Bulk METRC tag assignment mode** — scan-loop workflow | Saves hours during initial batch setup | M | 2 |
| P3-08 | **PDF cultivation record** — print-ready for regulator handoff | Required for compliance; currently JSON only | L | 2 |
| P3-09 | **"Quick Observe" micro-form on ContainerDetail** | 3-tap observation without leaving container record | M | 2 |
| P3-10 | **Pre-harvest compliance checklist** on BatchDetail | 7-item gate before harvest begins | M | 2 |

---

## Section 11: Quick Wins

Ten changes estimated at under 2 hours each with high field impact. Queue these as a single Felix implementation task.

| # | Change | File:Line | Impact | Estimated Time |
|---|--------|-----------|--------|----------------|
| 1 | **Amendment link adds batch_id** | `BatchDetail.jsx:387` — add `?batch_id=${batch.batch_id}` to amendment link | Every batch-context amendment now has correct batch association — prevents compliance gap | 5 min |
| 2 | **Today.jsx error states** | `Today.jsx:59,63` — add `setBatchError` / `setReiError` to catch blocks; render error banner with retry | Operators see a real error instead of an empty screen when API is down | 20 min |
| 3 | **NavBar touch targets** | `NavBar.jsx:10` — change `py-2 pt-1` to `py-3`; add `style={{ minHeight: '60px' }}` to nav wrapper | NavBar usable with gloves | 5 min |
| 4 | **PesticideNew offline detection** | `PesticideNew.jsx:572` — add `if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) { setPendingSync(true); ... }` | Pesticide records preserved on network drop | 15 min |
| 5 | **FinalHarvestForm weight unit buttons** | `FinalHarvestForm.jsx:266` — change `minHeight: '32px'` to `minHeight: '48px'` | Weight unit picker usable with gloves | 2 min |
| 6 | **HarvestDashboard "Manicure" → "Partial Harvest Batch"** | `HarvestDashboard.jsx:120,263,264,297,299` — replace all "Manicure Batch (MB)" strings | Terminology compliance with CLAUDE.md | 5 min |
| 7 | **BatchNew success toast** | `BatchNew.jsx` — add green flash + "Batch created ✓" toast before navigate | Visual confirmation batch was saved | 15 min |
| 8 | **BatchDetail phase transition toast** | `BatchDetail.jsx` — add `setToast({ message: 'Moved to ${status} ✓', type:'success' })` after successful transition | Applicators know the transition succeeded | 15 min |
| 9 | **Batches.jsx button touch target** | `Batches.jsx:87` — change `minHeight: '44px'` to `minHeight: '56px'` on "+ New Plant Batch" button | Consistent with gloved-use standard | 2 min |
| 10 | **Today conditions expanded by default on mobile** | `Today.jsx:251` — change `hidden md:block` to `block` on conditions section; add collapse toggle for mobile | Operators see VPD without manually expanding each session | 10 min |

**Total estimated implementation time: ~90 minutes**  
**Recommended deployment:** Single commit "fix: field UX quick wins (P0/P1 one-liners)" after unit test pass.

---

## Appendix: Mapping to CLAUDE.md Hard UX Rules

| Rule | Description | Current Status |
|------|-------------|----------------|
| 1. Touch targets ≥56pt | All interactive elements 56px+ | **PARTIAL** — NavBar (~40px), Batches.jsx new button (44px), harvest unit buttons (32px), pest/purpose chips (36px) |
| 2. Primary actions in thumb zone | Save/submit at bottom | ✓ All form pages use `fixed bottom-20` pattern |
| 3. Auto-save on blur / 3s inactivity | Draft persistence on 3+ field forms | **PARTIAL** — FertigationNew/Foliar/Pesticide/Amendment/Observation/PlantLoss/Teardown/Startup/WasteTrim ✓; BatchNew/RecipeEdit/SoilSample/PartialHarvest/FinalHarvest/PlantReplacement ✗ |
| 4. Offline-first | Entry succeeds locally, queues for sync | **PARTIAL** — Most application forms show "pending sync" banner; FinalHarvest/Pesticide/PlantLoss/harvest forms do not detect network errors |
| 5. Pre-fill from context | Applicator, timestamp, recipe, last-used values | ✓ All application forms pre-fill applicator and timestamp; FertigationNew pre-fills recipe; sensor auto-fill for temp/RH |
| 6. Controlled vocabulary over free text | Pickers, chips, tag selectors | ✓ Most forms use chips for categories, severities, methods |
| 7. Numeric keypad inputs | `inputMode="decimal"` or `"numeric"` | ✓ All reviewed numeric fields use correct inputMode |
| 8. Visual feedback on save | Haptic, color change, toast, 2s auto-dismiss | **PARTIAL** — Application forms ✓; BatchNew/BatchDetail transitions ✗ |
| 9. Three-tap maximum for most common task | Fertigation: see Section 2 | **NOT MET** — Current minimum is 4 taps from BatchDetail, 7 from Today |
| 10. High contrast (7:1 minimum, WCAG AAA) | Text-to-background contrast | Not verified — needs accessibility audit |
| 11. No modal stacks | One modal at a time | ✓ No stacked modals detected |
| 12. REI alerts full-screen modals | Full-screen, explicit dismissal required | **PARTIAL** — PesticideNew post-save ✓; ContainerDetail/ContainerScanner on REI-active scan ✗ (P0-04, P0-05) |
| 13. Photo capture from every screen | Camera icon in persistent toolbar | ✗ Not implemented — photo URLs are accepted in forms but no persistent camera button exists in any toolbar |
| 14. Voice input for notes | Long-press → speech transcription | **PARTIAL** — ObservationNew ✓; all other note fields ✗ |
| 15. Persistent context breadcrumb | "Batch · Strain · Sub-Zone" always visible | **PARTIAL** — All `*New.jsx` forms show a locked batch card or batch picker at top; no persistent breadcrumb across all screens |

---

*Analysis produced: 2026-05-21. Based on direct code review of all 53 JSX pages and 3 components, prior audit docs (audit-frontend-ux.md, audit-api-security.md, backlog.md), and the Field UX Requirements section of CLAUDE.md.*
