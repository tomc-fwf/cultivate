# Harvest Data Model
## Consolidated Domain Model for Harvest, Manicure, and Waste Trim

**Prepared:** 2026-05-21  
**Status:** Approved — implement in Phase 1  
**Context:** Derived from operator domain modeling session. Supersedes any harvest-related
schema implied in CLAUDE.md with these more precise definitions.

---

## Conceptual Clarification

Three distinct event types are involved in the harvest lifecycle. They are **not** subtypes
of each other — they are peers with different purposes:

| Event | Generates | Plant alive after? | Occurs when | METRC term |
|---|---|---|---|---|
| **Partial Harvest** | Product (wet weight) | Yes | Any stage from `field-veg` onward — when trimmed material will be **sold** | "Manicure" |
| **Final Harvest** | Product (wet weight) | No — triggers unassignment + container teardown | During `harvesting` only, once per plant | "Harvest" |
| **Waste Trim** | Waste (wet weight) | N/A — standalone event | Any stage — when trimmed material will be **destroyed** | Plant waste |

**Trim ≠ Manicure.** METRC's term "manicure" refers to a partial harvest (product), not
trimming. Waste trim is a separate concept entirely and has no harvest-ready prerequisite.

---

## Multiple Plants Per Container

`plant_batches.plants_per_container` (integer, default 1) records the intended planting density
for the plant batch. A value of 2 is common for autoflowers. This is consistent across the
plant batch — not set per container.

The `plant_assignments` table has **no unique constraint on `(container_id, unassigned_at IS NULL)`**.
Multiple active assignments per container are valid. The only per-plant uniqueness constraint
is on `metrc_plant_tag` (a tag belongs to exactly one plant at a time).

Container state implications:
- `active` = one or more active plant_assignments (not exactly one)
- `empty` = zero active plant_assignments within an active plant batch

During harvest, if a container has multiple active assignments the UI surfaces all assigned
plants and requires the operator to select which plant is being harvested before displaying
the METRC tag verification step.

---

## Plant Batch Status Changes

### Modified enum: `plant_batches.status`

**Before:**
```
germ | seedling | cult-hoop | field-veg | field-flower | flush | harvest | closed
```

**After:**
```
germ | seedling | cult-hoop | field-veg | field-flower | flush
  | harvest_window | harvesting | closed
```

`harvest` is replaced by `harvest_window` + `harvesting`. `closed` is unchanged.

### New status definitions

| Status | Meaning | Entry condition | Exit condition |
|---|---|---|---|
| `harvest_window` | Daily maturity assessments underway | Manual transition from `flush` | Management decision based on obs log |
| `harvesting` | Harvest committed, in progress | Management decision (logged, not gated) | All plants have a `final_harvest` event |
| `closed` | All plants harvested across all harvest batches | Auto when last plant final_harvested | Terminal |

### Transition: `harvest_window → harvesting`

A management decision — logged but not blocked on approval. Captured in the existing
batch stage transition log with:
- `transitioned_by` FK → users
- `transitioned_at` timestamp  
- `notes` — rationale (e.g. "majority showing 90%+ trichome maturity per obs log")

### Transition: `harvesting → closed`

Automatic when all `plant_assignments` in the batch have a `final_harvest` event recorded
across any of the batch's `harvest_batches`.

---

## Harvest Window: Maturity Observations

During `harvest_window`, staff walk rows daily and assess individual plants. These are
captured as observations with a dedicated category — **no plant-level state change**.

Container-level readiness data serves two purposes:
1. **Batch-level go/no-go** — observations aggregate to show what percentage of the batch
   is ready, informing the management decision to transition to `harvesting`
2. **Harvest processing order** — rows and containers with the most ready plants are
   processed first; the readiness distribution across rows drives sequencing

**Modified enum: `observations.category`**

Add: `harvest_readiness`

**Additional fields on observations when `category = harvest_readiness`:**

```
maturity_pct      integer, nullable    -- estimated trichome/pistil maturity 0–100
ready_to_harvest  boolean             -- staff judgment: this plant is ready now
harvest_priority  integer, nullable   -- relative priority within row (1=highest) for
                                      -- sequencing when not all plants ready simultaneously
```

The UI surfaces a **readiness summary by row** during `harvest_window`:

```
Row Z1-A-R1:  28/30 ready  ████████████████████▌░  93%   ← process first
Row Z1-A-R2:  25/30 ready  ████████████████░░░░░░  83%
Row Z1-A-R3:  19/30 ready  ████████████░░░░░░░░░░  63%
...
```

This view drives the harvest plan. The actual processing order is recorded implicitly
by the timestamps on `plant_harvest_events` — no separate sequencing table is needed.

These observations are the evidence trail — they inform but do not gate the
`harvest_window → harvesting` transition.

---

## New Table: `harvest_batches`

A harvest batch represents a group of plants harvested together under the same conditions
within a 1–2 day window. Normally one per plant batch. A major weather event forces
the current harvest batch closed and creates a new one for remaining plants under the new
conditions. Each harvest batch maps to one METRC harvest lot.

```
harvest_batches
────────────────────────────────────────────────────
harvest_plant_batch_id        PK
plant_batch_id                FK → plant_batches              -- the plant batch
sequence_number         integer default 1         -- 1 normally; 2+ if weather-forced split
status                  enum: in_progress | completed | force_closed
close_reason            enum: completed | weather_event | other
close_notes             text, nullable            -- required when close_reason = weather_event
started_at              timestamp
completed_at            timestamp, nullable
ambient_temp_f          decimal, nullable         -- conditions this batch was harvested under
ambient_rh              decimal, nullable
wind_speed_mph          decimal, nullable
metrc_harvest_batch_uid text, nullable            -- assigned in METRC at harvest
started_by              FK → users
closed_by               FK → users, nullable
notes                   text
created_at              timestamp
updated_at              timestamp
```

### Weather event forced-close flow

```
harvesting (day 1, harvest_batch 1 in_progress)
  └─ major weather event
       └─ harvest_batch 1 → force_closed  (close_reason=weather_event, close_notes required)
       └─ harvest_batch 2 created          (sequence_number=2, new conditions)
  └─ harvest continues on remaining plants under harvest_batch 2
  └─ plant batch → closed when all plants have a final_harvest across any harvest_batch
```

---

## New Table: `plant_harvest_events`

Records both partial harvest (METRC: "manicure") and final harvest events against individual
plants. Always associated with a `harvest_batch`. Final harvest triggers plant unassignment
and container state transition to `teardown`.

```
plant_harvest_events
────────────────────────────────────────────────────
harvest_event_id        PK
harvest_plant_batch_id        FK → harvest_batches
plant_batch_id                FK → plant_batches              -- denormalized for query convenience
plant_assignment_id     FK → plant_assignments
container_id            FK → containers
event_type              enum: partial_harvest | final_harvest
  -- partial_harvest: plant remains active, multiple allowed per plant
  -- final_harvest:   plant comes down, triggers unassignment + container → teardown
harvested_at            timestamp
product_type            enum: flower | larf | popcorn | trim_product | other
wet_weight              decimal
weight_unit             text                      -- e.g. "g", "oz", "lb"
applicator              FK → users
notes                   text
photo_urls              text, nullable            -- JSON array
metrc_sync_status       enum: pending | synced | failed | not_required
metrc_synced_at         timestamp, nullable
created_at              timestamp
updated_at              timestamp
```

### Constraints

- `event_type = partial_harvest`: plant_assignment remains active, container stays `active`,
  no state transitions triggered
- `event_type = final_harvest`: plant_assignment unassigned (reason: `harvested`), container
  transitions `active → teardown`, harvest_batch auto-checks if all plants are now
  final_harvested and closes if so

---

## New Table: `plant_waste_trim_events`

Standalone waste trim events. Occur throughout the full plant lifecycle — veg, flower, flush,
and during harvesting. Not subordinate to harvest events. Generate waste, not product.
Have their own lifecycle state from collection through METRC waste reporting.

```
plant_waste_trim_events
────────────────────────────────────────────────────
waste_trim_id           PK
plant_batch_id                FK → plant_batches
container_id            FK → containers, nullable
row_id                  FK → rows, nullable       -- for row-level trim events
plant_assignment_id     FK → plant_assignments, nullable
harvest_plant_batch_id        FK → harvest_batches, nullable  -- set if occurring during harvesting
harvest_event_id        FK → plant_harvest_events, nullable  -- set if tied to a harvest event
trimmed_at              timestamp

trim_reason             enum: defoliation | lollipoping | ipm_removal | disease_removal |
                               pest_damage | physical_damage | senescence | other
trim_reason_notes       text, nullable

wet_weight              decimal
weight_unit             text                      -- e.g. "g", "oz", "lb"

-- Waste lifecycle
waste_status            enum: collected | held | disposed | reported
waste_status_updated_at timestamp
disposed_at             timestamp, nullable
disposition             enum: composted | incinerated | quarantined | tested | other
disposed_by             FK → users, nullable

applicator              FK → users
notes                   text
photo_urls              text, nullable            -- JSON array
metrc_sync_status       enum: pending | synced | failed | not_required
metrc_synced_at         timestamp, nullable
created_at              timestamp
updated_at              timestamp
```

### Waste lifecycle states

| State | Meaning |
|---|---|
| `collected` | Material removed and weighed, not yet disposed |
| `held` | Being held (quarantine, testing, awaiting disposal window) |
| `disposed` | Disposed per `disposition` field |
| `reported` | METRC waste/destruction event synced |

---

## Full Harvest Lifecycle (Reference)

```
flush
  └─► harvest_window
        Daily maturity observations (category: harvest_readiness)
        No plant state changes — these are the evidence trail
        Waste trim events may continue independently

        └─► harvesting  [management decision, logged, not gated]
              │
              ├─ harvest_batch 1 created (sequence_number=1)
              │     │
              │     ├─ partial_harvest events per plant (multiple allowed)
              │     ├─ waste_trim events (independent, harvest_plant_batch_id set for context)
              │     └─ final_harvest per plant
              │           └─ plant_assignment unassigned (reason: harvested)
              │           └─ container → teardown
              │
              ├─ [weather event] harvest_batch 1 force_closed
              │     └─ harvest_batch 2 created (sequence_number=2)
              │           └─ remaining plants harvested under new conditions
              │
              └─► closed  [auto: all plants have final_harvest across all harvest_batches]
```

---

## METRC Mapping

| Our term | METRC term | Notes |
|---|---|---|
| `partial_harvest` | Manicure | Product harvest, plant lives |
| `final_harvest` | Harvest | Product harvest, plant cut |
| `waste_trim_event` | Plant Waste | Waste destruction record |
| `harvest_batch (batch_type=harvest)` | Harvest Batch (HB) | One METRC HB per harvest_batch; full plant cut events |
| `harvest_batch (batch_type=manicure)` | Manicure Batch (MB) | One METRC MB per partial harvest grouping; plant lives |

### MN OCM Batch Naming Convention

Both batch types require a specific name format when submitted to METRC:

```
Harvest Batch:   "Blue Dream | 05/21/2026 | HB | Auto"
Manicure Batch:  "Blue Dream | 05/21/2026 | MB | Auto"
```

This name is generated by the app at `cv_harvest_batches` creation time from:
- Strain name (from `cv_batches → cv_strains`)
- Date of harvest/manicure (from `started_at`, formatted MM/DD/YYYY in America/Chicago)
- Type abbreviation: `HB` or `MB` based on `batch_type`
- Plant type: `Auto` or `Photo` (from `cv_strains.type`)

Stored in `metrc_name` (TEXT, nullable). Immutable after METRC sync — name must not change
once it has been submitted to or assigned in METRC.

### Timing Constraints

The key question is **material disposition** — will the trimmed material be sold, or destroyed?

| Disposition | Event type | Batch required | Allowed batch statuses |
|---|---|---|---|
| Material **will be sold** (product) | `partial_harvest` | Manicure Batch (MB) | `field-veg`, `field-flower`, `flush`, `harvest_window`, `harvesting` |
| Material **will be destroyed** (waste) | `waste_trim_event` | none | any |
| **Full plant cut** | `final_harvest` | Harvest Batch (HB) | `harvesting` only |

A manicure performed during veg to sell the tops or large fan leaves creates a Manicure Batch
(MB) in METRC and a `partial_harvest` event in our model. The plant stays alive and the
material enters product inventory.

The same physical trimming action during veg performed purely for airflow improvement —
where trimmings will be composted or destroyed — is a `waste_trim_event` only. No METRC
Manicure Batch is created; it goes through the waste destruction lifecycle instead.

The operator makes this call at the time of entry.

---

## What Does NOT Change

- `container_state` table and its enum — no new container states needed
- `plant_assignments` table — no `plant_status` field needed; harvest-ready is batch-level
- `teardown_events`, `startup_events`, `container_amendments` — unchanged
- `plant_loss_events` — unchanged (mid-batch loss, not harvest)
- The four application tables (fertigation, foliar, amendment, pesticide) — unchanged
