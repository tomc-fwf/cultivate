# CLAUDE.md — Cultivation Tracking Application

## Purpose of This Document

This file orients Claude Code to the cultivation tracking application: what it does, who uses it, what data it manages, and how it must behave. It is the **authoritative project brief**. When in doubt about scope, data model, or business rules, refer here. Code style, framework conventions, and deployment details follow our existing PWA framework (see `README.md` and existing apps in this repo as the reference implementation).

**Read order for new Claude Code sessions:**
1. This file — project context, domain model, and development standards
2. `docs/harvest-model.md` — harvest, partial harvest, and waste trim model detail
3. `docs/sibling-app-resolution.md` — approved farmstock ↔ cultivate integration decisions
4. Recent git log (`git log --oneline -20`) — understand what has been built
5. Then begin work. Do not re-read farmstock or the broader family on every session; those decisions are settled.

**Current state (as of May 2026):** Sibling app integration is resolved (shared DB, Option A). Phase 1 is in progress — features 1–16 are built. See Application Surface section for remaining work.

---

## What This Application Is

A Progressive Web App for tracking cannabis cultivation operations at a licensed Minnesota grow facility. It replaces a paper-based system that proved unmaintainable at our scale (~1,360 plants/year across 8 sub-zones with daily applications). It must satisfy:

- **Minnesota Statute 342.25** — cultivation records per plant batch, 5-year retention, including quantity and timing of every pesticide, fertilizer, soil amendment, or plant amendment used.
- **Minnesota Rule 4770** — "crop input" tracking (fertilizers, pesticides, fungicides, plant regulators, etc.).
- **METRC compliance** — every batch maps to a METRC immature plant batch UID; applications can be exported for METRC's "Record Additives" function.
- **Operational reality** — daily use by cultivation staff in a grow environment, often on mobile devices, sometimes offline-tolerant.

The system is **single-tenant** (one cultivation operation), deployed at `cultivate.hatstak.app` as a peer application within the `hatstak.app` family. It runs on Railway, served through Cloudflare. The family provides shared user/auth, common branding, and a unified component/theme system across all its subdomains. This app inherits those — do not build a parallel auth, nav, or theming layer.

---

## Sibling App Boundary — IMPORTANT: Read Before Building Anything

This application has a sibling app called **farmstock** (deployed at `farmstock.hatstak.app`, codebase at `C:\projects\farmstock`) that **predates cultivate and has begun branching into recipes and applications**. There is real overlap between what farmstock currently does and what cultivate proposes to do.

**Before Claude Code writes any code or designs any schema, it must:**

1. **Read the farmstock codebase thoroughly.** Understand what data tables, features, UI screens, and business logic already exist.
2. **Identify all overlap dimensions in concrete terms.** Specifically: what tables exist in farmstock that cultivate also needs? What features did farmstock start building that cultivate plans to do at greater depth?
3. **Propose a resolution to the operator** before implementing anything. Do not assume — propose, get approval, then build.

### Expected Domain Boundaries

Based on the original product vision, the two apps should divide responsibilities as follows:

| Domain | Farmstock (sibling — source of truth for these) | Cultivate (this app — source of truth for these) |
|---|---|---|
| Crop input catalog | ✓ Master product list, EPA/OMRI registration | References from farmstock |
| Input lot tracking | ✓ Receiving, on-hand quantity, expiration | References from farmstock; consumes on application |
| Suppliers / purchase orders | ✓ Vendor management, ordering | Not in scope |
| Storage locations | ✓ Where inventory is kept | Not in scope |
| Cost / financial tracking | ✓ Costs per input, batch cost accounting | Not in scope |
| Recipes | Migrate to cultivate | ✓ Full versioned recipe library (fertigation + foliar) |
| Applications | Migrate to cultivate | ✓ Four-class application tracking with compliance |
| Plants, batches, METRC tags | Not in scope | ✓ Full plant/batch lifecycle |
| Containers and lifecycle | Not in scope | ✓ Full container tracking |
| Soil samples, amendments | Not in scope | ✓ Full container amendment history |
| METRC integration | Not in scope (or minimal) | ✓ Full METRC sync |
| Field UX, scanning workflows | Not in scope | ✓ Primary user surface |

### Resolution Patterns Claude Code Should Consider

There is no single right answer for how the two apps should connect. Claude Code should evaluate based on the actual farmstock architecture and propose:

**Option A: Shared database, separate apps**
- Both apps read/write the same SQLite database
- Tables owned by farmstock (crop_inputs, input_lots, suppliers) are referenced by cultivate
- Pros: instant consistency, simple to implement
- Cons: tighter coupling, both apps must agree on schema changes
- Best for: small-scale operations where deployment independence isn't critical

**Option B: Cross-app API calls**
- Each app has its own database
- Cultivate calls farmstock's API to look up products, lots, depletions
- Pros: clean separation, independent deployment
- Cons: network overhead, must handle API auth between apps
- Best for: operations expecting one or both apps to scale or evolve independently

**Option C: Shared core package**
- A third package (e.g. `@hatstak/inventory-core`) contains shared models and queries
- Both apps depend on it
- Pros: DRY, clean dependency graph
- Cons: more upfront design, version coordination
- Best for: when the shared logic is substantial and stable

**Option D: Hybrid — shared DB with thin API**
- Shared underlying data, but each app exposes its own API surface for typed access
- Pros: consistency + clean boundaries
- Cons: more layers
- Best for: most pragmatic for this scale

### What to Migrate from Farmstock to Cultivate

The recipes and applications work that started in farmstock should be **moved out** of farmstock and **into** cultivate, because cultivate handles them at the depth this operation requires (versioned recipes, four-class application tracking, full compliance, METRC integration, etc.). Farmstock's recipe/application code becomes legacy to be removed.

Specifically (subject to Claude Code verification against the actual farmstock code):
- Recipe tables in farmstock → migrate to cultivate's `fertigation_recipes`, `foliar_recipes`, etc.
- Application tables in farmstock → migrate to cultivate's `applications_*` tables
- Any UI screens for recipes/applications in farmstock → remove (cultivate is the home for these now)
- Any links from farmstock UI to "applications" should redirect to `cultivate.hatstak.app` in the family nav

### What to Keep in Farmstock and Reference from Cultivate

- The `crop_inputs` catalog (product master list)
- The `input_lots` table (lot tracking)
- The `suppliers` / `purchase_orders` tables (if they exist)
- Storage location tracking
- Receiving / depletion logic

When cultivate logs an application, it should:
1. Reference an existing crop_input from farmstock (do not duplicate)
2. Reference an existing input_lot from farmstock (do not duplicate)
3. Trigger a depletion event in farmstock (the inventory side decrements)

### Required Deliverable Before Building

The first task in Phase 1 is **NOT** to start coding. It is to produce a **Sibling App Resolution Document** that:

1. Maps farmstock's current state to cultivate's proposed state (concrete table-by-table comparison)
2. Recommends an integration pattern (A, B, C, or D above, or a custom approach)
3. Specifies what to migrate from farmstock, what to reference, what to rebuild
4. Identifies any breaking changes farmstock will need to make
5. Proposes a sequencing plan (what migrates first, how to maintain farmstock during transition)

This document goes to the operator for review before any cultivate code is written. Approval of this document gates the rest of Phase 1.

---

## Domain Glossary

Terms used throughout this document and the application UI. **Use these exact terms — do not invent synonyms.**

### Core Entities

| Term | Meaning |
|------|---------|
| **Plant Batch** | One strain occupying one sub-zone for one season-run. The METRC unit. Has one METRC Plant Batch UID. Lifecycle: Germ → Seedlings → Cult-Hoop → Field → Harvest Window → Harvesting → Closed. Do not use "batch" alone when the context could be confused with Harvest Batch or a METRC product package — always say "plant batch." |
| **Strain** | A genetic cultivar (e.g. "Northern Lights Auto"). |
| **Zone** | A field irrigation zone. We have 4 zones (Zone 1, 2, 3, 4), each with shared drip-line infrastructure. |
| **Sub-zone** | A pot-size partition within a zone. Each zone has A (30-gal pots) and B (10-gal pots). 8 sub-zones total: Z1A, Z1B, Z2A, Z2B, Z3A, Z3B, Z4A, Z4B. **Sub-zones are durable physical identifiers — they never change.** One strain occupies one sub-zone per run. |
| **Row** | A row of containers within a sub-zone. Each A sub-zone has 5 rows × 30 containers = 150. Each B sub-zone has 5 rows × 29 containers = 145. |
| **Container** | A single pot. Uniquely identified by position: `Z1-A-R3-C12` (Zone 1, sub-zone A, row 3, container 12). **Containers are first-class tracked entities with their own lifecycle and history independent of any single batch.** One plant per container at a time. |
| **Container State** | A container's current lifecycle state: `ready`, `active`, `empty`, `teardown`, `startup`, or `out_of_service`. See Operational Model → Container Lifecycle. |
| **Container Amendment** | An addition to the container media itself: compost, nematodes, mycorrhizae, soil correctors, organic matter, biological inoculants. May occur within an active batch OR between batches during teardown/startup. **Distinct from crop applications** which apply to the active plant. |
| **Plant Assignment** | The link between a METRC plant tag and a container at a point in time. One active assignment per container; one active assignment per tag. |
| **Plant Loss Event** | Recordable event when a plant dies, is destroyed, or is removed mid-batch. Triggers METRC waste reporting, batch count adjustment, and container state change to `empty`. |
| **Soil Sample** | A laboratory analysis of container media, typically collected at teardown. Drives startup amendment decisions. |
| **Teardown** | Container state and event: after a batch is harvested, the plant is removed, debris disposed, container cleaned, and a soil sample collected for analysis. |
| **Startup** | Container state and event: after teardown, ~1/3 of media is replaced and amendments are applied based on soil sample results. Container becomes `ready` for next batch when complete. |
| **Location** | A physical area: Germ-01, Seedlings, Cult-Hoop, or Field. Batches move through these. |
| **Applicator** | A staff member who performs an application or observation. |
| **Observation** | A note about plant condition. Logged at row or container granularity. |
| **Harvest Window** | Plant Batch status period when daily maturity assessments are underway. Individual plant readiness observations are logged per container. No state change on the plant — this is the evidence trail for the management decision to begin harvesting. |
| **Harvesting** | Plant Batch status indicating harvest has been committed and is actively in progress. Entered by management decision based on the observation log. All harvest events (partial and final) are gated on this status. |
| **Harvest Batch** | A group of plants harvested together under the same environmental conditions within a 1–2 day window. Normally one per plant batch; a major weather event forces the current harvest batch closed and creates a new one for remaining plants. Maps 1:1 to a METRC harvest lot. Distinct from Plant Batch and from any METRC product package/batch. |
| **Partial Harvest** | A harvest event where product (wet weight) is removed from a plant that remains alive and in the ground. Multiple partial harvests are allowed per plant. METRC calls this "manicure" — the term is avoided here because it is confused with trimming. |
| **Final Harvest** | A harvest event that cuts the plant. One per plant. Records product wet weight, unassigns the plant from its container, and transitions the container to teardown. |
| **Waste Trim** | A first-class plant event — distinct from harvest — that records material removed from a plant and disposed of as waste (not product). Occurs throughout the full lifecycle: veg, flower, flush, and harvesting. Captured with a reason (defoliation, IPM removal, disease removal, etc.) and wet weight. Has its own waste lifecycle: collected → held → disposed → reported to METRC. |

### Crop Input Classification

Cannabis cultivation uses four distinct classes of crop inputs, each with different regulatory requirements, application methods, and audit detail. **The data model treats these as separate application types** — do not merge them into a single generic "application" table.

| Class | Definition | Example Products | Application Method | Frequency | Regulatory Weight |
|-------|------------|------------------|---------------------|-----------|-------------------|
| **Fertigation** | Liquid nutrient solution delivered via drip irrigation as routine root feed | Fish hydrolysate, Cal-Mag, Armor Si, Superthrive, Organics Alive | Drip, sub-zone level | Daily | Moderate (crop input per MN Rule 4770) |
| **Foliar** | Spray applications to leaves for nutrition, growth, or non-pesticide purposes — **no EPA number** | Foliar kelp, foliar Si, foliar Cal-Mag | Spray, row/container level | Weekly or as-needed | Moderate |
| **Soil Amendment** | Solid or semi-solid materials incorporated into or top-dressed on growing media — **no EPA number** | Worm castings, biochar, mycorrhizae top-dress, compost, dolomitic lime | Top-dress, mix-in, drench | Stage transitions (3–5 per cycle) | Moderate |
| **Pesticide** | **Any product with an EPA registration number**, regardless of whether organic, biological, or "natural" | ZeroTol 2.0 (H₂O₂), BTNow (B. thuringiensis), CEASE (B. subtilis), spinosad, neem | Foliar spray or soil drench | As-needed only | **Highest** — full lot tracking, PHI/REI, target pest, environmental data, MDA-ready records |

### The Critical Rule: EPA Number = Pesticide

If a product has an EPA registration number, it is a **pesticide** under federal and Minnesota law — even if it is OMRI-listed, organic, or a live biological agent. This is a hard rule with no exceptions.

This includes products that operators commonly think of as "biologicals" or "biocontrols":
- **ZeroTol 2.0** (hydrogen dioxide) — pesticide
- **BTNow** (Bacillus thuringiensis) — pesticide
- **CEASE** (Bacillus subtilis) — pesticide
- **Spinosad products** — pesticide
- **Neem oil products with EPA numbers** — pesticide

Products that do NOT have EPA numbers can be classified as biocontrols, amendments, or other categories:
- Beneficial nematodes (no EPA number) — biocontrol
- Predatory mites — biocontrol
- Compost teas — amendment
- Pure mycorrhizal inoculants — biocontrol or amendment

**The data model enforces this:** when an applicator enters a new crop input with an EPA number, the system must auto-select category `pesticide` (or related: `fungicide`, `biocontrol_pesticide`) and prevent saving it as `fertilizer`, `foliar_nutrient`, or `amendment`. This prevents misclassification at intake.

### Application Terms

| Term | Meaning |
|------|---------|
| **Fertigation Recipe** | A named, versioned nutrient solution formula for drip irrigation. 7 fertigation recipes: BASE, SEEDLING, AUTO-VEG, AUTO-FLOWER, PHOTO-VEG, PHOTO-FLOWER, FLUSH. |
| **Foliar Recipe** | A named, versioned mix used for repeat foliar applications (e.g. "Weekly Preventive Foliar"). Optional — single-product foliar applications don't need a recipe. |
| **Fertigation Application** | A single instance of a fertigation recipe applied to a batch via drip irrigation. Logged at sub-zone granularity. |
| **Foliar Application** | A single instance of a foliar spray (recipe-based or single-product). Logged at row/container granularity. Non-pesticide. |
| **Soil Amendment Application** | A single instance of an amendment applied to a batch. Logged at sub-zone, row, or container granularity depending on method. |
| **Pesticide Application** | A single instance of a pesticide applied to a batch. Logged at row/container granularity. **Requires full MN MDA-compliant record** with target pest, wind speed, temperature, PHI compliance check, REI sign-off. Even if applied via foliar spray, recorded here, not as a Foliar Application. |
| **Crop Input** | Any product used in cultivation per MN Rule 4770 across any of the four classes above. |
| **Partial Harvest** | See Domain Glossary. METRC term: "manicure." Do not use "manicure" in the UI or codebase. |
| **Waste Trim** | See Domain Glossary. Generates waste (not product). Requires wet weight and reason. Distinct from any harvest event. |

### Why Pesticide is Separate from Foliar

Even when a pesticide is sprayed on leaves (same physical method as a foliar nutrient), it is logged as a **Pesticide Application**, not a Foliar Application. Reasons:

1. **MN MDA reporting** requires fields foliar doesn't (target pest, wind speed, applicator license #)
2. **PHI (Pre-Harvest Interval) enforcement** must block or warn at harvest planning
3. **REI (Re-Entry Interval) tracking** affects worker safety and labor scheduling
4. **Audit search patterns** — regulators ask "what pesticides did you apply" as a distinct query from "what crop inputs"
5. **Restricted-use lists** — some pesticides are state-controlled even when OMRI-listed

The data model reflects this real-world distinction.

---

## Operational Model

### Scale (2026 season)

- ~660 autoflowers across 3 strains
- ~700 photoperiods across 4–5 strains
- Total annual: ~1,360 plants
- Field capacity at any moment: 1,180 containers
- Autos run early-season, finish before photos enter flower (containers re-used for sequential batches)

### Batch Lifecycle

```
LOCATION          DURATION              RECIPE          GRANULARITY
──────────────────────────────────────────────────────────────────────────
Germ-01           Days 0–7              BASE            Tray-level
Seedlings         Days 7–21             BASE → SEEDLING Sub-zone
Cult-Hoop         Days 17–25            SEEDLING        Sub-zone
Field             Day 25+ → flush       VEG → FLOWER    Sub-zone (routine)
                                          → FLUSH         Row/container (hose, foliar, obs)
Harvest Window    Days before harvest   —               Per-container (maturity observations)
Harvesting        1–2 days             —               Per-plant (partial + final harvest events)
Closed            —                    —               —
```

### Application Methods

Three distinct ways inputs reach plants. Each has its own logging granularity:

| Method | Granularity | Frequency | Notes |
|--------|-------------|-----------|-------|
| **Drip irrigation** | Sub-zone | Daily/scheduled | Whole sub-zone gets same recipe at same time. The routine feed. |
| **Hose (supplemental)** | Row or container | As needed | Manual top-up of specific dry containers. |
| **Foliar spray** | Row or container | Corrective | Pest control, deficiency correction, IPM. |

Routine recipe changes happen at stage boundaries only. Mid-stage corrections are made via foliar sprays, not by changing the base feed recipe.

### Recipe Set (7 total)

| Recipe | Used During | Notes |
|--------|-------------|-------|
| BASE | Days 0–9 | Seed soak, plug priming, tray bottom-feed |
| SEEDLING | Days 9–21 | 4" pots in Seedlings location |
| AUTO-VEG | Auto field, veg phase | |
| AUTO-FLOWER | Auto field, bloom phase | |
| PHOTO-VEG | Photo field, veg phase | |
| PHOTO-FLOWER | Photo field, bloom phase | |
| FLUSH | Pre-harvest, all strains | |

Recipes are versioned. When a recipe formula changes, a new version is created — old applications continue to reference the version that was active when they happened.

### Container Lifecycle

Containers are first-class tracked entities with their own lifecycle independent of any single batch. Each container moves through six possible states:

| State | Plant Present? | Batch Context | Typical Triggers |
|-------|---------------|---------------|------------------|
| **READY** | No | No active batch | Startup complete, awaiting assignment |
| **ACTIVE** | Yes | In an active batch | Batch assigned, plant tagged to container |
| **EMPTY** | No | In an active batch | Plant died, removed, or destroyed mid-batch |
| **TEARDOWN** | No (cleanup) | Batch ending | All containers in a batch transition here at batch close |
| **STARTUP** | No | No batch | Post-teardown soil rebuilding (1/3 media replacement + amendments) |
| **OUT_OF_SERVICE** | N/A | None | Container damaged, being sanitized, or removed from rotation |

```
                    ┌──────────────────────┐
                    │      READY           │
                    └──────────┬───────────┘
                               │ Batch assigned + plant tagged
                               ▼
                    ┌──────────────────────┐
       ┌───────────►│      ACTIVE          │◄──┐
       │ Plant      │      (with batch)    │   │ New plant
       │ tagged     └──────────┬───────────┘   │ assigned
       │                       │               │ (same batch)
       │                       │ Plant dies    │
       │                       │ / removed     │
       │                       │ mid-batch     │
       │                       ▼               │
       │            ┌──────────────────────┐   │
       │            │      EMPTY           │───┘
       │            │      (within batch)  │
       │            └──────────┬───────────┘
       │                       │ Batch closes
       │                       │ (all containers)
       │                       ▼
       │            ┌──────────────────────┐
       │            │      TEARDOWN        │
       │            │  (soil sample taken) │
       │            └──────────┬───────────┘
       │                       │
       │                       ▼
       │            ┌──────────────────────┐
       │            │      STARTUP         │
       │            │  (1/3 media replace, │
       │            │   amendments)        │
       │            └──────────┬───────────┘
       │                       │ Ready for next batch
       │                       ▼
       │            ┌──────────────────────┐
       └────────────│      READY           │
                    └──────────────────────┘
                
                    ┌──────────────────────┐
                    │  OUT_OF_SERVICE      │ ← Can be entered from any state
                    │                      │
                    └──────────────────────┘
```

### Why EMPTY is Distinct from TEARDOWN

EMPTY and TEARDOWN both describe a container with no plant, but they are fundamentally different:

- **EMPTY** means the container is part of an active batch but currently has no plant (plant died or was removed mid-batch). The container is still receiving irrigation as part of the sub-zone's drip schedule. A replacement plant of the same strain may be assigned — the container goes back to ACTIVE within the same batch.

- **TEARDOWN** means the batch has ended. The container will be cleaned, a soil sample collected, and prepared for the next batch (which may be a different strain entirely).

### Plant Loss Events

When a plant dies or is removed mid-batch, the system records a **plant loss event** as a distinct, first-class record:

- The container's plant assignment is unassigned with a documented reason
- The container state transitions to EMPTY
- The batch's plant count decreases automatically
- A METRC waste/destroy event is queued for reporting
- Optional: a replacement plant of the same strain can be assigned to bring the container back to ACTIVE within the same batch

This is distinct from harvest — harvests are *expected* outcomes; losses are *unexpected* outcomes. Both need recording but for different reasons.

### Container History as a Distinct Audit Trail

Container history is independent of batch history. Two parallel records exist:

```
BATCH HISTORY                           CONTAINER HISTORY
─────────────                           ─────────────
Started: 2026-03-15                     Established: 2024 (first commissioned)
Strain: Northern Lights Auto            Position: Z1-A-R3-C12
Sub-zone: Z1A                           Pot size: 30 gal
Plant count: 30 → 29 (1 lost)
                                        Records (across all batches):
Records (batch-scoped):                 - Soil amendments (compost, nematodes, etc.)
- Fertigation applications              - Soil samples and lab results
- Foliar applications                   - State transitions (READY → ACTIVE → EMPTY...)
- Pesticide applications                - Teardown events
- Observations                          - Startup events
- Plant assignments                     - Long-term metrics (cumulative organic inputs,
                                          pH trend, etc.)
- Plant loss events
```

When generating a batch's cultivation record (for METRC/audit), pull batch-scoped applications plus container amendments that occurred during the batch's tenure in the container.

When generating a container's history view, pull all container-scoped records ever, optionally annotated with which batch (if any) was occupying the container at the time.

---

## Data Model

The schema below is the authoritative data model. Implement using the existing migration and ORM patterns. Preserve all relationships and constraints.

### SQLite-Specific Implementation Notes

- **Enums** are stored as TEXT with CHECK constraints (SQLite has no native enum type)
- **Timestamps** stored as ISO-8601 strings in UTC (TEXT column) or as Unix epoch integers — follow the parent app's convention
- **JSON columns** (e.g. `photo_urls`, METRC `payload`) stored as TEXT, parsed at the application layer
- **Booleans** stored as INTEGER (0/1) per SQLite convention
- **Foreign keys** must be enabled with `PRAGMA foreign_keys = ON` (this is non-default in SQLite — ensure the framework enables it)
- **Decimal precision** for measurements (EC, pH, rates, volumes) — store as REAL with a documented precision rule, or as TEXT if exact decimal arithmetic is required. Follow the parent app's convention for measurement values.

### Shared User Table

The `users` table referenced throughout this schema is the **shared user table from the parent application's auth system**. Do not create a new user table. All FK references to `users` (applicator, observer, approved_by, supervisor, created_by, updated_by) resolve to that shared table.

### Core Tables

```
crop_inputs
─────────────
input_id            PK
name                e.g. "Organic Gem Liquid Fish"
manufacturer
category            enum: fertilizer | foliar_nutrient | amendment | biocontrol_non_pesticide | pesticide | fungicide | biocontrol_pesticide | plant_regulator | other
epa_reg_no          nullable (presence triggers pesticide-category enforcement)
omri_no             nullable
mn_state_reg_no     nullable — MN-specific pesticide registration
epa_registered      boolean (computed: epa_reg_no IS NOT NULL)
omri_listed         boolean
restricted_use      boolean — RUP designation
signal_word         nullable enum: CAUTION | WARNING | DANGER
phi_days_label      nullable — manufacturer label PHI (days)
phi_days_operational nullable — OPERATION-enforced PHI, always ≥ phi_days_label; used by system for all PHI checks
phi_notes           text nullable — explains why operational PHI differs (e.g. "no bio foliars after flower week 3 due to microbial test risk")
rei_hours           nullable — re-entry interval (hours)
active_ingredients  text — comma-separated, especially for pesticides
target_organisms    nullable text — for pesticides, what it controls
form                e.g. "liquid", "powder", "granular"
sds_url             nullable — Safety Data Sheet link
storage_notes
shelf_life_months
active              boolean

input_phi_stage_overrides
─────────────
(optional per-product stage-specific PHI rules — e.g. "no biological foliar after flower week 3")
override_id         PK
input_id            FK → crop_inputs
batch_stage         enum: germ | seedling | cult_hoop | field_veg | field_flower_w1 | field_flower_w2 | field_flower_w3 | field_flower_w4plus | flush
allowed             boolean — false means "do not apply during this stage"
phi_days_override   nullable — alternative PHI for this stage
reason              text — required when allowed = false
created_by          FK → users
created_at          timestamp

input_lots
─────────────
lot_id              PK
input_id            FK → crop_inputs
lot_number          from product packaging
received_date
expiration_date     nullable
quantity_on_hand
unit                e.g. "gal", "lb", "oz"
notes

fertigation_recipes
─────────────
recipe_id           PK
name                enum: BASE | SEEDLING | AUTO-VEG | AUTO-FLOWER | PHOTO-VEG | PHOTO-FLOWER | FLUSH
version             e.g. "1.0", "1.1"
active              boolean (only one active per name)
ec_target_low       e.g. 0.40
ec_target_high      e.g. 0.50
ph_target_low       e.g. 6.0
ph_target_high      e.g. 6.2
mixing_order        text (numbered steps)
notes               text
approved_by         FK → users
approved_at         timestamp
superseded_at       timestamp, nullable

fertigation_recipe_ingredients
─────────────
recipe_id           FK → fertigation_recipes
input_id            FK → crop_inputs (must be category: fertilizer or amendment or biocontrol)
rate_value          e.g. 0.125
rate_unit           e.g. "tsp_per_gal", "ml_per_gal", "drops_per_gal"
order_index         mixing order position
notes               e.g. "Day 9 only" for Dynomyco

foliar_recipes
─────────────
(optional — for repeat foliar mixes; single-product foliars don't need a recipe)
foliar_recipe_id    PK
name                e.g. "Weekly Preventive Foliar", "Cal-Mag Foliar"
version
active              boolean
purpose             text — what this foliar is intended to address
notes
approved_by         FK → users
approved_at         timestamp
superseded_at       timestamp, nullable

foliar_recipe_ingredients
─────────────
foliar_recipe_id    FK → foliar_recipes
input_id            FK → crop_inputs (must be category: foliar_nutrient or fertilizer or biocontrol — NOT pesticide)
rate_value
rate_unit
order_index
notes
```

### Physical Infrastructure (seed data — fixed)

```
zones
─────────────
zone_id             PK (1, 2, 3, 4)
name                e.g. "Zone 1"

sub_zones
─────────────
sub_zone_id         PK e.g. "Z1A"
zone_id             FK → zones
designation         "A" | "B"
pot_size_gal        30 or 10
row_count           5
container_count     150 or 145

rows
─────────────
row_id              PK e.g. "Z1-A-R3"
sub_zone_id         FK → sub_zones
row_number          1–5
container_count     30 or 29

containers
─────────────
container_id        PK e.g. "Z1-A-R3-C12"
row_id              FK → rows
position            1–30 (or 1–29)
qr_code             nullable — for future QR scanning
notes               nullable — e.g. "broken drip" "damaged pot"
```

### Batch & Operations

```
strains
─────────────
strain_id           PK
name
type                "auto" | "photo"
genetics            nullable
notes

plant_batches
─────────────
plant_batch_id      PK
strain_id           FK → strains
sub_zone_id         FK → sub_zones (assigned when moved to field)
metrc_plant_batch_uid nullable until assigned in METRC
plant_count_initial integer
plant_count_current integer (DERIVED — counted from active plant_assignments within this plant batch; do not edit directly; recompute on read or maintain via assignment events)
plants_per_container integer default 1  -- intended planting density; 2 is common for autoflowers;
                                        -- consistent across the plant batch
status              "germ" | "seedling" | "cult-hoop" | "field-veg" | "field-flower" | "flush" | "harvest_window" | "harvesting" | "closed"
                    -- harvest_window: daily maturity assessments underway, harvest not yet committed
                    -- harvesting: management decision made, harvest in progress (1–2 day window)
                    -- closed: all plants have a final_harvest event across all harvest_batches
sow_date
transplant_date     nullable
field_move_date     nullable
harvest_started_date date, nullable  -- date first harvest event recorded (any harvest_batch)
closed_date         nullable
notes
supervisor          FK → users

batch_stage_recipes
─────────────  
(records which recipe is currently active for a plant batch)
plant_batch_id      FK → plant_batches
recipe_id           FK → recipes
effective_from      timestamp
effective_to        timestamp, nullable (null = current)
authorized_by       FK → users
notes

plant_assignments
─────────────
(the live mapping between METRC plant tags and physical containers — the "who's where" registry)
assignment_id       PK
plant_batch_id      FK → plant_batches
container_id        FK → containers (physical position, e.g. Z1-A-R3-C12)
metrc_plant_tag     text — METRC UID (24-char), unique while active
assigned_at         timestamp
assigned_by         FK → users
unassigned_at       timestamp, nullable
unassign_reason     nullable enum: harvested | destroyed | died | moved | replaced | other
unassign_notes      text, nullable
unassigned_by       FK → users, nullable

# NO unique constraint on (container_id, unassigned_at IS NULL) — multiple plants per
# container are supported. plant_batches.plants_per_container records the intended density
# (typically 1; 2 is common for autoflowers). The actual count is always derived from
# active assignments.
# Unique constraint: only one active assignment per metrc_plant_tag (a tag belongs to
# exactly one plant at a time regardless of container sharing)

container_qr_codes
─────────────
(permanent QR codes affixed to containers encoding their position ID for camera scanning)
qr_id               PK
container_id        FK → containers (1:1)
qr_payload          text — typically the container_id itself, e.g. "Z1-A-R3-C12"
qr_format           enum: text | url | json — payload encoding format
printed_at          timestamp
notes               text — e.g. "replaced after damage 2026-04-15"

applications_fertigation
─────────────
(routine drip applications — sub-zone level)
application_id      PK
plant_batch_id      FK → plant_batches
recipe_id           FK → fertigation_recipes (the version actually used)
applied_at          timestamp
volume_gallons      decimal
ec_measured         decimal
ph_measured         decimal
solution_temp_f     decimal nullable
ambient_temp_f      decimal nullable
ambient_rh          decimal nullable
applicator          FK → users
notes               text
photo_urls          array, nullable
corrects_id         FK → applications_fertigation, nullable

applications_foliar
─────────────
(non-pesticide foliar sprays — row/container level)
foliar_id           PK
plant_batch_id      FK → plant_batches
row_id              FK → rows, nullable
container_id        FK → containers, nullable
applied_at          timestamp
foliar_recipe_id    FK → foliar_recipes, nullable (null = single-product application)
input_id            FK → crop_inputs, nullable (used when no recipe, must be non-pesticide category)
input_lot_id        FK → input_lots, nullable
rate_value          decimal nullable (required if no recipe)
rate_unit           string nullable
volume_applied      decimal
volume_unit         string e.g. "gal", "L"
purpose             text — e.g. "weekly preventive", "Mg deficiency correction"
ambient_temp_f      decimal nullable
ambient_rh          decimal nullable
phi_compliant       boolean — system computes; warns if false (even biologicals can fail microbial testing)
stage_compliant     boolean — system computes against input_phi_stage_overrides
applicator          FK → users
notes               text
photo_urls          array, nullable
corrects_id         FK → applications_foliar, nullable

applications_soil_amendment
─────────────
DEPRECATED — superseded by container_amendments.

Soil amendments (compost, nematodes, mycorrhizae, organic matter, pH correctors, biological
inoculants, etc.) are now tracked in the container_amendments table because they are
container-scoped events that persist across batches, not batch-scoped events.

When a soil amendment is applied during an active batch, the container_amendment record
sets plant_batch_id to the active plant batch — this preserves the plant-batch-scoped view while keeping
the amendment in the container's permanent history.

See the Container Lifecycle Tables section below for the container_amendments schema.

applications_pesticide
─────────────
(pesticide, fungicide, biocontrol agent applications — full MN MDA compliance)
pesticide_app_id    PK
plant_batch_id      FK → plant_batches
row_id              FK → rows, nullable
container_id        FK → containers, nullable
applied_at          timestamp
input_id            FK → crop_inputs (category: pesticide | fungicide | biocontrol)
input_lot_id        FK → input_lots (required for pesticides)
rate_value          decimal
rate_unit           string
volume_applied      decimal
volume_unit         string
application_method  enum: foliar_spray | soil_drench | granular | other
target_pest         text — required — what is being controlled
pest_pressure       enum: incidental | threshold | outbreak
ambient_temp_f      decimal (MN MDA required)
ambient_rh          decimal nullable
wind_speed_mph      decimal (MN MDA required)
wind_direction      string nullable
phi_compliant       boolean — system computes; warns if false
expected_harvest_date date nullable — for PHI calculation
rei_expires_at      timestamp — computed from applied_at + rei_hours
rei_cleared_at      timestamp nullable — when posted as safe to re-enter
rei_cleared_by      FK → users nullable
applicator          FK → users
applicator_license  string nullable — operator certification number if required
notes               text
photo_urls          array, nullable
corrects_id         FK → applications_pesticide, nullable

observations
─────────────
observation_id      PK
plant_batch_id      FK → plant_batches
row_id              FK → rows, nullable
container_id        FK → containers, nullable
observed_at         timestamp
category            "healthy" | "pest" | "deficiency" | "disease" | "damage" | "harvest_readiness" | "other"
severity            "low" | "medium" | "high"
note                text
observer            FK → users
photo_urls          array, nullable
resolved_at         timestamp, nullable
resolution_note     text, nullable
triggered_app_id    text nullable — reference to follow-up application if any

# Fields active only when category = 'harvest_readiness':
maturity_pct        integer, nullable — estimated trichome/pistil maturity 0–100
ready_to_harvest    boolean, nullable — staff judgment: this plant is ready now
harvest_priority    integer, nullable — relative priority within row (1=highest) for
                                        sequencing when not all plants ready simultaneously

# harvest_readiness observations accumulate during the harvest_window batch status.
# They serve two purposes: (1) evidence trail for the management decision to begin
# harvesting, (2) row-level readiness summary for planning harvest processing order.
# The transition to 'harvesting' is a management decision based on this log — not gated.
```

### Container Lifecycle Tables

```
container_state
─────────────
(current state of each container — 1:1 with containers)
container_id        PK / FK → containers
current_state       enum: ready | active | empty | teardown | startup | out_of_service
state_since         timestamp — when entered current state
current_plant_batch_id FK → plant_batches, nullable (set when state IN ('active', 'empty', 'teardown'))
media_first_used    date — when this container was first commissioned with growing media
last_full_replacement date, nullable — most recent FULL media replacement (rare event)
last_teardown_date  date, nullable
last_startup_date   date, nullable
notes               text — current status notes

# Constraints:
# - state='active' requires current_plant_batch_id IS NOT NULL AND an active plant_assignment
# - state='empty' requires current_plant_batch_id IS NOT NULL AND NO active plant_assignment
# - state='teardown' requires current_plant_batch_id IS NOT NULL
# - state IN ('ready', 'startup', 'out_of_service') requires current_plant_batch_id IS NULL

container_state_transitions
─────────────
(append-only log of state changes)
transition_id       PK
container_id        FK → containers
from_state          enum
to_state            enum
transitioned_at     timestamp
transitioned_by     FK → users
plant_batch_id      FK → plant_batches, nullable
trigger_event       enum: batch_assigned | plant_loss | plant_replaced | batch_closed | teardown_complete | startup_complete | manual | other
notes               text

container_amendments
─────────────
(any addition to container media — batch-scoped OR container-only)
amendment_id        PK
container_id        FK → containers
plant_batch_id      FK → plant_batches, nullable (null = container-only event during teardown/startup)
container_state     enum: active | empty | teardown | startup — state when applied
applied_at          timestamp
amendment_type      enum: media_replacement | amendment | inoculation | drench | top_dress | mix_in | correction | removal | other
input_id            FK → crop_inputs, nullable (null for actions like "removed 1/3 media")
input_lot_id        FK → input_lots, nullable
quantity            decimal nullable
quantity_unit       text nullable — e.g. "lb", "cup", "gal", "1/3 volume"
application_method  enum: top_dress | mix_in | drench | side_dress | replaced | removed | other
purpose             text — e.g. "pH correction per Mar 2026 sample", "annual nematode inoculation"
soil_sample_id      FK → soil_samples, nullable (links amendment to driving sample)
applicator          FK → users
notes               text
photo_urls          array, nullable
corrects_id         FK → container_amendments, nullable

soil_samples
─────────────
sample_id           PK
container_id        FK → containers
sub_zone_id         FK → sub_zones, nullable (some samples are composite for the sub-zone)
sample_type         enum: individual | composite_row | composite_subzone
sampled_at          timestamp
sampled_by          FK → users
sample_label        text — physical label put on sample bag
teardown_id         FK → teardown_events, nullable (sample taken during a teardown)
lab_name            text, nullable — where sent for analysis
lab_sent_at         date, nullable
lab_results_at      date, nullable
results_received    boolean default false
lab_report_url      text, nullable — attached PDF of original lab report
notes               text

soil_sample_results
─────────────
(structured results from soil lab; one row per parameter)
result_id           PK
sample_id           FK → soil_samples
parameter           text — e.g. "pH", "EC", "N_ppm", "P_ppm", "K_ppm", "Ca_ppm", "Mg_ppm", "OM_pct", "CEC", "Na_ppm"
value               decimal
unit                text — e.g. "ppm", "%", "meq/100g"
reference_low       decimal, nullable (target range from lab or operator config)
reference_high      decimal, nullable
interpretation      enum: deficient | low | optimal | high | excessive | unknown
notes               text

teardown_events
─────────────
(distinct teardown record — captures the work, not just a state change)
teardown_id         PK
container_id        FK → containers
plant_batch_id      FK → plant_batches (the batch that was harvested out)
started_at          timestamp
completed_at        timestamp, nullable
plant_removed       boolean default false
debris_disposed     boolean default false
container_cleaned   boolean default false
soil_sample_collected boolean default false
soil_sample_id      FK → soil_samples, nullable
performed_by        FK → users
notes               text
photo_urls          array, nullable

startup_events
─────────────
(distinct startup record — captures media work between teardown and ready)
startup_id          PK
container_id        FK → containers
prior_teardown_id   FK → teardown_events, nullable
prior_soil_sample_id FK → soil_samples, nullable (informed amendments)
started_at          timestamp
completed_at        timestamp, nullable
media_replaced_pct  decimal — e.g. 33% for "replace 1/3", 100% for full replacement
media_brand         text — e.g. "Pro-Mix HP"
amendments_applied_count integer default 0
ready_sign_off_at   timestamp, nullable
ready_sign_off_by   FK → users, nullable
performed_by        FK → users
notes               text
photo_urls          array, nullable

plant_loss_events
─────────────
(first-class record of mid-batch plant loss; triggers METRC waste reporting)
loss_id             PK
plant_batch_id      FK → plant_batches
container_id        FK → containers
plant_assignment_id FK → plant_assignments (the assignment terminated by this loss)
metrc_plant_tag     text — denormalized UID at time of loss
occurred_at         timestamp — actual or estimated time of death
discovered_at       timestamp — when discovered (may differ from occurred_at)
loss_type           enum: death_natural | death_disease | death_pest | physical_damage | removal_culled | removal_quality | accidental | other
loss_cause          text — specific cause, e.g. "root rot", "broken stem"
plant_disposition   enum: disposed_compost | disposed_waste | quarantined | tested | other
plant_count         integer default 1 (typically 1; sometimes >1 for batch-level events)
reported_by         FK → users
metrc_sync_status   enum: pending | synced | failed | not_required
metrc_synced_at     timestamp, nullable
notes               text
photo_urls          array, nullable

harvest_batches
─────────────
(a METRC harvest lot — plants harvested together under the same conditions in a 1–2 day window)
(normally one per cultivation batch; a major weather event force-closes the current harvest_batch
and creates a new one for remaining plants under new conditions)
harvest_batch_id    PK
plant_batch_id      FK → plant_batches              -- the cultivation batch
sequence_number     integer default 1         -- 1 normally; increments if weather forces a split
status              enum: in_progress | completed | force_closed
close_reason        enum: completed | weather_event | other
close_notes         text, nullable            -- required when close_reason = weather_event
started_at          timestamp
completed_at        timestamp, nullable       -- set when last final_harvest event recorded
ambient_temp_f      decimal, nullable         -- environmental conditions for this harvest batch
ambient_rh          decimal, nullable
wind_speed_mph      decimal, nullable
metrc_harvest_batch_uid text, nullable        -- assigned in METRC at harvest
started_by          FK → users
closed_by           FK → users, nullable
notes               text

# A cultivation batch moves to 'closed' status automatically when all plant_assignments
# have a final_harvest event across any of its harvest_batches.
# Weather event flow: force_close current harvest_batch → create new harvest_batch
# (sequence_number+1) for remaining plants → cultivation batch stays 'harvesting'.

plant_harvest_events
─────────────
(product-generating harvest events — partial harvest and final harvest are peers;
 the only difference is whether the plant survives)
harvest_event_id    PK
harvest_batch_id    FK → harvest_batches
plant_batch_id      FK → plant_batches              -- denormalized for query convenience
plant_assignment_id FK → plant_assignments
container_id        FK → containers
event_type          enum: partial_harvest | final_harvest
                    -- partial_harvest: plant remains active, multiple allowed per plant
                    --                 METRC maps this as "manicure" — do not use that term in UI
                    -- final_harvest:  plant is cut; triggers plant_assignment unassignment
                    --                 (reason: harvested) and container → teardown
harvested_at        timestamp
product_type        enum: flower | larf | popcorn | trim_product | other
wet_weight          decimal
weight_unit         text                      -- e.g. "g", "oz", "lb"
applicator          FK → users
notes               text
photo_urls          text, nullable            -- JSON array
metrc_sync_status   enum: pending | synced | failed | not_required
metrc_synced_at     timestamp, nullable

# Constraint: event_type = 'partial_harvest' requires batch.status = 'harvesting'
# Constraint: event_type = 'final_harvest' requires batch.status = 'harvesting'
# On final_harvest: unassign plant_assignment (reason=harvested), container → teardown,
#   check if all plants in batch are final_harvested → if so, batch → closed

plant_waste_trim_events
─────────────
(waste-generating trim events — distinct from harvest events, occur throughout full lifecycle)
(generates waste, not product; requires reason, wet weight, and tracks disposal lifecycle)
waste_trim_id       PK
plant_batch_id      FK → plant_batches
container_id        FK → containers, nullable
row_id              FK → rows, nullable       -- for row-level trim events
plant_assignment_id FK → plant_assignments, nullable
harvest_batch_id    FK → harvest_batches, nullable  -- set if occurring during harvesting stage
harvest_event_id    FK → plant_harvest_events, nullable  -- set if tied to a specific harvest event
trimmed_at          timestamp
trim_reason         enum: defoliation | lollipoping | ipm_removal | disease_removal |
                          pest_damage | physical_damage | senescence | other
trim_reason_notes   text, nullable
wet_weight          decimal
weight_unit         text                      -- e.g. "g", "oz", "lb"
waste_status        enum: collected | held | disposed | reported
                    -- collected: material removed and weighed, not yet disposed
                    -- held: quarantine, testing, or awaiting disposal window
                    -- disposed: composted, incinerated, etc. per disposition field
                    -- reported: METRC waste/destruction event synced
waste_status_updated_at timestamp
disposed_at         timestamp, nullable
disposition         enum: composted | incinerated | quarantined | tested | other
disposed_by         FK → users, nullable
applicator          FK → users
notes               text
photo_urls          text, nullable            -- JSON array
metrc_sync_status   enum: pending | synced | failed | not_required
metrc_synced_at     timestamp, nullable
```

### Audit & Compliance

```
metrc_sync_log
─────────────
sync_id             PK
sync_type           "additive" | "plant_batch" | "plant_tag_assignment" | "plant_waste" | "harvest" | "other"
plant_batch_id      FK → plant_batches, nullable
related_id          text, nullable — ID of the source record (loss_id, harvest_id, etc.)
synced_at           timestamp
status              "success" | "failed" | "pending"
payload             JSON
response            JSON
error               text, nullable
```

All tables should have `created_at`, `updated_at`, and `created_by`/`updated_by` audit columns per our framework conventions.

---

## Business Rules — Hard Requirements

These are non-negotiable. If implementation forces a tradeoff, flag it before deviating.

### General

1. **Recipes are immutable once approved.** Applies to both fertigation_recipes and foliar_recipes. To change a recipe, create a new version. Applications always reference the exact version applied.

2. **Sub-zones are permanent identifiers.** Never rename, renumber, or recycle. Z1A is Z1A forever.

3. **Container IDs follow the pattern `Z{zone}-{sub}-R{row}-C{container}`**. Example: `Z1-A-R3-C12`. This is the canonical format in all displays, exports, and reports.

4. **Every application and observation must capture the applicator/observer.** Anonymous entries are not permitted across any of the four application types.

5. **No deletion of audit records.** Mistakes get corrected via a follow-up entry with a `corrects_id` reference. Original record is preserved for the 5-year retention requirement (MN Statute 342.25).

6. **METRC UID is optional at batch creation but required before harvest.** System should warn but not block creation without it.

7. **All timestamps in the database are UTC.** All display is America/Chicago (operation is in MN). Use the framework's timezone helpers.

8. **Date math is calendar-day based, not 24-hour periods.** "Day 9 of growth" means the 9th calendar day from sow_date in America/Chicago. Use the framework's date utilities.

### Crop Input Classification (Intake)

9. **EPA number = pesticide. No exceptions.** When a user enters a crop input with any value in `epa_reg_no`, the system must restrict `category` to pesticide-family values (`pesticide`, `fungicide`, `biocontrol_pesticide`) and prevent saving as `fertilizer`, `foliar_nutrient`, `amendment`, or `biocontrol_non_pesticide`. This is enforced at the data layer with a CHECK constraint, not just UI validation.

10. **A product's category is set at creation and is effectively immutable.** Changing a product's category retroactively would corrupt application records. To "reclassify" a product, create a new crop_input entry with the corrected category and mark the old one inactive. Existing application records continue to reference the original.

### Fertigation Applications

11. **EC and pH are required on every fertigation application.** If a meter is broken, applicator records "meter-error" in notes and a numeric placeholder — but the field is not nullable. Forces honest data capture.

### Foliar Applications (Non-Pesticide)

12. **Foliar applications require a purpose** (preventive, deficiency correction, growth stimulant, etc.). Captures the *why*, which audits ask about.

13. **Foliar applications cannot use pesticide-class products.** If the product's category is `pesticide`, `fungicide`, or `biocontrol_pesticide`, the system must redirect to the Pesticide Application form. Even if applied via spray, the regulatory framing differs.

14. **Foliar applications enforce PHI even on non-pesticide biologicals.** Live biological products (B. subtilis, mycorrhizae, etc.) can cause microbial test failures at harvest lab. The system computes `phi_compliant` against `phi_days_operational` and `input_phi_stage_overrides`. **If a biological foliar is applied during a prohibited stage (e.g. "no biological foliars after flower week 3"), the system blocks the entry unless explicitly overridden with documented reason.**

### Soil Amendments (See Container Lifecycle)

15. **Soil amendments are container-scoped, not batch-scoped.** All soil amendments — including those applied during an active batch — are recorded in the `container_amendments` table, not in an application table. This preserves the amendment in the container's permanent history. When an amendment is applied during an active plant batch, the `plant_batch_id` field captures the plant batch context. See Container Lifecycle rules (30–40) for full requirements.

### Pesticide Applications — Strictest Compliance

16. **Pesticide applications require an input_lot_id.** Lot tracking is non-negotiable for pesticides — auditors will ask which lot was applied when.

17. **Pesticide applications require target_pest, ambient_temp_f, and wind_speed_mph at minimum.** These are MN MDA-standard fields per Statute 18B.37. Even though our operator is currently unlicensed (pursuing a private license), the system captures these for: (a) future compliance once licensed, (b) METRC and MN Statute 342.25 cultivation record requirements, (c) good defensive recordkeeping in case of any audit.

18. **PHI must be checked at application time and uses `phi_days_operational`, not `phi_days_label`.** If `expected_harvest_date - applied_at < phi_days_operational`, the system must warn and require explicit override with notes documenting why. **Block harvest** of any batch where last pesticide application < phi_days_operational before harvest_date.

19. **Stage-specific PHI rules apply.** If `input_phi_stage_overrides` has an entry for the current batch stage with `allowed = false`, the system blocks the application entirely (no override) and explains why. This handles cases like "no biological foliars after flower week 3" where the issue isn't days-from-harvest but a stage-based contamination concern.

20. **REI must be enforced.** When a pesticide application is logged, the system computes `rei_expires_at`. Until cleared, the sub-zone/row should be visually flagged as "REI active — do not enter." Re-entry requires a `rei_cleared_at` and `rei_cleared_by` entry.

21. **Applicator license capture.** The `applicator_license` field is **optional** today (operator is unlicensed). It is **required** if a restricted-use pesticide is applied. The system must block RUP applications when no license number is provided. Once the private applicator license is obtained, the operator profile can store the license # for auto-fill, but the system still records it per-application for audit history.

22. **MDA-ready, not MDA-required.** Pesticide records are captured to MDA standards (Statute 18B.37 fields) so they can be exported on demand. Since the operation is not currently a commercial applicator, MDA reporting is not mandatory. The export exists to support: (a) future licensing, (b) voluntary disclosure if requested, (c) defensive recordkeeping.

### Plant Assignment & Scanning

23. **Multiple plants per container are supported.** A container may have more than one active plant assignment simultaneously. `plant_batches.plants_per_container` records the intended density for the plant batch (default 1; 2 is common for autoflowers). There is no unique constraint on `(container_id, unassigned_at IS NULL)`. Container state `active` means one or more active assignments; `empty` means zero active assignments within an active plant batch.

24. **One active assignment per METRC tag.** A METRC plant tag can only be actively assigned to one container at a time. If scanned and already assigned elsewhere, the system requires explicit reassignment (which unassigns the prior container with a reason).

25. **METRC tag format validation.** All METRC plant tags must be 24 characters per METRC's standard format. The system validates format at entry/scan time.

26. **Tag-container desync detection.** When a METRC tag is scanned, the system shows the container it's assigned to. If the operator is physically at a different container (verified by separately scanning that container's QR), the system flags a potential desync requiring resolution.

27. **Scan history is preserved.** Every scan (successful or failed, resulting in change or not) can optionally be logged in `scan_history` for audit purposes. Failed scans particularly important — they reveal labeling/tag issues.

28. **Harvest requires container scan + visual tag verification.** When harvesting a plant, the operator must (a) scan the container's QR to load the assigned METRC tag, and (b) visually verify the last 4 digits of the physical tag match what the app displays. Mismatches block the harvest entry and require reconciliation. This is the practical alternative to direct RFID scanning of the plant tag, which is impractical due to tag placement and UHF interference in dense grow environments.

29. **No silent reassignment.** Reassigning a METRC tag to a different container requires explicit operator confirmation showing the previous container, the reason, and the new container. Logged as both an unassignment and a new assignment.

### Container Lifecycle

30. **Container state must be valid for its plant batch relationship.** The system enforces:
    - `active` requires `current_plant_batch_id IS NOT NULL` AND one or more active plant_assignments
    - `empty` requires `current_plant_batch_id IS NOT NULL` AND NO active plant_assignments
    - `teardown` requires `current_plant_batch_id IS NOT NULL`
    - `ready`, `startup`, `out_of_service` require `current_plant_batch_id IS NULL`
    Invalid combinations are rejected at the data layer.

31. **A container must be in `ready` state to receive a new plant batch assignment.** No exceptions. Containers in `teardown`, `startup`, `empty`, or `out_of_service` cannot accept a new plant batch.

32. **Plant loss events automatically transition state to EMPTY.** Recording a plant_loss_event:
    - Unassigns the corresponding plant_assignment with the loss reason
    - Transitions container state from ACTIVE to EMPTY
    - Updates batch plant_count (derived) 
    - Queues METRC waste event for reporting

33. **Mid-batch replacement is supported.** An EMPTY container can receive a new plant assignment within the same batch (same strain). State transitions back to ACTIVE. The previous loss and new assignment are both preserved in history.

34. **Batch close transitions all containers to TEARDOWN.** When a batch's status changes to `closed` (or final harvest occurs), every container assigned to that batch — whether ACTIVE or EMPTY — transitions to TEARDOWN. Empty containers skip the "remove plant" step but still go through cleaning, soil sampling, etc.

35. **Teardown requires soil sample collection (strongly recommended).** A teardown_event with `soil_sample_collected = false` is allowed but flagged. The system reminds operators that soil samples drive the startup amendment decisions.

36. **Startup amendments should reference the driving soil sample when possible.** When entering a container_amendment during STARTUP state, the system pre-fills `soil_sample_id` from the most recent sample for that container. Operator can override.

37. **Container readiness requires sign-off.** A container cannot transition from STARTUP to READY without a `ready_sign_off_at` and `ready_sign_off_by`. The sign-off confirms amendments are complete and the container is suitable for new planting.

38. **Container history is permanent.** All container_amendments, teardown_events, startup_events, soil_samples, and state_transitions are append-only. The 5-year retention rule applies to container history just as it does to batch history.

39. **Plant loss records require METRC sync.** Every plant_loss_event must have `metrc_sync_status` tracked. The system surfaces unsynced losses as action items until reported to METRC (manually in Phase 1, automatically in Phase 4).

40. **Plant_count_current is derived, not edited.** This value is always computed from the count of active plant_assignments for the batch. Manual edits are rejected. The system can choose to cache for performance, but the source of truth is the assignment table.

### Harvest Lifecycle

41. **Harvest-ready is a batch-level state, not a plant-level state.** Individual plant maturity is captured via `harvest_readiness` observations (container-level). The batch status transition from `harvest_window` to `harvesting` is a management decision based on the observation log. No individual plant state change is required or supported.

42. **The `harvest_window → harvesting` transition is logged but not gated.** It requires `transitioned_by` (FK → users) and `notes` referencing the observation evidence. No approval queue. The manager makes the call and records it.

43. **Harvest events require `harvesting` batch status.** Both `partial_harvest` and `final_harvest` events are blocked unless the batch status is `harvesting`. This enforces the harvest-ready gate.

44. **Partial harvest leaves the plant alive.** A `partial_harvest` event records product wet weight but does not unassign the plant or change container state. Multiple partial harvests are allowed per plant per harvest batch. METRC maps this as "manicure" — do not use the term "manicure" anywhere in the UI or codebase; use "partial harvest."

45. **Final harvest kills the plant.** A `final_harvest` event records product wet weight, unassigns the plant_assignment (reason: `harvested`), and transitions the container to `teardown`. One per plant.

46. **Harvest must complete within 1–2 days under consistent conditions.** A harvest batch is a time-bounded event. Environmental conditions (temp, RH, wind) are recorded on the harvest_batch and apply to all events within it.

47. **Weather events force-close the harvest batch, not the cultivation batch.** A major weather event that disrupts harvest:
    - Sets current `harvest_batch.status = force_closed` with `close_reason = weather_event` and required `close_notes`
    - Creates a new `harvest_batch` (sequence_number+1) for remaining plants under new conditions
    - The cultivation batch remains in `harvesting` status until all plants have a `final_harvest` event
    - No pause state exists — the harvest batch closes and a new one begins

48. **Batch closes automatically when all plants are final-harvested.** When the last `final_harvest` event is recorded across all harvest_batches for a cultivation batch, the batch status transitions to `closed`. No manual close action required.

49. **Waste trim is independent of harvest status.** `plant_waste_trim_events` can be recorded at any batch status (field-veg, field-flower, flush, harvest_window, harvesting). No harvest-ready prerequisite. Waste trim generates waste, not product.

50. **Waste trim requires wet weight and reason.** Both fields are non-nullable. The reason captures the why (defoliation, IPM removal, disease removal, etc.) — not the material type. Waste trim has its own disposal lifecycle (`collected → held → disposed → reported`) and must be reported to METRC.

51. **Harvest and waste trim are peer event types, not parent-child.** `plant_waste_trim_events` that occur during a harvest session may optionally reference a `harvest_event_id` for context, but they are first-class records in their own right — not sub-records of harvest events.

---

## Application Surface — Screens & Workflows

Each screen below is a feature increment. Build in this priority order unless directed otherwise.

### Phase 1 — MVP (build first)

**1. Fertigation Recipe Library**
- List view of all 7 fertigation recipes with current version and active status
- Detail view: ingredients, rates, EC/pH targets, mixing order, version history
- Edit form (creates new version on save — old version preserved)
- Print/Export: PDF recipe card per recipe (visual style should match the wall chart PDF in `/reference/` — Fraunces serif headers, JetBrains Mono for numbers, earthy palette: cream `#faf6ed`, leaf-dark `#1f3320`, rust `#a04727`)

**2. Foliar Recipe Library**
- Same structure as fertigation but for foliar mixes
- Initially empty — recipes added as the operation defines repeat foliar mixes
- Same versioning and approval flow

**3. Crop Input Inventory**
- List view: all inputs with **category**, manufacturer, EPA/OMRI/MN reg #, current lot, expiration
- Filters by category (fertilizer, foliar nutrient, amendment, pesticide, fungicide, biocontrol)
- Detail/edit form with category-specific fields (PHI/REI/signal word/target organisms appear for pesticides only)
- Lot tracking: receive new lot, deplete on use, expire automatically
- **Required: Safety Data Sheet upload for pesticides**

**4. Batch Management**
- Batch list with current status, days-in-stage, sub-zone, strain
- Create new batch: pick strain, sub-zone, plant count, sow date, expected harvest date
- Batch lifecycle actions: "Move to Seedlings", "Move to Cult-Hoop", "Move to Field", "Begin Flower", "Begin Flush", "Begin Harvest Window", "Begin Harvesting", "Close Batch"
  - "Begin Harvest Window" → `flush → harvest_window`; enables harvest_readiness observations
  - "Begin Harvesting" → `harvest_window → harvesting`; management action, requires notes referencing observation log; enables harvest events
- Each transition timestamped, recorded_by
- Fertigation recipe transitions tracked separately (a batch can be in "Field" status while transitioning from AUTO-VEG to AUTO-FLOWER recipe)
- **Active REI/PHI status visible on each batch card**
- **Harvest window: row readiness summary visible on batch card** — "Z1-A-R1: 28/30 ready" etc.

**5. Fertigation Application Entry**
- **Field-optimized per the Field UX Requirements section** — three-tap maximum, thumb-zone save, large touch targets
- Quick-entry form: pick batch → pre-fills active fertigation recipe → enter volume/EC/pH → save
- "Recent applications" view for the day, allowing edits within 24h, then locked
- Bulk entry: "Apply [recipe] to [sub-zones A, B, C] at [time]" — for days when multiple batches get same treatment

**6. Foliar Application Entry (Non-Pesticide)**
- **Field-optimized per the Field UX Requirements section**
- Form: batch, row/container target, foliar recipe OR single product, rate, purpose, applicator
- Product picker filtered to non-pesticide categories only — if user selects a product with an EPA number, system redirects to Pesticide Application Entry
- **PHI check banner for biological products** — even non-pesticide biologicals enforce operational PHI; if applying during a stage flagged in `input_phi_stage_overrides` (e.g., "no biological foliars after flower week 3"), system blocks with explanation
- Photo attachment recommended

**7. Container Amendment Entry**
- Form for adding amendments to container media: compost, nematodes, mycorrhizae, organic matter, pH correctors, biological inoculants, etc.
- Trigger paths:
  - From a container record (scanned via QR or selected): "Add Amendment"
  - From startup workflow (#25): amendments pre-populated from soil sample recommendations
  - From an active batch: visible in container amendment history with batch context
- Form fields: container, amendment type, product, lot, quantity, application method, purpose, applicator, optional photo
- Product picker filtered to `amendment`, `biocontrol_non_pesticide` categories (and `fertilizer` for soil-applied non-foliar use)
- Automatically captures container's current state (active/empty/teardown/startup) — appears in record
- If applied during an active plant batch, captures `plant_batch_id` to enable plant-batch-scoped views

**8. Pesticide Application Entry — Distinct Form**
- **Separate, prominent screen** — not buried in a generic "application" flow
- **Reached automatically if user picks an EPA-registered product from any other application form**
- Form: batch, row/container target, product (filtered to pesticide-family categories), **lot (required)**, rate, volume, application method
- **Required environmental capture: ambient temp, wind speed, wind direction**
- **Required: target pest selection** from a controlled vocabulary (extensible list per product)
- **PHI check banner** at top of form using `phi_days_operational` — red if non-compliant, requires override notes (note: operational PHI may be stricter than label PHI)
- **Stage-block check** — if `input_phi_stage_overrides` says this product is not allowed in the current batch stage, blocks the application entirely with explanation (no override)
- **REI calculation displayed** with timestamp when REI expires
- **Applicator license # field** — optional today, becomes required if a restricted-use pesticide is selected
- Photo attachment recommended
- On save: creates "REI active" status flag on affected location until cleared
- **Full-screen REI confirmation modal** on save — applicator must acknowledge before exiting

**9. REI Status Dashboard**
- At-a-glance view of all active REIs across all sub-zones/rows
- Clear-REI action (sign-off when posted as safe to re-enter)
- **Full-screen warning modal** whenever an applicator attempts entry into a row with active REI — must acknowledge to proceed
- Persistent banner on Today screen if any REI is active

**10. Observation Logging**
- Quick form: batch, row/container, category, severity, note, optional photo
- **Voice input** supported for notes
- Inspection mode: walk a row, tap-through containers, log issues (see Field UX → Inspection Mode)
- Option to "flag for follow-up" — creates a task for foliar or pesticide treatment
- **Harvest readiness mode** (active during `harvest_window` batch status):
  - Category pre-set to `harvest_readiness`
  - Additional fields: maturity_pct (0–100 slider), ready_to_harvest (yes/no), harvest_priority
  - Row summary view after completing a row: "28/30 ready"

**11. METRC Application Export**
- Filter by date range and/or batch
- Generates CSV/PDF formatted for METRC "Record Additives" entry
- **Includes all four application types** (fertigation, foliar, amendment, pesticide)
- Marks records as "exported" with timestamp

**12. MN MDA Pesticide Report Export (MDA-Ready)**
- Per-month or per-date-range export of all pesticide applications
- **Matches MDA template field-for-field** per Statute 18B.37
- PDF and CSV formats
- Not required for current (unlicensed) operations; available on demand for future licensing and defensive recordkeeping

**13. Cultivation Record (Audit Export)**
- Per-batch complete history PDF
- Includes: batch details, every fertigation/foliar/amendment/pesticide application with full input expansion, every observation, recipe versions used, supervisor sign-offs, all REI clearances, all harvest events (partial and final) with wet weights, all waste trim events with disposal records
- Designed for regulator handoff — meets MN Statute 342.25 record requirements

**14. Today Screen (App Home)**
- See Field UX Requirements → "The Today Screen"
- This is the app's front door — not a generic dashboard
- Surfaces active REIs, pending tasks, recent entries, sync status, and at-a-glance batch cards

**15. QR Code Container Scanner — The Universal Entry Point**
- Camera-based scan view with full-screen viewfinder, tap-to-focus, flash toggle
- On successful scan of a container QR (e.g. `Z1-A-R3-C12`): app navigates directly to that container's record
- Container record shows: position, current batch assignment, METRC plant tag (if assigned), strain, days-in-stage, recent activity, observations, REI/PHI status
- From container record, one-tap entry to: Add Observation, Log Foliar, Log Amendment, Log Pesticide, Add Photo, Begin Harvest
- Failure handling: clear full-screen error if QR doesn't decode or doesn't match a known container

**16. METRC Plant Tag Assignment**
- Workflow: scan container QR → if no tag assigned, tap "Assign METRC Tag" → camera opens in barcode-scan mode → aim at printed barcode on the METRC tag → app captures 24-char UID → confirm → assignment recorded
- Manual fallback: type the 24-char UID if camera scanning fails
- Validates: tag not already assigned elsewhere, container not already assigned, format is valid 24-char METRC UID
- **Bulk assignment mode**: streamlined loop for tagging entire batches (scan container → scan tag → next container → next tag)
- Creates `plant_assignments` record

**17. Container Tag Label Printing (Admin)**
- Admin/setup screen to generate printable PDFs of container QR labels
- Selects: all containers, by zone, by sub-zone, or custom subset
- Output: weatherproof Avery-format label sheets (~1" × 2.5" each, 30 per sheet)
- Label content: large QR code + position ID + zone color stripe
- Used for initial setup and replacement of damaged labels

**18. Harvest Workflows**

Requires batch status `harvesting`. Three distinct entry points, all field-optimized.

**18a. Partial Harvest Entry (METRC: "manicure" — do not use that term in UI)**
- Triggered from container record during `harvesting` batch status: tap "Partial Harvest"
- App displays assigned METRC tag last 4 digits for visual verification
- Form: product_type (flower / larf / popcorn / other), wet_weight, weight_unit, notes
- Plant remains active — no state changes triggered
- Multiple partial harvests allowed per plant per harvest batch
- METRC sync queued as partial harvest lot

**18b. Final Harvest Entry**
- Triggered from container record: tap "Final Harvest"
- **If container has multiple active assignments** (plants_per_container > 1), app lists all assigned plants — operator selects which plant is being harvested
- App displays the selected METRC tag's last 4 digits in large text (e.g., "...6789")
- Operator visually verifies the physical tag on the plant matches the displayed digits
- Tap "Confirm match" — proceed; or "Mismatch — investigate" — opens reconciliation flow
- Form: product_type, wet_weight, weight_unit, notes
- On save:
  - plant_harvest_event (final_harvest) recorded
  - Plant assignment unassigned (reason: `harvested`)
  - Container transitions to `teardown`
  - Batch plant_count_current updated
  - System checks if all plants in batch are final-harvested → batch auto-closes if so
- METRC sync queued (Phase 4 pushes to METRC API; Phase 1 queues for manual entry)

**18c. Waste Trim Entry**
- Available at any batch status (not gated on `harvesting`)
- Triggered from container record or row record: tap "Record Waste Trim"
- Form: trim_reason (controlled vocabulary), wet_weight, weight_unit, notes
- Waste lifecycle captured: status starts as `collected`
- Waste disposal confirmation flow: operator marks `disposed` with disposition when complete
- METRC waste sync queued

**18d. Weather Event — Force Close Harvest Batch**
- Triggered from harvest batch record: "Force Close (Weather Event)"
- Requires close_notes describing the weather event
- Creates new harvest_batch (sequence_number+1) for remaining plants
- UI surfaces which plants have been final-harvested and which remain
- Cultivation batch stays in `harvesting` — harvest continues under new batch

**19. Plant Loss Quick Action**
- Lightweight, fast-entry form for mid-batch plant loss
- Trigger: scan container QR → "Record Plant Loss" button on container record
- Form fields (mobile-optimized, three-tap completion target):
  - Loss type (controlled vocabulary: death_natural, death_disease, death_pest, physical_damage, removal_culled, removal_quality, accidental, other)
  - Loss cause (free text, voice-input supported)
  - Plant disposition (controlled vocabulary)
  - Optional photo
- On save:
  - plant_loss_event recorded
  - plant_assignment unassigned (reason from loss_type)
  - Container state transitions ACTIVE → EMPTY
  - Batch plant_count_current updates automatically
  - METRC waste event queued (visible as action item until synced)
- **Designed for speed** — most common plant loss should be 3 taps from container scan to saved

**20. Mid-Batch Plant Replacement Workflow**
- Distinct from quick loss entry — used when assigning a replacement plant
- Trigger: from EMPTY container record, tap "Assign Replacement Plant"
- Constraint: replacement must be same strain as the batch
- Workflow: confirms strain → scan METRC tag of replacement plant → confirm assignment
- Creates new plant_assignment, transitions container state EMPTY → ACTIVE
- Records the replacement context (which loss it replaces, when)
- Batch plant_count_current updates automatically

**21. Container Detail / History View**
- Shows full container record:
  - Position, pot size, current state, current batch (if any), assigned METRC tag (if any)
  - State history (chronological list of state transitions)
  - Complete amendment history (every container_amendment, oldest first or newest first)
  - All teardown_events and startup_events with their associated soil samples
  - Past batches that have occupied this container
  - Cumulative metrics: total amendments applied, last soil sample summary, last full media replacement date
- Available filters: amendments only, teardowns only, by date range
- Print/Export: container lifetime report PDF for audit purposes

**22. Container Status Dashboard**
- At-a-glance view of all 1,180 containers grouped by state
- Filter by zone, sub-zone, or state
- Card view shows: position, current state, current batch (if any), days in state, any flags
- Click a container card to open Container Detail view
- Summary counts: "X active, Y empty, Z in teardown, W in startup, V ready"

**23. Teardown Workflow**
- Triggered when a batch is closed or when an individual EMPTY container needs teardown
- Guided checklist:
  - Remove plant material (if any) ✓
  - Dispose debris ✓
  - Clean container ✓
  - Collect soil sample? (Yes/No → if yes, opens Soil Sample Entry)
  - Performed by (applicator)
  - Notes / photos
- On completion: container state transitions to TEARDOWN, teardown_event created

**24. Soil Sample Entry & Tracking**
- Form for collecting and tracking soil samples through lab analysis lifecycle
- Initial entry: sample label, container or sub-zone, sample type, sampled by, lab destination
- Sample-sent status (date sent to lab)
- Lab results entry — when results return:
  - Per-parameter structured entry (pH, EC, N_ppm, P_ppm, K_ppm, Ca_ppm, Mg_ppm, OM_pct, CEC, etc.)
  - Reference ranges (configurable per parameter)
  - Interpretation flags (deficient/low/optimal/high/excessive)
  - Free-text notes
  - PDF attachment of original lab report
- View prior samples for a container with trend visualization (Phase 3)

**25. Startup Workflow**
- Triggered from TEARDOWN state when ready to begin soil rebuild
- Prerequisite: prior soil sample results entered (warning if not, can proceed with documentation)
- Guided checklist:
  - Media replacement (specify % — default 33%)
  - New media added (brand, quantity)
  - Amendments to apply (pre-populated list based on soil sample recommendations)
  - Per amendment: confirm product, lot, quantity, application method
  - Each amendment creates a container_amendment record linked to the sample and startup_event
- Sign-off: applicator confirms container is ready for next batch
- On completion: container state transitions STARTUP → READY

**26. Today Screen (App Home)**
- See Field UX Requirements → "The Today Screen"
- This is the app's front door — not a generic dashboard
- Surfaces active REIs, pending tasks, recent entries, sync status, and at-a-glance batch cards
- **Additional surfaces for container lifecycle:**
  - Containers in TEARDOWN awaiting soil sample
  - Containers in STARTUP awaiting amendments
  - Soil samples sent to lab awaiting results
  - Unsynced plant loss events needing METRC reporting

### Phase 2 — Field Operations Enhancement

**Field Operations:**
- **Sub-zone Field Maps** — visual layout of each zone showing current container status (color-coded by state), clickable to log observations or scan containers
- **Inspection Mode** — tablet-optimized row walks with swipe navigation between containers (see Field UX → Inspection Mode)
- **Offline Mode hardening** — robust sync queue with conflict resolution
- **Photo Capture from any screen** — persistent camera button in toolbar, auto-tags with current context

**Enhanced Container Workflows:**
- **Bulk METRC tag assignment mode** — streamlined scan-container/scan-tag loop for tagging entire batches
- **Bulk Teardown / Startup** — process multiple containers at once when batch closes
- **Audit Mode** — guided container-by-container verification workflow with discrepancy reporting
- **Move/Transplant Tracking** — when a plant is moved between containers, app records the transition with both container scans (preserves audit history)
- **Soil Sample Tracker** — dashboard of all samples and their lab status

**Performance & Quality:**
- **Voice Input** — for observation notes, target pest descriptions, free-text fields
- **Photo Galleries per Container** — viewable history of all photos taken against a container/plant over time
- **Improved Search** — quickly find batches, containers, or applications by partial input

### Phase 3 — Intelligence

- **Annual Batch Tracker** — Gantt-style view of all batches across the year by sub-zone
- **Trend Charts** — EC/pH over time per batch, deviation from targets
- **Recipe Performance** — yield outcomes correlated with recipe versions used
- **Cross-batch Comparisons** — strain × sub-zone × recipe performance analysis
- **Applicator Performance** — measurement consistency, application timing reliability
- **Pesticide Use Reporting** — annual summaries for license renewal

### Phase 4 — METRC API Integration

- Direct API push for batch creation, plant tag assignment, application records
- Two-way sync to detect manual METRC edits
- Reconciliation reports
- Automated METRC submission of harvest weights and plant disposals

---

## Hatstak App Family Integration

This application is a **peer application within the `hatstak.app` family**, deployed at `cultivate.hatstak.app`. It is NOT a sub-route of another app — it has its own subdomain, like other apps in the family. However, it inherits significant shared infrastructure from the family conventions.

### What This Application Inherits from the Family

- **Authentication and session management** — shared across all hatstak.app subdomains (single sign-on)
- **User identity and role/permission model** — extend if needed (e.g. add a `cultivation_role` attribute if required), but do not fork the user table
- **Global navigation shell and family branding** — header, footer, app switcher
- **Theme and design tokens** — colors, typography, spacing, component library
- **Layout primitives** — page containers, headers, common widgets
- **Notification/toast system**
- **Form components, modals, date pickers, etc.**
- **API conventions** — how endpoints are organized, error formats, request/response patterns
- **Database connection and migration tooling**
- **Build, lint, test, and deploy pipelines**

### What This Application Owns

- The `cultivate.hatstak.app` subdomain and all its routes
- All cultivation-domain data tables (recipes, batches, applications, etc.)
- All cultivation-domain UI screens (lists, forms, detail pages)
- All cultivation-domain business logic (recipe versioning, batch lifecycle, METRC export, MDA reporting, PHI/REI enforcement)
- Domain-specific UI components only when the family's component library doesn't provide an equivalent

### Style Continuity for Printed Outputs

Printed outputs (recipe cards, cultivation records, METRC exports, MDA pesticide reports) should match the visual style of the existing wall chart PDF in `/reference/` — Fraunces serif headers, JetBrains Mono for numerical data, earthy palette (cream `#faf6ed`, leaf-dark `#1f3320`, rust `#a04727`). This is **specifically for printable PDFs**, not for the in-app UI, which inherits the hatstak.app family theme.

The reason: cultivation staff already use the wall chart and recipe binder in physical form. Maintaining visual continuity between paper and printed app outputs reduces cognitive overhead during compliance reviews.

---

## Field UX Requirements — The Most Important Section

**This section governs how every screen must be designed and tested.** The application's success depends entirely on whether it's faster and easier than paper for cultivation staff working in the field. If a screen is awkward in field conditions, it will be abandoned, and compliance recordkeeping will collapse. Build for the field first; desk-use is a happy byproduct.

### Operating Conditions to Design For

Cultivation staff use this app in conditions that are hostile to typical app design assumptions:

- **Dirty or gloved hands** — fingers may be muddy, wet, or covered in nitrile gloves. Standard touch precision is impaired.
- **One-handed operation** — the other hand is holding a hose, sprayer, EC meter, clipboard, or container.
- **Sun glare** — outdoor cultivation areas have direct sunlight; screen brightness fights with ambient light. High-contrast UI is essential.
- **Standing in a row** — applicator is moving down a row, looking at plants, glancing at the screen for verification. The phone is not the focus of attention.
- **Memory pressure** — applicator just measured EC=0.84 and needs to record it before forgetting. Every second of friction risks data loss.
- **Interruptions** — a helper asks a question mid-entry, applicator returns to the form 30 seconds later. Auto-save must preserve everything.
- **Spotty connectivity** — the field, hoop house, and parts of the grow facility have weak or no WiFi. The app must work offline.
- **Boots and gloves** — applicator may not be able to remove gloves to type. Voice input and large tap targets help.

### Hard UX Rules

1. **Minimum touch target: 56pt × 56pt.** Larger than Apple/Google's 44pt guidance because of gloved use. Critical action buttons (save, submit) should be 64pt+.

2. **Primary actions live in the thumb zone.** Bottom 1/3 of the screen, reachable by the right or left thumb without re-gripping. Save/submit/confirm buttons go at the bottom, never at the top. Top of screen is for context (current batch, status), not actions.

3. **Auto-save every field on blur or 3 seconds of inactivity.** Never lose a partial entry. Recovery on reload is required.

4. **Offline-first.** Every entry succeeds locally and queues for sync. The applicator never sees "couldn't save — network error." A small sync status indicator shows queue depth and last successful sync time.

5. **Pre-fill everything that can be inferred:**
   - **Applicator** = currently logged-in user
   - **Timestamp** = now (editable if back-dating)
   - **Active recipe** = the batch's current recipe at this timestamp
   - **Last-used values** = e.g., if the same applicator just logged for sub-zone 1A, suggest those numbers as defaults for 1B
   - **Environmental data** = pull from connected sensors if available (Phase 3); otherwise use the last value recorded today

6. **Controlled vocabulary over free text.** Pickers, chips, and tag selectors instead of typing wherever possible. Target pest, purpose, observation category, and recipe selection should all be tap-to-select. Free text only for notes.

7. **Numeric inputs use the numeric keypad.** Force `inputmode="decimal"` for EC/pH/volume; `inputmode="numeric"` for counts. Never force the applicator to switch keyboard modes.

8. **Visual feedback for every save:**
   - Haptic tap on submit
   - Color change confirmation (green flash or border)
   - Checkmark icon
   - Toast: "Saved · Synced" or "Saved · Pending sync"
   - Auto-dismiss after 2 seconds so the screen returns to workflow

9. **Three-tap maximum for the most common task.** Fertigation application entry should be: (1) open app to today screen, (2) tap the batch row, (3) confirm pre-filled values and tap save. Anything more is a design failure.

10. **High-contrast colors.** Text-to-background contrast minimum 7:1 (WCAG AAA), not 4.5:1. Reduces sun-glare illegibility.

11. **No modal stacks.** One modal at a time. If the current task requires confirmation, use a slide-up sheet, not a stacked dialog.

12. **REI and PHI alerts are full-screen modals, not toasts.** When an applicator tries to enter a row with active REI, the screen takes over with a red warning that requires explicit dismissal (tap "I understand, REI active until X:XX") before proceeding. Toasts are missable; safety warnings must not be.

13. **Photo capture available from every screen.** A camera icon in the persistent toolbar. Photos auto-tag with current batch/row/container context. No need to navigate to a "photo" feature.

14. **Voice input for notes.** Long-press a notes field opens voice transcription. Especially important for observation notes where the applicator might want to describe what they're looking at without typing.

15. **Persistent context breadcrumb.** Every screen shows at the top: "Batch · Strain · Sub-Zone" so the applicator always knows what they're recording for. Tapping it returns to batch context.

### The "Today" Screen — The App's Front Door

The app opens to a **Today screen**, not a generic dashboard. The Today screen is a prioritized list of:

1. **Active REIs** — any sub-zone with active re-entry interval, prominent red banner at top, dismissible after acknowledgment
2. **Pending tasks** — "Fertigation needed: Z1A, Z2A, Z3B" based on batch schedules
3. **Recent entries** — the last 5–10 logged applications/observations for quick review/edit
4. **Sync status** — silent green dot when synced; amber if pending; red if failed
5. **Batches at-a-glance** — compact card per active batch showing strain, sub-zone, days-in-stage, current recipe, last application time

Below the fold (scrolling required): full batch list, navigation to inventory, recipes, exports, etc.

The principle: **what does the applicator need to do RIGHT NOW** is the answer to the Today screen.

### Inspection Mode — Optimized for Row Walks

When an applicator chooses "Inspect Row" or scans a row marker:

1. **Phone orients to landscape automatically** (or large vertical cards) — easier to see container layout
2. **Container grid view** — each container shown as a large button labeled with position (C1, C2, ...)
3. **Tap a container** — quick action sheet appears from bottom: "Observation · Foliar · Pesticide · Photo · Note"
4. **Swipe right** — advances to next container in row
5. **Swipe up** — adds observation without leaving the container view
6. **Long-press a container** — captures photo with that container's context
7. **Status colors** on containers: green = healthy, amber = open observation, red = active REI, gray = harvested

The mode should make a 30-container row walkable in under 5 minutes with full observation logging.

### Speed Benchmarks

The system should hit these performance targets in normal field use:

- **App launch to Today screen:** < 2 seconds (cold start)
- **Today screen interaction to batch detail:** < 500ms
- **Fertigation entry submission to next batch:** < 3 seconds total
- **Photo capture and attach:** < 5 seconds
- **Sync queue flush after coming online:** < 30 seconds for typical day's entries
- **Container QR scan to record open:** < 1 second
- **METRC tag barcode scan to capture:** < 2 seconds

If any common workflow exceeds these times, the design needs to be revisited.

---

## Devices, Scanning & Container-Based Plant Tracking

The application is **device-adaptive across phones and tablets** and uses **container QR codes as the primary entry point** for all field operations. METRC plant tags are tracked via the container they're tied to, not scanned directly.

### Why Container QR, Not Direct Plant Tag Scanning

Operational realities make direct plant tag scanning impractical:

- **METRC tags are tied to plants**, often near the stem base or buried in mature canopy. Scanning a tag tied to a 5-foot flowering plant requires kneeling, parting branches, and fighting tag orientation. Slow and ergonomically poor.
- **UHF RFID in dense grow environments has serious interference issues**: tag collision between adjacent plants, signal attenuation from plant tissue (water), reflection from irrigation lines and metal stakes, and effective range collapse from 3 meters to ~30 cm. Reads in a row of 30 containers spaced 18 inches apart are unreliable.
- **Container QR codes are always accessible** — affixed to the rim or stake, never buried in foliage, fixed in a consistent orientation.

### The Solution: Container-as-Anchor Model

The system anchors the digital model to **containers** (stable physical positions), not **plants** (changing biological entities):

```
Container Z1-A-R3-C12 (permanent, never changes)
   │
   └─ Currently assigned: METRC plant tag XYZ123-456-789...
      ├─ Strain: Strain X
      ├─ Batch: Batch 2026-AUTO-3
      ├─ Days in stage: 47
      └─ Last application: 6 hours ago

(When plant is harvested or replaced, the container persists; the assignment changes.)
```

This model means:
- **Every operation starts with a container QR scan** — predictable, fast, ergonomic
- **METRC tag assignment is a one-time event per plant** — recorded at tag application, not re-scanned daily
- **All applications, observations, photos are recorded against the container** — automatically associated with the assigned METRC tag through the mapping
- **No UHF RFID hardware required** — eliminates ~$2,000 per scanner cost and all interference complexity

### Target Devices

**Phones** — staff personal devices (iPhone/Android), used for:
- Ad-hoc observations and quick photo capture
- Spot entries when away from the tablet
- Backup recording if tablets fail

**Tablets** — operation-provided ruggedized tablets, used as the primary field device for:
- Daily fertigation rounds
- Row-walk inspections
- Foliar and pesticide applications (large form, lot picker, environmental data entry)
- Harvest workflows
- Recipe review and on-screen reference

Both must render every screen functionally, but the app should detect device class (touch input + viewport size) and adapt layouts:

| Element | Phone (≤768px) | Tablet (>768px) |
|---------|----------------|-----------------|
| Today screen | Stacked cards, single column | Two-column: batch list left, detail right |
| Batch detail | Tabs for sections (apps, obs, foliar, pest) | Split-pane: section nav left, content right |
| Inspection mode | Container grid, swipe between | Row map + entry form side-by-side |
| Recipe library | List view | Grid view with previews |
| Application entry forms | Full-screen, sequential fields | Compact two-column layout |
| Photo viewer | Full-screen modal | Inline thumbnails + lightbox |

**Critical:** the app must not assume one device class. Sub-flows that work on tablet must also work on phone (perhaps with reduced information density but never broken).

### Container QR Codes — The Universal Entry Point

Every container has a permanent QR code sticker affixed to the rim or stake. The QR encodes the container's position ID (e.g., `Z1-A-R3-C12`).

**Implementation:**
- Camera-based QR scanning (no additional hardware required)
- App uses device camera with a dedicated scan view (full-screen, tap-to-focus, flash toggle)
- Scan detects the container ID → app navigates directly to that container's record screen
- Container record shows: position, assigned METRC tag (if any), current batch, strain, days-in-stage, last activity, observations, REI/PHI status
- From container record, one-tap entry to: Add Observation, Log Foliar, Log Amendment, Log Pesticide, Add Photo

**Tag printing & physical setup:**
- App includes a "Print Container Tags" admin feature that generates a printable PDF sheet of QR labels for any specified set of containers
- Format: weatherproof Avery-style label sheets (likely 30 labels per sheet, ~1" × 2.5")
- Label content: large QR code + human-readable position ID + zone color stripe
- One-time setup task: print and apply 1,180 labels (~$355 for stickers + ~6 hours labor)
- Replacement workflow: damaged labels can be reprinted individually from the admin screen

### METRC Plant Tag Capture — Via Camera or Manual

METRC plant tags have a printed barcode (1D Code 128 or 2D Data Matrix) of the 24-character UID on the tag itself. This barcode is camera-scannable from arm's length, no special hardware needed.

**Tag Assignment Workflow (at METRC tag application):**
1. Scan container QR → app opens container record showing "No METRC tag assigned"
2. Operator ties physical METRC tag to plant per METRC procedures
3. Tap "Assign METRC Tag" → camera opens in barcode-scan mode
4. Aim at printed barcode on the tag → app captures 24-char UID
5. App displays UID, operator confirms with a tap
6. Assignment recorded: `Container Z1-A-R3-C12 ↔ METRC tag XYZ123`

**Manual fallback:** Operator can type the 24-char UID directly if camera scanning fails (tag damaged, lighting poor, etc.). Format validation catches typos.

**Bulk assignment mode:** For large batches getting tagged sequentially (e.g., 30 plants in row 1A-3), the app supports a streamlined flow: scan container → scan tag → next container → next tag, looping until done. Each pair commits as a single transaction.

### Daily Operations Workflow

After initial assignment, METRC tags are not re-scanned for routine operations. Daily workflow:

1. **Scan container QR** (always accessible)
2. App opens container record with full context
3. Operator performs action (observation, foliar, etc.)
4. Save — action is recorded against the container AND automatically associated with the assigned METRC tag through the mapping

### Harvest Workflow

Harvest is the one routine operation where confirming the plant identity matters most. The workflow uses container scan + visual tag verification:

1. **Scan container QR** → app shows expected METRC tag for this container
2. **App displays the last 4 characters of the tag** (e.g., "...6789") in large text
3. **Operator visually verifies** the physical tag on the plant matches (tag is visible at this point — operator is cutting the plant)
4. Tap "Confirm match" or "Mismatch — investigate"
5. On confirm: enter wet weight → harvest recorded → assignment unassigned with reason
6. On mismatch: app blocks harvest, opens reconciliation flow

This avoids the UHF scanning workflow entirely while still maintaining audit-quality verification.

### Audit / Reconciliation Workflow

Periodic plant audits ensure the container-tag mapping is accurate. Run quarterly or as needed:

1. App generates audit list: all containers with active METRC tag assignments, sorted by location
2. Operator walks the rows with tablet
3. For each container: scan container QR → app shows expected tag → operator visually verifies tag presence and last 4 digits
4. Tap "Verified" or "Missing/Mismatch"
5. At end of audit: app generates discrepancy report
6. Discrepancies trigger investigation and resolution workflow

This is faster than UHF scanning would be (no interference, no failed reads) and equally rigorous from a compliance standpoint.

### Scan-Aware Orientation — The Key UX Principle

When a container QR scan succeeds, the app should **orient itself automatically to the scanned context**, not just open a search result:

- Persistent context bar updates to show scanned container, batch, strain
- Next action defaults to "what makes sense given current scan and current screen"
- Voice prompt option: "Read me this plant's status"
- After a successful scan, the operator's next tap is for a useful action, not for selecting what they just scanned

This is the difference between "the app supports scanning" and "the app is scan-aware." The latter is what enables 30-container row walks in 5 minutes.

### Scanning Hard Rules

1. **Container QR scans are logged.** Every container scan can be optionally recorded for audit history. Useful for inspection round verification.

2. **Scan failures must be loud.** If a QR scan fails to match a known container, the app must show a clear full-screen error explaining what was scanned and why it didn't resolve. Silent failures lead to incorrect data entry.

3. **METRC tag format validation.** All tag UIDs must be 24 characters per METRC's standard format. The system validates format at entry/scan time. Invalid formats reject with explanation.

4. **Two-step verification at harvest.** Scan container QR + visually verify last 4 digits of tag = harvest can proceed. Mismatches require explicit reconciliation.

5. **No silent reassignment.** If a scanned/entered METRC tag is already assigned to another container, the app must require explicit confirmation showing the previous container, the reason, and the new container.

### Future Considerations (Not in v1 or v2)

Documented here only as roadmap context:

- **NFC tags on containers** — could complement QR for tap-instead-of-scan workflows. ~$0.10 per tag, but range is 4cm (must touch). QR is preferable as primary; NFC could be added as a secondary tap-target.
- **UHF RFID for harvest verification only** — if you ever want pure scan-based harvest confirmation (read tag with handheld at cut time), this could be added. Not recommended for daily operations.
- **Computer vision for tag UID reading** — newer models can OCR the printed UID directly without needing a barcode. Future tablet OS improvements may make this viable.

---

## UI / UX Principles (Cross-Cutting)

- **Mobile-first, tablet-optimal.** Every entry form must work on a phone, but tablet layouts should take advantage of the extra space for productivity (split panes, more visible context, larger maps).
- **Device-adaptive layouts.** Detect device class via viewport width and touch capability; render appropriate layout. Don't ship one layout that's awkward on both form factors.
- **Inherit the hatstak.app family component library and theme for in-app UI.** Do not introduce new colors, fonts, or spacing systems for the application screens. The earthy wall-chart palette is reserved for printable outputs only.
- **Optimistic UI for offline tolerance.** Submit succeeds locally, syncs later. Show sync status passively, never block the user on it.
- **Audit views are print-friendly.** Compliance docs are sometimes printed for in-person audits.
- **Accessibility:** WCAG AA minimum, AAA for color contrast. Voice input support everywhere it makes sense.
- **Container-scan-aware throughout.** Any screen where the operator might be holding a tablet near a container should support a container QR scan as input — not just dedicated "scan" screens.

---

## Stack & Framework

**Use the existing framework conventions in this repo.** Do not introduce new frameworks, libraries, or patterns without explicit approval. When in doubt, mimic the most recently built app in the repo.

### Confirmed Stack Details

- **Database engine:** SQLite — use the existing migration and ORM patterns from sibling apps. Schema design should account for SQLite's strengths (file-based, single-writer) and limitations (no native enum types, simpler concurrency model).
- **Hosting:** Railway (backend), Cloudflare (CDN/edge) — use existing deployment pipeline, do not modify
- **Deployment URL:** `cultivate.hatstak.app` — follows the existing convention of subdomain-per-application within the `hatstak.app` family
- **Auth/users:** **Inherits from the shared auth system** used across the `hatstak.app` application family. Do not build a parallel user model. References to `users` in the data model refer to the existing shared user table. All FK references to `users` (applicator, observer, approved_by, supervisor, created_by, updated_by) point to this shared table.
- **Shell/nav/branding:** This application is **part of the `hatstak.app` family**. Inherit the parent family's shell, navigation, theme, and branding. Do not introduce new global styles, colors, or layout primitives. Add only domain-specific UI components for cultivation features.

### Discover from the repo (do not assume)

- Frontend framework, router, and component library — mimic the most recent sibling app
- Backend framework and ORM/query layer — same
- Migration tooling — same
- File/photo storage approach for application/foliar/observation photos
- Print/PDF generation approach (must align with what the parent app already uses; if none, propose Playwright or our framework's preferred tool before building)
- Testing conventions and CI hooks

---

## Out of Scope (Do Not Build)

- Multi-tenant support — this is single-tenant only
- Generic plant tracking — this app is cannabis-specific with MN compliance built in
- Inventory management beyond crop inputs — separate concern
- Sales / dispensary functionality — separate concern
- Climate/environmental sensor integration — out of scope for v1
- Direct hardware control (irrigation valves, lights) — out of scope
- Generic CRM, financials, payroll — out of scope

---

## Reference Materials

In the repo's `/reference/` directory (add if not present):
- `autoflower_seedling_chart_letter.pdf` — existing wall chart, visual style reference
- This `CLAUDE.md` file
- Any captured screenshots of competitor systems (Trym, Distru, GrowFlow) to clarify what we are *not* building

In the conversation that generated this brief, the following was established:
- Feed protocol for seedlings (days 9–21) with reviewed/revised rates
- Batch volume math at 25 / 50 / 100 / 250 / 500 pot scale
- Container ID convention: `Z1-A-R3-C12`
- All 7 recipe names

External authority:
- **MN Statute 342.25** — cultivation records requirement
- **MN Rule 4770** — crop input definition
- **MN Statute 18B.37** — pesticide application record fields (the template our exports should match)
- **METRC documentation** — Plant Batch and Record Additives sections

---

## Development Standards — Production Grade, Regulated Environment

This is a compliance-critical application. Every record may be reviewed by a regulator. Every API endpoint is an audit surface. Development standards reflect that — they are not suggestions.

---

### The Vertical Slice Rule — Definition of Done

**A feature is not done until every layer is complete in the same commit.**

| Layer | Complete means |
|---|---|
| **Database** | Migration written and reversible; seed data added if required |
| **Backend** | Route registered in `app.ts`; auth middleware applied; all inputs validated; business rules enforced; consistent error responses; transactions for multi-step writes |
| **API client** | Method added to `client/src/api.js` |
| **Frontend** | List view + detail view + entry form; loading and error states on every async call; draft persistence on forms with 3+ fields |
| **Navigation** | Route registered in `App.jsx`; NavBar or hub wired if the feature needs to be discoverable |
| **Cross-surface** | Check Today screen, BatchDetail, ContainerDetail, Batches list — update any that show data affected by this feature |
| **Tests** | Business rule tests written (see Testing section) |

**Cross-surface scanning is mandatory.** Before closing any task, check whether the same gap exists elsewhere. If you add a field to BatchDetail, check the Batches list page and Today screen. If you fix a form, check whether other forms have the same problem. Never fix one surface and leave related surfaces inconsistent.

**One concern at a time, fully complete.** Don't mix unrelated features in a commit. Don't split one feature's vertical slice across multiple commits. Backend + frontend + migrations for the same feature go together.

---

### Input Validation — Use Zod (Already Installed)

`zod` is in `package.json`. Use it for all API request body validation. Do not write manual `if (!field)` chains.

```typescript
// backend route pattern
import { z } from 'zod';

const CreateBatchSchema = z.object({
  strain_id: z.number().int().positive(),
  plant_count_initial: z.number().int().positive(),
  plants_per_container: z.number().int().min(1).default(1),
  sow_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrc_plant_batch_uid: z.string().length(24).regex(/^[A-Za-z0-9]+$/).nullable().optional(),
  notes: z.string().nullable().optional(),
});
```

Validation errors return HTTP 400 with `{ error: string, issues?: ZodIssue[] }`.

---

### API Contract Standards

- All response fields use **snake_case**.
- **Error shape**: `{ error: string }` always. Validation errors may add `{ issues: [...] }`.
- **HTTP status codes**:
  - `200` — success (GET, PATCH)
  - `201` — created (POST)
  - `400` — validation failure or business rule violation
  - `401` — unauthenticated
  - `403` — insufficient role
  - `404` — record not found
  - `422` — rule violation requiring client-side redirect (e.g., pesticide product in foliar form)
  - `500` — unexpected server error (log full error; return generic message only)
- **Never** expose stack traces, internal IDs, or schema details in error responses.
- List endpoints return arrays. Detail endpoints return objects. A found record is never `null` — use 404.
- Computed fields (e.g., `metrc_batch_name`, `metrc_phase`, `plant_count_current`, `days_in_stage`) are added in the route layer, not the client.

---

### Security — Non-Negotiable Checklist

Every route must satisfy all of the following before it is considered complete:

1. **Auth middleware** — `requireAuth` or `requireRole('supervisor'|'admin')` on every handler, no exceptions.
2. **Input validation** — all user-supplied fields validated with Zod before any database access.
3. **Parameterized SQL** — no string concatenation in queries. Use `?` placeholders always.
4. **No sensitive data in responses** — no passwords, tokens, internal join keys, or full stack traces.
5. **Role check for write operations** — mutations that affect compliance records (batches, applications, harvest events) require at minimum `grower` role; transitions and deletions require `supervisor`.

Rate limiting is applied globally in `app.ts`. Sensitive state changes (batch transitions, harvest events, plant loss, pesticide applications) log `user_id` and timestamp at the application layer — this is the audit trail.

---

### TypeScript Standards (Backend)

- Strict mode is the target. Avoid `any`; if unavoidable, add a comment explaining why.
- All request body shapes have a named `interface` or Zod schema.
- Database rows come back as `Record<string, unknown>` from better-sqlite3; extract and cast field by field — do not blind-cast entire rows to a domain type.
- Extract shared logic into named helper functions (`enrichBatch`, `resolvedPlantCount`, etc.) — no inline logic repeated across multiple route handlers.
- All migrations are typed (`import type { Knex } from 'knex'`).

---

### Frontend Standards

- **Every async operation** has a loading state and an error state. No silent failures. No "it just doesn't load" bugs.
- **Form validation** before submit: required fields, format checks. Field-level inline errors. General error banner at top of form.
- **Draft persistence**: any form with 3+ fields persists to `localStorage` keyed by a `cv_draft_*` key; cleared on successful submit.
- **Optimistic UI only for low-risk reads**. For compliance-critical writes (harvest events, pesticide applications, plant loss, batch transitions) — wait for server confirmation before navigating away.
- **Touch targets**: minimum `minHeight: '56px'` on all interactive elements per Field UX requirements.
- **No hardcoded IDs or magic strings** — use named constants or derive from API data.
- **Error boundaries**: any page that fetches data must handle load failure gracefully with a user-visible error message and a retry option.

---

### Database Standards

- Every schema change goes in a **new numbered migration** (`src/db/migrations/NNN_name.ts`). Never modify the database outside a migration.
- Migrations must implement both `up()` and `down()`. The `down()` must actually reverse the change.
- All tables have `created_at` and `updated_at`. Most have `created_by` FK → `cv_users`.
- **Foreign keys are enforced** — `PRAGMA foreign_keys = ON` is set at DB init. Do not disable this.
- **Audit records are never deleted.** Use `active = 0`, `status = 'closed'`, or `corrects_id` patterns. Hard-delete is only permitted for non-compliance data (e.g., draft records that were never submitted).
- **Multi-step writes use transactions.** Creating a batch also writes phase history and location history — all three writes are in one `db.transaction(() => { ... })()` call.
- **Seed data for the physical model**: zones, sub-zones, rows, and containers are fixed. Load via migration/seed, never via the application UI.

---

### Testing

Testing is required for business rules. It is not optional or deferred.

**Framework to set up** (not yet configured — must be done before Phase 1 is considered complete):
- Backend: `vitest` + Fastify's `inject()` for route-level integration tests
- Frontend: `vitest` + `@testing-library/react`
- Add `"test": "vitest"` to both `package.json` scripts

**Minimum test coverage required:**

| Rule | Type |
|---|---|
| METRC UID format — 24 alphanumeric characters | Unit |
| Container ID format — `Z1-A-R3-C12` pattern | Unit |
| Batch status transitions — only valid `VALID_TRANSITIONS` paths allowed | Unit |
| PHI calculation — `phi_days_operational` enforced, not label PHI | Unit |
| REI expiry — `applied_at + rei_hours` computed correctly | Unit |
| Stage compliance blocks — `input_phi_stage_overrides` with `allowed=false` blocks application | Integration |
| Plant count derived from active assignments, not edited directly | Integration |
| Harvest events blocked unless batch status is `harvesting` | Integration |
| Final harvest triggers unassignment + container → teardown | Integration |
| Pesticide applications require `input_lot_id` | Integration |
| Container state constraints — `active` requires active assignment | Integration |

Until the framework is configured, mark untested business rules with `// TODO: test — [rule]` in the route file.

---

### When to Ask vs. When to Proceed

**Ask before implementing** only when:
- The task conflicts with an existing business rule in this file
- The task requires a schema change with significant breaking implications
- There is genuine ambiguity between two architecturally different approaches

**Do not ask** before implementing:
- Routine feature work where intent is clear from context and the Application Surface section
- Bug fixes and UI corrections
- Adding a field that already exists in the schema to a form that's missing it
- Any work where the domain model in this file provides sufficient guidance

When an assumption is made, state it in one sentence at the start of the response. Wrong assumptions are cheap to fix; unnecessary questions waste time.

---

### Commit and Push Standards

- Commit after each complete vertical slice — route + frontend + migration for the same feature in one commit.
- Push immediately after committing. Never accumulate uncommitted work across a session.
- Commit message prefix: `feat:` (new feature), `fix:` (bug fix), `refactor:` (no behavior change), `test:` (tests only), `migration:` (schema only).
- Never commit `.env` files, credentials, or secrets.

---

### Cross-App Coordination (Cultivate ↔ Farmstock)

The two apps share a SQLite database. A schema change in either app can affect the other. If a cultivate change touches a shared table (e.g., `cv_items`, `cv_users`, `cv_input_lots`), explicitly flag the impact on farmstock before implementing.

---

### Background Task Execution — Felix

Felix (`C:\projects\felix`) is a background Claude Code dispatcher. Drop a JSON file in `C:\Users\Tom\felix-inbox\pending\` and Felix queues and executes it against the target directory headlessly.

**Use Felix for:**
- Long-running or parallelizable work that doesn't need interactive back-and-forth
- Batches of related tasks with sequential dependencies (migration → route → frontend)
- Work that can run overnight or during scheduled windows (3am, 11am, 5pm, 10:30pm)

**Felix task file template for cultivate:**
```json
{
  "import_config": {
    "target_directory": "C:\\projects\\cultivate",
    "source": "cultivate",
    "task_type": "feature",
    "priority": 2
  },
  "tasks": [
    {
      "name": "Short name ≤50 chars",
      "instructions": "Read CLAUDE.md before starting. Follow the vertical slice rule. [Detailed instructions — must be self-contained; Felix is headless and Claude cannot ask clarifying questions.]",
      "model": "sonnet",
      "acceptance_criteria": [
        "npx tsc --noEmit passes",
        "Changes committed and pushed"
      ]
    }
  ]
}
```

**Rules for Felix instructions:**
1. Always begin with "Read CLAUDE.md before starting."
2. Include all context — file paths, field names, which schema table to reference, which patterns to follow. Claude cannot ask clarifying questions in headless mode.
3. Use `dependencies` for sequencing: task 2 won't start until task 1 is `completed`.
4. `acceptance_criteria` are surfaced to Claude as a self-check before committing.
5. End every task with an explicit commit+push instruction.

**Checking status:**
```powershell
Get-ScheduledTask -TaskName Felix | Select State
Get-Content C:\Users\Tom\.felix\logs\combined-$(Get-Date -Format yyyy-MM-dd).log -Tail 30
```

---

*Last updated: May 2026. Maintained in version control. Material changes require operator review.*
