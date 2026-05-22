# Agent SDK + MCP Architecture for UEM Skill Execution

**Prepared:** 2026-05-21  
**Status:** Design document — pre-implementation  
**Scope:** Claude Code Agent SDK + MCP integration for UEM skill execution in cultivate  
**Prerequisite reading:** `docs/uem-architecture.md` (skill schema specification)

---

## Overview

This document specifies how cultivate's Uniform Enterprise Management (UEM) system uses the
Claude Code Agent SDK to execute skill schemas as managed agent loops. The key architectural
insight: cultivate's existing Fastify route handlers already encode all business logic, auth,
validation, and compliance enforcement. We expose them as MCP tools so agents can call them.
The agent handles reasoning and workflow orchestration; the routes handle execution and compliance.

```
Operator or scheduler
        │
        ▼
  executeSkill()
        │
        ├── loads skill schema from ff-dcs (or src/skills/)
        ├── builds system prompt from skill steps + preconditions
        ├── instantiates CultivateMcpServer bound to user context
        │
        ▼
  Claude Agent (query() loop)
        │
        ├── reads context  (get_batch, get_current_conditions, check_phi_compliance, ...)
        ├── applies logic  (skill step evaluation, precondition checking)
        ├── writes records (create_observation, create_pesticide_application, ...)
        │   │
        │   └── PreToolUse hook  →  approval gate for compliance-critical writes
        │                       →  pauses agent until human approves/rejects
        │
        └── PostToolUse hook → audit log → cv_agent_audit_log
                │
                └── all writes also land in their native application tables
                    (cv_applications_pesticide, cv_observations, etc.)
                    with agent provenance tracked via created_by + session_id
```

---

## Section 1: Cultivate MCP Server Design

**File:** `src/agents/cultivate-mcp-server.ts`

An in-process MCP server created per-agent-session. Each server instance is bound to a specific
`user_id` and `session_id` so every tool call carries user context without requiring agents to
pass credentials in tool arguments.

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-code';
import { getDB } from '../db/index.js';

export interface McpServerContext {
  user_id: number;
  session_id: string;
  on_behalf_of?: string;  // display name for audit log
}

export function createCultivateMcpServer(ctx: McpServerContext) {
  return createSdkMcpServer({
    name: 'cultivate',
    version: '1.0.0',
    tools: buildToolDefinitions(ctx),
  });
}
```

### 1.1 Read Tools

Read tools are safe — no approval gate required. They call the same DB queries used by the
Fastify route handlers, extracted into shared query functions.

---

**`get_batch`** — Get plant batch by ID with full context

```typescript
{
  name: 'get_batch',
  description: 'Get a plant batch record with enriched context: status, strain, sub-zone, location, current recipe, plant counts, METRC UID, days in stage, REI status. Use this to understand the current state of a cultivation batch before taking any action.',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number', description: 'Numeric plant batch ID' },
    },
    required: ['batch_id'],
  },
  handler: async ({ batch_id }) => {
    // Calls the same enrichBatch() logic used by GET /api/batches/:id
    // Returns: batch fields + strain_name, sub_zone_id, current_location_name,
    //          active_recipe (name + version), plant_count_current (derived),
    //          days_in_stage, metrc_batch_name, any active REI flags
    return callBatchRoute('GET', `/api/batches/${batch_id}`, ctx);
  },
}
```

| Field | Source |
|-------|--------|
| Batch fields | `cv_plant_batches` |
| Strain | `cv_strains` join |
| Active recipe | `cv_batch_stage_recipes` + `cv_fertigation_recipes` |
| Plant count | COUNT(active `cv_plant_assignments`) |
| Days in stage | `NOW() - stage_entered_at` in America/Chicago |
| REI status | Latest `cv_applications_pesticide` where `rei_expires_at > NOW()` |

---

**`get_batch_list`** — List active batches with status, location, plant count

```typescript
{
  name: 'get_batch_list',
  description: 'List all non-closed plant batches with their current status, sub-zone, strain, plant counts, and days in stage. Use this to understand what batches are currently active before deciding which to act on.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status (e.g., "field-flower", "harvesting"). Omit for all active.' },
      sub_zone_id: { type: 'string', description: 'Filter by sub-zone (e.g., "Z1A").' },
    },
  },
  handler: async ({ status, sub_zone_id }) => {
    // Calls GET /api/batches logic with optional filters
    // Returns array of enriched batch summaries
  },
}
```

---

**`get_container`** — Get container by ID with current state, assignment, sensor data

```typescript
{
  name: 'get_container',
  description: 'Get a container record including: current state (ready/active/empty/teardown/startup/out_of_service), active plant assignment (METRC tag, strain), current batch context, recent amendments, and latest sensor reading for the sub-zone. Use this before logging an application or observation to confirm context.',
  inputSchema: {
    type: 'object',
    properties: {
      container_id: { type: 'string', description: 'Container position ID, e.g. "Z1-A-R3-C12"' },
    },
    required: ['container_id'],
  },
  handler: async ({ container_id }) => {
    // Calls GET /api/containers/:containerId logic
    // Returns: container state + assignment + latest reading for sub-zone
  },
}
```

---

**`get_current_conditions`** — Current sensor readings for a location or sub-zone

```typescript
{
  name: 'get_current_conditions',
  description: 'Get the current environmental conditions (temperature, RH, dew point, VPD) for a location or sub-zone from connected SensorPush sensors. Use this to auto-fill ambient conditions before logging a pesticide or fertigation application.',
  inputSchema: {
    type: 'object',
    properties: {
      location_id: { type: 'number', description: 'Location ID to query.' },
      sub_zone_id: { type: 'string', description: 'Sub-zone ID (e.g., "Z1A"). If provided, returns readings for the zone containing this sub-zone.' },
    },
  },
  handler: async ({ location_id, sub_zone_id }) => {
    // Calls GET /api/sensors/current logic
    // Returns: { sensor_id, sensor_name, temp_f, humidity_rh, dew_point_f, vpd_kpa, observed_at, is_stale }
    // is_stale = observed_at is more than 30 minutes old
  },
}
```

---

**`check_rei_status`** — Check if REI is active for a location; when it expires

```typescript
{
  name: 'check_rei_status',
  description: 'Check whether any pesticide application has an active Re-Entry Interval (REI) for a given sub-zone, row, or container. Returns the earliest time the location can be safely re-entered. Always check this before recommending an observation or application that requires physical entry.',
  inputSchema: {
    type: 'object',
    properties: {
      sub_zone_id: { type: 'string', description: 'Sub-zone to check (e.g., "Z1A").' },
      row_id: { type: 'string', description: 'Row to check (e.g., "Z1-A-R3").' },
      container_id: { type: 'string', description: 'Container to check.' },
    },
  },
  handler: async ({ sub_zone_id, row_id, container_id }) => {
    // Queries cv_applications_pesticide WHERE rei_expires_at > NOW()
    //   AND (row_id matches OR sub-zone of row matches)
    // Returns: { rei_active: boolean, expires_at: string|null, product_name: string|null,
    //            applied_at: string|null, clearance_required: boolean }
  },
}
```

---

**`check_phi_compliance`** — Check if applying a product now would violate PHI

```typescript
{
  name: 'check_phi_compliance',
  description: 'Check whether applying a specific crop input to a specific batch right now would violate Pre-Harvest Interval (PHI) requirements. Uses phi_days_operational (not label PHI). Returns whether compliant and the number of days until compliant. Also checks input_phi_stage_overrides for stage-based blocks.',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      input_id: { type: 'number', description: 'Farmstock crop input ID' },
      expected_harvest_date: { type: 'string', description: 'ISO date YYYY-MM-DD. Required for PHI calculation.' },
    },
    required: ['batch_id', 'input_id'],
  },
  handler: async ({ batch_id, input_id, expected_harvest_date }) => {
    // Fetches item from farmstock (phi_days_operational, phi_days_label)
    // Fetches batch current stage
    // Checks cv_input_phi_stage_overrides for batch stage
    // Returns: { phi_compliant: boolean, stage_compliant: boolean,
    //            days_until_compliant: number|null,
    //            phi_days_operational: number|null,
    //            stage_blocked: boolean, stage_block_reason: string|null,
    //            override_allowed: boolean }
  },
}
```

---

**`get_crop_input`** — Get product details including PHI, REI, EPA number

```typescript
{
  name: 'get_crop_input',
  description: 'Get a crop input (product) record from the farmstock catalog. Includes: category, EPA registration number, PHI days operational, REI hours, signal word, active ingredients, and whether it is a restricted-use pesticide. Use this to verify product classification before recommending an application.',
  inputSchema: {
    type: 'object',
    properties: {
      input_id: { type: 'number', description: 'Farmstock item ID' },
    },
    required: ['input_id'],
  },
  handler: async ({ input_id }) => {
    // Calls farmstock API: GET /api/items/inventory/:input_id
    // Returns the item record as-is from farmstock
  },
}
```

---

**`get_active_recipe`** — Get current fertigation recipe for a batch

```typescript
{
  name: 'get_active_recipe',
  description: 'Get the currently active fertigation recipe for a plant batch, including all ingredients with rates and mixing order. Use this to display or confirm the recipe before logging a fertigation application.',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
    },
    required: ['batch_id'],
  },
  handler: async ({ batch_id }) => {
    // Joins cv_batch_stage_recipes → cv_fertigation_recipes → cv_fertigation_recipe_ingredients
    // Returns: { recipe_id, name, version, ec_target_low, ec_target_high, ph_target_low,
    //            ph_target_high, ingredients: [{ input_id, rate_value, rate_unit, order_index }] }
  },
}
```

---

**`get_observations`** — Get recent observations for a batch or container

```typescript
{
  name: 'get_observations',
  description: 'Get recent plant observations for a batch or specific container. Useful for understanding current plant health status before recommending an action. Supports filtering by category (pest, deficiency, harvest_readiness, etc.) and date range.',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      container_id: { type: 'string' },
      category: { type: 'string', description: 'Filter by category: healthy|pest|deficiency|disease|damage|harvest_readiness|other' },
      limit: { type: 'number', default: 20, description: 'Max records to return.' },
    },
  },
  handler: async (params) => {
    // Calls GET /api/observations logic with filters
    // Returns array of observation records with container/row context
  },
}
```

---

**`get_harvest_status`** — Get harvest progress for a batch

```typescript
{
  name: 'get_harvest_status',
  description: 'Get the harvest status for a batch in harvesting mode: which plants have been final-harvested, which remain, harvest batch details, total wet weight accumulated. Use this to track harvest progress and identify remaining plants.',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
    },
    required: ['batch_id'],
  },
  handler: async ({ batch_id }) => {
    // Calls GET /api/harvest/status/:batchId logic
    // Returns: { harvest_batches, assignments: [{ assignment_id, container_id,
    //            metrc_plant_tag, harvested: boolean, harvest_events: [...] }],
    //            total_wet_weight_g, plants_remaining }
  },
}
```

---

**`get_compliance_dashboard`** — Get current compliance posture

```typescript
{
  name: 'get_compliance_dashboard',
  description: 'Get the current compliance dashboard: active REIs, PHI watch list, METRC sync status, untagged plant count, batches without METRC UIDs, unsynced plant losses, pending waste disposal. Returns overall status (green/amber/red) and panel-by-panel breakdown.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => {
    // Calls GET /api/exports/compliance-dashboard logic
    // Returns the 8-panel aggregation with RAG status
  },
}
```

---

### 1.2 Write Tools

Write tools create or modify compliance records. Compliance-critical writes require supervisor
approval via the PreToolUse hook (see Section 2). All writes stamp `created_by = ctx.user_id`
and link to the agent session via the audit log.

---

**`create_observation`** — Log a plant observation (grower-level, no approval)

```typescript
{
  name: 'create_observation',
  description: 'Log a plant observation for a batch, row, or container. Required fields: batch_id, category, severity, note, observed_at. For harvest_readiness observations, also provide maturity_pct and ready_to_harvest.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      row_id: { type: 'string', nullable: true },
      container_id: { type: 'string', nullable: true },
      observed_at: { type: 'string', description: 'ISO datetime' },
      category: { type: 'string', enum: ['healthy', 'pest', 'deficiency', 'disease', 'damage', 'harvest_readiness', 'other'] },
      severity: { type: 'string', enum: ['low', 'medium', 'high'] },
      note: { type: 'string' },
      maturity_pct: { type: 'number', minimum: 0, maximum: 100, nullable: true },
      ready_to_harvest: { type: 'boolean', nullable: true },
      harvest_priority: { type: 'number', nullable: true },
    },
    required: ['batch_id', 'category', 'severity', 'note', 'observed_at'],
  },
  handler: async (body) => {
    // Calls POST /api/observations logic, injects applicator = ctx.user_id
    // Returns created observation record
  },
}
```

---

**`create_fertigation_application`** — Log fertigation (grower-level, no approval)

```typescript
{
  name: 'create_fertigation_application',
  description: 'Log a fertigation application (drip irrigation nutrient delivery) for a plant batch. Requires: batch_id, recipe_id (the version applied), applied_at, volume_gallons, ec_measured, ph_measured. EC and pH are required — use "meter-error" in notes if equipment failed.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      recipe_id: { type: 'number' },
      applied_at: { type: 'string' },
      volume_gallons: { type: 'number' },
      ec_measured: { type: 'number' },
      ph_measured: { type: 'number' },
      solution_temp_f: { type: 'number', nullable: true },
      ambient_temp_f: { type: 'number', nullable: true },
      ambient_rh: { type: 'number', nullable: true },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'recipe_id', 'applied_at', 'volume_gallons', 'ec_measured', 'ph_measured'],
  },
  handler: async (body) => {
    // Calls POST /api/applications/fertigation logic
    // Returns created application record with phi_compliant computed
  },
}
```

---

**`create_foliar_application`** — Log foliar spray (grower-level, no approval)

```typescript
{
  name: 'create_foliar_application',
  description: 'Log a non-pesticide foliar spray application. Products with an EPA registration number MUST use create_pesticide_application instead. Requires: batch_id, applied_at, purpose, applicator. Either foliar_recipe_id OR input_id must be provided (not both).',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      row_id: { type: 'string', nullable: true },
      container_id: { type: 'string', nullable: true },
      applied_at: { type: 'string' },
      foliar_recipe_id: { type: 'number', nullable: true },
      input_id: { type: 'number', nullable: true },
      input_lot_id: { type: 'number', nullable: true },
      rate_value: { type: 'number', nullable: true },
      rate_unit: { type: 'string', nullable: true },
      volume_applied: { type: 'number' },
      volume_unit: { type: 'string' },
      purpose: { type: 'string' },
      ambient_temp_f: { type: 'number', nullable: true },
      ambient_rh: { type: 'number', nullable: true },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'applied_at', 'volume_applied', 'volume_unit', 'purpose'],
  },
  handler: async (body) => {
    // Calls POST /api/applications/foliar logic
    // Returns created record; if input has EPA number, returns 422 redirect signal
  },
}
```

---

**`create_pesticide_application`** — Log pesticide (REQUIRES supervisor approval via hook)

```typescript
{
  name: 'create_pesticide_application',
  description: 'Log a pesticide, fungicide, or biocontrol pesticide application. This is a compliance-critical write that REQUIRES supervisor approval before execution. Required: batch_id, input_id (EPA-registered product), input_lot_id, applied_at, target_pest, ambient_temp_f, wind_speed_mph, rate_value, rate_unit, volume_applied, volume_unit, application_method. PHI and REI are auto-computed.',
  approval_level: 'supervisor',  // triggers PreToolUse hook
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      row_id: { type: 'string', nullable: true },
      container_id: { type: 'string', nullable: true },
      applied_at: { type: 'string' },
      input_id: { type: 'number' },
      input_lot_id: { type: 'number' },
      rate_value: { type: 'number' },
      rate_unit: { type: 'string' },
      volume_applied: { type: 'number' },
      volume_unit: { type: 'string' },
      application_method: { type: 'string', enum: ['foliar_spray', 'soil_drench', 'granular', 'other'] },
      target_pest: { type: 'string' },
      pest_pressure: { type: 'string', enum: ['incidental', 'threshold', 'outbreak'], nullable: true },
      ambient_temp_f: { type: 'number' },
      ambient_rh: { type: 'number', nullable: true },
      wind_speed_mph: { type: 'number' },
      wind_direction: { type: 'string', nullable: true },
      expected_harvest_date: { type: 'string', nullable: true },
      applicator_license: { type: 'string', nullable: true },
      phi_override_notes: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'input_id', 'input_lot_id', 'applied_at', 'target_pest',
               'ambient_temp_f', 'wind_speed_mph', 'rate_value', 'rate_unit',
               'volume_applied', 'volume_unit', 'application_method'],
  },
  handler: async (body) => {
    // Calls POST /api/applications/pesticide logic
    // Returns created record with rei_expires_at, phi_compliant computed
  },
}
```

---

**`create_waste_trim`** — Log waste trim event (grower-level, no approval)

```typescript
{
  name: 'create_waste_trim',
  description: 'Log a plant waste trim event (defoliation, IPM removal, disease removal, etc.). Generates waste, not product — use create_harvest_event for product-generating harvest. Can be logged at any batch status. Required: batch_id, trim_reason, wet_weight, weight_unit, trimmed_at.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      container_id: { type: 'string', nullable: true },
      row_id: { type: 'string', nullable: true },
      trimmed_at: { type: 'string' },
      trim_reason: { type: 'string', enum: ['defoliation', 'lollipoping', 'ipm_removal', 'disease_removal', 'pest_damage', 'physical_damage', 'senescence', 'other'] },
      trim_reason_notes: { type: 'string', nullable: true },
      wet_weight: { type: 'number' },
      weight_unit: { type: 'string' },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'trim_reason', 'wet_weight', 'weight_unit', 'trimmed_at'],
  },
  handler: async (body) => {
    // Calls POST /api/harvest/waste-trim logic
    // Returns created waste trim record; metrc_sync_status = 'pending'
  },
}
```

---

**`record_plant_loss`** — Log plant loss (grower-level, no approval)

```typescript
{
  name: 'record_plant_loss',
  description: 'Record a mid-batch plant loss event. Automatically unassigns the METRC tag, transitions the container to empty, decrements batch plant count, and queues a METRC waste event. Required: batch_id, container_id, plant_assignment_id, loss_type, plant_disposition.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      container_id: { type: 'string' },
      plant_assignment_id: { type: 'number' },
      occurred_at: { type: 'string' },
      loss_type: { type: 'string', enum: ['death_natural', 'death_disease', 'death_pest', 'physical_damage', 'removal_culled', 'removal_quality', 'accidental', 'other'] },
      loss_cause: { type: 'string' },
      plant_disposition: { type: 'string', enum: ['disposed_compost', 'disposed_waste', 'quarantined', 'tested', 'other'] },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'container_id', 'plant_assignment_id', 'loss_type', 'plant_disposition'],
  },
  handler: async (body) => {
    // Calls POST /api/plant-loss logic
    // Returns created loss record; container state → empty
  },
}
```

---

**`transition_batch`** — Advance batch to next status (REQUIRES supervisor approval)

```typescript
{
  name: 'transition_batch',
  description: 'Advance a plant batch to its next lifecycle status. Valid transitions are sequential: germ → seedling → cult-hoop → field-veg → field-flower → flush → harvest_window → harvesting → closed. The "harvest_window → harvesting" transition requires notes referencing the observation log. Requires supervisor approval.',
  approval_level: 'supervisor',
  inputSchema: {
    type: 'object',
    properties: {
      batch_id: { type: 'number' },
      to_status: { type: 'string' },
      notes: { type: 'string', nullable: true },
    },
    required: ['batch_id', 'to_status'],
  },
  handler: async (body) => {
    // Calls POST /api/batches/:id/transition logic
    // Returns updated batch record
  },
}
```

---

**`create_harvest_event`** — Log partial or final harvest (REQUIRES supervisor approval)

```typescript
{
  name: 'create_harvest_event',
  description: 'Log a harvest event for a plant. event_type "partial_harvest" leaves the plant alive and records wet weight. event_type "final_harvest" cuts the plant, unassigns the METRC tag, and transitions the container to teardown. Both require batch status "harvesting". Requires supervisor approval.',
  approval_level: 'supervisor',
  inputSchema: {
    type: 'object',
    properties: {
      harvest_batch_id: { type: 'number' },
      plant_assignment_id: { type: 'number' },
      container_id: { type: 'string' },
      event_type: { type: 'string', enum: ['partial_harvest', 'final_harvest'] },
      harvested_at: { type: 'string' },
      product_type: { type: 'string', enum: ['flower', 'larf', 'popcorn', 'trim_product', 'other'] },
      wet_weight: { type: 'number' },
      weight_unit: { type: 'string' },
      notes: { type: 'string', nullable: true },
    },
    required: ['harvest_batch_id', 'plant_assignment_id', 'container_id', 'event_type',
               'harvested_at', 'product_type', 'wet_weight', 'weight_unit'],
  },
  handler: async (body) => {
    // Calls POST /api/harvest/batches/:id/events logic
    // On final_harvest: unassigns tag, container → teardown, checks batch auto-close
    // Returns created event + updated state summary
  },
}
```

---

### 1.3 Utility Tools

**`calculate_mix`** — Given recipe + volume, return scaled ingredient quantities

```typescript
{
  name: 'calculate_mix',
  description: 'Calculate the actual quantities of each ingredient needed for a fertigation or foliar recipe at a given total volume. Returns human-readable amounts with smart unit selection (tsp/tbsp/cup/oz/ml/L). Use this to present mixing instructions before an application.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      recipe_id: { type: 'number' },
      recipe_type: { type: 'string', enum: ['fertigation', 'foliar'] },
      volume_gallons: { type: 'number' },
    },
    required: ['recipe_id', 'recipe_type', 'volume_gallons'],
  },
  handler: async ({ recipe_id, recipe_type, volume_gallons }) => {
    // Pure calculation — no DB write
    // Applies unit conversion from docs/mix-calculator-design.md Section 3 logic
    // Returns: { volume_gallons, ingredients: [{ name, rate_value, rate_unit, quantity, quantity_display }] }
  },
}
```

---

**`get_sensor_reading`** — Get latest sensor reading for a location

```typescript
{
  name: 'get_sensor_reading',
  description: 'Get the most recent sensor reading for a specific location. Returns temperature, RH, dew point, VPD. Use this as a targeted read when you already know the location ID.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      location_id: { type: 'number' },
    },
    required: ['location_id'],
  },
  handler: async ({ location_id }) => {
    // Queries cv_sensor_readings JOIN cv_sensor_location_assignments
    // Returns latest reading or null if no sensor assigned
  },
}
```

---

**`get_skill`** — Retrieve a skill definition by ID

```typescript
{
  name: 'get_skill',
  description: 'Retrieve a skill schema definition by skill ID. Skills define the steps, preconditions, allowed tools, and compliance checks for a specific operation. Use this when an agent needs to understand what sub-skill to execute.',
  approval_level: 'none',
  inputSchema: {
    type: 'object',
    properties: {
      skill_id: { type: 'string', description: 'Skill identifier, e.g. "pesticide_application"' },
    },
    required: ['skill_id'],
  },
  handler: async ({ skill_id }) => {
    // Loads from src/skills/{skill_id}.json or from ff-dcs API (Phase 3+)
    // Returns the full SkillSchema object
  },
}
```

---

### 1.4 Tool Routing — How Handlers Call Existing Routes

Handlers do not call Fastify routes over HTTP. They call the same underlying query functions
directly in-process. This avoids an HTTP round-trip and network overhead:

```typescript
// Pattern: shared query function imported by both route handler and MCP tool handler

// src/api/queries/batches.ts
export function queryBatchById(db: Database, batchId: number): Record<string, unknown> | null {
  return db.prepare(`
    SELECT pb.*, s.name AS strain_name, sz.sub_zone_id, ...
    FROM cv_plant_batches pb
    JOIN cv_strains s ON s.strain_id = pb.strain_id
    ...
    WHERE pb.batch_id = ?
  `).get(batchId) as Record<string, unknown> | null;
}

export function enrichBatch(db: Database, raw: Record<string, unknown>): Record<string, unknown> {
  // compute plant_count_current, days_in_stage, active_recipe, rei_status
  // same logic as the route handler currently uses inline
  return { ...raw, /* computed fields */ };
}

// Fastify route: src/api/routes/batches.ts
app.get('/:id', async (req, reply) => {
  const raw = queryBatchById(db, Number(req.params.id));
  if (!raw) return reply.code(404).send({ error: 'Not found' });
  return reply.send(enrichBatch(db, raw));
});

// MCP tool handler: src/agents/cultivate-mcp-server.ts
handler: async ({ batch_id }) => {
  const raw = queryBatchById(db, batch_id);
  if (!raw) throw new McpError(404, `Batch ${batch_id} not found`);
  return enrichBatch(db, raw);
},
```

This also means that if a route's underlying query improves, both the API and the MCP tool
benefit automatically.

---

## Section 2: Approval Gate Architecture

### 2.1 Approval Levels

```typescript
const APPROVAL_REQUIRED: Record<string, 'none' | 'supervisor' | 'admin'> = {
  // Read tools — never need approval
  'get_batch': 'none',
  'get_batch_list': 'none',
  'get_container': 'none',
  'get_current_conditions': 'none',
  'check_rei_status': 'none',
  'check_phi_compliance': 'none',
  'get_crop_input': 'none',
  'get_active_recipe': 'none',
  'get_observations': 'none',
  'get_harvest_status': 'none',
  'get_compliance_dashboard': 'none',
  'calculate_mix': 'none',
  'get_sensor_reading': 'none',
  'get_skill': 'none',

  // Grower-level writes — no approval, audit only
  'create_observation': 'none',
  'create_fertigation_application': 'none',
  'create_foliar_application': 'none',
  'create_waste_trim': 'none',
  'record_plant_loss': 'none',

  // Compliance-critical writes — supervisor must approve before execution
  'create_pesticide_application': 'supervisor',
  'transition_batch': 'supervisor',
  'create_harvest_event': 'supervisor',
};
```

The rule: any operation that creates a pesticide record, changes batch lifecycle status, or
records a harvest event requires a human with the `supervisor` role to explicitly approve
the pending action before the agent proceeds.

### 2.2 Approval Queue Table

**Migration:** `017_agent_infrastructure.ts`

```sql
CREATE TABLE cv_agent_approval_queue (
  approval_id       INTEGER PRIMARY KEY,
  session_id        TEXT NOT NULL,       -- agent session identifier
  tool_name         TEXT NOT NULL,       -- e.g. 'create_pesticide_application'
  tool_input        TEXT NOT NULL,       -- JSON of proposed tool call arguments
  proposed_summary  TEXT NOT NULL,       -- human-readable 1–2 sentence summary
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  required_role     TEXT NOT NULL DEFAULT 'supervisor'
                    CHECK (required_role IN ('supervisor', 'admin')),
  requested_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL,       -- auto-reject if not resolved within 30 minutes
  resolved_at       TEXT,
  resolved_by       INTEGER REFERENCES cv_users(user_id),
  resolver_notes    TEXT,
  modified_input    TEXT,               -- JSON — if reviewer modified the proposed args
  created_by        INTEGER NOT NULL REFERENCES cv_users(user_id)  -- the user on whose behalf the agent acts
);

CREATE INDEX idx_agent_approvals_session ON cv_agent_approval_queue(session_id);
CREATE INDEX idx_agent_approvals_status ON cv_agent_approval_queue(status, requested_at);
```

### 2.3 PreToolUse Hook

The PreToolUse hook fires before every tool call. For tools requiring approval, it:
1. Inserts a row into `cv_agent_approval_queue`
2. Sends a WebSocket notification to online supervisors
3. Pauses the agent until resolved
4. Returns the approval decision (approved / rejected / modified)

```typescript
import { type HookInput } from '@anthropic-ai/claude-code';

export function buildApprovalGate(ctx: McpServerContext) {
  return async (input: HookInput): Promise<Record<string, unknown>> => {
    if (input.hook_event_name !== 'PreToolUse') return {};

    const toolName = input.tool_name.replace('mcp__cultivate__', '');
    const requiredApproval = APPROVAL_REQUIRED[toolName] ?? 'none';

    if (requiredApproval === 'none') return {};  // proceed immediately

    const db = getDB();
    const proposedSummary = buildProposedSummary(toolName, input.tool_input);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const approvalId = db.prepare(`
      INSERT INTO cv_agent_approval_queue
        (session_id, tool_name, tool_input, proposed_summary, required_role,
         expires_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ctx.session_id,
      toolName,
      JSON.stringify(input.tool_input),
      proposedSummary,
      requiredApproval,
      expiresAt,
      ctx.user_id
    ).lastInsertRowid;

    // Notify supervisors via WebSocket
    broadcastToRole(requiredApproval, {
      type: 'agent_approval_required',
      approval_id: approvalId,
      session_id: ctx.session_id,
      tool_name: toolName,
      proposed_summary: proposedSummary,
      expires_at: expiresAt,
      on_behalf_of: ctx.on_behalf_of,
    });

    // Poll for resolution (agent execution is paused here)
    const resolution = await waitForApprovalResolution(Number(approvalId), expiresAt);

    if (resolution.status === 'rejected') {
      // Returning 'block' causes the agent to receive an error and reason
      return {
        block: true,
        reason: `Supervisor rejected this action. Reason: ${resolution.resolver_notes ?? 'No reason provided.'}`
      };
    }

    if (resolution.status === 'expired') {
      return { block: true, reason: 'Approval request expired after 30 minutes without a response.' };
    }

    // If supervisor modified the input, replace the tool's arguments
    if (resolution.modified_input) {
      return { modified_input: JSON.parse(resolution.modified_input) };
    }

    return {};  // approved as-is
  };
}

async function waitForApprovalResolution(
  approvalId: number,
  expiresAt: string
): Promise<{ status: string; resolver_notes?: string; modified_input?: string }> {
  const deadline = new Date(expiresAt).getTime();

  while (Date.now() < deadline) {
    const row = getDB().prepare(`
      SELECT status, resolver_notes, modified_input
      FROM cv_agent_approval_queue
      WHERE approval_id = ?
    `).get(approvalId) as { status: string; resolver_notes: string; modified_input: string } | undefined;

    if (row && row.status !== 'pending') return row;
    await sleep(3000);  // poll every 3 seconds
  }

  // Mark as expired
  getDB().prepare(`
    UPDATE cv_agent_approval_queue SET status = 'expired' WHERE approval_id = ?
  `).run(approvalId);

  return { status: 'expired' };
}
```

### 2.4 Approval API Endpoints

Registered in `src/api/routes/agents.ts` at `/api/agents`:

```
GET  /api/agents/approvals          — list pending approvals (supervisor+)
GET  /api/agents/approvals/:id      — get single approval with full tool input
PATCH /api/agents/approvals/:id     — resolve: { action: 'approve'|'reject', notes?, modified_input? }
GET  /api/agents/sessions           — list active agent sessions (admin)
GET  /api/agents/audit              — query audit log (supervisor+)
```

```typescript
// PATCH /api/agents/approvals/:id
app.patch('/:id', { preHandler: requireRole('supervisor') }, async (req, reply) => {
  const { action, notes, modified_input } = req.body as ApprovalResolveBody;
  const db = getDB();

  const approval = db.prepare(`
    SELECT * FROM cv_agent_approval_queue WHERE approval_id = ?
  `).get(req.params.id);

  if (!approval) return reply.code(404).send({ error: 'Approval not found' });
  if (approval.status !== 'pending') return reply.code(409).send({ error: 'Already resolved' });
  if (new Date(approval.expires_at) < new Date()) return reply.code(409).send({ error: 'Expired' });

  db.prepare(`
    UPDATE cv_agent_approval_queue
    SET status = ?, resolved_at = datetime('now'), resolved_by = ?,
        resolver_notes = ?, modified_input = ?
    WHERE approval_id = ?
  `).run(
    action === 'approve' ? 'approved' : 'rejected',
    req.user.user_id,
    notes ?? null,
    modified_input ? JSON.stringify(modified_input) : null,
    req.params.id
  );

  // Wake up the waiting agent (WebSocket notification to the agent session)
  notifyAgentSession(approval.session_id, { type: 'approval_resolved', approval_id: req.params.id });

  return reply.send({ ok: true });
});
```

### 2.5 WebSocket Approval Notification Flow

```
Agent hook      ──INSERT pending──►  cv_agent_approval_queue
                ──WebSocket push──►  All supervisor browsers (type: agent_approval_required)

Supervisor UI   ──reviews summary + tool args
                ──PATCH /api/agents/approvals/:id (approve/reject/modify)

Server          ──UPDATE status──►  cv_agent_approval_queue
                ──WebSocket push──►  Agent session (type: approval_resolved)

Agent hook      ──polls DB──►  sees resolved status
                ──returns block=true OR {}──►  agent continues or receives error
```

The agent's `waitForApprovalResolution()` loop combines DB polling (3s interval) with a
WebSocket event as the primary wake signal to minimize latency.

---

## Section 3: Audit Trail Design

### 3.1 Audit Log Table

**Migration:** `017_agent_infrastructure.ts` (same migration as approval queue)

```sql
CREATE TABLE cv_agent_audit_log (
  audit_id          INTEGER PRIMARY KEY,
  session_id        TEXT NOT NULL,
  agent_session_name TEXT,             -- human-readable label (e.g., "Pesticide Application Skill — Z1A")
  skill_id          TEXT,              -- if executing a UEM skill
  tool_name         TEXT NOT NULL,
  tool_input        TEXT NOT NULL,     -- JSON
  tool_result       TEXT,              -- JSON (null on error)
  tool_error        TEXT,              -- error message if tool failed
  success           INTEGER NOT NULL,  -- 0 or 1
  on_behalf_of_user INTEGER NOT NULL REFERENCES cv_users(user_id),
  approval_id       INTEGER REFERENCES cv_agent_approval_queue(approval_id),
  executed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms       INTEGER,
  -- Link to created application record (denormalized for compliance search)
  created_record_type TEXT,           -- 'pesticide_application'|'fertigation_application'|etc.
  created_record_id   INTEGER
);

CREATE INDEX idx_agent_audit_session ON cv_agent_audit_log(session_id);
CREATE INDEX idx_agent_audit_user ON cv_agent_audit_log(on_behalf_of_user, executed_at);
CREATE INDEX idx_agent_audit_tool ON cv_agent_audit_log(tool_name, executed_at);
CREATE INDEX idx_agent_audit_skill ON cv_agent_audit_log(skill_id, executed_at);
```

### 3.2 PostToolUse Hook

```typescript
export function buildAuditHook(ctx: McpServerContext, skillId?: string) {
  return async (input: HookInput): Promise<Record<string, unknown>> => {
    if (input.hook_event_name !== 'PostToolUse') return {};

    const start = Date.now();
    const db = getDB();
    const toolName = input.tool_name.replace('mcp__cultivate__', '');

    // Find the approval_id if this tool required approval
    const pendingApproval = db.prepare(`
      SELECT approval_id FROM cv_agent_approval_queue
      WHERE session_id = ? AND tool_name = ? AND status = 'approved'
      ORDER BY resolved_at DESC LIMIT 1
    `).get(ctx.session_id, toolName) as { approval_id: number } | undefined;

    // Extract created record info if the tool created a record
    const createdRecord = extractCreatedRecord(toolName, input.tool_response);

    db.prepare(`
      INSERT INTO cv_agent_audit_log
        (session_id, agent_session_name, skill_id, tool_name, tool_input,
         tool_result, tool_error, success, on_behalf_of_user, approval_id,
         executed_at, duration_ms, created_record_type, created_record_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
    `).run(
      ctx.session_id,
      ctx.agent_session_name ?? null,
      skillId ?? null,
      toolName,
      JSON.stringify(input.tool_input),
      input.tool_response ? JSON.stringify(input.tool_response) : null,
      input.tool_error ?? null,
      input.tool_response !== null && !input.tool_error ? 1 : 0,
      ctx.user_id,
      pendingApproval?.approval_id ?? null,
      Date.now() - start,
      createdRecord?.type ?? null,
      createdRecord?.id ?? null
    );

    return {};
  };
}
```

### 3.3 Human-Initiated vs. Agent-Initiated Records

Every application record (in `cv_applications_pesticide`, `cv_applications_fertigation`, etc.)
carries a `created_by` field that resolves to a user. When an agent creates a record, this is
the `on_behalf_of_user` — the operator on whose behalf the agent acted.

The additional provenance that distinguishes agent-initiated records:

| Field | Human-Initiated | Agent-Initiated |
|-------|----------------|-----------------|
| `cv_applications_*.created_by` | user_id directly | user_id (on behalf of) |
| `cv_agent_audit_log` | No entry | Entry with session_id, skill_id |
| `cv_agent_approval_queue` | No entry | Entry for supervisor-level tools |

To query all application records created by agents (for audit):

```sql
SELECT 'pesticide' AS type, p.pesticide_app_id AS record_id,
       p.applied_at, p.created_by, a.session_id, a.skill_id
FROM cv_applications_pesticide p
JOIN cv_agent_audit_log a ON a.created_record_type = 'pesticide_application'
                          AND a.created_record_id = p.pesticide_app_id
WHERE a.executed_at >= ?
ORDER BY a.executed_at DESC;
```

### 3.4 Compliance Evidence for MN Statute 342.25

Agent-initiated records satisfy the same 5-year retention requirement as human-initiated
records because:

1. The record itself (in the application table) is identical to what a human entry would produce
2. The approval gate ensures a human with the appropriate role explicitly authorized the record
3. The audit log provides the chain of custody: skill → agent session → approval → record
4. The `corrects_id` pattern still applies if the record needs correction

The audit log itself is append-only. No records in `cv_agent_audit_log` are deleted.

---

## Section 4: Skill Execution Agent Pattern

### 4.1 Skill Context Types

```typescript
// src/agents/types.ts

export interface SkillContext {
  batch_id?: number;
  container_id?: string;
  sub_zone_id?: string;
  user_id: number;           // operator on whose behalf the agent acts
  on_behalf_of?: string;     // display name for notifications
  trigger_type: 'user_action' | 'sensor_threshold' | 'scheduled' | 'state_change';
  additional_context?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  skill_id: string;
  session_id: string;
  context: SkillContext;
  steps_completed: string[];      // step IDs from skill schema
  outputs_created: Array<{
    record_type: string;
    record_id: number;
  }>;
  approvals_required: Array<{
    approval_id: number;
    tool_name: string;
    status: string;
  }>;
  success: boolean;
  summary?: string;               // agent's self-reported outcome
  error?: string;
}
```

### 4.2 The `executeSkill()` Function

```typescript
// src/agents/execute-skill.ts

import { query } from '@anthropic-ai/claude-code';
import { createCultivateMcpServer } from './cultivate-mcp-server.js';
import { buildApprovalGate } from './approval-gate.js';
import { buildAuditHook } from './audit-hook.js';
import { getSkillSchema } from './skill-loader.js';
import { getDB } from '../db/index.js';
import crypto from 'crypto';

export async function executeSkill(
  skillId: string,
  context: SkillContext,
  options: {
    require_approval_for?: string[];  // override approval requirements
    max_tool_calls?: number;          // safety limit (default: 50)
    resume_session_id?: string;       // resume a paused session
  } = {}
): Promise<SkillExecutionResult> {

  const skill = await getSkillSchema(skillId);
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);

  const sessionId = options.resume_session_id ?? crypto.randomUUID();
  const mcpCtx = {
    user_id: context.user_id,
    session_id: sessionId,
    on_behalf_of: context.on_behalf_of,
    agent_session_name: `${skill.name} — ${context.sub_zone_id ?? context.batch_id ?? 'general'}`,
  };

  const cultivateMcp = createCultivateMcpServer(mcpCtx);

  const systemPrompt = buildSkillSystemPrompt(skill, context);

  const results: SkillExecutionResult = {
    skill_id: skillId,
    session_id: sessionId,
    context,
    steps_completed: [],
    outputs_created: [],
    approvals_required: [],
    success: false,
  };

  // Record the skill instance in the DB
  const db = getDB();
  const instanceId = db.prepare(`
    INSERT INTO cv_skill_instances
      (skill_id, session_id, context_json, status, initiated_by, initiated_at)
    VALUES (?, ?, ?, 'running', ?, datetime('now'))
  `).run(skillId, sessionId, JSON.stringify(context), context.user_id).lastInsertRowid;

  let toolCallCount = 0;
  const maxCalls = options.max_tool_calls ?? 50;

  try {
    for await (const message of query({
      prompt: buildSkillPrompt(skill, context),
      options: {
        systemPrompt,
        mcpServers: { cultivate: cultivateMcp },
        allowedTools: skill.allowed_tools.map(t => `mcp__cultivate__${t}`),
        resume: options.resume_session_id,
        hooks: {
          PreToolUse: [{
            hooks: [buildApprovalGate(mcpCtx, options.require_approval_for)],
          }],
          PostToolUse: [{
            hooks: [buildAuditHook(mcpCtx, skillId)],
          }],
        },
      },
    })) {

      if (message.type === 'tool_use') {
        toolCallCount++;
        if (toolCallCount > maxCalls) {
          throw new Error(`Tool call limit (${maxCalls}) exceeded — possible infinite loop`);
        }
      }

      if (message.type === 'result' && message.subtype === 'success') {
        results.success = true;
        results.summary = message.result;
      }

      if (message.type === 'result' && message.subtype === 'error') {
        results.error = message.result;
      }
    }

    // Collect outputs from audit log
    const auditEntries = db.prepare(`
      SELECT created_record_type, created_record_id, approval_id
      FROM cv_agent_audit_log
      WHERE session_id = ? AND success = 1
    `).all(sessionId) as Array<Record<string, unknown>>;

    for (const entry of auditEntries) {
      if (entry['created_record_type'] && entry['created_record_id']) {
        results.outputs_created.push({
          record_type: entry['created_record_type'] as string,
          record_id: entry['created_record_id'] as number,
        });
      }
      if (entry['approval_id']) {
        // collect approval references for the result
      }
    }

  } catch (err) {
    results.error = err instanceof Error ? err.message : String(err);
    db.prepare(`
      UPDATE cv_skill_instances SET status = 'failed', error = ?, completed_at = datetime('now')
      WHERE instance_id = ?
    `).run(results.error, instanceId);
    return results;
  }

  db.prepare(`
    UPDATE cv_skill_instances SET status = 'completed', completed_at = datetime('now'),
    result_summary = ? WHERE instance_id = ?
  `).run(results.summary ?? null, instanceId);

  return results;
}
```

### 4.3 System Prompt Construction

The system prompt translates the skill schema into agent instructions. It is the bridge
between the human-readable SOP (in ff-dcs) and the agent's execution context.

```typescript
function buildSkillSystemPrompt(skill: SkillSchema, context: SkillContext): string {
  return `
You are a compliance-aware cultivation assistant executing the "${skill.name}" skill
on behalf of the operator (user_id: ${context.user_id}) at a licensed Minnesota cannabis
grow facility.

## Regulatory Context
${skill.regulatory_refs.map(r => `- ${r}`).join('\n')}

## Your Task
Execute the following skill step-by-step. Do not skip steps. For each step:
1. Use read tools to gather required information before taking action
2. Confirm preconditions are met before executing write tools
3. If a precondition fails, STOP and report why — do not proceed
4. For compliance-critical writes, the approval gate will pause you — this is expected

## Skill: ${skill.name}
**Purpose:** ${skill.description}

## Preconditions (check all before any write)
${skill.preconditions.map((p, i) => `${i + 1}. ${p.description}`).join('\n')}

## Steps
${skill.steps.map((step, i) => `
### Step ${i + 1}: ${step.name}
${step.description}
${step.tool ? `Primary tool: ${step.tool}` : ''}
${step.required_fields?.length ? `Required fields: ${step.required_fields.join(', ')}` : ''}
${step.on_failure ? `On failure: ${step.on_failure}` : ''}
`).join('\n')}

## Compliance Checks
${skill.compliance_checks.map(c => `- [${c.severity.toUpperCase()}] ${c.description}`).join('\n')}

## Context
${context.batch_id ? `Batch ID: ${context.batch_id}` : ''}
${context.container_id ? `Container: ${context.container_id}` : ''}
${context.sub_zone_id ? `Sub-zone: ${context.sub_zone_id}` : ''}
${context.additional_context ? JSON.stringify(context.additional_context, null, 2) : ''}

## Required Outputs
At the end, confirm which records were created (type + ID) and whether all preconditions
and compliance checks were satisfied. If anything was blocked or required override, explain.

## Important Constraints
- You CANNOT modify tool input schemas — call tools with valid arguments only
- You CANNOT skip the approval gate — supervisor approval is required for pesticide applications,
  batch transitions, and harvest events
- You MUST call check_rei_status before any action that requires physical entry
- You MUST call check_phi_compliance before recommending any product application
- When in doubt, use a read tool first, then decide
`.trim();
}
```

### 4.4 Skill Schema Storage

```typescript
// src/agents/skill-loader.ts

import path from 'path';
import { readFile } from 'fs/promises';

const SKILLS_DIR = path.join(__dirname, '../../skills');

export async function getSkillSchema(skillId: string): Promise<SkillSchema | null> {
  try {
    const filePath = path.join(SKILLS_DIR, `${skillId}.json`);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as SkillSchema;
  } catch {
    return null;
  }
}
```

**Phase 1:** Skills are stored as JSON files in `skills/` (hand-crafted, version-controlled).  
**Phase 3:** Skills are fetched from ff-dcs API with local caching and ETag refresh.

---

## Section 5: Event Trigger Architecture

### 5.1 Trigger Table

```sql
-- In migration 017_agent_infrastructure.ts

CREATE TABLE cv_agent_triggers (
  trigger_id        INTEGER PRIMARY KEY,
  trigger_name      TEXT NOT NULL,        -- human-readable label
  trigger_type      TEXT NOT NULL
                    CHECK (trigger_type IN ('sensor_threshold', 'scheduled', 'state_change',
                                            'manual')),
  skill_id          TEXT NOT NULL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  -- Trigger condition (evaluated by the dispatcher)
  condition_json    TEXT NOT NULL,        -- JSON per trigger_type (see below)
  -- Context template — merged with runtime context when trigger fires
  context_template  TEXT NOT NULL DEFAULT '{}',  -- JSON
  -- Scheduling (for 'scheduled' type)
  cron_expression   TEXT,                -- null except for scheduled type
  -- State tracking
  last_fired_at     TEXT,
  last_result       TEXT,               -- 'success'|'failed'|'blocked'
  fire_count        INTEGER DEFAULT 0,
  created_by        INTEGER NOT NULL REFERENCES cv_users(user_id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Condition JSON formats by trigger_type:**

```json
// sensor_threshold
{
  "metric": "vpd_kpa",
  "sub_zone_id": "Z1A",
  "operator": ">",
  "threshold": 1.8,
  "duration_minutes": 30
}

// state_change
{
  "entity": "plant_batch",
  "from_status": "flush",
  "to_status": "harvest_window"
}

// scheduled  (cron_expression on the trigger row drives timing)
{
  "batch_status_filter": ["field-veg", "field-flower", "flush"],
  "time_of_day": "06:00",
  "timezone": "America/Chicago"
}
```

### 5.2 Event Dispatcher Service

**File:** `src/agents/event-dispatcher.ts`

The dispatcher runs as a background service (Node.js setInterval or Railway cron).
It polls every 5 minutes, evaluates trigger conditions, and launches skill execution.

```typescript
export async function runEventDispatcher(): Promise<void> {
  const db = getDB();

  const triggers = db.prepare(`
    SELECT * FROM cv_agent_triggers WHERE enabled = 1
  `).all() as AgentTrigger[];

  for (const trigger of triggers) {
    try {
      const shouldFire = await evaluateTriggerCondition(trigger);
      if (!shouldFire) continue;

      const context = buildTriggerContext(trigger);
      const result = await executeSkill(trigger.skill_id, context, {
        require_approval_for: getApprovalOverrides(trigger),
      });

      db.prepare(`
        UPDATE cv_agent_triggers
        SET last_fired_at = datetime('now'),
            last_result = ?,
            fire_count = fire_count + 1,
            updated_at = datetime('now')
        WHERE trigger_id = ?
      `).run(result.success ? 'success' : 'failed', trigger.trigger_id);

      // Notify relevant users of the trigger result
      await notifyTriggerResult(trigger, result);

    } catch (err) {
      logger.error({ trigger_id: trigger.trigger_id, err }, 'Trigger evaluation failed');
    }
  }
}
```

### 5.3 Trigger Condition Evaluation

```typescript
async function evaluateTriggerCondition(trigger: AgentTrigger): Promise<boolean> {
  const condition = JSON.parse(trigger.condition_json) as TriggerCondition;

  switch (trigger.trigger_type) {
    case 'sensor_threshold': {
      const db = getDB();
      const reading = db.prepare(`
        SELECT AVG(${condition.metric}) AS avg_val
        FROM cv_sensor_readings r
        JOIN cv_sensor_location_assignments a ON a.sensor_id = r.sensor_id
          AND a.unassigned_at IS NULL
        WHERE a.sub_zone_id = ?
          AND r.observed_at >= datetime('now', '-${condition.duration_minutes} minutes')
      `).get(condition.sub_zone_id) as { avg_val: number } | undefined;

      if (!reading?.avg_val) return false;

      const met = condition.operator === '>'
        ? reading.avg_val > condition.threshold
        : reading.avg_val < condition.threshold;

      // Don't re-fire within 1 hour of last fire to prevent alert storms
      if (met && trigger.last_fired_at) {
        const msSinceFire = Date.now() - new Date(trigger.last_fired_at).getTime();
        if (msSinceFire < 60 * 60 * 1000) return false;
      }

      return met;
    }

    case 'state_change': {
      // Check if any batch transitioned in the past 5 minutes
      const db = getDB();
      const transition = db.prepare(`
        SELECT batch_id FROM cv_batch_phase_history
        WHERE to_status = ? AND recorded_at >= datetime('now', '-5 minutes')
        LIMIT 1
      `).get(condition.to_status) as { batch_id: number } | undefined;

      return !!transition;
    }

    case 'scheduled': {
      // Evaluate cron expression against current time (America/Chicago)
      return isCronDue(trigger.cron_expression!, trigger.last_fired_at);
    }

    default:
      return false;
  }
}
```

### 5.4 Trigger Type Examples

| Trigger | Condition | Skill | Approval Required |
|---------|-----------|-------|-------------------|
| VPD out of range | VPD > 1.8 kPa for 30 min in Z1A | `environmental_alert` | No (read + notify only) |
| Daily fertigation | 06:00 America/Chicago, field-flower batches | `fertigation_application` | No (fully automated) |
| Batch enters harvest_window | status change flush → harvest_window | `harvest_readiness_monitor` | No (starts observation prompts) |
| REI approaching expiry | pesticide app where rei_expires_at within 15 min | `rei_clearance_reminder` | No (notification only) |
| PHI non-compliance detected | phi_compliant=0 on harvesting batch | `phi_compliance_alert` | No (block + notify) |
| Weekly compliance check | Sunday 08:00 | `compliance_status_report` | No (read + report) |

---

## Section 6: Implementation Phases

### Phase 1 — Foundation (build next, estimate: 3–4 days)

**Goal:** Prove the pattern. One working end-to-end agent call with read-only tools.

1. **Install SDK**
   ```bash
   npm install @anthropic-ai/claude-code
   ```

2. **Create `src/agents/` directory structure**
   ```
   src/agents/
     cultivate-mcp-server.ts    — MCP server definition
     types.ts                   — shared types
     audit-hook.ts              — PostToolUse audit hook
     skill-loader.ts            — JSON skill schema reader
     index.ts                   — exports
   ```

3. **Extract shared query functions** from route handlers into `src/api/queries/`:
   ```
   src/api/queries/
     batches.ts       — queryBatchById, enrichBatch, queryBatchList
     containers.ts    — queryContainerById, enrichContainer
     sensors.ts       — queryCurrentConditions, queryLatestReading
     observations.ts  — queryObservations
     harvest.ts       — queryHarvestStatus
   ```
   Route handlers import from here; MCP tools import from here. No logic duplication.

4. **Create `src/api/routes/agents.ts`** — query endpoint for testing:
   ```
   POST /api/agents/query
   ```
   Body: `{ prompt: string, batch_id?: number, tools?: string[] }`  
   Auth: `requireRole('supervisor')`  
   Response: `{ session_id, result, tool_calls_made, audit_entries }`

5. **Write migration `017_agent_infrastructure.ts`** with:
   - `cv_agent_approval_queue`
   - `cv_agent_audit_log`
   - `cv_agent_triggers`
   - `cv_skill_instances`

6. **Proof-of-concept test:**
   ```
   POST /api/agents/query
   { "prompt": "What is the current status of all active batches? Include plant counts and current recipes." }
   ```
   Expected: agent calls `get_batch_list`, then `get_active_recipe` for each batch, returns structured summary. All calls logged in `cv_agent_audit_log`.

7. **Add read-only MCP tools:** all 11 read tools from Section 1.1 + 3 utility tools.

8. **Commit:** `feat: Agent SDK foundation — MCP server with read-only tools + audit log`

---

### Phase 2 — Write Tools + Approval Gates (estimate: 4–5 days)

**Goal:** Full write capability with supervisor approval for compliance-critical operations.

1. **Implement approval queue** (table from Phase 1 migration)
2. **Build `buildApprovalGate()` hook** — polling + WebSocket integration
3. **Add write tools** to MCP server (all 8 from Section 1.2)
4. **Build approval UI** — new compliance dashboard panel showing pending approvals
5. **WebSocket integration** — real-time push to supervisor browsers on approval request
6. **Add `/api/agents/approvals` endpoints** (CRUD for approval queue)

7. **First skill with approval:** `compliance_check` skill  
   - No write tools — reads state, checks REI/PHI across all active batches
   - Returns compliance summary with actionable items
   - Useful test: runs on demand, returns JSON report with red/amber/green items

8. **Second test:** trigger `create_pesticide_application` via agent query  
   - Agent gathers context (batch, product, conditions)
   - Hits approval gate — supervisor sees request in UI
   - Supervisor approves → agent proceeds, record created
   - Audit log shows full chain

9. **Commit:** `feat: write tools + approval gate + pesticide application skill`

---

### Phase 3 — Skill Execution (estimate: 5–6 days)

**Goal:** Full `executeSkill()` function running hand-crafted skill schemas.

1. **Create `skills/` directory** with 5 priority skill schemas (JSON):
   - `skills/pesticide_application.json`
   - `skills/foliar_application.json`
   - `skills/fertigation_application.json`
   - `skills/batch_status_transition.json`
   - `skills/plant_loss_recording.json`

2. **Implement `executeSkill()`** function (Section 4.2)

3. **Create `cv_skill_instances` table** (in migration 017):
   ```sql
   CREATE TABLE cv_skill_instances (
     instance_id   INTEGER PRIMARY KEY,
     skill_id      TEXT NOT NULL,
     session_id    TEXT NOT NULL UNIQUE,
     context_json  TEXT NOT NULL,
     status        TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'paused')),
     initiated_by  INTEGER NOT NULL REFERENCES cv_users(user_id),
     initiated_at  TEXT NOT NULL,
     completed_at  TEXT,
     result_summary TEXT,
     error         TEXT
   );
   ```

4. **Add skill execution endpoint:**
   ```
   POST /api/agents/skills/:skillId/execute
   ```
   Body: `{ batch_id?, container_id?, sub_zone_id?, additional_context? }`  
   Auth: `requireRole('grower')`  
   Response: `{ instance_id, session_id, status, summary }`

5. **End-to-end test:** Execute `pesticide_application` skill against a test batch  
   - Agent reads context, computes PHI/REI, checks conditions, assembles application record
   - Hits approval gate, supervisor approves
   - Application record created, audit log complete
   - Skill instance marked completed

6. **Commit:** `feat: executeSkill() — skill schema to agent execution`

---

### Phase 4 — Event Triggers (estimate: 3–4 days)

**Goal:** Skills execute automatically on sensor thresholds, schedules, and state changes.

1. **Implement `event-dispatcher.ts`** background service
2. **Wire dispatcher to Railway cron** or Node.js `setInterval` in server startup
3. **Create trigger management endpoints:**
   ```
   GET  /api/agents/triggers       — list triggers
   POST /api/agents/triggers       — create trigger
   PATCH /api/agents/triggers/:id  — update/enable/disable
   DELETE /api/agents/triggers/:id — remove trigger
   ```
4. **Seed initial triggers:**
   - Daily fertigation at 06:00
   - VPD threshold for each active sub-zone
   - State change trigger on harvest_window entry
   - Weekly compliance check Sunday 08:00

5. **Test:** Manually trigger a sensor threshold to verify skill fires and notifies

6. **Commit:** `feat: event dispatcher — sensor threshold and scheduled skill triggers`

---

## Section 7: Felix + Agent SDK Division of Labor

| Task Type | Tool | Rationale |
|-----------|------|-----------|
| New route, migration, UI page | **Felix** | Pre-specified, headless, no live data needed |
| Nightly batch audit report (PDF generation) | **Felix** | Pre-specified, runs to completion without interaction |
| Skill schema authoring / conversion | **Felix** | Given SOP text → produce JSON schema |
| Real-time pesticide guidance | **Agent SDK** | Needs live data (current conditions, REI, PHI), approval gate, sensor reading |
| Daily fertigation logging | **Agent SDK** | Needs live batch data, real sensor auto-fill, record creation |
| Sensor threshold response | **Agent SDK** | Event-driven, requires real-time sensor context |
| Harvest readiness assessment | **Agent SDK** | Needs per-container observation, interactive summary |
| Compliance monitoring alerts | **Agent SDK** | Continuous, event-driven, depends on live DB state |
| SOP → skill schema conversion (AI extraction) | **Agent SDK** | Interactive reasoning, needs ff-dcs RAG context |
| Code generation (test files, utility functions) | **Felix** | Pre-specified, no live data |
| Schema gap analysis | **Felix** | Read-only, report output |
| Large refactors (extracting query functions) | **Felix** | Pre-specified, headless |

**Heuristics:**

- **Use Agent SDK when:** the task requires live DB reads + writes in the same session, or when the right action depends on real-time conditions that aren't known until execution time
- **Use Felix when:** the task's full specification can be written in advance without needing to observe live data

**Hybrid pattern (daily fertigation):**

Fully automated fertigation is a borderline case. Two options:

*Option A — Felix:* A pre-scheduled Felix task at 06:00 that reads current batch data (via API call) and writes fertigation applications for all active batches at the standard recipe. No approval gate. Works when the recipe and batch configuration don't require judgment.

*Option B — Agent SDK:* A triggered skill that reads sensor data (EC/pH from yesterday, VPD trends), recommends whether to apply or adjust, then creates the records after grower confirms. Better when environmental variation might drive deviations.

Recommendation: Start with Option A (Felix, simpler). Upgrade to Agent SDK when the operation wants sensor-driven recipe adjustments.

---

## Section 8: Security and Permissions

### 8.1 User Identity Flow

```
Trigger → SkillContext.user_id
         │
         ├── MCP tool handler: injects ctx.user_id as created_by on all DB writes
         │   (same column that Fastify route handlers write when a human submits a form)
         │
         ├── cv_agent_audit_log.on_behalf_of_user = ctx.user_id
         │
         └── cv_agent_approval_queue.created_by = ctx.user_id
```

Every database write made by an agent carries the user_id of the operator who initiated
the skill execution. If the trigger is automated (scheduled, sensor threshold), the
`user_id` is a designated system service account (e.g., `system_agent` user with role `grower`
for read/write, no supervisor access).

The service account has deliberately limited permissions: it can create observations,
fertigation applications, and foliar applications, but cannot create pesticide applications,
transition batches, or log harvest events without a human supervisor's explicit approval.

### 8.2 Role Enforcement in MCP Tools

MCP tool handlers enforce the same `requireRole()` logic as Fastify route handlers by checking
the bound `ctx.user_id` against the user's role in `cv_users`:

```typescript
// In buildToolDefinitions(ctx):
function requireMcpRole(toolName: string, minRole: 'grower' | 'supervisor' | 'admin') {
  const db = getDB();
  const user = db.prepare(`SELECT role FROM cv_users WHERE user_id = ?`).get(ctx.user_id) as
    { role: string } | undefined;

  if (!user) throw new McpError(401, 'Agent context user not found');

  const roleOrder = { grower: 0, supervisor: 1, admin: 2 };
  if (roleOrder[user.role as keyof typeof roleOrder] < roleOrder[minRole]) {
    throw new McpError(403, `This tool requires role: ${minRole}`);
  }
}
```

This means a grower-context agent cannot call `transition_batch` (supervisor minimum) even
if the approval gate were bypassed. The role check is independent of the approval gate.

### 8.3 Approval Gate Role Enforcement

The approval gate enforces that the resolver matches the required role:

```typescript
// In PATCH /api/agents/approvals/:id route handler:
if (req.user.role !== approval.required_role && req.user.role !== 'admin') {
  return reply.code(403).send({ error: `Resolving this approval requires role: ${approval.required_role}` });
}
```

A grower cannot approve their own agent's pending pesticide application.  
An admin can approve any pending approval regardless of required_role.

### 8.4 Audit Log Provenance

The audit log distinguishes four action types:

| Action Source | created_by column | cv_agent_audit_log entry |
|---------------|------------------|--------------------------|
| Human via browser | user_id | None |
| Agent (user-triggered) | user_id (on_behalf_of) | Yes — session_id + skill_id |
| Agent (scheduled trigger) | system_agent user_id | Yes — trigger_id in context_json |
| Agent (sensor trigger) | system_agent user_id | Yes — trigger_id + threshold_value |

Regulators can query `cv_agent_audit_log` to see a complete list of all agent-initiated
actions, sorted by date, with the approving supervisor's identity for compliance-critical writes.

### 8.5 Rate Limiting and Safety Limits

```typescript
const AGENT_SAFETY_LIMITS = {
  max_tool_calls_per_session: 50,        // prevent runaway loops
  max_concurrent_sessions_per_user: 2,   // prevent duplicate execution
  max_approval_wait_minutes: 30,         // auto-reject stale approvals
  max_trigger_fires_per_hour: 12,        // per trigger, prevent storm
  sensor_threshold_refire_cooldown_ms: 60 * 60 * 1000,  // 1 hour
};
```

Concurrent session tracking:

```typescript
function checkConcurrentSessions(userId: number): void {
  const db = getDB();
  const running = db.prepare(`
    SELECT COUNT(*) AS cnt FROM cv_skill_instances
    WHERE initiated_by = ? AND status = 'running'
      AND initiated_at >= datetime('now', '-1 hour')
  `).get(userId) as { cnt: number };

  if (running.cnt >= AGENT_SAFETY_LIMITS.max_concurrent_sessions_per_user) {
    throw new Error(`User ${userId} already has ${running.cnt} running agent sessions`);
  }
}
```

The 50-tool-call limit per session prevents infinite reasoning loops. If a skill legitimately
requires more than 50 tool calls, raise the limit explicitly in the skill schema's
`max_tool_calls` field and document why.

---

## Appendix A: Skill Schema Table — Priority 5

These five skill schemas should be hand-crafted first (before any AI extraction):

| Skill ID | allowed_tools | Approval Required | Estimated Steps |
|----------|---------------|-------------------|-----------------|
| `pesticide_application` | check_rei_status, check_phi_compliance, get_crop_input, get_batch, get_current_conditions, create_pesticide_application | supervisor | 6 |
| `foliar_application` | check_phi_compliance, get_active_recipe, get_batch, get_current_conditions, create_foliar_application | none | 5 |
| `fertigation_application` | get_batch, get_active_recipe, get_current_conditions, calculate_mix, create_fertigation_application | none | 4 |
| `batch_status_transition` | get_batch, get_observations, get_harvest_status, check_phi_compliance, transition_batch | supervisor | 5 |
| `plant_loss_recording` | get_container, get_batch, record_plant_loss | none | 3 |

---

## Appendix B: Proof-of-Concept Test Script

After Phase 1 is implemented, run this to verify the full stack:

```bash
# Start the server
npm run dev

# Query the agent endpoint
curl -X POST http://localhost:3001/api/agents/query \
  -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize the current compliance status. Check all active batches for REI and PHI issues, then list any batches that need immediate attention.",
    "tools": ["get_batch_list", "check_rei_status", "check_phi_compliance", "get_compliance_dashboard"]
  }'

# Expected response includes:
# - session_id (UUID)
# - result (agent summary text)
# - tool_calls_made (count)
# - audit_entries (array with each tool call logged)
```

The test is complete when:
1. Agent calls `get_compliance_dashboard` first for overview
2. Calls `get_batch_list` to enumerate batches
3. Calls `check_rei_status` and/or `check_phi_compliance` for flagged batches
4. Returns a structured compliance summary with actionable items
5. All calls appear in `cv_agent_audit_log` with the supervisor's user_id

---

*Last updated: 2026-05-21. Prerequisites: docs/uem-architecture.md (skill schema specification)*
