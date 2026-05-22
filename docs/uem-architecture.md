# Uniform Enterprise Management (UEM) — Architecture Design

**Prepared:** 2026-05-21  
**Status:** Design document — pre-implementation  
**Scope:** SOP-driven skill system connecting ff-dcs to cultivate (and future sub-applications)  
**Author:** Design session with operator

---

## Executive Summary

The UEM system transforms SOPs from compliance documents into executable software behavior.
Rather than encoding business rules independently in each application (cultivate, farmstock,
future apps), all rules derive from the SOPs stored in ff-dcs. When a regulation changes,
a manager updates the SOP — all downstream applications update automatically through a
skill schema that both humans and machines can execute.

This creates a compliance posture stronger than any manual system: the same document that
satisfies a regulator inspection is the same document that drives the form fields, validation
rules, and agent behaviors across the operation's software.

---

## Section 1: The SOP → Skill → Checklist Pipeline

### Overview

```
SOP (natural language in ff-dcs)
    │
    ▼  [AI Extraction — IntelligenceService]
Extracted Structure
    │
    ▼  [Schema Generation — human-reviewed]
Skill Schema (JSON — hosted by ff-dcs)
    │
    ├──▶ Sub-application forms  (cultivate, farmstock)
    ├──▶ Printable checklists   (pdf/print)
    ├──▶ Agent execution        (Felix tasks)
    └──▶ Compliance monitoring  (nightly check)
```

### Stage 1: SOP Authoring (ff-dcs)

Managers write SOPs in natural language using a standard template. ff-dcs already enforces
document structure through its category/type system. Cultivation-domain SOPs follow this
template:

```markdown
## Purpose and Scope
[What this SOP governs and who it applies to]

## Regulatory References
[MN Statute 342.25, MN 18B.37, METRC Record Additives, ...]

## Required Inputs
[What must be gathered or confirmed before beginning]

## Step-by-Step Procedure
1. [Step with any conditions: IF / THEN]
2. ...

## Compliance Checkpoints
[Explicit BLOCK / WARN conditions]

## Required Outputs
[What records must be created and where they are stored]

## Roles and Responsibilities
[Who can perform each step — GROWER / SUPERVISOR / ADMIN]

## Exception Handling
[What to do when something goes wrong or a rule cannot be met]
```

The template is enforced as a category convention in ff-dcs, not a hard schema constraint.
Sections can be abbreviated or combined, but the AI extraction pipeline expects these
semantic signals to be present.

### Stage 2: AI Extraction (ff-dcs IntelligenceService)

The existing `IntelligenceService.extract()` capability reads the SOP and extracts structured
data. The current `ExtractType` values (`requirements`, `roles`, `procedures`, `equipment`,
`safety`, `definitions`, `references`, `timelines`) provide the raw materials.

For UEM, we extend this with a `skill_extraction` operation that calls `extract()` for
multiple types and then runs a second LLM pass to synthesize the results into a draft
skill schema:

```typescript
// New operation on IntelligenceService
async extractSkill(sopDocId: string, userId?: string): Promise<DraftSkillSchema> {
  // Phase 1: extract raw structure using existing types
  const extracted = await this.extract({
    doc_id: sopDocId,
    extract_types: ['requirements', 'roles', 'procedures', 'timelines', 'references'],
  }, userId);

  // Phase 2: LLM synthesis pass — convert to structured skill schema
  const response = await this.llm.complete(
    SKILL_EXTRACTION_SYSTEM_PROMPT,
    [{
      role: 'user',
      content: `Extracted content:\n${JSON.stringify(extracted, null, 2)}`,
    }],
    { maxTokens: 6000, userId, operation: 'skill_extraction' }
  );

  // Phase 3: Parse and validate draft
  return parseSkillSchema(response.content);
}
```

The `SKILL_EXTRACTION_SYSTEM_PROMPT` instructs the model to produce the skill schema
format defined in Section 4 of this document. The output is a **draft** — not published
until a supervisor approves it.

### Stage 3: Skill Schema Generation

The draft skill schema is stored in ff-dcs's database with status `draft`. A supervisor
reviews it via the ff-dcs Skills admin UI:

- Step list rendered interactively (add/remove/reorder steps)
- Precondition rules edited as structured form fields
- Role requirements confirmed against the operation's actual user roles
- Output actions verified against the cultivate database schema

On approval, status transitions to `active` and the skill becomes available to sub-applications
via the skills API.

**Version lifecycle:**

```
draft → active → deprecated
               ↘ superseded (when a new version goes active)
```

All prior versions are retained (5-year audit requirement). Sub-applications pin to specific
versions and are notified when a new version is available.

### Stage 4: Skill Distribution

```
ff-dcs (source of truth)
    │
    ├── GET /api/skills              — list active skills with metadata
    ├── GET /api/skills/:id          — full schema for a specific skill
    ├── GET /api/skills/:id/versions — version history
    └── POST /api/skills/:id/runs    — record a completed execution
    
cultivate (consumer)
    │
    ├── Fetches skills at startup (all active)
    ├── Caches in localStorage with version key
    ├── Re-fetches when ETag changes (webhook or polling)
    └── Falls back to cached copy if ff-dcs is unreachable
```

Skills are small JSON objects (typically 2–10 KB each). Full reload of all cultivation
skills on startup adds < 200ms to cold start.

---

## Section 2: How Skills Drive Sub-Applications

### Dynamic Form Generation

Today, `PesticideNew.jsx` is a handcrafted React component that encodes business rules
as hardcoded JSX. Under UEM, the form is generated from the skill schema.

The form renderer reads the skill's `steps` array and renders each step as a form
section. The renderer is a single shared component `<SkillForm skill={schema} />` that:

1. Evaluates preconditions against current context (batch status, active REIs, PHI)
2. Shows BLOCK conditions as full-screen modals before allowing entry
3. Renders fields from `step.fields` using the field type map (below)
4. Applies auto-fill from `step.auto_fill` sources
5. Validates each field per the field's `validation` rules before allowing next step
6. Submits output actions to the appropriate backend routes

The field type map:

| Field type | Rendered as |
|---|---|
| `text` | Text input (keyboard type text) |
| `decimal` | Numeric input (inputmode=decimal) |
| `integer` | Numeric input (inputmode=numeric) |
| `reference` | Searchable picker loading from `source` endpoint |
| `enum` | Chip selector (controlled vocabulary) |
| `boolean` | Yes/No toggle |
| `datetime` | Date + time picker (defaults to now, editable) |
| `photo` | Camera capture + gallery attachment |

### Dynamic Checklist Generation

The same skill schema generates a printable interactive checklist for human use. Each step
becomes a checkbox group. Decision points branch the checklist. Compliance checkpoints are
highlighted with regulatory references.

Completed checklists are stored in ff-dcs as `skill_run` records (Section 5). This provides
machine-readable evidence that staff followed the SOP — stronger than any paper binder.

### Validation Driven by Skill

Route handlers in cultivate currently contain hardcoded rule checks. Under UEM, a
`validateAgainstSkill(skillId, body, context)` utility loads the skill schema and evaluates:

1. Preconditions — return 400 / 422 with the precondition's message
2. Field validations — return 400 with per-field issues
3. Stage compliance — check `input_phi_stage_overrides` per skill specification
4. PHI/REI — compute per skill's `compliance_checks` array

The skill schema does not replace Zod (which handles type safety), but wraps around it
to add domain-rule evaluation that goes beyond type checking.

### Graceful Degradation

If ff-dcs is unavailable (network partition, maintenance), cultivate falls back to its
locally cached skill schemas. If no cached schema exists for a skill, cultivate falls
back to its hardcoded form (the current behavior). The degradation is invisible to the
user in normal operation.

---

## Section 3: Agent Integration Architecture

### Agent Types

#### 3.1 Skill Extraction Agent

Converts a human-authored SOP into a draft skill schema for supervisor review.

```
Input:  SOP document ID (in ff-dcs)
Output: Draft skill schema (stored in ff-dcs, status=draft)

Execution:
  1. IntelligenceService.extract() — pull requirements, roles, procedures, timelines
  2. LLMService.complete() — synthesize into skill schema JSON
  3. Parse and validate schema structure
  4. Store as draft in ff-dcs skills table
  5. Notify supervisor that draft is ready for review

Human gate: REQUIRED before status → active
```

Felix task format for triggering skill extraction:

```json
{
  "import_config": {
    "target_directory": "C:\\projects\\ff-dcs",
    "task_type": "feature",
    "priority": 2
  },
  "tasks": [{
    "name": "Extract skill schema from SOP-012",
    "model": "sonnet",
    "instructions": "Read CLAUDE.md before starting. Call POST /api/skills/extract with body { sop_doc_id: 'SOP-012', submitted_by: '{user_id}' }. Log the draft skill ID returned. Do not publish or approve the draft."
  }]
}
```

#### 3.2 Skill Execution Agent

Walks through a skill schema autonomously, collecting inputs, checking preconditions,
and creating output records.

```
Input:  Skill schema + execution context (batch_id, user_id, sensor readings)
Output: Completed records in cultivate DB + skill_run record in ff-dcs

Execution:
  1. Load skill schema from ff-dcs
  2. Evaluate preconditions — abort if any BLOCK condition fails
  3. For each step:
     a. Collect inputs (from context, sensors, or prior steps)
     b. Validate per field rules
     c. If step requires human sign-off: send notification, await confirmation
     d. Execute step (API call to cultivate)
  4. Record skill_run in ff-dcs with step outcomes
  5. Surface any compliance deviations
```

Skill execution via Felix:

```json
{
  "tasks": [{
    "name": "Execute daily fertigation — Z1A, Z2A",
    "model": "haiku",
    "instructions": "Execute skill 'fertigation-application-v1' for batches in sub-zones Z1A and Z2A. Context: use sensor readings from /api/sensors/current. Batch IDs: [batch_ids]. User: system. No human confirmation needed for routine fertigation if EC and pH are in range. Log any out-of-range readings as observations."
  }]
}
```

#### 3.3 Compliance Monitoring Agent

Nightly check that compares what was recorded against what the skill schema requires.

```
Input:  All applications recorded today + all active skill schemas
Output: Compliance report — deviations flagged, conformances confirmed

Execution:
  1. For each application recorded today, find the matching skill schema
  2. Verify all required fields were captured
  3. Verify all compliance checkpoints were satisfied (or overridden with documentation)
  4. Verify outputs match the skill's declared output actions
  5. Write compliance_run record to ff-dcs
  6. If any deviation: create ff-dcs notification for supervisor
  7. If critical deviation: escalate (email to tomc@sbdci.com)

Schedule: Nightly at 3am (Felix cron)
```

#### 3.4 Skill Update Agent

When a regulation changes, identifies affected SOPs and proposes amendments.

```
Input:  Regulatory update description (free text or document)
Output: Draft SOP amendments for human review

Execution:
  1. RAGService.answer() — "Which of our SOPs reference [regulation]?"
  2. For each affected SOP: IntelligenceService.compare() — current vs. new requirement
  3. IntelligenceService.generateDraft() — produce amendment section
  4. Store as ff-dcs document revision draft
  5. Notify supervisor that drafts are ready for review

Human approval: REQUIRED before publishing any SOP or skill update
```

### Human-in-the-Loop Spectrum

Not all workflow steps are candidates for automation. The spectrum:

| Level | Description | Example Workflows |
|---|---|---|
| **Fully automated** | Agent executes the complete skill with no human interaction | Routine fertigation logging (sensor data + known recipe + active batch → complete record) |
| **Assisted** | Agent pre-fills form; human reviews and confirms before submission | Pesticide application (agent fills temp/RH from sensor, product from lot, rate from SOP; operator reviews and taps confirm) |
| **Supervised** | Agent identifies when criteria are met; supervisor approves the action | Batch status transitions (agent detects all plants ready per readiness observations; supervisor approves harvesting transition) |
| **Human-only** | No agent involvement; human executes the skill directly | Harvest decisions, compliance exception overrides, regulatory submissions, PHI override sign-off |

**Cultivate workflow assignments:**

| Workflow | Level | Rationale |
|---|---|---|
| Daily fertigation logging | Fully automated (Phase 5) | Sensor data + recipe = complete record; low variance |
| Foliar application | Assisted | Product selection and rate require human judgment |
| Pesticide application | Assisted | PHI/REI/stage blocks require operator acknowledgment |
| Container amendment | Assisted | Soil sample interpretation requires human judgment |
| Batch status transitions | Supervised | Irreversible changes; supervisor approval required |
| Harvest events | Supervised | Physical verification required (tag last-4 check) |
| Harvest decisions | Human-only | Management judgment; regulatory weight |
| Plant loss recording | Assisted | Simple form; but loss cause requires human assessment |
| Compliance exception override | Human-only | Override must be documented by authorized person |

---

## Section 4: Skill Schema Standard

### Schema Version

All skill schemas include a `schema_version` field to support evolution without breaking
existing consumers.

```
Current schema_version: "1.0"
```

When the schema format changes in a backward-incompatible way, `schema_version` increments.
Sub-applications check this field on load and warn if they don't recognize the version.

### Full Schema Specification

```typescript
interface SkillSchema {
  // Identity
  schema_version: "1.0";
  skill_id: string;                 // e.g. "pesticide-application"
  skill_version: string;            // e.g. "2.1"
  status: "draft" | "active" | "deprecated" | "superseded";

  // Source linkage
  sop_id: string;                   // ff-dcs document ID
  sop_version: string;              // exact SOP version this skill was extracted from

  // Metadata
  name: string;
  description: string;
  category: "cultivation" | "compliance" | "safety" | "operations";
  regulatory_refs: string[];        // e.g. ["MN Statute 18B.37", "METRC Record Additives"]
  estimated_duration_minutes?: number;

  // Authorization
  required_roles: Role[];           // any of these roles can execute the skill
  restricted_roles?: {              // per-step role restrictions if finer-grained
    step_id: number;
    roles: Role[];
  }[];

  // Pre-flight checks
  preconditions: Precondition[];

  // Execution
  steps: SkillStep[];

  // Post-execution
  outputs: OutputAction[];
  post_conditions: PostCondition[];

  // Compliance
  compliance_checks: ComplianceCheck[];

  // Audit
  created_at: string;
  created_by: string;
  approved_at?: string;
  approved_by?: string;
  superseded_at?: string;
  superseded_by?: string;           // skill_id of the version that replaced this
}

type Role = "grower" | "supervisor" | "admin";

interface Precondition {
  check: string;                    // expression (see Expression DSL below)
  message: string;                  // human-readable explanation
  severity: "block" | "warn_override" | "warn" | "info";
  regulatory_ref?: string;          // e.g. "MN 18B.37 §3(a)"
}

interface SkillStep {
  step_id: number;
  name: string;
  description?: string;
  type: StepType;

  // For type=input
  fields?: FieldDef[];
  auto_fill?: AutoFillSource[];

  // For type=decision
  condition?: string;               // expression; branches to true_steps or false_steps
  true_next?: number;               // step_id to go to if condition is true
  false_next?: number;              // step_id to go to if condition is false

  // For type=confirmation
  confirmation_prompt?: string;     // text shown to user before they can proceed
  confirmation_role?: Role;         // if set, only this role can confirm

  // For type=automated
  action?: AutomatedAction;         // what the system does automatically

  // For type=checkpoint
  checkpoint?: ComplianceCheck;     // evaluated before allowing next step
}

type StepType = "input" | "decision" | "confirmation" | "automated" | "checkpoint";

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  
  // For type=reference
  source?: string;                  // e.g. "cv_batches", "farmstock.items"
  filter?: string;                  // expression to filter source records
  depends_on?: string;              // field name; this field is only shown after that field is set

  // For type=enum
  options?: string[];               // static list, or omit and use source

  // Validation
  validation?: FieldValidation;

  // Regulatory
  regulatory?: string;              // e.g. "MN 18B.37" — shown as annotation
  
  // UX hints
  unit?: string;                    // e.g. "°F", "mph", "%"
  placeholder?: string;
  hint?: string;
}

type FieldType = "text" | "decimal" | "integer" | "reference" | "enum" | "boolean" | "datetime" | "photo";

interface FieldValidation {
  min?: number;
  max?: number;
  pattern?: string;                 // regex
  min_length?: number;
  max_length?: number;
  custom?: string;                  // expression that must evaluate to true
  message?: string;                 // shown on validation failure
}

interface AutoFillSource {
  field: string;                    // the field to auto-fill
  source: string;                   // expression pointing to the data source
  // Examples:
  // "sensor.current(batch.sub_zone_id).temp_f"
  // "user.current.id"
  // "batch.active_recipe_id"
  // "context.timestamp"
}

interface OutputAction {
  table: string;                    // e.g. "cv_applications_pesticide"
  action: "INSERT" | "UPDATE" | "QUEUE";
  event_type?: string;              // for QUEUE: e.g. "record_additives"
  condition?: string;               // expression; output only created if true
  field_map?: Record<string, string>; // maps skill fields to table columns
}

interface PostCondition {
  action: PostActionType;
  args: Record<string, string>;     // action-specific arguments (expressions)
}

type PostActionType =
  | "set_rei_active"                // args: { duration_hours, scope }
  | "transition_batch_status"       // args: { batch_id, to_status }
  | "transition_container_state"    // args: { container_id, to_state }
  | "queue_metrc_sync"              // args: { sync_type, related_id }
  | "send_notification"             // args: { recipients, message }
  | "create_observation";           // args: { category, severity, note }

interface AutomatedAction {
  type: "api_call" | "db_query" | "sensor_read" | "compute";
  target?: string;                  // endpoint or table
  args?: Record<string, string>;    // expressions for arguments
  output_field?: string;            // store result in this field for subsequent steps
}

interface ComplianceCheck {
  name: string;                     // e.g. "PHI_CHECK"
  check: string;                    // expression
  severity: "block" | "warn_override" | "warn";
  message: string;
  regulatory_ref?: string;
  override_requires_note?: boolean; // if warn_override, must document reason
}
```

### Expression DSL

Conditions, auto-fill sources, and validations use a simple expression language.
Expressions are strings that reference named variables:

**Available context variables:**

```
user                          — current user object (id, role, name, license_no)
batch                         — current plant batch (status, sub_zone_id, strain, expected_harvest_date, ...)
container                     — current container (id, state, current_batch_id, ...)
input                         — selected crop input (category, phi_days_operational, rei_hours, epa_reg_no, ...)
lot                           — selected input lot (lot_id, expiration_date, ...)
sensor                        — sensor data accessor (sensor.current(sub_zone_id).temp_f, .rh, .vpd, ...)
context                       — execution context (timestamp, date, application_method, ...)
env                           — environment flags (env.farmstock_available, env.metrc_configured, ...)
```

**Supported operations:**

```
comparison:   ==, !=, <, >, <=, >=
logical:      AND, OR, NOT
membership:   IN ['value1', 'value2']
null checks:  IS NULL, IS NOT NULL
arithmetic:   +, -, *, /
function calls:
  phi_compliant(phi_days, expected_harvest_date)
  rei_active(sub_zone_id)
  days_since(date)
  stage_allows(input_id, batch_stage)
  count_active_assignments(container_id)
```

**Expression examples:**

```
# Harvest event gating
batch.status == 'harvesting'

# PHI violation
NOT phi_compliant(input.phi_days_operational, batch.expected_harvest_date)

# Stage block for biological foliars
NOT stage_allows(input_id, batch.derived_stage)

# RUP license requirement
input.restricted_use == true AND user.license_no IS NULL

# REI active on sub-zone
rei_active(batch.sub_zone_id)

# Auto-fill sensor temp
sensor.current(batch.sub_zone_id).temp_f
```

### Severity Levels

| Level | User experience | Blocking? | Override? |
|---|---|---|---|
| `block` | Full-screen red modal, explains why | Yes | No |
| `warn_override` | Full-screen amber modal, requires documented note | Soft | Yes, with mandatory note |
| `warn` | Inline banner, advisory | No | N/A |
| `info` | Inline annotation | No | N/A |

### Versioning and Deprecation

When a skill needs to change:

1. Create a new skill schema with incremented `skill_version`
2. Get supervisor approval (status → active)
3. Previous version transitions to `superseded`
4. Sub-applications receive a push notification or detect ETag change
5. Sub-applications reload and begin using the new version
6. Completed runs reference the skill version that was active at execution time

Deprecation (sunset without replacement): status → `deprecated`. Sub-applications
continue to use the cached schema until the skill is removed from the API response,
at which point they fall back to hardcoded behavior.

---

## Section 5: ff-dcs ↔ Cultivate Integration Points

### New ff-dcs API Routes

```
Skills API:
  GET  /api/skills                           — list active skills (with ETag header)
  GET  /api/skills/:skill_id                 — full schema for one skill
  GET  /api/skills/:skill_id/versions        — version history
  POST /api/skills/extract                   — trigger AI skill extraction from SOP
  PUT  /api/skills/:skill_id/approve        — supervisor approval (status: draft → active)

Skill Runs (evidence of SOP compliance):
  POST /api/skills/:skill_id/runs            — record a completed execution from cultivate
  GET  /api/skills/:skill_id/runs            — list runs (for compliance monitoring)
  GET  /api/skills/runs?date=&app_id=        — runs across all skills for a date/app

Compliance Q&A (RAG):
  POST /api/ai/ask                           — send question; returns answer with SOP citations
  Body: { question: string, category?: string, context?: object }
  
Documents:
  GET  /api/documents?category=cultivation   — SOPs relevant to cultivation
```

### New ff-dcs Database Tables

```sql
-- Skill schema storage
CREATE TABLE skills (
  skill_id          TEXT PRIMARY KEY,   -- e.g. "pesticide-application"
  skill_version     TEXT NOT NULL,      -- e.g. "2.1"
  status            TEXT NOT NULL,      -- draft | active | deprecated | superseded
  sop_id            TEXT NOT NULL REFERENCES documents(id),
  sop_version       TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL,
  schema_json       TEXT NOT NULL,      -- full SkillSchema as JSON
  created_at        TEXT NOT NULL,
  created_by        TEXT NOT NULL REFERENCES users(id),
  approved_at       TEXT,
  approved_by       TEXT REFERENCES users(id),
  superseded_at     TEXT,
  superseded_by     TEXT               -- skill_id of replacement
);

CREATE UNIQUE INDEX skills_active_uq ON skills(skill_id)
  WHERE status = 'active';             -- one active version per skill_id at a time

-- Execution records (proof of SOP compliance)
CREATE TABLE skill_runs (
  run_id            TEXT PRIMARY KEY,
  skill_id          TEXT NOT NULL,
  skill_version     TEXT NOT NULL,
  source_app        TEXT NOT NULL,     -- 'cultivate' | 'farmstock' | 'felix'
  source_record_id  TEXT,              -- the cultivate application_id or similar
  executed_by       TEXT NOT NULL,     -- user_id or 'agent:felix'
  execution_mode    TEXT NOT NULL,     -- 'human' | 'assisted' | 'automated'
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  status            TEXT NOT NULL,     -- in_progress | completed | failed | cancelled
  step_outcomes     TEXT,             -- JSON array of per-step results
  deviations        TEXT,             -- JSON array of rule deviations with reasons
  override_notes    TEXT,             -- documented override reasons (if any)
  created_at        TEXT NOT NULL
);
```

### What cultivate Provides to ff-dcs

Cultivate posts a `skill_run` record to ff-dcs after each completed application entry.
This record contains:

- Which skill version was used
- Which steps completed and when
- Any compliance checkpoints that were overridden (with documented reasons)
- Reference to the source application record in cultivate

Cultivate also sends deviation reports: when an application is submitted that differs from
the skill schema requirements (missing required field filled with a placeholder, PHI override,
etc.), the deviation is recorded with the override note, creating a machine-readable audit
trail.

### Cross-App Authentication

Service-to-service authentication between cultivate and ff-dcs uses a shared secret
(`FFDCS_SERVICE_KEY` env var on cultivate; `CULTIVATE_SERVICE_KEY` on ff-dcs). All
cultivate → ff-dcs API calls include `Authorization: Bearer {key}` with a header
`X-Source-App: cultivate`.

ff-dcs validates the key and assigns a `service:cultivate` identity for audit logging.
No user token is forwarded — these are system-to-system calls.

### Webhook Notifications (ff-dcs → cultivate)

ff-dcs sends a POST to cultivate's webhook endpoint when:

- A skill goes active (new version available)
- A SOP relevant to cultivation is updated
- A compliance deviation requires supervisor attention

```
POST /api/webhooks/ffdcs
Headers: X-Ffdcs-Signature: {hmac-sha256 of body}
Body: {
  event_type: "skill.activated" | "sop.updated" | "compliance.deviation",
  skill_id?: string,
  doc_id?: string,
  detail: string
}
```

Cultivate verifies the signature using `FFDCS_WEBHOOK_SECRET`, then refreshes its skill
cache from the skills API.

### Compliance Q&A Integration

Cultivate exposes a "Ask about compliance" button in the application forms. When tapped,
it sends the operator's question to ff-dcs's RAG endpoint and displays the answer with
SOP citations.

Example use: operator applying a pesticide asks "What is the PHI for ZeroTol 2.0?" —
ff-dcs RAG searches the SOP library, finds the pesticide application SOP, and returns
the exact PHI value with a citation to the SOP section.

```
cultivate POST /api/webhooks/ffdcs → ff-dcs
ff-dcs → RAGService.answer(question, { category: 'cultivation' })
ff-dcs → response: { answer, citations: [{ doc_id, section, excerpt }] }
cultivate → renders inline in form
```

---

## Section 6: Regulatory Alignment

### The Compliance Argument

Minnesota OCM inspectors and MDA auditors assess compliance in two ways:
1. **Existence check** — do you have SOPs covering required activities?
2. **Adherence check** — do your records demonstrate the SOPs were followed?

Most operations have SOPs in a binder and records in a spreadsheet. The two are
disconnected — an inspector has to manually verify that each record matches what the SOP
requires. Under UEM:

| What the regulator sees | Where it comes from |
|---|---|
| SOPs covering all regulated activities | ff-dcs document library (versioned, approved, retained) |
| Records proving staff followed the SOPs | cultivate application tables |
| Machine-readable link between SOP and record | `skill_runs.skill_id` + `skill_runs.sop_id` |
| Documented deviations with authorization | `skill_runs.deviations` + `skill_runs.override_notes` |
| Continuous compliance monitoring | Nightly compliance agent report |

The SOPs literally drive the application. A regulator who questions why a particular
data field was collected receives this answer: "Because SOP-012 section 4.3, citing MN
18B.37, requires it — and our software enforced that requirement at data entry."

### Per-Regulation Alignment

| Regulation | Requirement | UEM implementation |
|---|---|---|
| MN Statute 342.25 | Cultivation records per plant batch, 5-year retention | Applications tables (append-only) + skill_runs (evidence) |
| MN Rule 4770 | Crop input tracking across all four classes | Four-application-type skill schemas with mandatory lot reference |
| MN Statute 18B.37 | Pesticide application records (temp, wind, target pest, lot) | Pesticide skill schema enforces all 18B.37 fields as `required: true` |
| METRC | Application record additives export | Skill output action: `QUEUE` metrc_sync_log event |
| MDA inspection | On-demand export matching MDA template | MDA pesticide report driven by skill schema's `regulatory_refs` |

### Deviation Documentation

When an operator overrides a `warn_override` condition (e.g., PHI violation with
documented justification), the system:

1. Captures the override note (mandatory text field)
2. Records it in `skill_runs.deviations` as a structured object:
   ```json
   {
     "checkpoint": "PHI_CHECK",
     "expected": "applied_at + 21 days < expected_harvest_date",
     "actual": "applied_at + 14 days < expected_harvest_date",
     "override_note": "Batch showing early senescence; supervisor approved 7-day reduction",
     "override_by": "user_id_supervisor",
     "override_at": "2026-07-15T14:23:00Z"
   }
   ```
3. Flags the record in the compliance dashboard for supervisor review
4. Includes the deviation in the cultivation record export (MN 342.25 requires deviations
   from the SOP to be documented, not hidden)

This is superior to the current approach where deviations exist only as free-text notes
(if at all) with no machine-readable structure linking them to specific compliance rules.

---

## Section 7: Implementation Roadmap

### Phase 1 — Current State (complete)

ff-dcs manages SOPs as documents. Cultivate implements rules as hardcoded business logic
in React components and Fastify route handlers. The connection is conceptual, not technical.

**Gap:** There is no machine-readable link between an SOP and the application form or
validation logic derived from it. A regulatory change requires code changes in cultivate.

### Phase 2 — Skill Schema Foundation (recommended next)

**Duration:** 3–4 weeks  
**Dependencies:** Cultivate Phase 1 critical fixes resolved

**Deliverables:**

1. **Skills API in ff-dcs** — `GET /api/skills`, `GET /api/skills/:id`, POST for creation
2. **Skills database tables** — `skills` and `skill_runs` in ff-dcs
3. **Manual skill schemas** — handcrafted (not AI-extracted) schemas for the 5 highest-risk workflows:
   - Pesticide Application (highest regulatory weight)
   - Foliar Application (PHI enforcement for biologicals)
   - Fertigation Application (daily volume + EC/pH capture)
   - Batch Status Transitions (irreversible lifecycle changes)
   - Plant Loss Recording (METRC waste sync)
4. **Skill consumer in cultivate** — startup fetch, localStorage cache, ETag refresh
5. **Validation layer** — `validateAgainstSkill()` utility used by route handlers
6. **No form changes yet** — skill used for validation only; hardcoded forms remain

**Value delivered:** Regulatory rule changes can be pushed via skill schema updates
without code deployments. Cultivate validates against the skill but renders its own form.

### Phase 3 — Dynamic Forms

**Duration:** 4–6 weeks  
**Dependencies:** Phase 2 stable for 2+ weeks

**Deliverables:**

1. **`<SkillForm>` component** — renders steps, fields, preconditions from skill schema
2. **Checklist instance storage** — cultivate posts `skill_runs` to ff-dcs on submission
3. **Compliance Q&A integration** — "Ask about this" button in pesticide form
4. **Compliance monitoring agent** — nightly Felix job comparing records to skill schemas
5. **Skill admin UI in ff-dcs** — supervisor review/edit/approve draft skills
6. **Webhook receiver in cultivate** — refreshes skill cache on ff-dcs push

**Value delivered:** Form fields and validation rules can be changed without code
deployments. Checklist evidence is stored in ff-dcs alongside the SOPs.

### Phase 4 — Skill Extraction Automation

**Duration:** 3–4 weeks  
**Dependencies:** Phase 3 stable; at least 5 manually-crafted skills as quality baseline

**Deliverables:**

1. **`IntelligenceService.extractSkill()`** — new extraction method using multi-type
   extract + LLM synthesis
2. **`SKILL_EXTRACTION_SYSTEM_PROMPT`** — prompt engineered against manual skill schemas
   to maximize quality of AI-generated drafts
3. **Draft skill workflow in ff-dcs UI** — supervisor review screen for AI-generated drafts
4. **Extraction quality metrics** — track how many AI-generated fields required manual
   correction (drives prompt improvement)
5. **Skill extraction API** — `POST /api/skills/extract`

**Value delivered:** New SOPs can produce draft skill schemas automatically. Estimated
80% of fields correct on first extraction; 20% require supervisor correction. Supervisor
review takes ~20 minutes per skill vs. ~2 hours to author from scratch.

### Phase 5 — Execution Agents

**Duration:** 6–8 weeks  
**Dependencies:** Phase 4 stable; Felix demonstrated reliable for cultivation tasks

**Deliverables:**

1. **`SkillExecutionAgent`** — Felix task template that accepts a skill schema and context
2. **Routine fertigation automation** — daily Felix job executes fertigation skill for all
   active batches; posts records to cultivate; posts skill_run to ff-dcs
3. **Assisted-mode UI** — cultivate forms pre-filled by agent; operator reviews and confirms
4. **Execution failure handling** — failed step logged, supervisor notified, manual fallback
5. **Skill Update Agent** — regulatory change → draft SOP amendments
6. **Audit mode** — any executed skill can be replayed from its `skill_run` record for
   inspector demonstration

**Value delivered:** Routine daily applications can be logged autonomously from sensor
data + recipe + batch context. Staff focus on observation, assessment, and exception
handling rather than data entry.

---

## Section 8: Open Questions for the Operator

These decisions require operator input before Phase 2 implementation begins.

### Q1: Skill Schema Home

Where does the authoritative skill schema live?

| Option | Pros | Cons |
|---|---|---|
| **ff-dcs database** (recommended) | Single source of truth; versioned alongside SOPs; API already in place | ff-dcs must be available for skill updates to propagate |
| Each sub-application | No external dependency for local validation | Schemas drift; no single source of truth; regulatory argument weaker |
| Separate skills microservice | Clean separation; scalable | Additional deployment complexity |

**Recommendation:** ff-dcs database. The compliance argument (SOP → skill → record)
only works if the skill lives next to the SOP. The local cache in cultivate provides
resilience when ff-dcs is temporarily unavailable.

### Q2: Hand-crafted vs. AI-generated Skill Schemas

How much of the initial skill library should be hand-crafted before the AI extraction
pipeline is trusted?

**Recommendation:** Hand-craft the first 5–10 skills (one per major workflow type).
Use these as the quality benchmark and prompt-engineering baseline before attempting
automated extraction. AI extraction that produces lower-quality output than hand-crafting
is a cost, not a benefit.

### Q3: Supervisor Review Gate

What does the review process look like before a skill goes live?

Proposed: Supervisor opens the draft skill in ff-dcs UI. Each step is shown as a
readable form. The supervisor marks each step/field as confirmed or edits it. Only when
all steps are marked does the "Approve" button become available.

**Question for operator:** Should approval be a single-supervisor action, or should it
require a second supervisor to co-approve? (Given regulatory weight, co-approval may be
appropriate for pesticide skills.)

### Q4: Exception Handling Beyond the SOP

What happens when a cultivate user encounters a situation the skill schema doesn't cover?

Proposed: An "Exception" escape hatch in any skill form. The operator taps "This situation
is not covered by the standard procedure" → required free-text note describing the
exception → supervisor notification queued → record saved with `deviation` flag.

**Question for operator:** Should the exception require a supervisor to approve before
the record is finalized, or is a supervisor-notification-after-the-fact sufficient?

### Q5: Conflict Resolution — Skill Schema vs. Hardcoded Cultivate Logic

During Phase 2 and 3, both the skill schema and the hardcoded cultivate route handlers
will express business rules. If they conflict (skill says a field is optional; route
says it's required), who wins?

**Recommendation:** The route handler wins during Phase 2 (skill used for advisory
validation only). In Phase 3, the skill schema takes precedence and the hardcoded
validation is removed. A migration plan is needed to transition each rule from code to
schema.

### Q6: Skill Execution Failure Logging

When a Felix-executed skill fails mid-step (API error, validation block, network timeout),
what is the recovery protocol?

Proposed:
- Partial `skill_run` saved with status `failed` and the last completed step
- Supervisor notified
- No retry on failure — agent reports failure; human decides whether to re-run or
  complete manually
- No incomplete records written to cultivate (step outputs are only committed if the
  full step completes)

**Question for operator:** Is the no-retry rule acceptable, or should the agent retry
transient failures (network errors) up to N times before escalating?

### Q7: Human Confirmation Channel

For supervised workflows (batch transitions, PHI overrides), how does the agent surface
the approval request?

Options:
- In-app notification in cultivate (requires operator to open cultivate)
- Email to tomc@sbdci.com (works anywhere)
- Both (email for urgency, in-app for record)

**Recommendation:** Email for Phase 5; in-app notification added in a follow-on iteration.

### Q8: Liability and Agent Audit

If an agent executes a skill and records are incorrect (wrong lot number, missed field),
how is accountability documented?

**Recommendation:** `skill_runs.executed_by` is set to `agent:felix:{task_id}` for
autonomous executions. The Felix task file that triggered the agent is retained in
`~/.felix/felix.db` with full instructions. The `skill_runs.step_outcomes` record the
exact inputs the agent gathered at each step. An inspector can reconstruct the full
execution from these records.

The liability question is: an agent is not a substitute for operator judgment — it is a
scribe that captures what sensors and databases say. If sensor data was wrong, the
application record is wrong, exactly as if a human had read a broken thermometer.
The audit trail is complete either way; the human-in-the-loop confirmation step for
assisted workflows provides an additional verification gate.

**Question for operator:** Should certain workflows require a human to co-sign even when
executed by an agent? (e.g., pesticide applications executed by agent must still have
a human `rei_cleared_by` before REI is lifted.)

---

## Appendix A: Example Skill Schema — Pesticide Application

```json
{
  "schema_version": "1.0",
  "skill_id": "pesticide-application",
  "skill_version": "1.0",
  "status": "draft",
  "sop_id": "PH-002-PRO-01",
  "sop_version": "1.0",
  "name": "Pesticide Application",
  "description": "Apply an EPA-registered pesticide to a plant batch per MN Statute 18B.37",
  "category": "cultivation",
  "regulatory_refs": [
    "MN Statute 18B.37",
    "MN Rule 4770",
    "MN Statute 342.25",
    "METRC Record Additives"
  ],
  "estimated_duration_minutes": 10,
  "required_roles": ["grower", "supervisor", "admin"],
  "preconditions": [
    {
      "check": "batch.status NOT IN ['closed', 'harvesting']",
      "message": "Cannot apply pesticide to a closed or actively harvesting batch. If the batch is harvesting, check PHI compliance before applying.",
      "severity": "block"
    },
    {
      "check": "NOT rei_active(batch.sub_zone_id)",
      "message": "Active REI on this sub-zone. Do not enter until REI is cleared.",
      "severity": "block",
      "regulatory_ref": "MN Statute 18B.37"
    },
    {
      "check": "phi_compliant(input.phi_days_operational, batch.expected_harvest_date)",
      "message": "Applying this pesticide would violate the operational PHI. Document your reason for overriding if proceeding.",
      "severity": "warn_override",
      "regulatory_ref": "MN Statute 18B.37"
    },
    {
      "check": "stage_allows(input_id, batch.derived_stage)",
      "message": "This product is not permitted during the current batch stage per SOP stage restrictions.",
      "severity": "block"
    },
    {
      "check": "NOT (input.restricted_use == true AND user.license_no IS NULL)",
      "message": "This is a restricted-use pesticide. A licensed applicator number is required.",
      "severity": "block",
      "regulatory_ref": "MN Statute 18B.37"
    }
  ],
  "steps": [
    {
      "step_id": 1,
      "name": "Select target batch and location",
      "type": "input",
      "fields": [
        {
          "name": "batch_id",
          "label": "Plant Batch",
          "type": "reference",
          "required": true,
          "source": "cv_batches",
          "filter": "status NOT IN ['closed']"
        },
        {
          "name": "row_id",
          "label": "Row (optional)",
          "type": "reference",
          "required": false,
          "source": "cv_rows",
          "filter": "sub_zone_id == batch.sub_zone_id",
          "depends_on": "batch_id"
        },
        {
          "name": "container_id",
          "label": "Container (optional)",
          "type": "reference",
          "required": false,
          "source": "cv_containers",
          "filter": "row_id == row_id",
          "depends_on": "row_id"
        }
      ]
    },
    {
      "step_id": 2,
      "name": "Select product and lot",
      "type": "input",
      "fields": [
        {
          "name": "input_id",
          "label": "Pesticide Product",
          "type": "reference",
          "required": true,
          "source": "farmstock.items",
          "filter": "category IN ['pesticide', 'fungicide', 'biocontrol_pesticide']"
        },
        {
          "name": "input_lot_id",
          "label": "Lot Number",
          "type": "reference",
          "required": true,
          "source": "farmstock.stock",
          "filter": "input_id == input_id AND quantity_on_hand > 0",
          "depends_on": "input_id",
          "regulatory": "MN 18B.37 — lot tracking required"
        }
      ]
    },
    {
      "step_id": 3,
      "name": "Record application rate",
      "type": "input",
      "fields": [
        {
          "name": "rate_value",
          "label": "Application Rate",
          "type": "decimal",
          "required": true,
          "unit": "see rate_unit",
          "validation": { "min": 0, "message": "Rate must be positive" }
        },
        {
          "name": "rate_unit",
          "label": "Rate Unit",
          "type": "enum",
          "required": true,
          "options": ["fl_oz_per_gal", "tsp_per_gal", "ml_per_gal", "oz_per_gal"]
        },
        {
          "name": "volume_applied",
          "label": "Total Volume Applied",
          "type": "decimal",
          "required": true,
          "unit": "gallons",
          "validation": { "min": 0 }
        },
        {
          "name": "application_method",
          "label": "Application Method",
          "type": "enum",
          "required": true,
          "options": ["foliar_spray", "soil_drench", "granular", "other"]
        }
      ]
    },
    {
      "step_id": 4,
      "name": "Record environmental conditions",
      "description": "Required by MN Statute 18B.37. Sensor auto-fill where available.",
      "type": "input",
      "auto_fill": [
        {
          "field": "ambient_temp_f",
          "source": "sensor.current(batch.sub_zone_id).temp_f"
        },
        {
          "field": "ambient_rh",
          "source": "sensor.current(batch.sub_zone_id).humidity_rh"
        }
      ],
      "fields": [
        {
          "name": "ambient_temp_f",
          "label": "Ambient Temperature",
          "type": "decimal",
          "required": true,
          "unit": "°F",
          "regulatory": "MN 18B.37"
        },
        {
          "name": "wind_speed_mph",
          "label": "Wind Speed",
          "type": "decimal",
          "required": true,
          "unit": "mph",
          "regulatory": "MN 18B.37"
        },
        {
          "name": "wind_direction",
          "label": "Wind Direction",
          "type": "text",
          "required": false,
          "placeholder": "e.g. N, NW, SW"
        },
        {
          "name": "ambient_rh",
          "label": "Relative Humidity",
          "type": "decimal",
          "required": false,
          "unit": "%"
        }
      ]
    },
    {
      "step_id": 5,
      "name": "Record target and applicator",
      "type": "input",
      "auto_fill": [
        {
          "field": "applicator",
          "source": "user.current.id"
        },
        {
          "field": "applicator_license",
          "source": "user.current.license_no"
        }
      ],
      "fields": [
        {
          "name": "target_pest",
          "label": "Target Pest",
          "type": "text",
          "required": true,
          "regulatory": "MN 18B.37",
          "placeholder": "e.g. Botrytis cinerea, spider mites, powdery mildew"
        },
        {
          "name": "pest_pressure",
          "label": "Pest Pressure Level",
          "type": "enum",
          "required": true,
          "options": ["incidental", "threshold", "outbreak"]
        },
        {
          "name": "applicator",
          "label": "Applicator",
          "type": "reference",
          "required": true,
          "source": "cv_users"
        },
        {
          "name": "applicator_license",
          "label": "Applicator License #",
          "type": "text",
          "required": false,
          "hint": "Required for restricted-use pesticides once licensed"
        },
        {
          "name": "notes",
          "label": "Notes",
          "type": "text",
          "required": false
        }
      ]
    },
    {
      "step_id": 6,
      "name": "Review and confirm REI",
      "type": "confirmation",
      "confirmation_prompt": "Applying this pesticide will activate a re-entry interval of {input.rei_hours} hours on sub-zone {batch.sub_zone_id}. No one may enter this area until the REI is cleared by a supervisor. Do you confirm this application?"
    }
  ],
  "outputs": [
    {
      "table": "cv_applications_pesticide",
      "action": "INSERT"
    },
    {
      "table": "metrc_sync_log",
      "action": "QUEUE",
      "event_type": "record_additives"
    }
  ],
  "post_conditions": [
    {
      "action": "set_rei_active",
      "args": {
        "duration_hours": "input.rei_hours",
        "scope": "batch.sub_zone_id"
      }
    }
  ],
  "compliance_checks": [
    {
      "name": "PHI_COMPLIANT",
      "check": "phi_compliant(input.phi_days_operational, batch.expected_harvest_date)",
      "severity": "warn_override",
      "message": "PHI violation — this application may affect harvest eligibility.",
      "regulatory_ref": "MN Statute 342.25",
      "override_requires_note": true
    },
    {
      "name": "LOT_EXPIRY",
      "check": "lot.expiration_date IS NULL OR lot.expiration_date > context.date",
      "severity": "warn",
      "message": "This lot is expired or near expiration. Verify the product is still suitable."
    }
  ]
}
```

---

## Appendix B: Skills API — Cultivate Startup Sequence

```javascript
// client/src/lib/skills.js

const SKILLS_CACHE_KEY = 'cv_skills_cache';
const SKILLS_ETAG_KEY  = 'cv_skills_etag';

export async function loadSkills() {
  const cached = localStorage.getItem(SKILLS_CACHE_KEY);
  const etag   = localStorage.getItem(SKILLS_ETAG_KEY);

  try {
    const headers = {};
    if (etag) headers['If-None-Match'] = etag;

    const res = await fetch(`${FFDCS_BASE}/api/skills`, {
      headers: { ...headers, 'Authorization': `Bearer ${FFDCS_SERVICE_KEY}` }
    });

    if (res.status === 304 && cached) {
      return JSON.parse(cached);     // not modified — use cache
    }

    if (res.ok) {
      const skills = await res.json();
      const newEtag = res.headers.get('ETag');
      localStorage.setItem(SKILLS_CACHE_KEY, JSON.stringify(skills));
      if (newEtag) localStorage.setItem(SKILLS_ETAG_KEY, newEtag);
      return skills;
    }
  } catch {
    // ff-dcs unreachable — fall back to cache
    if (cached) return JSON.parse(cached);
  }

  return [];    // no skills available — cultivate falls back to hardcoded behavior
}

export function getSkill(skills, skillId) {
  return skills.find(s => s.skill_id === skillId && s.status === 'active');
}
```

---

*This document is the authoritative UEM architecture design. Implementation proceeds in phases
as described in Section 7. Open questions in Section 8 require operator decisions before
Phase 2 begins. All schema changes to ff-dcs require migrations per the ff-dcs development
standards.*
