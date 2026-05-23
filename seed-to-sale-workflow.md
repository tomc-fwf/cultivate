---
title: "Cultivate App: Seed-to-Sale Workflow Reference"
type: workflow
phase: cross-cutting
status: draft
last-reviewed: 2026-05-23
related-cultivate-app: yes
---

# Cultivate App: Seed-to-Sale Workflow Reference

This document is a **working reference** for the cultivate app describing what happens at each phase of the cultivation lifecycle: tasks, roles, tools, app entries, and METRC entries.

Use this as a reference when designing or implementing screens, validating that the right data is captured at the right time, and ensuring METRC compliance touchpoints aren't missed. It is a *checklist of considerations*, not a final operational SOP — operational SOPs live in the SOP binder and in `docs/workflows/phase-*/` documents.

This document complements:
- `workflow-vision.md` — the UI/UX pattern and navigation model
- `CLAUDE.md` — the data model, business rules, and compliance details

---

## How to Use This Document

When Claude Code is implementing a feature:

1. **Find the relevant phase** in the table of contents below
2. **Read the trigger, tasks, and entries** for that phase
3. **Confirm the cultivate app captures every "Cultivate Entry" listed** for that phase
4. **Confirm METRC integration captures every "METRC" entry listed** (or queues it for later sync)
5. **Verify role assignments** align with the permissions model

This document is intentionally task-oriented. Each phase shows what work happens, who does it, what tools they use, what gets recorded in the cultivate app, and what gets reported to METRC.

---

## Workflow Dimensions

Every task in this document is described along these dimensions:

| Dimension | Meaning |
|-----------|---------|
| **Phase / Location** | Where the plants physically are (Germ-01, Seedlings, Cult-Hoop, Field, etc.) |
| **Trigger** | What causes work to happen (planning, schedule, observation, transition) |
| **Tasks** | Specific actions performed |
| **Role** | Who does it (Supervisor, Applicator, Crew) |
| **Tools / Equipment** | What's needed to do the work |
| **Cultivate Entry** | What gets recorded internally in the app |
| **METRC Entry** | What gets reported to the state |

---

## Table of Contents — Lifecycle Phases

1. [GERM-01](#phase-1-germ-01-days-07) — Days 0–7
2. [SEEDLINGS](#phase-2-seedlings-days-721) — Days 7–21
3. [CULT-HOOP](#phase-3-cult-hoop-days-1725) — Days 17–25 (hardening)
4. [FIELD — VEG](#phase-4-field--veg-variable) — Variable duration
5. [FIELD — FLOWER](#phase-5-field--flower-variable) — Variable duration
6. [FLUSH](#phase-6-flush) — Pre-harvest
7. [HARVEST](#phase-7-harvest) — Per planting group
8. [TEARDOWN](#phase-8-teardown) — Per container, post-harvest
9. [DRYING / CURING](#phase-9-drying--curing) — Post-harvest
10. [STARTUP](#phase-10-startup) — Per container, between groups
11. [PACKAGE & TRANSFER](#phase-11-package--transfer) — Sale-side

Plus cross-cutting routines:
- [Daily Operations](#daily-operations)
- [Weekly / Monthly / Quarterly Operations](#weekly-monthly-quarterly-operations)
- [Tool Inventory](#tool-inventory-by-workflow)
- [Role Definitions](#role-definitions)

---

## Phase 1: GERM-01 (Days 0–7)

**Trigger:** New planting group is initiated by cultivation supervisor.

### Pre-Phase Setup
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Confirm seed inventory matches plan | Supervisor | Seed inventory in farmstock | Verify strain, count available | — |
| Mix BASE solution (per Page 1 of binder) | Applicator | RO water, mixing tank, EC/pH meters | Recipe lookup | — |
| Prepare germination trays + plugs | Applicator | Trays, plugs | — | — |

### Day 0: Seed Soak & Sow
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Soak seeds in BASE solution | Applicator | BASE solution, container | — | — |
| Soak plugs in BASE solution | Applicator | BASE solution, trays | — | — |
| Sow seeds into plugs | Applicator | Tweezers, label tape | **Create planting group record** (strain, count, sow date, supervisor) | **Plantings → Create Plant Batch** (receive METRC Immature Plant Batch UID) |
| Place trays in Germ-01, add BASE to tray bottoms | Applicator | Trays, BASE solution | Log first BASE application against planting group | — |
| Label trays with planting group + strain + sow date | Applicator | Label tape, marker | — | — |

### Days 1–6: Germination Monitoring
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Daily check: emergence, moisture, BASE replenishment | Applicator | Visual inspection, BASE solution | Log daily BASE application if added | — |
| Record germination rate observations | Applicator | Tablet | Observation entry | — |
| Note losses (failed germination) | Applicator | Tablet | Plant loss event | **Plant Batch waste** if significant |

### Day 7: Transition to Seedlings
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Prepare 4" pots with Pro-Mix HP | Applicator | 4" pots, media, scoop | — | — |
| Transplant plugs to 4" pots | Applicator | Tweezers, gloves | — | — |
| Move pots to Seedlings location | Applicator | Cart | **Update planting group status: germ → seedling** | **Move plants** (Plant Batch location change) |
| Apply Dynomyco at transplant | Applicator | Dynomyco, scoop | Container amendment entry (inoculation) | — |
| Update planting group with transplant date | Applicator | Tablet | Phase transition entry | — |

---

## Phase 2: SEEDLINGS (Days 7–21)

**Trigger:** Planting group arrives in Seedlings location.

### Daily Routine
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Mix daily fertigation per SEEDLING recipe | Applicator | Mixing tank, recipe card, ingredients, EC/pH meters | Recipe lookup | — |
| Apply fertigation to all planting groups in Seedlings | Applicator | Watering can / small hose | **Fertigation application entry** per planting group (volume, EC, pH) | — |
| Observe plants for issues | Applicator | Tablet | Observation entries as needed | — |
| Record any plant losses | Applicator | Tablet | Plant loss event | **Plant Batch waste** |
| Environmental check (temp, RH, VPD) | Applicator | Sensors, tablet | Daily environment log (optional) | — |

### Recipe Progression Within Seedlings
Per the daily progression chart, EC and rates change every 1–3 days. SEEDLING is one recipe with daily-adjusted rates; no formal recipe transitions occur within this phase.

### Day 17–21: Transition to Cult-Hoop
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Assess readiness (per Day 21 checklist) | Supervisor | Visual + chart | — | — |
| Move pots to Cult-Hoop | Crew | Cart | **Update planting group status: seedling → cult-hoop** | **Move plants** (Plant Batch location change) |

---

## Phase 3: CULT-HOOP (Days 17–25)

**Trigger:** Planting group arrives in Cult-Hoop for hardening before field transplant.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Continue SEEDLING recipe (taper if needed) | Applicator | Mixing tank, recipe | Fertigation application entries | — |
| Acclimate to outdoor light/temp gradually | Crew | Hoop ventilation, shade cloth | — | — |
| Monitor for stress (wilting, sunburn) | Applicator | Tablet | Observation entries | — |
| Pre-transplant readiness check (Day 23–25) | Supervisor | Visual | — | — |

### Transition to Field
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Verify destination sub-locations are READY | Supervisor | Container Status Dashboard | Verify all containers ready | — |
| Confirm METRC tags assigned (or prepare for assignment) | Supervisor | METRC, cultivate | — | — |
| Photoperiods: receive METRC plant tags from state | Supervisor | METRC portal | — | **Request/receive Plant Tags** |
| Transport pots to field | Crew | Cart, truck | — | — |
| Transplant into 30-gal or 10-gal containers | Crew | Pre-prepared containers, shovel, gloves | — | — |
| Photoperiods: assign METRC tag per plant + container | Applicator | Tablet, METRC tags, label ties | **Plant assignment entry** per container | **Tag Plants** (Plant Batch → individual Plant tags) |
| Update planting group record | Supervisor | Tablet | **Update status: cult-hoop → field-veg**, set sub-location | **Move plants** (location change) |
| Containers transition: ready → active | Auto via cultivate | — | Container state transition | — |
| First field fertigation (recipe → AUTO-VEG or PHOTO-VEG) | Applicator | Mixing tank, recipe | Fertigation entry with new recipe | — |

---

## Phase 4: FIELD — VEG (Variable)

**Trigger:** Planting group transplanted into sub-location.

### Daily Routine
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Drip irrigation (sub-location level) | Applicator | Drip system, recipe-mixed solution, EC/pH meters | **Fertigation application entry** per sub-location | — |
| Spot-water dry pots (hose) | Applicator | Garden hose | **Fertigation entry** (or note in observations) | — |
| Walk rows, log observations | Applicator | Tablet (inspection mode) | Observation entries per container as needed | — |
| Record plant losses | Applicator | Tablet | Plant loss event | **Plant waste** per affected plant |
| Apply foliar if scheduled | Applicator | Sprayer, foliar recipe | **Foliar application entry** | — |

### Weekly Routine
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Weekly preventive foliar (if part of protocol) | Applicator | Sprayer, foliar recipe | Foliar application entries per row | — |
| Pest scouting (IPM walkthrough) | Applicator | Visual + magnifier | Observation entries | — |
| Apply pesticides if pest pressure exceeds threshold | Applicator | Sprayer, PPE, pesticide product | **Pesticide application entry** (MDA-ready record) | **Record additives** (recommended) |
| REI tracking — restrict access | All | Cultivate app REI dashboard | REI status updated automatically | — |

### Veg-to-Flower Transition (Photoperiods Only)
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Adjust light schedule (if light-dep) | Crew | Light controls | — | — |
| Recipe transition: PHOTO-VEG → PHOTO-FLOWER | Supervisor | Tablet | **Recipe transition** entry | — |
| Notify crew of flower-phase PHI restrictions | Supervisor | Communication | — | — |

---

## Phase 5: FIELD — FLOWER (Variable)

**Trigger:** Planting group enters flower stage (photoperiods: light change; autoflowers: natural progression).

Daily routine is the same as Veg, with differences:
- Different fertigation recipe (AUTO-FLOWER or PHOTO-FLOWER)
- Heightened PHI awareness (especially after flower week 3 for biological foliars)
- More frequent pest scouting
- Trichome monitoring as harvest approaches

### Flower-Phase-Specific Tasks
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Trichome inspection | Supervisor | Loupe / scope | Observation entries | — |
| Defoliation (selective) | Crew | Scissors | — | — |
| Trellising / support | Crew | Stakes, ties | — | — |
| Final foliar window closes | Supervisor | Cultivate PHI dashboard | System auto-blocks foliars per rules | — |

### Pre-Harvest Sample Collection (if required by MN regs)
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Schedule lab pickup for compliance testing | Supervisor | Lab partner | — | **Create Lab Sample** |
| Collect samples per state protocol | Supervisor + Lab tech | Sample bags, scale | Observation: "Sample collected for testing" | **Lab Sample entry** with METRC tag |

---

## Phase 6: FLUSH

**Trigger:** Planting group enters final ~2 weeks before harvest.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Recipe transition: FLOWER → FLUSH | Supervisor | Tablet | **Recipe transition** entry | — |
| Daily flush feeding | Applicator | Mixing tank, flush recipe | Fertigation entries | — |
| Stop all foliars and amendments | All | — | System enforces via PHI rules | — |
| Final observations | Applicator | Tablet | Observation entries | — |

---

## Phase 7: HARVEST

**Trigger:** Planting group ready for harvest (visual maturity + flush complete).

### Pre-Harvest Setup
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Confirm lab test results passed | Supervisor | METRC, lab report | — | **Verify Lab Test pass** |
| Schedule harvest crew | Supervisor | Calendar | — | — |
| Prepare drying space | Crew | Drying racks, environment controls | — | — |
| Print METRC package tags (if needed) | Supervisor | METRC, label printer | — | **Request package tags** |

### Harvest Day
| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Scan container QR → verify last 4 digits of plant tag | Crew | Tablet | **Harvest workflow** entry per plant | — |
| Cut plant | Crew | Pruners, gloves | — | — |
| Weigh wet weight (per plant or per planting group) | Crew | Scale | Wet weight entry per plant | **Manicure/Harvest** entry — record wet weight |
| Move to drying area | Crew | Bins, cart | — | **Create Harvest Batch** (METRC) |
| Container transitions: active → teardown | Auto via cultivate | — | Container state transition | — |
| Update planting group status | Supervisor | Tablet | **Status: flush → harvest** | — |

---

## Phase 8: TEARDOWN

**Trigger:** Plant harvested from container.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Remove remaining plant material (roots, debris) | Crew | Gloves, bins | — | — |
| Dispose debris (compost or waste per protocol) | Crew | Compost bin / waste | — | — |
| Wipe container exterior, rim | Crew | Cloth, sanitizer | — | — |
| Collect soil sample (per container or composite per row) | Supervisor | Sample bag, label, scoop | **Soil sample entry** | — |
| Ship samples to lab | Supervisor | Mailer, lab contact | Update soil_sample.lab_sent_at | — |
| Mark teardown complete | Supervisor | Tablet | **Teardown event completion** | — |

---

## Phase 9: DRYING / CURING

**Trigger:** Plants placed in drying area.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Daily environment check in dry room | Crew | Hygrometer, thermometer | Optional log | — |
| Weigh dry material periodically | Supervisor | Scale | Optional log | — |
| Trim and process | Crew | Trim tables, scissors | — | — |
| Record final dry weight | Supervisor | Scale | Update harvest record | **Update Harvest Batch** with dry weight |
| Sample retention (for state) | Supervisor | Sample bags, scale | — | **Retain Lab Samples** if required |
| Package into compliant sizes | Crew | Bags, scale | — | **Create Packages** in METRC with package tags |

Note: Drying, curing, and packaging are planned as Phase 3 work in the cultivate app. Phase 1–2 build can rely on paper logging for these activities, with cultivate tracking only the harvest weights and METRC sync.

---

## Phase 10: STARTUP

**Trigger:** Soil sample results received OR scheduled startup begins.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Receive lab results | Supervisor | Lab portal, email | **Soil sample results entry** (per parameter) | — |
| Review results, plan amendments | Supervisor | Sample interpretation guide | — | — |
| Remove top 1/3 media | Crew | Scoop, bin | **Container amendment** (removal record) | — |
| Add new Pro-Mix HP | Crew | Media, scoop | **Container amendment** entry | — |
| Apply amendments per soil sample | Crew | Various products | **Container amendment** entries per product | — |
| Inoculate with biology (mycorrhizae, nematodes) | Crew | Inoculants | **Container amendment** entries | — |
| Sign off container as READY | Supervisor | Tablet | **Startup event completion** | — |
| Container state transitions: startup → ready | Auto via cultivate | — | Container state transition | — |

---

## Phase 11: PACKAGE & TRANSFER

**Trigger:** Packaged product ready to move to dispensary or wholesale.

| Task | Role | Tools | Cultivate Entry | METRC |
|------|------|-------|-----------------|-------|
| Verify package data matches METRC | Supervisor | METRC, tablet | — | **Verify Package** |
| Create transfer manifest | Supervisor | METRC | — | **Create Transfer Manifest** |
| Prepare shipment | Crew | Boxes, manifest copies | — | — |
| Driver/transporter pickup | Driver | Vehicle, manifest | — | **Confirm Transfer Start** |
| Delivery confirmation | Receiving party | Manifest | — | **Confirm Transfer Receipt** |

Note: Transfer is typically handled by a dispensary or wholesale operation outside cultivate's primary scope. Cultivate's role is to provide the data and METRC linkage; the actual transfer workflow may live in a different hatstak.app sibling app.

---

## Daily Operations

### Morning Routine (8:00–9:00 AM)
1. Open cultivate app on tablet → review Locations home (or operations dashboard for Lead/Admin)
2. Check active REIs / PHI alerts
3. Review pending tasks (transitions, harvests, soil samples awaiting results)
4. Mix today's fertigation per active recipes per sub-location
5. Walk all active planting groups: visual check, observations as needed

### Application Rounds (Varies by Phase)
1. Apply drip irrigation (sub-location level)
2. Spot water as needed (hose, container-level)
3. Log applications immediately at point of activity (offline-tolerant)

### End of Day (4:00–5:00 PM)
1. Review day's logged applications for completeness
2. Verify sync status (all entries pushed to backend)
3. Check tomorrow's planned tasks
4. METRC reconciliation: push any applications, losses, harvests not yet synced

**Minnesota requires all activity to be reported by 8 AM the following day.** The cultivate app buffers entries during the day and supports end-of-day batch METRC pushes rather than transaction-by-transaction entry.

---

## Weekly, Monthly, Quarterly Operations

### Weekly

| Task | Day | Responsible |
|------|-----|-------------|
| METRC review — confirm entries match cultivate records | Monday | Supervisor |
| Soil sample status check | Monday | Supervisor |
| Inventory review with farmstock | Wednesday | Supervisor |
| Preventive foliar application | Friday | Applicator |
| Pest scouting (formal IPM walkthrough) | Friday | Supervisor |

### Monthly

| Task | Responsible |
|------|-------------|
| Generate METRC application export, verify against state portal | Supervisor |
| Generate MDA-style pesticide report | Supervisor |
| Review planting group performance metrics | Supervisor |
| Inventory reconciliation (cultivate vs farmstock vs physical) | Supervisor |
| Update recipe versions if needed | Supervisor |

### Quarterly

| Task | Responsible |
|------|-------------|
| Container audit (verify METRC tag ↔ container mappings) | Supervisor + Crew |
| Soil amendment effectiveness review | Supervisor |
| Recipe performance review (yield correlations) | Supervisor |
| Compliance documentation review (audit-readiness) | Supervisor |

---

## Tool Inventory by Workflow

### Mixing & Application
- RO water system
- Mixing tanks (~30 gal capacity for largest batches)
- Aeration / air stone for larger batches
- Measuring spoons, cups, graduated cylinders
- EC/TDS meter (calibrated regularly)
- pH meter (calibrated, with calibration solutions)
- Thermometer for solution temp
- Pumps or watering cans
- Garden hoses with adjustable spray
- Foliar sprayers (backpack or handheld)
- Pesticide-dedicated sprayers (NEVER share with foliar nutrient sprayers)

### PPE
- Nitrile gloves (multiple sizes)
- Safety glasses
- Respirator with appropriate cartridges (for pesticides)
- Long-sleeve protective clothing for pesticide applications
- First aid kit

### Measurement & Recording
- Tablets (ruggedized) with cultivate app
- Personal phones with cultivate app
- Bluetooth scale for harvest weights
- Calipers / measuring tape for plant heights (optional)
- Magnifier / loupe (60x) for trichome inspection
- Macro photo capability (tablet camera sufficient)

### Container & Tag Management
- Pre-printed QR labels (1,180 containers)
- Label printer (for soil sample labels, replacements)
- METRC plant tags (state-supplied for photoperiods)
- METRC package tags (state-supplied)
- Backup label tape and permanent markers

### Soil Sampling
- Soil sample bags
- Sample collection scoops (cleaned between samples)
- Sample labels (waterproof)
- Shipping mailers for lab
- Lab partner relationship established

### Compliance & Documentation
- Binder with wall chart and recipe cards
- Calibration logs for meters
- SDS sheets for pesticides and amendments
- Pesticide license documentation (once obtained)
- METRC credentials and login

---

## Role Definitions

For a 2–3 person team with overlapping roles, these are the operational functions. One person can fulfill multiple roles.

### Cultivation Supervisor
- Owns planting group lifecycle from planning through harvest
- Approves recipe versions
- Authorizes phase transitions
- Reviews compliance records
- Coordinates with farmstock for inventory
- Manages METRC entries beyond basic applications
- Performs IPM walkthroughs and pest decisions
- Schedules and oversees teardown/startup

### Applicator
- Performs daily fertigation
- Logs all applications in cultivate
- Performs foliar applications
- Records observations
- Records plant losses
- Mixes solutions per recipes
- Maintains application equipment

### Crew (Field Labor)
- Performs transplanting
- Performs harvest
- Performs teardown work (cleaning, debris removal)
- Performs startup work (media replacement, amendments)
- Assists with packaging

In the cultivate app permissions model, these map to permission bundles:
- **Worker bundle**: Applicator + Crew permissions
- **Lead bundle**: Cultivation Supervisor permissions (decisions, approvals)
- **Admin bundle**: System configuration permissions (recipes, rules, integrations)

A single user may have any combination of bundles.

---

## How This Maps to the Cultivate App Build

This workflow reference should inform the cultivate app design at every phase, but the app does NOT need to implement everything described here in Phase 1.

**Phase 1A Build Targets** (per `workflow-vision.md`):
- Locations Home + drill-down navigation
- Fertigation application entry (covers Phases 2, 4, 5, 6)
- Observation logging (covers all phases)
- Plant loss recording (covers all phases)
- Container QR scanning

**Phase 1B Build Targets:**
- Mix Today workflow
- Planting Group dashboard
- Foliar application entry
- Pesticide application entry with approval flow
- Worker end-of-day wrap-up

**Phase 2A–B** adds Lead/Admin Mode: operations dashboard, approval queue, planting group management, recipe library, METRC reconciliation, reports, settings.

**Phase 2C** adds advanced worker workflows: Harvest Mode, Teardown, Startup.

**Phase 3** adds post-harvest lifecycle: Drying, Curing, Packaging.

This workflow document covers the full lifecycle so the data model and app architecture can anticipate later phases, even though the build is incremental.

---

## What This Document Is

**This is** a working reference for what happens in the operation, mapped to cultivate app entries and METRC reporting.

**This is NOT**:
- An SOP (operational SOPs live in the SOP binder and `docs/workflows/phase-*/` if/when those are built)
- A feature checklist (the cultivate app build is phased; see `workflow-vision.md` for build order)
- A final spec (this is a strawman to refine through use)

**For developers**: use this to validate that the app captures the right data at the right time. If a Cultivate Entry column shows a workflow needs to record something, the app should support that entry. If a METRC column shows a state report is needed, the app should queue or push that report.

**For operators**: use this as a checklist of considerations when building real operational SOPs. The "Tasks" columns enumerate what needs to happen; the SOP binder describes *how* each task is performed.
