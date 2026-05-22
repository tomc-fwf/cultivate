# Pest Identification Agent — Design Document

**Prepared:** 2026-05-21  
**Status:** Design — pre-implementation  
**Scope:** AI-assisted pest/disease identification integrated into the observation and pesticide application workflow  
**Prerequisite reading:** `docs/uem-architecture.md` (skill schema), `docs/agent-sdk-design.md` (MCP server), CLAUDE.md §Pesticide Applications

---

## 1. Purpose and Scope

### The Problem

Cultivation staff walk rows daily and log observations. When they see a problem — spots on leaves, wilting, discoloration, insect activity — they currently must:

1. Recognize the pest or disease from memory
2. Know which category it falls under (pest, disease, deficiency)
3. Know whether any approved product addresses it
4. Know whether that product is a pesticide (EPA number) requiring a full compliance record
5. Know the target pest name as MN 18B.37 requires it verbatim on the pesticide application record

All five steps require knowledge that varies by staff member. Misidentification at step 1 cascades into wrong treatment, wrong product category, and wrong or missing compliance records. A spray applied under the wrong category avoids the PHI/REI enforcement gates — the most common path to a compliance failure.

### What the Agent Does

The pest identification agent takes a symptom description and optional photos, uses Claude's reasoning capability to identify the likely pest or disease, and produces:

- A structured identification with confidence level and differentials
- An IPM-first treatment path (beneficial insects, physical controls, approved non-pesticide biocontrols)
- If a pesticide is warranted: a pre-filled pesticide application entry with `target_pest` already populated from the identification
- PHI/REI and stage-block pre-checks for every recommended product
- A link to matching products already in the farmstock catalog

### What It Does Not Do

- It does not replace an agronomist or the operator's judgment
- It does not auto-submit pesticide applications (human confirmation always required)
- It does not diagnose from photos alone without any textual context (Phase 1)
- It does not access external plant disease databases — it uses Claude's general biological knowledge plus the operation's crop input catalog

### Scope Boundaries

| In scope | Out of scope |
|---|---|
| Cannabis-specific pest and disease identification | Soil nutrient deficiency analysis (different signal path) |
| IPM-first treatment recommendations | Harvest maturity assessment |
| Pesticide application pre-fill from identification | Environmental root cause analysis |
| PHI/REI/stage-block compliance pre-checks | Supply chain or procurement recommendations |
| Farmstock catalog matching for recommended products | METRC regulatory submissions |

---

## 2. Integration Points in the Observation/Application Workflow

### 2.1 Entry Points (Three Paths)

The agent is reachable from three places in the existing UI. It is **never mandatory** — staff can log an observation without running the agent, exactly as today.

#### Path A: Post-Observation Trigger (MVP — build this first)

After an observation with `category = 'pest' | 'disease' | 'damage'` is saved, a "Get identification help →" button appears on the confirmation screen and on the observation detail view.

```
[Observation saved: "Pest — High severity — Spider-web pattern on underside of Z2-A-R3 leaves"]
                                    │
                       [Get identification help →]
                                    │
                              PestIdSession
                         (pre-filled: batch, row, category,
                          observation note as symptom seed)
```

This path requires no changes to the observation form. The observation creates the context; the agent uses it.

#### Path B: In-Observation Entry (Phase 2)

During observation entry, a "🔍 Help me identify this" button appears when `category` is set to `pest`, `disease`, or `damage`. Tapping it opens a compact slide-up sheet (not a modal stack) with a photo capture area and a short symptom question. The agent returns a suggested `category`, `severity`, and `note` that pre-fills the observation form.

This path requires a UI change to the observation form. Deferred to Phase 2 because:
- Photo capture during form entry adds complexity
- The post-observation path covers the compliance-critical case (treatment recommendation)
- Phase 1 MVP establishes the agent pattern before adding it to an entry form

#### Path C: Standalone Scan Mode (Phase 2)

From the container record or scanner view: "Identify a problem" option. Opens the full identification workflow starting from photo capture. If identification leads to a treatment recommendation, the user can create an observation AND a pesticide application in sequence, both pre-filled.

### 2.2 Workflow State Machine

```
[Trigger: observation saved or button tapped]
                  │
        ┌─────────▼─────────┐
        │  PestIdSession     │   Session created in cv_pest_id_sessions
        │  (context loading) │   Loads: batch, strain, sub_zone, batch_stage,
        └─────────┬──────────┘   location, recent observations for this row/container,
                  │              active REIs, known recent pesticide applications
                  │
        ┌─────────▼──────────┐
        │  Symptom Input     │   Text description (required)
        │                    │   Photos (optional Phase 1, required cue Phase 2)
        │                    │   Affected area: row/container targeting
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │  Claude Inference  │   Model: claude-sonnet-4-6 (see §6)
        │  (identification)  │   Input: symptom + context prompt
        │                    │   Output: structured IdentificationResult
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │  Results Display   │   Primary ID + confidence + differentials
        │                    │   Treatment path (IPM → pesticide)
        │                    │   Catalog matches from farmstock
        │                    │   PHI/REI/stage-block flags per product
        └─────────┬──────────┘
                  │
        ┌─────────┴───────────┐
        │                     │
[Link observation]     [Pre-fill pesticide app]
        │                     │
  session.linked_       Opens PesticideNew.jsx
  observation_ids       with target_pest, input_id,
  updated               input_lot_id pre-populated
                        from identification result
```

### 2.3 Output Routes

The agent has two output paths depending on whether the recommendation is pesticide or non-pesticide:

**Non-pesticide treatment recommended:**
- Displays biocontrol/IPM recommendation with ordering link to farmstock
- Creates a `create_observation` (triggered_app_id = null) for the identification record
- No application form needed

**Pesticide treatment recommended:**
- Displays product recommendation with PHI/REI/stage-block pre-check
- "Log Application →" button opens `PesticideNew.jsx` with pre-fills:
  - `target_pest`: the exact identification string from the agent
  - `input_id`: matched farmstock crop_input.input_id
  - `input_lot_id`: most recent non-expired lot for that input (pre-selected, editable)
  - `pest_pressure`: mapped from agent severity estimate (low→incidental, medium→threshold, high→outbreak)
  - `batch_id`, `row_id`, `container_id`: from the observation context
- The observation's `triggered_app_id` is updated after the application is saved

This maintains the compliance chain: observation → identification session → pesticide application, all linked by ID.

---

## 3. MVP Design (Text-Only Identification, Phase 1)

### 3.1 What Can Be Built Now

Claude claude-sonnet-4-6 has extensive biological knowledge about cannabis cultivation pests and diseases. The MVP uses text-only inference — no vision capability required. The operator describes what they see; the model identifies it.

**Input to the model:**
```
Batch context: [strain, batch_stage, sub_zone, location, days_in_stage]
Recent observations: [last 7 days for this row, summarized]
Recent applications: [pesticide apps in last 30 days, summarized]
Environmental context: [current temp_f, humidity_rh from sensor if available]

Staff observation: [raw text from observation.note or new free-text entry]
Affected area: [sub_zone/row/container]
Visual description: [what they see — symptoms, pattern, affected tissue]
```

**Structured output from the model (JSON-parsed from Claude's response):**

```typescript
interface IdentificationResult {
  primary_id: {
    name: string;                  // e.g. "Tetranychus urticae (two-spotted spider mite)"
    common_name: string;           // e.g. "Spider mites"
    category: 'pest' | 'disease' | 'deficiency' | 'environmental';
    confidence: 'high' | 'medium' | 'low';
    confidence_rationale: string;  // why this confidence level
    affected_tissue: string[];     // e.g. ["leaf undersides", "growing tips"]
    diagnostic_signs: string[];    // key identifying characteristics
  };
  differentials: Array<{           // other possibilities to rule out
    name: string;
    common_name: string;
    distinguishing_factor: string; // what rules this in or out vs primary
  }>;
  ipm_first_path: {
    immediate_actions: string[];   // physical/cultural controls (remove infested material, increase airflow, etc.)
    biocontrols: Array<{
      name: string;                // e.g. "Phytoseiulus persimilis"
      common_name: string;         // e.g. "Predatory mites"
      rationale: string;
      epa_registered: false;       // explicitly never for biocontrols on IPM path
    }>;
    monitoring_recommendation: string;
  };
  pesticide_warranted: boolean;    // model's assessment — user can override
  pesticide_rationale?: string;    // why pesticide is recommended (pressure level, biocontrol ineffective at this stage, etc.)
  pesticide_recommendations: Array<{
    product_class: string;         // e.g. "Insecticidal soap", "Bacillus thuringiensis", "Hydrogen dioxide"
    mechanism: string;             // how it works against this pest
    notes: string;                 // any application-specific notes
  }>;
  stage_considerations: string;    // cannabis-stage-specific advice (e.g., "avoid foliar sprays after week 3 of flower")
  urgency: 'monitor' | 'treat_soon' | 'treat_immediately';
  spread_risk: 'low' | 'medium' | 'high';
}
```

### 3.2 The System Prompt

The identification prompt is a fixed, versioned system prompt. It encodes cannabis-cultivation-specific pest knowledge and output format requirements. It is not generated dynamically from a skill schema in Phase 1 — it is a standalone prompt file at `src/agents/prompts/pest-identification.md`.

Key sections:
1. **Persona and scope**: cannabis cultivation advisor, IPM-first philosophy, compliance-aware
2. **Context variables**: injected at runtime (batch stage, recent applications, sensor data)
3. **Cannabis pest library**: structured knowledge of ~25 common pests/diseases/deficiencies
4. **Output format**: JSON schema the model must follow (strict tool-use format)
5. **Compliance constraints**: if any recommended pesticide violates PHI or stage rules, flag it explicitly

### 3.3 Catalog Matching

After the model returns pesticide recommendations by product class, the backend queries farmstock for matching products:

```typescript
async function matchCatalogProducts(
  recommendations: PesticideRecommendation[],
  batchStageKey: string,
  expectedHarvestDate: string | null
): Promise<CatalogMatch[]> {
  // Fetch all pesticide-category items from farmstock
  const items = await fetchFarmstockItems({ category: ['pesticide', 'fungicide', 'biocontrol_pesticide'] });
  
  // Match by product_class keywords, active_ingredients, target_organisms
  // For each match:
  //   - Check phi_compliant against expectedHarvestDate
  //   - Check stage_allows against batchStageKey via cv_input_phi_stage_overrides
  //   - Check rei_hours
  //   - Check restricted_use + user license
  //   - Resolve most recent non-expired lot
}
```

The matching is keyword-based in Phase 1 — not semantic similarity. "Bacillus thuringiensis" matches items where `active_ingredients` contains "bacillus thuringiensis" (case-insensitive). "Hydrogen dioxide" matches "hydrogen dioxide" or "ZeroTol". The keyword list is tunable per product class.

### 3.4 MVP Feature Summary

| Feature | Phase 1 (MVP) |
|---|---|
| Identification input | Text description (required) |
| Model | claude-sonnet-4-6 text |
| Context | Batch, stage, recent obs, sensor temp/RH |
| IPM-first path | Yes — cultural + biocontrols listed |
| Catalog matching | Keyword-based against farmstock items |
| PHI/REI pre-check | Yes — per matched product |
| Stage-block pre-check | Yes — via cv_input_phi_stage_overrides |
| Pesticide pre-fill | Yes — target_pest + input_id + input_lot_id |
| Observation linkage | Yes — triggered_app_id updated post-application |
| Photo input | No |
| Session storage | Yes — cv_pest_id_sessions table |

---

## 4. Phase 2 — Vision Capability

### 4.1 Why Vision Matters

Text descriptions of plant problems are imprecise. "Spots on leaves" matches powdery mildew, septoria, botrytis, spray damage, and calcium deficiency. A photo of the same symptom makes the identification definitive in most cases. The diagnostic value of vision is highest for:

- Distinguishing spider mites from russet mites (mites are too small to describe; their damage patterns differ)
- Distinguishing powdery mildew from other white deposits (salt spray residue, trichome dusting)
- Distinguishing early botrytis from normal senescence
- Identifying specific insect morphology from close-up photos

### 4.2 Claude Vision Integration

Claude claude-sonnet-4-6 supports multi-modal input natively. The Phase 2 upgrade is primarily a frontend change:

**Frontend changes:**
- Observation form: add photo capture step when category is pest/disease/damage
- PestIdSession form: add multi-photo capture area (up to 4 photos per session)
- Camera guidance overlay: "Show the affected tissue", "Show the whole leaf", "Show an insect if visible"

**Backend changes:**
- Accept photo uploads in `POST /api/pest-id/sessions`
- Store photos using the existing photo storage approach (same as observation photos)
- Pass photos to Claude as base64-encoded content blocks in the API call
- Include a "photo_interpretation" field in the model's structured output

**Model invocation with vision:**

```typescript
const messages = [
  {
    role: 'user',
    content: [
      // Context as text
      { type: 'text', text: buildContextPrompt(session) },
      // Photos
      ...session.photos.map(photo => ({
        type: 'image',
        source: { type: 'base64', media_type: photo.media_type, data: photo.data }
      })),
      // Symptom description
      { type: 'text', text: `Staff observation: ${session.symptom_description}` }
    ]
  }
];
```

### 4.3 Anthropic Files API (Future)

For Phase 2, photos are stored locally (same as existing photo storage). A Phase 3 upgrade could use the Anthropic Files API to upload photos once and reference them across multiple inference calls — useful if the same photo is used for differential analysis, treatment research, or historical comparison. Not required for Phase 2.

### 4.4 Multi-Photo Diagnostic Protocol

Phase 2 introduces a guided photo capture protocol to maximize diagnostic value:

| Photo | Purpose | Guidance text |
|---|---|---|
| 1 — Overview | Whole plant or affected branch | "Show the entire affected area from arm's length" |
| 2 — Close-up symptom | Affected tissue at 6 inches | "Show the specific symptom up close" |
| 3 — Leaf underside | Underside of affected leaf | "Flip a leaf and photograph the underside" |
| 4 — Reference healthy | An unaffected leaf from same batch | "Show a healthy leaf from the same plant for comparison" |

Not all four are required. Photos 1 and 2 are prompted; 3 and 4 are optional based on category.

### 4.5 Confidence Improvement Expected

Based on analogous plant disease identification research, adding photo input is expected to improve identification confidence from medium-high in text-only mode to high in vision mode for the most common cannabis cultivation issues. The improvement is greatest for:

- Insect identification (body morphology often decisive)
- Fungal disease vs. nutrient deficiency distinction
- Early-stage vs. late-stage severity calibration

---

## 5. Data Model

### 5.1 New Table: `cv_pest_id_sessions`

A pest ID session captures the full context of an identification event — input, model output, and follow-up actions. This is distinct from `cv_observations` (which records the problem) and `cv_applications_pesticide` (which records the treatment). The session is the bridge.

```sql
CREATE TABLE cv_pest_id_sessions (
  session_id            INTEGER PRIMARY KEY,

  -- Context at time of identification
  batch_id              INTEGER NOT NULL REFERENCES cv_batches(batch_id),
  row_id                TEXT REFERENCES cv_rows(row_id),
  container_id          TEXT REFERENCES cv_containers(container_id),
  batch_stage_key       TEXT,                     -- e.g. 'field_flower_w2', for audit

  -- Input
  symptom_description   TEXT NOT NULL,            -- free text from staff
  photo_urls            TEXT,                     -- JSON array; null in Phase 1
  model_used            TEXT NOT NULL,            -- e.g. 'claude-sonnet-4-6'
  context_snapshot      TEXT,                     -- JSON: batch status, sensor readings, recent apps used as context

  -- Output
  identification_result TEXT,                     -- JSON: IdentificationResult (see §3.2)
  model_confidence      TEXT,                     -- 'high' | 'medium' | 'low' (top-level from result)
  primary_id_name       TEXT,                     -- denormalized for query convenience
  pesticide_warranted   INTEGER,                  -- 0 | 1 — model's assessment

  -- Status
  status                TEXT NOT NULL DEFAULT 'pending',
                        -- pending | identified | linked | dismissed
  dismissed_reason      TEXT,                     -- if staff dismissed without acting

  -- Follow-up linkage
  linked_observation_ids TEXT,                    -- JSON array of observation_ids created/linked
  linked_pesticide_app_id INTEGER,               -- cv_applications_pesticide.pesticide_app_id if application created
  linked_foliar_app_id    INTEGER,               -- cv_applications_foliar.foliar_id if non-pesticide biological used

  -- Audit
  initiated_by          INTEGER NOT NULL REFERENCES cv_users(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT
);

CREATE INDEX cv_pest_id_sessions_batch_idx ON cv_pest_id_sessions(batch_id, created_at DESC);
CREATE INDEX cv_pest_id_sessions_status_idx ON cv_pest_id_sessions(status) WHERE status != 'dismissed';
```

**Why a separate table rather than `cv_skill_instances`?**

`cv_skill_instances` records SOP compliance evidence — proof that a skill was executed per its schema. Pest ID sessions are exploratory and advisory; they don't correspond to a defined SOP step sequence. The session may result in no action (dismissed), a non-pesticide recommendation, or a pesticide application — all three outcomes have different post-session records. A separate table allows the session to have its own lifecycle.

That said, when Phase 2 implements the full UEM skill schema for pest identification, completed sessions that led to a pesticide application *should* also create a `cv_skill_instances` record linking the SOP evidence chain: observation → pest_id_session → pesticide_application.

### 5.2 No Changes to Existing Tables

The existing `cv_observations` table already handles the problem-logging side:
- `category = 'pest' | 'disease' | 'damage'` covers the trigger cases
- `triggered_app_id` links the observation to a follow-up application
- `note` stores the symptom description that seeds the agent

No changes are needed to `cv_observations`. The pest ID session references the observation; the observation is updated with `triggered_app_id` after the application is created.

### 5.3 Migration Number

This migration belongs as `018_pest_id_sessions.ts` (following `017_skill_instances.ts`). Note: the roadmap document planned `018_conflict_log.ts` — verify and increment if that migration was written first.

---

## 6. Model Selection and API Design

### 6.1 Model: claude-sonnet-4-6

`claude-sonnet-4-6` is the correct choice for this agent:

| Criterion | Assessment |
|---|---|
| **Biological domain knowledge** | Strong — extensive training data on plant pathology, entomology, cannabis cultivation |
| **Structured output** | Yes — tool_use / JSON mode for `IdentificationResult` |
| **Vision support (Phase 2)** | Yes — multi-modal input natively supported |
| **Speed** | Fast enough for field use (< 5s expected for text-only; < 10s for vision) |
| **Cost** | Acceptable for consultation-frequency use (not daily-volume like fertigation) |

`claude-haiku-4-5` is not appropriate — the identification requires deep biological reasoning, not just extraction. `claude-opus-4-7` is not warranted — the task is well-defined enough that Sonnet performs it reliably.

**Specialized plant disease APIs** (e.g., PlantNet, iNaturalist, Pl@ntd) are not recommended:
- None are cannabis-specific or trained on the particular disease expressions in dense greenhouse environments
- They require external API dependencies with availability and cost concerns
- They cannot factor in the operation's specific compliance context (batch stage, PHI, farmstock catalog)
- Claude's general biological knowledge plus cannabis-specific prompt context produces better contextually-aware recommendations

### 6.2 API Invocation Pattern

```typescript
// src/agents/pest-identifier.ts

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();  // uses ANTHROPIC_API_KEY env var

export async function identifyPest(session: PestIdSessionInput): Promise<IdentificationResult> {
  const systemPrompt = await loadPestIdSystemPrompt();   // from src/agents/prompts/pest-identification.md
  const contextPrompt = buildContextPrompt(session);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: contextPrompt },
          // Phase 2: photo content blocks inserted here
          { type: 'text', text: `Staff symptom description: ${session.symptom_description}` },
        ],
      }
    ],
    tools: [
      {
        name: 'submit_identification',
        description: 'Submit the structured pest/disease identification result',
        input_schema: IDENTIFICATION_RESULT_SCHEMA,  // JSON Schema for IdentificationResult
      }
    ],
    tool_choice: { type: 'auto' },
  });

  // Extract tool_use block
  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'submit_identification');
  if (!toolUse) throw new Error('Model did not return a structured identification');

  return toolUse.input as IdentificationResult;
}
```

**Prompt caching**: The system prompt (cannabis pest knowledge + output format) is large and stable. Apply the `cache_control: { type: 'ephemeral' }` header to the system prompt in every call to reduce cost and latency. The context prompt (batch-specific, session-specific) is not cached. This follows the project's claude-api standards.

### 6.3 Backend Route: `POST /api/pest-id/sessions`

```
POST /api/pest-id/sessions
Auth: requireAuth (any role)

Body:
{
  batch_id: number,
  row_id?: string,
  container_id?: string,
  symptom_description: string,    // required
  photo_urls?: string[],          // Phase 2
  linked_observation_id?: number  // observation that triggered this session
}

Response 201:
{
  session_id: number,
  identification_result: IdentificationResult,
  catalog_matches: CatalogMatch[],   // farmstock items matched to recommendations
  compliance_flags: ComplianceFlag[] // PHI/REI/stage-block flags per matched product
}
```

The route is synchronous in Phase 1 — the Claude API call completes within the HTTP request. Phase 2 should move to async (create session immediately, poll for result) to accommodate the higher latency of vision inference plus photo upload.

```
GET /api/pest-id/sessions/:sessionId
PATCH /api/pest-id/sessions/:sessionId  — update status, link_observation_id, link_app_id
GET /api/pest-id/sessions?batch_id=X&status=identified  — list sessions needing follow-up
```

---

## 7. UEM Skill Schema Fit

### 7.1 Position in the UEM Framework

The pest ID agent fits the framework as a **Skill Execution Agent** (Section 3.2 of `docs/uem-architecture.md`) with one key distinction: its primary output is a _recommendation_, not a compliance record. The recommendation then feeds into the Pesticide Application skill (which is the compliance-record-generating skill).

```
PestIdentification skill (this agent)
    ├── Input: symptom + context
    ├── Output: IdentificationResult → feeds into → PesticideApplication skill
    └── Evidence: cv_pest_id_sessions record

PesticideApplication skill (existing POC)
    ├── Input: pre-filled from IdentificationResult (target_pest, input_id, lot_id)
    ├── Output: cv_applications_pesticide record
    └── Evidence: cv_skill_instances record
```

### 7.2 Skill Schema (Phase 2)

When the full UEM dynamic form infrastructure is in place (Phase 3 per the roadmap), the pest ID workflow becomes a skill schema in ff-dcs:

```json
{
  "schema_version": "1.0",
  "skill_id": "pest-identification",
  "skill_version": "1.0",
  "name": "Pest / Disease Identification",
  "category": "cultivation",
  "regulatory_refs": ["MN Rule 4770", "MN Statute 18B.37"],
  "estimated_duration_minutes": 3,
  "required_roles": ["grower", "supervisor", "admin"],

  "preconditions": [
    {
      "check": "batch.status NOT IN ['closed']",
      "message": "Cannot run pest identification on a closed batch.",
      "severity": "block"
    }
  ],

  "steps": [
    {
      "step_id": 1,
      "name": "Describe the symptoms",
      "type": "input",
      "fields": [
        {
          "name": "symptom_description",
          "label": "What do you see?",
          "type": "text",
          "required": true,
          "placeholder": "Describe what the problem looks like — leaves, color, pattern, insects, etc."
        },
        {
          "name": "photos",
          "label": "Photos (recommended)",
          "type": "photo",
          "required": false
        }
      ]
    },
    {
      "step_id": 2,
      "name": "AI Identification",
      "type": "automated",
      "action": {
        "type": "api_call",
        "target": "/api/pest-id/sessions",
        "args": {
          "batch_id": "batch.batch_id",
          "row_id": "context.row_id",
          "symptom_description": "step1.symptom_description"
        },
        "output_field": "identification_result"
      }
    },
    {
      "step_id": 3,
      "name": "Review identification and recommendations",
      "type": "confirmation",
      "confirmation_prompt": "The AI has identified: {identification_result.primary_id.common_name} (confidence: {identification_result.primary_id.confidence}). Review the treatment recommendations and decide how to proceed."
    },
    {
      "step_id": 4,
      "name": "Create observation",
      "type": "automated",
      "action": {
        "type": "api_call",
        "target": "/api/observations",
        "args": {
          "batch_id": "batch.batch_id",
          "category": "pest",
          "note": "identification_result.primary_id.name"
        }
      },
      "condition": "context.create_observation == true"
    }
  ],

  "outputs": [
    {
      "table": "cv_pest_id_sessions",
      "action": "INSERT"
    }
  ]
}
```

### 7.3 Human-in-the-Loop Level

Per the UEM automation spectrum table (`docs/uem-architecture.md` §3):

| Step | Level | Rationale |
|---|---|---|
| Symptom collection | Human-only | Requires physical observation |
| AI identification | Fully automated | Model returns structured result |
| Treatment recommendation review | Human-only | Judgment call; regulatory weight |
| Observation creation | Assisted | Agent pre-fills; human confirms |
| Pesticide application creation | Assisted | Agent pre-fills target_pest/product; human confirms all fields and REI acknowledgment |

The identification itself is fully automated. No human confirms the AI's diagnosis — but the human decides whether to act on it. Every action (observation creation, pesticide application) that results from the identification requires explicit human confirmation per the existing application form flows.

### 7.4 Compliance Evidence Chain

The agent creates a three-record chain that satisfies MN 18B.37 audit requirements:

```
cv_observations          → what was seen (staff observation)
    └── cv_pest_id_sessions  → why the pesticide was selected (AI identification + IPM consideration)
            └── cv_skill_instances   → that the SOP was followed (skill version, precondition checks)
                    └── cv_applications_pesticide → what was applied (full compliance record)
```

An inspector asking "why did you apply ZeroTol 2.0 on this date" can trace:
1. Application record → links to observation ID
2. Observation → triggered by what the staff saw
3. Pest ID session → IPM path was considered (ipm_first_path populated); pesticide warranted because [rationale]
4. Skill instance → PHI, REI, stage-block were checked at time of application

This is a stronger compliance argument than "the grower decided to spray."

---

## 8. Field UX Design

### 8.1 The Post-Observation Trigger (Phase 1)

After saving a pest/disease/damage observation:

```
┌─────────────────────────────────────────────────────┐
│  ✓ Observation saved                                │
│                                                     │
│  Pest · High · Z2-A-R3-C07                         │
│  "Spider-web pattern on leaf undersides"            │
│                                                     │
│  [Get identification help →]   [Done]               │
└─────────────────────────────────────────────────────┘
```

The button is prominent but not mandatory. Tapping it opens the PestIdFlow screen.

### 8.2 The PestIdFlow Screen

Three-section screen following field UX rules:

**Section 1 — Context (non-editable, confirmation)**
Shows: batch, strain, sub_zone, container (if scanned), days-in-stage, current batch stage.
Staff sees exactly what context the agent will use. Non-editable — they confirmed this when creating the observation.

**Section 2 — Symptom Entry**
Pre-seeded from observation note (editable). Large text area with voice input. Optional additional detail prompts:
- "Where on the plant?" (leaf / stem / root / whole plant)
- "Pattern?" (spots / yellowing / wilting / insects visible / webbing)

**Section 3 — Submit**
Large "Identify →" button (56pt+, bottom of screen). Tapping starts the identification.

During inference (< 5s): full-screen spinner with "Analyzing symptoms…" — not a small loading indicator. The operator cannot accidentally interact with anything while the model runs.

### 8.3 The Results Screen

Results presented in a priority order that matches how a grower thinks:

```
┌─────────────────────────────────────────────────────┐
│  IDENTIFICATION                                     │
│                                                     │
│  Spider mites (Tetranychus urticae)  [HIGH ●]       │
│  "Web-like pattern + dry conditions typical of      │
│   this pest; two-spotted pattern consistent"        │
│                                                     │
│  Also consider:                                     │
│  • Russet mites — smaller damage pattern            │
│  • Broad mites — leaf curl rather than webbing      │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  TRY THESE FIRST                                    │
│                                                     │
│  • Remove heavily infested leaves immediately       │
│  • Increase airspace between plants in Z2-A         │
│  • Reduce ambient temp if possible (spider mites    │
│    thrive above 85°F — current: 82°F)               │
│  • Predatory mites (Phytoseiulus persimilis) —      │
│    effective at this batch stage                    │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  IF CHEMICAL TREATMENT IS NEEDED                    │
│                                                     │
│  ⚠ ZeroTol 2.0 (Hydrogen dioxide)                  │
│    EPA Reg: 70299-1  ·  PHI: 0 days ✓              │
│    REI: 12 hours  ·  Stage: field_flower_w2 ✓      │
│    Lot #LOT-2026-041 (expires Nov 2026)             │
│    [Log Application →]                              │
│                                                     │
│  ─ BTNow (Bacillus thuringiensis)                   │
│    EPA Reg: 73049-39  ·  Stage: BLOCKED ✗           │
│    Note: Biological foliars blocked after flower w3 │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  SPREAD RISK: High · URGENCY: Treat soon           │
│                                                     │
│  [Dismiss — monitoring only]                        │
└─────────────────────────────────────────────────────┘
```

**Design principles applied:**
- IPM path shown first — not buried under pesticide options
- Stage-blocked products shown with clear explanation (not hidden)
- PHI/REI compliance shown inline — no separate compliance check needed before acting
- "Log Application →" button is prominent but below IPM section — deliberate friction to prompt IPM consideration
- Dismiss is available — no action is required

### 8.4 Log Application Pre-fill Flow

Tapping "Log Application →" for a matched product:

1. Opens `PesticideNew.jsx` with these fields pre-populated:
   - `batch_id` — from session context
   - `row_id` / `container_id` — from observation
   - `input_id` — matched farmstock item
   - `input_lot_id` — most recent non-expired lot
   - `target_pest` — exact primary_id.name from IdentificationResult
   - `pest_pressure` — mapped from urgency (monitor→incidental, treat_soon→threshold, treat_immediately→outbreak)
   - `ambient_temp_f` / `ambient_rh` — from sensor auto-fill (already wired in PesticideNew)
2. Staff reviews all fields, adds wind speed (manual), adjusts anything
3. Standard PHI/REI confirmation modal fires on save
4. On save: the pest ID session is updated with `linked_pesticide_app_id`

The observation's `triggered_app_id` is updated via a `PATCH /api/observations/:id` call from the pesticide application save flow if `linked_observation_id` is present in the session.

---

## 9. Open Questions for Operator Input

### Q1: IPM Log as a Formal Record?

The agent surfaces IPM-first recommendations (physical controls, beneficial insects). Should these be formally logged as observations or a new IPM action record? Currently they're advisory only.

**Consideration:** MN Rule 4770 broadly covers "crop inputs" but doesn't require logging beneficial releases as applications unless an EPA-registered product is used. However, logging nematode releases, predatory mite introductions, etc. would strengthen the "IPM-first" documentation that protects against regulatory scrutiny of pesticide use frequency.

**Decision needed:** Should the agent offer a "Log IPM action" path alongside "Log pesticide application"?

### Q2: Identification History / Trend Tracking

Should there be a screen showing pest identification history by batch or sub-zone over time? This would surface patterns like "Z1A has had 3 spider mite identifications in 60 days" which might indicate an environmental root cause.

**Consideration:** Useful for operations management; not required for compliance. A `GET /api/pest-id/sessions?batch_id=X` endpoint already covers the query; it's a UI question about whether to build the view.

### Q3: Confidence Threshold Gating

Should the agent refuse to show a treatment recommendation if it has only `low` confidence in its identification? Or should it always show recommendations with a visible caveat?

**Recommendation:** Always show with explicit confidence caveats, and require the operator to tap "Proceed despite low confidence" before the Log Application path is enabled. Blocking recommendations entirely risks the operator just applying a product without any guidance.

### Q4: Agent Running in the Field Without Network

The pest ID session requires the Anthropic API. Unlike observation logging (which queues offline), the identification inference cannot be deferred — the operator needs the result now.

**Consideration:** Offline behavior options:
- (A) Block: Show "Identification unavailable offline — log observation and retry when connected" 
- (B) Cache: Pre-cache the common cannabis pest identification knowledge as a local lookup table — no AI, but covers the 10–15 most common cases
- (C) Skip: Always show the "Get identification help" button but show a clear error if offline

**Recommendation:** Option C for Phase 1 (simple), Option B for Phase 2 (useful). The local lookup table for common pests would be a ~2KB JSON file, easily bundled with the app.

### Q5: Operator License Pre-check Before Showing Pesticide Recommendations

If the operator is viewing a recommendation for a restricted-use pesticide (RUP) and doesn't have an applicator license, the Log Application button will ultimately be blocked. Should the agent proactively hide RUP recommendations with an explanation, or show them with a disabled button?

**Recommendation:** Show with a disabled "Log Application" button and an explanation: "Restricted-use pesticide — applicator license required. Contact supervisor." This is more informative than hiding the option.

### Q6: Prompt Versioning and Auditability

The system prompt encodes the pest knowledge and output format used at identification time. Should the prompt version be stored in `cv_pest_id_sessions.context_snapshot` so audits can reconstruct exactly what knowledge the model used?

**Recommendation:** Yes — store `{ prompt_version: "1.0", model: "claude-sonnet-4-6", ... }` in `context_snapshot`. This is analogous to `cv_skill_instances.skill_version`. If the operation is ever questioned about why a particular recommendation was made, the prompt version plus the model version gives a reproducible record.

---

## 10. Implementation Phasing

### Phase 1 — MVP (Text-Only Identification)

**Estimated effort:** M (1–2 days)

**Deliverables:**
1. `src/db/migrations/018_pest_id_sessions.ts` — new table
2. `src/agents/prompts/pest-identification.md` — versioned system prompt
3. `src/agents/pest-identifier.ts` — Claude API invocation, catalog matching, compliance flags
4. `src/api/routes/pest-id.ts` — POST/GET/PATCH routes registered at `/api/pest-id`
5. `client/src/api.js` — 4 pest-id methods (createSession, getSession, updateSession, listSessions)
6. `client/src/pages/pest-id/PestIdFlow.jsx` — observation → symptom entry → results → action
7. `client/src/pages/observations/ObservationNew.jsx` (or confirmation screen) — add "Get identification help →" button trigger
8. `client/src/pages/applications/PesticideNew.jsx` — accept pre-fill params from pest ID session

**Acceptance criteria:**
- Staff can save a pest observation and immediately access the identification flow
- Agent returns a structured identification in < 10 seconds
- Catalog matching returns at least one farmstock product where one exists
- Log Application button opens PesticideNew with target_pest pre-populated
- cv_pest_id_sessions record created with full context snapshot

### Phase 2 — Vision Integration (Recommended next after Phase 1 is stable)

**Estimated effort:** M-L (2–3 days)

**Additional deliverables:**
1. Photo upload endpoint wired to pest-id sessions
2. Phase 2 inference call with image content blocks
3. Updated PestIdFlow with photo capture step
4. Updated system prompt with photo interpretation guidance

### Phase 3 — UEM Skill Schema Integration

**Estimated effort:** S (hours — mostly configuration)

**Additional deliverables:**
1. `pest-identification.skill.json` in `src/skills/` (see §7.2 draft)
2. Skill instance creation in pest-id route (same pattern as pesticide-applications.ts)
3. Results view updated to show UEM compliance badges

---

## Appendix: Cannabis Cultivation Pest Reference (for System Prompt Seed)

The following pests, diseases, and deficiencies constitute ~95% of cannabis cultivation issues. The system prompt should encode all of these with their distinguishing characteristics, preferred batch stage (some only appear at specific stages), and standard treatment protocols.

### Pests

| Common Name | Scientific | Key Signs | Typical Stage | IPM First | Pesticide Class |
|---|---|---|---|---|---|
| Spider mites | Tetranychus urticae | Stippling on leaves, fine webbing on undersides | Field flower | Predatory mites, humidity increase | Insecticidal soap, hydrogen dioxide |
| Russet mites | Aculops cannibicola | Upward leaf curl, bronze discoloration, no webbing | Field flower (late) | No effective biocontrol | Sulfur (allowed stages only) |
| Aphids | Various | Sticky residue, ant activity, curled new growth | Veg and early flower | Lacewings, parasitic wasps | Insecticidal soap, neem (EPA-registered only) |
| Fungus gnats | Bradysia spp. | Larvae in topsoil, adult flies near base | All — worse in seedling | Beneficial nematodes, sticky traps, reduced watering | BTNow (Bacillus thuringiensis israelensis) |
| Thrips | Frankliniella occidentalis | Silver/bronze scarring on leaves, black frass spots | Veg | Blue sticky traps, predatory mites | Spinosad (early stage only) |
| Whiteflies | Bemisia tabaci | White powder on undersides, sticky honeydew | Veg | Yellow sticky traps, parasitic wasps | Insecticidal soap |
| Broad mites | Polyphagotarsonemus latus | New growth twisting, glossy appearance, no webbing | Seedling–veg | Predatory mites | Abamectin (check stage) |

### Diseases

| Common Name | Pathogen | Key Signs | Typical Stage | IPM First | Pesticide Class |
|---|---|---|---|---|---|
| Powdery mildew | Erysiphe spp. | White powdery patches on leaves/buds, starts on leaf surface | Field flower | Airflow improvement, humidity < 50% | Potassium bicarbonate, hydrogen dioxide, copper |
| Botrytis (gray mold) | Botrytis cinerea | Gray fuzzy mold on buds/stems, starts in dense canopy | Late flower — high humidity | Defoliation, airflow, harvest affected material | Bacillus subtilis (CEASE), copper |
| Root rot | Pythium spp. | Wilting despite adequate water, brown mushy roots | All stages | Beneficial microbes (Trichoderma), pH correction | None effective once established |
| Fusarium | Fusarium spp. | Sudden wilting one branch at a time, brown interior stem | Late veg / early flower | Remove affected plants | No effective chemical control |
| Damping off | Pythium / Rhizoctonia | Seedlings collapse at soil line | Seedling | Sterile media, avoid overwatering | Copper (preventive only) |

### Deficiencies (for differential — typically not pesticide-warranted)

| Deficiency | Key Signs | Distinguishing from disease |
|---|---|---|
| Nitrogen | Lower leaf yellowing top-down, uniform | No spots, no mold, lower leaves affected first |
| Calcium | Brown spots with yellow halo, curled leaf tips | Spots appear on newer growth |
| Magnesium | Yellowing between veins on mid-plant leaves | Veins stay green — interveinal chlorosis |
| Iron | Yellowing between veins on new growth only | Youngest leaves affected first |
| Phosphorus | Purple/red coloration on underside, slow growth | Color shift rather than spotting |

---

*This design is pre-implementation. Phase 1 requires operator decision on Q1 (IPM log record) and Q3 (confidence gating) before build begins. All other questions can be decided post-Phase 1.*
