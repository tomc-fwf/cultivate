# Cultivate — Phase 2–4 Roadmap and Feature Specifications

**Prepared:** 2026-05-21  
**Status:** Planning document — implementation follows Phase 1 stabilization  
**Scope:** Concrete specifications for Phase 2 (Field Operations Enhancement), Phase 3 (Intelligence), and Phase 4 (METRC API Integration)  
**Prerequisite reading:** `docs/audit-api-security.md`, `docs/audit-frontend-ux.md`, `docs/audit-regulatory-compliance.md`, `docs/metrc-integration-design.md`

---

## Phase 1 Critical Fixes (Gate Before Phase 2 Begins)

The following audit findings must be resolved before Phase 2 starts. They are correctness and compliance bugs, not enhancements:

| Fix | File | Impact |
|-----|------|--------|
| **C1** Remove DELETE endpoints from application tables | `fertigation-applications.ts`, `foliar-applications.ts`, `pesticide-applications.ts` | Violates 5-year retention (Business Rule 5) |
| **C2** Expand recipe ingredients in exports | `exports.ts` — METRC additives + cultivation record | Regulators need ingredient-level detail |
| **C3** Fix MDA report: add time-of-day, add lot_number | `exports.ts` | Statute 18B.37 requires time; lot traceability missing |
| **C4** Add METRC UID gate before harvest events | `harvest.ts` | Business Rule 6 — warn but allow; must surface prominently |
| **C5** Bulk container → teardown on batch auto-close | `harvest.ts` | Business Rule 34 — currently only the harvested container transitions |
| **C6** Fix BatchDetail amendment link missing `?batch_id=` | `BatchDetail.jsx:387` | Amendments logged from batch context have no batch association |
| **C7** REI pre-entry check in ContainerDetail + ContainerScanner | `ContainerDetail.jsx`, `ContainerScanner.jsx` | Full-screen REI warning required (Business Rule 20, UX Rule 12) |
| **C8** Fix `api.getItems()` pointing to wrong URL | `client/src/api.js` | `/api/items` → `/api/catalog/items` |
| **H7** Add `GET /api/auth/users` auth middleware | `auth.ts` | Unauthenticated user enumeration (CRITICAL security) |

---

## Phase 2 — Field Operations Enhancement

### Overview

Phase 2 transforms the app from a data-entry tool into a fully field-native system. The core additions are: spatial views of container grids, a gesture-driven row-walk mode, robust offline operation, and bulk workflows for high-volume operations (METRC tagging, teardown/startup). Estimated total effort: **3 developer-weeks**.

---

### Feature 2.1 — Sub-zone Field Maps

**Goal:** Give applicators a visual, scannable view of a sub-zone's current container states without needing to open individual container records.

**Screens:** Add to route `/containers/map/:subZoneId` (e.g., `/containers/map/Z1A`). Link from ContainerDashboard and BatchDetail.

#### Visual Layout

Each sub-zone is rendered as a CSS grid — 5 rows × 29–30 containers per row. CSS grid is the right choice over SVG (no accessibility requirements for custom elements) and canvas (no native click handling or scroll).

**Mobile (≤768px):**
```
Row 1  [C1][C2][C3]...[C30]   ← scrollable horizontally if needed
Row 2  [C1][C2][C3]...[C30]
Row 3  [C1][C2][C3]...[C30]
Row 4  [C1][C2][C3]...[C30]
Row 5  [C1][C2][C3]...[C30]
```
Cell size: 36×36px minimum. Row label ("R1") pinned to left margin. Horizontal scroll within a row if viewport < 30 cells × 36px = 1,080px.

**Tablet (>768px):**
Cell size: 48×48px. Full grid visible without horizontal scroll on a 10" tablet in landscape. Cell shows position label (C1) + a small status dot.

#### Color Coding

| Container State | Color | Notes |
|----------------|-------|-------|
| `active` (healthy) | Green (`#22c55e`) | Normal operational state |
| `active` + open observation | Amber (`#f59e0b`) | Has unresolved observation (severity medium/high) |
| `active` + REI active | Red (`#ef4444`) | Pesticide REI not yet cleared — full-screen warning on tap |
| `empty` | Light gray (`#d1d5db`) | No plant, batch active |
| `teardown` | Dark gray (`#6b7280`) | Post-harvest cleanup |
| `startup` | Purple (`#8b5cf6`) | Soil rebuild in progress |
| `ready` | Blue (`#3b82f6`) | Awaiting assignment |
| `out_of_service` | Black (`#1f2937`) | Removed from rotation |

REI takes priority — an active+REI container is always red regardless of observation status.

#### Interaction

- **Tap container cell** → navigate to `/containers/:containerId` (ContainerDetail)
- **Long-press container cell** → quick action sheet: Add Observation, Log Application, Photo
- **Tap row header** → navigate to inspection mode for that row (Feature 2.2)
- **Scan button (top right)** → open ContainerScanner; after scan, app scrolls to and highlights the scanned container in the grid

#### Data Source

Primary: `GET /api/containers?sub_zone_id=Z1A` (already exists). The response needs two computed fields added at the route layer (no schema change):

```
has_open_observation  boolean  — true if any observation for this container has resolved_at IS NULL
                                  AND severity IN ('medium', 'high')
rei_active_until      string|null  — the latest rei_expires_at from active pesticide applications
                                     where rei_cleared_at IS NULL; null if no active REI
```

These are computed via a JOIN/subquery in the containers route; not stored columns.

Secondary for the legend counts: `GET /api/containers/summary?sub_zone_id=Z1A` (already exists, returns state counts). Displayed as a summary bar above the grid ("120 active · 5 empty · 2 teardown · 3 ready").

#### Performance

150 containers per A sub-zone, 145 per B. As React divs with Tailwind classes, rendering 150 static cells is ~0.5ms. No virtualization needed. Single API call returns all containers for the sub-zone. Cache for 30 seconds; invalidate on any write from the same session.

#### New Backend Work

Add `has_open_observation` and `rei_active_until` computed fields to the `GET /api/containers` route query. Both are LEFT JOINs on existing tables. Estimated: **0.5 days**.

#### Frontend Work

- `SubZoneFieldMap.jsx` — grid render, color logic, tap handlers
- `SubZoneSelector.jsx` — sub-zone picker (Z1A, Z1B, Z2A...) for the map entry screen
- Route registration in `App.jsx`
- Link from `ContainerDashboard.jsx` and `BatchDetail.jsx`

Estimated: **1.5 days**.

---

### Feature 2.2 — Inspection Mode

**Goal:** Let an applicator walk an entire row of containers, log observations and quick actions per container, and complete a 30-container row in under 5 minutes.

**Route:** `/inspect/:rowId` (e.g., `/inspect/Z1-A-R3`). Entrypoint: tap a row label in the field map (2.1), or tap "Inspect Row" button on the sub-zone map.

#### Workflow

1. App loads all containers for the row in sequence order (C1 → C30).
2. Full-screen view shows **one container at a time**: position label, current state badge, current batch/strain, last activity timestamp, any active observations.
3. Swipe right (or tap arrow) → advance to next container. Swipe left → previous.
4. Action sheet (slide up from bottom) on tap: **Observation** | **Foliar** | **Pesticide** | **Photo** | **Skip**
5. "Skip" advances without any entry. Progress bar at top: "5 / 30 reviewed".
6. After the last container: summary screen showing how many were logged vs. skipped, any flagged containers. Option to "Return to Row Map" or "Start new row."

#### Harvest Readiness Mode

Activated automatically when the current batch is in `harvest_window` status.

In this mode, the action sheet pre-selects "Observation" with `category = harvest_readiness`. The observation form shows:
- Maturity % slider (0–100, snaps to 5% increments)
- Ready to harvest? (Yes / No / Partial chips)
- Harvest priority (1–5 stars)
- Notes (voice-input supported)

After completing a row: show row summary — "Row Z1-A-R3: 24/30 ready (80%)". This feeds the readiness summary already visible in BatchDetail.

#### Swipe Implementation

Use `TouchEvent` listeners (no third-party gesture library needed — the gesture is simple enough):

```javascript
// On touchstart: record startX
// On touchend: if (endX - startX) > 50 → advance; < -50 → previous
```

CSS `scroll-snap` is an alternative but requires all containers pre-rendered; the TouchEvent approach renders one at a time and is more performant for 30 containers.

#### Landscape Orientation

When the device is in landscape, use a split-pane: container mini-grid on left (all 30 cells, colored by state), current container form on right. The selected cell highlights in the grid. This gives context for "where am I in the row" without swiping.

Portrait: full-screen single container with swipe navigation.

#### Offline Requirement

All observations and quick-entry actions logged in Inspection Mode must succeed locally even with no network. They enter the offline sync queue (Feature 2.3) rather than failing. The app shows a "Queued" badge instead of "Synced" — this is expected during a row walk.

#### New Backend Work

No new backend needed. Uses existing observation POST, foliar POST, container GET.

`GET /api/containers?row_id=Z1-A-R3` — check if this filter parameter is already supported. If not, add it (2-line change in containers route query). Estimated: **0.5 days** backend.

#### Frontend Work

- `InspectionMode.jsx` — single-container view with swipe handler, action sheet, progress bar
- `InspectionSummary.jsx` — end-of-row summary
- `InspectionHarvestReadiness.jsx` — harvest readiness form variant (can share ObservationNew logic)
- Route registration in `App.jsx`
- Links from `SubZoneFieldMap.jsx` row headers

Estimated: **2.5 days** frontend.

---

### Feature 2.3 — Offline Mode Hardening

**Goal:** Every write operation in the app succeeds locally and queues for sync. Applicators never see "network error." Sync happens automatically when connectivity returns.

This is the most architecturally significant Phase 2 feature. It touches every data-entry path.

#### Current State

As of Phase 1, forms that fail to save show an error state. `FertigationNew.jsx` and similar forms detect `'Failed to fetch'` and show "Saved locally, will sync." but do not actually persist the data — the state lives only in React memory and is lost on page reload.

#### Target Architecture

**IndexedDB** (via `idb` library) as the client-side persistence layer:

```
npm install idb
```

Structure:
```
db: 'cultivate-offline' (version 1)
  stores:
    pending_writes   — outbox for all queued API calls
    cached_data      — read-through cache for batch/container data
```

Each pending write is a record:
```
{
  id: auto-increment,
  created_at: timestamp,
  method: 'POST' | 'PATCH',
  url: string,
  body: object,
  entity_type: 'observation' | 'fertigation' | 'foliar' | 'pesticide' | 'amendment' | 'plant_loss',
  local_id: string,    — client-generated ID for optimistic UI
  retries: number,
  last_error: string|null,
}
```

#### Sync Strategy

**Background sync:** The app registers a `ServiceWorker` that uses the `BackgroundSync` API where available (Chrome/Android). Fallback: poll every 30 seconds using `setInterval` in `App.jsx` via an `OnlineContext`.

**Online detection:** `navigator.onLine` + listening to `window.addEventListener('online')`. On coming online, immediately flush the queue.

**Flush loop:**
1. Read all records from `pending_writes` ordered by `created_at ASC`
2. For each: POST/PATCH to the API. On success → delete from IndexedDB. On 4xx → mark `last_error`, do not retry (permanent failure, user must resolve). On 5xx/network error → increment `retries`, retry after exponential backoff (min 5s, max 300s).

#### Conflict Resolution

Different record types get different strategies:

| Record Type | Strategy | Rationale |
|-------------|----------|-----------|
| Observations | Last-write-wins | Additive records; duplicates are acceptable (worst case: duplicate note) |
| Fertigation applications | Last-write-wins (same applicator, same sub-zone, same ~timestamp) | Routine entries; duplicates would be obvious |
| Foliar applications | Last-write-wins | Same reasoning |
| Pesticide applications | Reject if batch state changed server-side | PHI/REI logic must be re-validated on submit |
| Batch status transitions | Reject if batch already at target state or beyond | Transitions are idempotent for same target; reject backward transitions |
| Plant loss events | Last-write-wins | Event is singular per assignment |
| Final harvest | Reject if assignment already unassigned | Duplicates are critical to prevent |

The API already returns appropriate 409/422 errors for stale-state scenarios. The sync worker maps these to "permanent failure" and surfaces them in the conflict UI.

**Conflict UI:**
A conflict resolution modal shows failed writes with:
- What was attempted ("Final harvest of Z1-A-R3-C12")  
- Why it failed ("Assignment already unassigned — plant may have been harvested by another user")  
- Options: Dismiss (discard the queued write) | View Record (navigate to container/batch)

#### UI Indicators

**NavBar sync status badge:**
- Green dot: all synced
- Amber dot + count: "3 pending"
- Red dot + count: "1 failed — tap to resolve"

**Per-form save button label:**
- Online: "Save" → "Saved ✓ Synced"
- Offline: "Save" → "Saved locally · Pending sync"
- Failed: button shows warning, navigates to conflict UI

**Service Worker setup:**
Register in `index.html`. The SW scope handles background sync and can cache API responses for offline reads of batch and container data (read-through cache).

#### New Dependencies

```
npm install idb           — typed IndexedDB wrapper
npm install workbox-*     — optional; simplifies SW caching patterns
```

#### New Backend Work

No backend schema changes. Idempotency keys (`X-Idempotency-Key` header) would help prevent duplicate submission during sync; add as a MEDIUM-priority enhancement. Each pending_write record generates a stable key from `entity_type + local_id`.

#### Files Affected

- New: `client/src/lib/offline-store.ts` — IndexedDB wrapper
- New: `client/src/lib/sync-worker.ts` — flush loop, conflict detection
- New: `client/src/hooks/useOfflineSubmit.ts` — wraps any form submit with offline-queue behavior
- New: `client/public/sw.js` — service worker
- Modified: all 7 application entry forms — swap direct `api.post()` for `useOfflineSubmit()`
- Modified: `NavBar.jsx` — add sync status badge
- Modified: `App.jsx` — register SW, provide `OnlineContext`

Estimated: **5 days** (most complex Phase 2 feature).

---

### Feature 2.4 — Bulk METRC Tag Assignment

**Goal:** Streamlined scan-container/scan-tag loop for tagging entire batches (30–150 plants) without navigating away between each plant.

**Route:** `/tag-assignment/bulk?batch_id=X&sub_zone_id=Z1A`

#### Workflow

1. **Entry:** Supervisor taps "Bulk Tag Assignment" from BatchDetail (gated on `supervisor` role). Optionally pre-filter by sub-zone or row.
2. **Container list view:** App loads all containers in the batch sub-zone. Shows two columns: position ID, assignment status (Tagged / Untagged). Start at first untagged.
3. **Loop step A — Container scan:** Full-screen QR scan view. On success: highlights the container in the list, shows "Scan METRC tag for Z1-A-R3-C12 →"
4. **Loop step B — METRC tag capture:** Camera opens in barcode mode (same as existing METRC tag scan). Capture 24-char UID. Validate format. Show "...6789 — Confirm?"
5. **Confirm:** Tapping "Confirm" calls `POST /api/tag-assignments` as a single record. On success: checkmark on this container, advance to next untagged. On error (tag already assigned): show error inline, allow retry or skip.
6. **Manual fallback per container:** Tap container in list to enter UID manually when camera fails.
7. **Progress:** Header shows "Tagged: 18 / 30". Remaining list stays visible.
8. **Completion:** When all containers tagged, summary screen: "Batch fully tagged. View batch →"

#### Error Recovery

- **Tag already assigned elsewhere:** Show which container it's currently assigned to. Options: Reassign (opens reassignment flow) | Use different tag
- **Container already tagged:** Skip automatically, advance to next untagged
- **Camera failure:** Fall back to manual entry field, pre-focused

#### New Backend Work

None — uses existing `POST /api/tag-assignments` route. Add `GET /api/tag-assignments?batch_id=X` if not already available (check planting-plans route which owns field assignments).

The existing route validates uniqueness, 24-char format, and active-assignment conflicts. Those validations surface cleanly in the bulk loop.

#### Frontend Work

- `BulkTagAssignment.jsx` — list + scan loop + progress
- Route registration in `App.jsx`
- "Bulk Tag Assignment" button in `BatchDetail.jsx` (supervisor only, when batch is in field stage)

Estimated: **1.5 days**.

---

### Feature 2.5 — Move / Transplant Tracking

**Goal:** When a plant must be physically moved from one container to another (transplant, container damage, etc.), record the move with both container scans and maintain full audit history.

**Route:** `/containers/:containerId/move`

#### Workflow

1. **Entry:** "Move Plant" button on `ContainerDetail.jsx` when container state is `active`.
2. **Step 1:** App shows current container context: position, METRC tag (last 4), strain.
3. **Step 2:** "Scan destination container QR" — full-screen scanner opens. Must scan a different container. Destination must be in `ready` state (cannot move into a container that already has an active plant, unless `plants_per_container > 1` — in that case, the destination must be the same batch sub-zone and the current plant count must be below the batch's `plants_per_container` value).
4. **Step 3:** Confirm screen: "Move [METRC ...6789] from Z1-A-R3-C12 → Z1-A-R4-C05. Both containers will be updated." Reason field (enum: container_damaged | transplant | relocation | other + notes).
5. **Confirm:** Single transaction — unassign from source (reason: `moved`), create new assignment on destination. If source container has no remaining active assignments, transition source → `empty`.
6. **Success:** Navigate to destination container record.

#### New Backend Work

Add `POST /api/tag-assignments/:assignmentId/move` endpoint:

```
Body: {
  destination_container_id: string,
  reason: 'container_damaged' | 'transplant' | 'relocation' | 'other',
  notes?: string
}

Transaction:
  1. Validate assignment is active
  2. Validate destination container (ready state, or active-within-same-batch if plants_per_container > 1)
  3. Unassign source: UPDATE cv_plant_assignments SET unassigned_at=now, unassign_reason='moved', unassign_notes=reason
  4. Create new assignment: INSERT cv_plant_assignments (same metrc_plant_tag, plant_batch_id, destination_container_id)
  5. If source has no remaining active assignments: UPDATE cv_container_state SET current_state='empty'
  6. INSERT cv_container_state_transitions for source (active → empty if applicable) and destination
```

Estimated: **0.5 days** backend + **0.5 days** frontend.

---

### Feature 2.6 — Soil Sample Tracker Dashboard

**Goal:** Operations-level view of all soil samples across all containers — especially for tracking which containers need samples collected and which have results awaiting entry.

**Route:** `/soil-samples`

#### View Structure

Three tabs:

**Tab 1 — Awaiting Collection** (`teardown` containers without a soil sample):
- List of containers in `teardown` state where `soil_sample_collected = false` on their latest teardown_event
- Columns: Container ID, Sub-zone, Batch (completed), Days since teardown started
- Quick action: "Log Sample" → navigates to `/containers/:containerId/soil-sample/new`
- Sort by days-since-teardown descending (oldest awaiting samples first)

**Tab 2 — Sent to Lab** (samples where `lab_sent_at IS NOT NULL` and `results_received = false`):
- Columns: Container ID, Sample label, Lab name, Date sent, Days waiting
- Quick action: "Enter Results" → opens inline results form or navigates to sample detail
- Alert: samples waiting > 14 days highlighted in amber

**Tab 3 — Results Received** (last 90 days):
- Columns: Container ID, Sample date, Lab, Key results (pH, EC, N_ppm), Interpretation summary
- Click to view full results
- Filter by sub-zone or interpretation flag (deficient / optimal / excessive)

#### Data Source

New backend endpoint: `GET /api/soil-samples?status=awaiting_collection|sent_to_lab|results_received`

This aggregates across `cv_soil_samples` joined to `cv_teardown_events` and `cv_container_state`. Add to `container-lifecycle.ts` or create a separate `soil-samples.ts` route file.

#### API Method

```javascript
api.getSoilSamplesTrackerView(status, filters)  // → client/src/api.js
```

Estimated: **1 day** backend + **1 day** frontend.

---

### Phase 2 Additional Features (Deferred to Phase 2 Tail)

These are in the Phase 2 scope per CLAUDE.md but are smaller additions:

**Photo Capture (any screen):** Add a persistent camera button to `NavBar.jsx`. Opens a photo capture modal that attaches to the current page context via URL params. Requires a photo upload endpoint (`POST /api/uploads` → returns URL). Estimated: **1.5 days** including upload infrastructure.

**Bulk Teardown/Startup:** "Close Batch & Start Teardown" action on BatchDetail that transitions all containers in the batch to `teardown` in one call. Triggers the C5 fix (already required). Estimated: **0.5 days** once C5 is implemented.

**Audit/Reconciliation Mode:** Guided container-by-container METRC tag verification walk. Similar to Inspection Mode but outputs a discrepancy report. Estimated: **1.5 days**.

**Voice Input:** Long-press any notes field → `SpeechRecognition` API. One component (`VoiceInput.jsx`) wraps all text areas. Estimated: **0.5 days** (the API is built-in; no library needed).

**Photo Galleries:** ContainerDetail's photo history section. Photos are currently stored as URL arrays on application records. Aggregate across all records for a container and display as a chronological gallery. Estimated: **1 day**.

**Improved Search:** Global search bar in NavBar. Searches batches (by strain, sub-zone), containers (by position), and applications (by date). Backend: `GET /api/search?q=Z1A` multi-table LIKE query. Estimated: **1 day**.

---

## Phase 3 — Intelligence and Analytics

**Estimated total effort:** 2.5 developer-weeks  
**Prerequisites:** Phase 1 complete, Phase 2 online mode stable (analytics rely on synced data)  
**Chart library recommendation:** `recharts` — already a natural fit for React, composable API, tree-shakeable. Install: `npm install recharts`. Do not use Chart.js (imperative API, worse React integration).

---

### Feature 3.1 — Annual Batch Tracker

**Goal:** Gantt-style view showing all batches across the season by sub-zone — when each sub-zone was occupied and what strain was growing.

**Route:** `/analytics/annual`

#### Layout

X-axis: calendar weeks (week numbers or month labels). Range: Jan 1 – Dec 31 of the current season, or selectable year.  
Y-axis: the 8 sub-zones (Z1A, Z1B, Z2A, Z2B, Z3A, Z3B, Z4A, Z4B), one row each.  
Each batch: a horizontal bar spanning `sow_date` to `closed_date` (or "today" if still open). Color coded by `strain.type` (auto = one color family, photo = another). Tooltip on hover: strain name, plant count, days open, current status.

**Visual approach:** `recharts` does not have a native Gantt. Use `ComposedChart` with `Bar` components positioned via `start/end` offsets. Alternatively, render as a CSS grid with `grid-column-start` / `grid-column-end` mapped to week number.

CSS grid approach is simpler and more accessible:
```
Grid columns: 52 (one per week)
Grid rows: 8 (one per sub-zone)
Each batch bar: <div style={{ gridColumnStart: startWeek, gridColumnEnd: endWeek }}>
```

#### Data Source

`GET /api/analytics/annual-tracker?year=2026`

New backend route (`src/api/routes/analytics.ts`):

```sql
SELECT 
  pb.plant_batch_id,
  pb.sub_zone_id,
  pb.sow_date,
  pb.closed_date,
  pb.status,
  pb.plant_count_initial,
  s.name AS strain_name,
  s.type AS strain_type
FROM cv_batches pb
JOIN cv_strains s ON s.strain_id = pb.strain_id
WHERE pb.sow_date >= ? AND pb.sow_date < ?
ORDER BY pb.sub_zone_id, pb.sow_date
```

Returns array of batches with week-number offsets computed at the route layer (not client-side, so the client doesn't need to know the year's start date).

Estimated: **0.5 days** backend + **1.5 days** frontend.

---

### Feature 3.2 — Trend Charts (EC/pH over Time)

**Goal:** Line chart of EC and pH measurements from fertigation applications over the life of a batch, overlaid with target range bands from the active recipe.

**Route:** `/analytics/batch/:batchId/trends`

#### Charts

Two charts (tabbed or stacked):

**EC Trend:**
- X-axis: date (day of batch, from sow_date)
- Y-axis: EC value (0.0 – 3.0 mS/cm range)
- Data series: `ec_measured` from `cv_applications_fertigation`
- Band: `ec_target_low` / `ec_target_high` from the recipe active at the time of each application (from `cv_batch_stage_recipes`)
- Color-coded dots: green = in-range, red = out-of-range
- Threshold lines from the recipe's targets

**pH Trend:**
- Same structure, pH range 5.0 – 7.5
- `ph_measured` vs. `ph_target_low` / `ph_target_high`

#### Data Source

`GET /api/analytics/batch/:batchId/ec-ph`

Backend joins `cv_applications_fertigation` → `cv_batch_stage_recipes` (active recipe at `applied_at`) → `cv_fertigation_recipes` (for targets). Returns time-series array:

```json
[
  {
    "applied_at": "2026-04-15T08:30:00Z",
    "day_of_batch": 12,
    "ec_measured": 1.4,
    "ph_measured": 6.1,
    "ec_target_low": 1.2,
    "ec_target_high": 1.6,
    "ph_target_low": 5.8,
    "ph_target_high": 6.2,
    "recipe_name": "AUTO-VEG",
    "recipe_version": "1.0"
  }
]
```

The recipe-at-time join: find the `cv_batch_stage_recipes` row where `effective_from <= applied_at AND (effective_to IS NULL OR effective_to > applied_at)`.

#### Additional Trend: Application Volume

Third chart showing `volume_gallons` over time — identifies missed days (gaps in the line) and volume anomalies. Helps correlate EC/pH deviations with watering volume changes.

Estimated: **0.5 days** backend + **1.5 days** frontend (recharts `ComposedChart` with `ReferenceBand`).

---

### Feature 3.3 — Recipe Performance Analysis

**Goal:** Correlate recipe versions with harvest outcomes — which recipe formulations produced what yields?

**Route:** `/analytics/recipe-performance`

#### What Data Exists

- `cv_applications_fertigation.recipe_id` — the exact recipe version used for each application
- `cv_batch_stage_recipes` — which recipe was active for a batch during each phase
- `cv_plant_harvest_events.wet_weight` — harvest weight per plant
- `cv_batches.plant_count_initial` / `strain_id` / `sub_zone_id`

#### What's Missing

The current schema can link a harvest to the batch and the batch to recipe versions over time, but there is no single "primary recipe" snapshot on a batch record. A batch may have used multiple recipe versions (e.g., AUTO-VEG v1.0 for 3 weeks, then AUTO-VEG v1.1). The analysis must aggregate across all recipe versions used during the batch.

**Proposed join:**
```sql
-- For each batch with completed harvests:
-- 1. Get total wet weight from cv_plant_harvest_events grouped by batch
-- 2. Get all recipe versions used (from cv_batch_stage_recipes, multiple rows per batch)
-- 3. Aggregate: "batch used recipes X, Y, Z → produced W grams per plant"
```

This is sufficient for a "recipe versions used in batches that produced high vs. low yield" view. True attribution (which recipe version drove the yield difference) requires cross-batch comparison (Feature 3.4).

#### UI

Table view:
| Recipe | Version | Batches using this version | Avg yield (g/plant) | Strains |
|--------|---------|--------------------------|---------------------|---------|
| AUTO-FLOWER | 1.0 | 3 | 284g | NL Auto, AC/DC |
| AUTO-FLOWER | 1.1 | 1 | 312g | NL Auto |

Caveat: yield per plant varies with strain, environment, and grower — the view explicitly notes these are correlations, not controlled comparisons. Add a disclaimer banner: "Yield variations reflect many factors. Use these numbers as a starting point for investigation, not as definitive attribution."

#### Schema Gap

No schema changes needed. The join works with existing tables. However, performance will suffer on large datasets without the recommended index from `docs/audit-schema-performance.md` on `cv_batch_stage_recipes(plant_batch_id, effective_from)`.

Estimated: **0.5 days** backend (complex join but single endpoint) + **1 day** frontend.

---

### Feature 3.4 — Cross-batch Comparisons

**Goal:** Compare performance across batches using the same strain in different sub-zones, or different strains in the same sub-zone.

**Route:** `/analytics/compare?strain_id=X,Y&sub_zone_id=Z1A,Z2A`

#### Comparison Dimensions

| Compare | Holds constant | Varies |
|---------|---------------|--------|
| Same strain, different sub-zones | Strain | Sub-zone (soil quality, drainage, sun exposure) |
| Different strains, same sub-zone | Sub-zone | Strain (genetics) |
| Same strain, same sub-zone, different seasons | Strain + sub-zone | Year (grower experience, climate) |

#### Metrics to Compare

For each batch in the comparison set:
- Avg yield per plant (g)
- Days to harvest (field_move_date → closed_date)
- Pesticide application count
- EC deviation from target (avg absolute deviation)
- pH deviation from target
- Plant loss rate (%)
- Harvest batch count (weather events, splits)

#### Data Source

`GET /api/analytics/compare?strain_id=X&sub_zone_id=Z1A,Z2A&year=2026`

The backend runs parallel queries for each combination and returns a structured comparison object. Each batch's metrics are pre-computed at the route layer (not in the client).

#### UI

Parallel bar or radar chart (recharts `RadarChart` or grouped `BarChart`). Table view as fallback. Allow user to select which metrics to show.

#### Data Gaps

The comparison is only as good as the data density. In 2026, there may be only 1–2 completed batches per sub-zone. The UI must handle N=1 gracefully (display the data, note "insufficient batches for statistical comparison — showing available data").

Estimated: **1 day** backend + **1.5 days** frontend.

---

### Feature 3.5 — Applicator Performance and Pesticide Use Reporting

These are lower-priority Phase 3 additions:

**Applicator Performance:**
- Per-applicator: application count, timing consistency (how close to scheduled times), EC/pH measurement variance
- Used for training feedback, not compliance — make this explicit in the UI
- Estimated: **0.5 days** (aggregation query + simple table)

**Pesticide Use Summary:**
- Annual report: total applications per product, total volume, total treated area, date range
- For license renewal documentation
- Already partially covered by the MDA export (Phase 1). This adds a summary roll-up view.
- Estimated: **0.5 days** (aggregate query + printable view)

---

## Phase 4 — METRC API Integration

Full design is in `docs/metrc-integration-design.md`. This section provides the implementation sequence and prerequisites only.

**Estimated total effort:** 6–8 developer-weeks  
**Prerequisites (must be done before Phase 4 begins):**

1. All Phase 1 critical fixes applied (especially C1, C4, C5)
2. Migration `016_additive_sync.ts` written and applied — adds `metrc_sync_status` and `metrc_synced_at` to `cv_applications_fertigation`, `cv_applications_foliar`, and `cv_container_amendments` (these three tables are currently missing these columns; `cv_applications_pesticide`, `cv_plant_harvest_events`, `cv_plant_waste_trim_events`, and `cv_plant_loss_events` already have them per migration 009)
3. METRC sandbox credentials obtained from MN OCM
4. `METRC_USER_API_KEY`, `METRC_SOFTWARE_API_KEY`, `METRC_FACILITY_LICENSE` environment variables set in Railway

**Implementation sequence (from `metrc-integration-design.md`):**

| Step | Deliverable | Effort |
|------|-------------|--------|
| 4.1 | `src/sync/metrc-client.ts` — authenticated HTTP client, test connection endpoint | 2 days |
| 4.2 | `src/sync/metrc-worker.ts` — sync worker, pending record polling | 2 days |
| 4.3 | Plant batch create/update sync | 3 days |
| 4.4 | Phase change and location move sync | 2 days |
| 4.5 | Plant tag assignment sync | 2 days |
| 4.6 | Harvest batch and harvest event sync | 3 days |
| 4.7 | Record Additives sync (all 4 application types) | 3 days |
| 4.8 | Plant waste/loss sync | 2 days |
| 4.9 | Reconciliation and two-way read | 3 days |
| 4.10 | Sync dashboard UI, error surfacing | 2 days |

**Phase 1/2 prerequisites for specific sync steps:**

- 4.3 (batch create): `metrc_plant_batch_uid` must be populated on existing batches before sync — an admin "backfill" workflow is needed
- 4.6 (harvest sync): Requires C5 fix (all containers → teardown on batch close) to be correct before pushing harvest events
- 4.7 (additives sync): Requires migration 016 on the three missing tables

---

## Implementation Timeline

### Sequencing Recommendation

```
Now (Phase 1 stabilization):
  Week 1:  Apply Phase 1 critical fixes (C1–C8, H7)
  Week 2:  Migration 015 (indexes + PRAGMA), compliance gap fixes (C2, C3)

Phase 2 (field operations):
  Week 3:  Feature 2.1 (Sub-zone Field Maps) + Feature 2.4 (Bulk Tag Assignment)
  Week 4:  Feature 2.2 (Inspection Mode)
  Weeks 5-6: Feature 2.3 (Offline Mode Hardening)
  Week 7:  Feature 2.5 (Move/Transplant) + Feature 2.6 (Soil Sample Tracker)
  Week 8:  Phase 2 tail: Photo capture, Bulk teardown, Voice input, Audit mode, Search

Phase 3 (analytics):
  Week 9:  Feature 3.1 (Annual Batch Tracker) + recharts install
  Week 10: Feature 3.2 (Trend Charts)
  Week 11: Feature 3.3 (Recipe Performance) + Feature 3.4 (Cross-batch Comparisons)
  Week 12: Feature 3.5 (Applicator performance, Pesticide summary) + polish

Phase 4 (METRC sync):
  Week 13: Migration 016 + Steps 4.1–4.2 (client + worker)
  Weeks 14-15: Steps 4.3–4.5 (batch, phase, tag assignment sync)
  Weeks 16-17: Steps 4.6–4.8 (harvest, additives, waste/loss)
  Week 18: Step 4.9 (reconciliation) + Step 4.10 (UI)
```

### Effort Summary

| Phase | Weeks | Blocking Dependencies |
|-------|-------|----------------------|
| Phase 1 fixes | 2 | None |
| Phase 2 | 6 | Phase 1 fixes |
| Phase 3 | 4 | Phase 1 complete, Phase 2 offline hardening stable |
| Phase 4 | 6 | Migration 016, METRC credentials, Phase 1 compliance fixes |
| **Total remaining** | **~18 developer-weeks** | — |

Phase 3 and Phase 4 are largely independent of each other — they can be worked in parallel by separate developers if available.

---

## Schema Gaps for Future Phases

The following migrations do not yet exist and will be needed before or during Phase 2–4 work:

### Migration 015 — Indexes and PRAGMA (Phase 1 stabilization)

Content specified in `docs/audit-schema-performance.md` Section 6. 29 indexes + PRAGMA changes (synchronous, busy_timeout, cache_size). Apply before Phase 2 begins to avoid performance degradation as data grows.

### Migration 016 — Additive Sync Columns (Phase 4 prerequisite)

```typescript
// 016_additive_sync.ts
export async function up(knex: Knex): Promise<void> {
  // cv_applications_fertigation is missing metrc_sync_status + metrc_synced_at
  await knex.schema.table('cv_applications_fertigation', (table) => {
    table.text('metrc_sync_status').notNullable().defaultTo('not_required');
    table.text('metrc_synced_at').nullable();
  });

  // cv_applications_foliar is missing these columns
  await knex.schema.table('cv_applications_foliar', (table) => {
    table.text('metrc_sync_status').notNullable().defaultTo('not_required');
    table.text('metrc_synced_at').nullable();
  });

  // cv_container_amendments is missing these columns
  await knex.schema.table('cv_container_amendments', (table) => {
    table.text('metrc_sync_status').notNullable().defaultTo('not_required');
    table.text('metrc_synced_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // SQLite cannot drop columns directly; use table recreation pattern
  // ... (standard column-drop workaround for SQLite)
}
```

Note: `defaultTo('not_required')` is correct for historical records — they should not be retroactively pushed to METRC as additives.

### Migration 017 — Scan History (Phase 2, optional)

Business Rule 27 states scan history may be logged. This is advisory:

```typescript
// 017_scan_history.ts — Optional; implement if audit log of container scans is required
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cv_scan_history', (table) => {
    table.increments('scan_id').primary();
    table.text('scanned_value').notNullable();     // raw QR payload
    table.text('container_id').nullable();          // resolved container, if matched
    table.text('scanned_by').notNullable();         // FK → cv_users
    table.integer('scanned_at').notNullable();      // Unix timestamp
    table.text('result').notNullable();             // 'matched' | 'not_found' | 'invalid_format'
    table.text('action_taken').nullable();           // 'navigation' | 'assignment' | 'observation' etc.
    table.text('session_id').nullable();             // for grouping scans in a session/row-walk
  });
}
```

Defer this until there's an explicit audit requirement — the data volume (every container QR scan logged) grows quickly.

### Migration 018 — Offline Pending Writes Log (Phase 2, optional)

If offline sync conflicts need a server-side audit trail (beyond the client's IndexedDB), add:

```typescript
// 018_offline_conflict_log.ts — Optional
// Records: which client-side writes were rejected, why, by whom, and when resolved
// Fields: conflict_id, entity_type, entity_local_id, attempted_at, rejection_reason,
//         resolved_at, resolved_by, resolution (discarded | applied | merged)
```

Only needed if regulatory auditors ask "why was this record not saved." In practice, the server's application logs (Railway) provide sufficient traceability.

### Analytics Views (Phase 3, optional optimization)

Phase 3 queries (cross-batch comparisons, recipe performance) involve multi-table joins that may be slow on 2+ seasons of data. If query latency becomes a problem, add:

```typescript
// 019_analytics_views.ts — Materialized cache for analytics queries
// A simple cv_batch_metrics table populated by a background job or triggered on batch close:
//   plant_batch_id, strain_id, sub_zone_id, year, avg_yield_g, days_to_harvest,
//   plant_loss_rate, pesticide_app_count, avg_ec_deviation, avg_ph_deviation
// Refreshed on: batch status → closed, or nightly by a cron job
```

Do not build this preemptively. Start with direct queries in the analytics routes and add the cache only if query time exceeds 2 seconds for a full-season dataset.

---

*End of document.*
