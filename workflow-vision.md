# Cultivate App: Workflow & UI Vision

A focused vision document for the cultivate cannabis cultivation tracking app, deployed at `cultivate.hatstak.app` as a peer application within the hatstak.app family.

This is a **workflow vision**, not a complete spec. It describes the UX pattern, navigation model, and key workflows so a developer can design coherent UI. Data model, business rules, and compliance details live in CLAUDE.md as supporting reference.

---

## The Operation

A 2026 Minnesota cannabis cultivation operation:
- ~1,360 plants/year across 8 sub-locations in 4 field zones (plus indoor germination, seedling, and hardening locations)
- 2–3 person team with overlapping roles
- Tablets in the field as primary devices; phones as backup; occasional desktop for admin work
- Spotty field connectivity (offline-first required)
- METRC state reporting required, Minnesota Statute 342.25 compliance

---

## The Core UX Concept: Location-First, Workflow-Driven

The app's home screen is a **spatial view of the operation** — not a task list, not a dashboard. Workers see their locations laid out as cards, with current status at a glance. They drill into a location to see what's happening, and workflows emerge contextually based on where they are.

**The container scan is a universal shortcut.** From anywhere in the app, a worker can scan a container's QR code to jump directly to that plant's detail. The spatial drill-down and the scan-driven jump both lead to the same place.

---

## Navigation Hierarchy

```
LOCATIONS (home — spatial grid of all locations)
    ↓ tap a location
SUB-LOCATIONS within a location (e.g., Zone 1 has 1A and 1B)
    ↓ tap a sub-location
CONTAINERS within the sub-location (e.g., 150 pots in a 5×30 grid)
    ↓ tap a container
PLANT detail (METRC tag, current state, history, actions)
```

This mirrors the physical reality: durable infrastructure (locations, sub-locations, containers) wraps transient occupants (plants).

**Physical hierarchy is the navigation; Planting Group is the cross-cutting identity.**

---

## The Planting Group Concept

A **Planting Group** is a set of plants treated the same through their lifecycle, typically sharing planting date and strain. It's the operational handle for group-level actions:

- "Apply fertigation to Planting Group A"
- "Harvest Planting Group A"
- "Show me Planting Group A's history"

A planting group is a *label* that ties plants together for treatment and reporting. It's not a navigation level — workers navigate to places (where plants live), not to abstract groupings. But the planting group is visible everywhere: on each container's view, on each sub-location's header, filterable from any list.

**Planting Group vs METRC entities** — the planting group is our internal operational concept. METRC has its own tracking entities at each phase: Immature Plant Batch (early), Plant Tags (after individual tagging), Harvest Batch (post-cut), Packages (final). The planting group is the operational thread connecting all of these. Workers see "Planting Group Auto-NL-Spring"; admin/audit views can also see the METRC UIDs.

---

## Two Modes (For Now)

The app has two operational modes, sharing the same underlying data:

**Worker Mode** — field execution. Locations grid, scan-driven, quick actions for daily tasks. This is what cultivation workers use 90% of the time. Optimized for tablets and one-handed phone use.

**Lead/Admin Mode** — operations and configuration. Operations dashboard, approval queue, recipe management, METRC reconciliation, reports, settings. Used for the work that doesn't happen in the field.

**Some users have one mode, some have both** (with an explicit mode toggle). A future version will split Lead and Admin into separate modes — permissions are designed as granular capabilities (`worker`, `lead`, `admin` tagged) so that future split is a UI restructure, not a data migration.

**Cross-mode workflows exist for approvals** — e.g., a worker submitting a restricted-use pesticide application saves it as "pending approval"; the lead/admin sees it in their queue and approves or rejects.

---

## Worker Mode: The Day in the Life

### 1. The Locations Home Screen

Worker opens the app on a tablet. They see all locations as cards:

```
INDOOR LOCATIONS
┌───────────┐ ┌────────────┐ ┌────────────┐
│ Germ-01   │ │ Seedlings  │ │ Cult-Hoop  │
│ 2 groups  │ │ 3 groups   │ │ 1 group    │
│ ✓ Healthy │ │ ⚠ 1 obs    │ │ Day 3      │
└───────────┘ └────────────┘ └────────────┘

FIELD ZONES
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Zone 1         │ │ Zone 2         │ │ Zone 3         │ │ Zone 4         │
│ A: Auto-1 W5fl │ │ A: Auto-2 W3vg │ │ A: Photo-1 W2  │ │ A: empty       │
│ B: Photo-2 W2  │ │ B: empty       │ │ B: Auto-3 W6fl │ │ B: Photo-3 W4  │
│ ⚠ REI 4h       │ │ ✓ Ready        │ │ ✓ Healthy      │ │ ⚠ Sample due   │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘

QUICK ACTIONS BAR
[ Scan ]  [ Mix Today ]  [ My Groups ]  [ More ]
```

Each card shows the planting group(s) currently in that location, lifecycle phase, plant count, and status. Status indicators bubble up: an active REI in Zone 1A shows on the Zone 1 card; an overdue soil sample shows on its zone card.

A persistent **Quick Actions Bar** at the bottom provides non-location-specific shortcuts: scan a container, mix today's fertigation, view "My Planting Groups," more.

### 2. Drilling Into a Location

Tap a field zone card → see sub-locations 1A and 1B side-by-side, each showing the planting group occupying it, plant count, recent activity, and a compact container map preview. Tap an indoor location → see the planting groups within (typically displayed similarly).

### 3. Drilling Into a Sub-Location

The sub-location detail is the **row-walk inspection view**:

- Header: which planting group is here, current recipe, days in phase, plant count
- Container map: visual grid (5 rows × 30 containers for A sub-locations). Each container colored by state (active green / empty gray / REI red / observation amber)
- Contextual actions: "Apply Fertigation," "Foliar," "Pesticide," "Walk Inspection," "Soil Sample," "View Planting Group Dashboard"

Tap any container cell → drill into container detail.

### 4. Container/Plant Detail

The deepest level, also reachable by scanning the container's QR:

- Container position (e.g., Z1-A-R3-C12)
- Current plant: METRC tag (display last 4 digits), strain, planting group, days from sow
- Recent activity timeline
- Actions: log observation, log plant loss, take photo, single-container foliar, single-container pesticide
- Container's persistent history (amendments, prior plantings, soil samples)

### 5. Workflows Emerge from Where You Are

Workflows aren't a separate navigation tree — they're buttons that appear contextually:

- **From the Locations home**: Quick Actions bar (Scan, Mix Today)
- **From a sub-location**: planting-group-wide actions (Apply Fertigation to this group, Foliar, Pesticide, Walk Inspection)
- **From a container**: single-plant actions (Observation, Plant Loss, Photo)

Workers don't navigate to a "workflows menu" — they navigate to *where the work is happening* and the relevant actions appear.

### 6. Common Workflows

The high-frequency workflows, in order of how often they happen:

**Apply Fertigation (daily)** — pick a planting group or sub-location, confirm recipe and pre-filled values, apply, save. Pre-mixed solutions tracked via a "Mix Today" workflow that consolidates the day's mixing.

**Log Observation (throughout day)** — scan container or pick from row map, tap a category chip (Healthy/Concern/Pest/Disease/Damage), tap severity, optional voice-note and photo, save.

**Log Plant Loss (as needed)** — scan container, tap "Plant Loss," pick type from chips, optional note and photo, save. Container auto-transitions to empty; METRC waste event queued.

**Foliar Application (1–3×/week)** — pick planting group or specific containers, pick recipe or single product, enter rate/volume/purpose, save.

**Pesticide Application (rare)** — pick product (EPA-registered only), pick lot, enter compliance fields (target pest, ambient temp, wind speed, etc.). For general-use pesticides: commits immediately, REI flag activates. For restricted-use pesticides: saves as "Pending Approval" → goes to lead/admin queue.

**Harvest (per planting group)** — scan each container, verify METRC tag's last 4 digits match expected, enter wet weight, mark harvested. Container auto-transitions to teardown.

**Teardown & Startup** — guided checklists for container cleanup, soil sampling, and post-sample amendment application.

---

## Planting Group Dashboard

A cross-cutting view of a single planting group, reachable from:
- Any container's detail view ("View Planting Group")
- The "My Planting Groups" quick action

Shows:
- Identity header: name, strain, sow date, location, current phase, plant count
- Lifecycle timeline (Germ → Seedling → Veg → Flower → Flush → Harvest → Dry → Cure → Package), with completed phases filled, current highlighted, future greyed-out
- Key metrics: applications this week, observations, plant losses, alerts
- Recent activity
- Drill-downs: all applications, all observations, all plant losses, container map, soil samples
- Quick actions appropriate to current phase

Phase 1 build shows only cultivation phases as active; post-harvest phases appear as greyed placeholders. Phase 3 will add full post-harvest workflows.

---

## Lead/Admin Mode

The Lead/Admin home is an **operations dashboard**, not a locations grid (though Locations is accessible from the nav). It surfaces:

- **Approval queue** — pending submissions from workers awaiting sign-off
- **Operational health** — planting groups by stage, containers by state, active REIs, today's application count, METRC sync status
- **Action items** — soil sample results returned, planting groups approaching transitions, recipe versions needing approval

Primary Lead/Admin functions:
- Approval queue (review worker submissions)
- Recipe management (versioning, approval)
- Planting group management (create, transition stages, close)
- Soil sample tracking and amendment planning
- METRC reconciliation
- Reports (cultivation record, METRC export, MDA pesticide export, container history)
- Settings (PHI rules, amendment recommendation rules, integrations)

---

## Design Principles

### For Worker Mode

- **Locations grid is home** — spatial awareness first
- **Scan is the shortcut** — container QR jumps straight to plant detail
- **Three-tap rule for common actions** — apply fertigation, log observation, log plant loss should all be ≤3 taps from app open
- **Pre-fill aggressively** — applicator = current user, timestamp = now, recipe = active version
- **Optimistic offline** — every entry saves locally and syncs later; never blocked by network
- **Full-screen warnings for safety** — REI active, PHI violations cannot be missed (not a toast — a takeover modal that requires acknowledgment)
- **Large touch targets (56pt+)** — accommodates gloved hands and sun glare
- **State survives interruption** — partial form entries persist if the worker is interrupted

### For Lead/Admin Mode

- **Operations dashboard is home** — what needs attention right now, across the whole operation
- **Information density is fine** — admins are at a desk; tables and multi-column layouts are appropriate
- **Powerful filters and search** — admins answer "show me X" questions
- **Reports are first-class** — easily generated, previewed, exported

### Cross-Cutting

- **Inherit hatstak.app design system** — components, colors, fonts. Cultivate-specific styling reserved for printable outputs.
- **Mode is visually distinct** — header color/icon differs so users always know which mode they're in
- **Physical hierarchy and planting group identity coexist** — location is where things are; planting group is what things are

---

## Build Order

A recommended phased build, prioritizing the value-generating loop (daily worker workflows) first:

**Phase 1A — Worker Mode Core**
- Locations Home (spatial grid of cards)
- Location detail and Sub-Location detail (with container map)
- Container detail (also reachable via scan)
- Apply Fertigation workflow
- Log Observation workflow
- Log Plant Loss workflow
- Container QR scanning

**Phase 1B — Worker Mode Completion**
- Mix Today workflow
- Planting Group dashboard
- "My Planting Groups" list
- Foliar Application workflow
- Pesticide Application workflow (with approval submission for restricted-use)
- Worker End-of-Day wrap-up

**Phase 2A — Lead/Admin Mode Core**
- Operations Dashboard
- Approval Queue
- Planting Group Management (create, transition, close)
- Recipe Library
- METRC Pending Queue

**Phase 2B — Lead/Admin Completion**
- Soil Sample Tracker + Result Entry + Amendment Planning
- Reports Hub (cultivation record, METRC export, MDA export)
- Settings (rules, integrations, users)
- Container Status Dashboard

**Phase 2C — Advanced Worker Workflows**
- Harvest Mode
- Teardown Workflow
- Startup Workflow

**Phase 3 — Post-Harvest Lifecycle**
- Drying tracking
- Curing tracking
- Packaging workflow

A working Phase 1A is a useful day-one product: workers can navigate locations spatially, see what's happening, and log their daily fertigation, observations, and plant losses. Everything else is additive.

---

## What Lives Elsewhere

This document is the **workflow and UI vision**. Supporting context lives in:

- **CLAUDE.md** — comprehensive data model, business rules, compliance details, sibling app boundary with farmstock, hatstak.app family integration patterns. Use as reference when implementing specific features.
- **reference/** — wall chart PDFs (visual style reference for printable outputs), supporting materials

The first Claude Code session should read this document end-to-end, skim CLAUDE.md for context (data model, sibling app boundary, compliance), explore the existing hatstak.app family conventions, and propose an approach for Phase 1A before writing code. Do not attempt to implement everything described here at once — phase the work per the build order.
