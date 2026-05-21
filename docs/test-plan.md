# Cultivate Test Plan — Business Rule Inventory & Infrastructure Design

**Last updated:** 2026-05-21  
**Status:** Plan only — infrastructure and test files are the next task

---

## 1. Purpose

This application manages compliance-critical records under:

- **MN Statute 342.25** — 5-year cultivation record retention per plant batch
- **MN Rule 4770** — crop input tracking requirements
- **MN Statute 18B.37** — pesticide application record fields
- **METRC** — state-mandated plant tracking and harvest reporting

Every API endpoint is an audit surface. A bug in harvest gating, PHI enforcement, or REI computation could produce records that fail a regulatory inspection. This test plan ensures that regulatory business rules are verified automatically before any code reaches production.

**Tests are required, not optional.** The development standards in CLAUDE.md state this explicitly. The test framework (vitest) is already installed. This document defines what must be tested and in what order.

---

## 2. Infrastructure Design

### 2.1 Architecture

Each integration test file gets a **fresh in-memory SQLite database** with all migrations applied. Tests never share database state. The Fastify app is built against that database instance, and HTTP requests are made via Fastify's built-in `inject()` — no network overhead, no port binding.

```
Test file starts
  → createTestApp()
       → creates better-sqlite3 :memory: DB
       → runs all migrations via knex
       → seeds 1 admin user (cv_users)
       → calls setDB(db) to inject into getDB() singleton
       → builds Fastify app (buildApp())
       → returns { app, db, getToken }
  → tests run via app.inject()
  → afterAll: app.close(), db.close()
```

**Prerequisite change:** `src/db/index.ts` needs a `setDB(instance: Database)` export so tests can inject a fresh in-memory DB. This is a one-line addition.

### 2.2 Directory Structure

```
src/tests/
  helpers/
    db.ts              -- createTestApp(): fresh DB + migrations + Fastify app
    auth.ts            -- getToken(app, role): returns signed JWT string
    fixtures.ts        -- createStrain(), createBatch(), putContainerActive(), etc.
  unit/
    domain-utils.test.ts   (ALREADY EXISTS — 27 tests passing)
  integration/
    batches.test.ts        -- batch lifecycle, transitions, sub_zone lock, plant count
    harvest.test.ts        -- harvest batch creation, events, force-close, auto-close
    plant-loss.test.ts     -- plant loss, container transition, replacement
    containers.test.ts     -- container state machine (teardown, startup, ready)
    tag-assignments.test.ts -- METRC tag assign, conflict, reassign, bulk
    applications/
      fertigation.test.ts  -- EC/pH required, closed batch, 24h lock
      pesticide.test.ts    -- PHI, REI, stage block, lot required, RUP license
      foliar.test.ts       -- EPA redirect, stage block, purpose required, harvesting block
```

### 2.3 Helper Implementations (Design, Not Code)

**`helpers/db.ts` — `createTestApp()`**
```typescript
// 1. Create an in-memory DB instance
// 2. Run migrations via knex (client: 'better-sqlite3', connection: { filename: ':memory:' })
// 3. Seed 1 cv_users row (admin) for auth
// 4. Call setDB(db) to wire into route handlers via getDB()
// 5. Build Fastify app via buildApp() — uses JWT_SECRET='test-secret'
// 6. Return { app, db, adminId }
```

**`helpers/auth.ts` — `getToken(app, opts)`**
```typescript
// Signs a JWT using app.jwt.sign({ id, role })
// Roles: 'grower' | 'supervisor' | 'admin'
// Returns the Bearer token string for use in Authorization header
```

**`helpers/fixtures.ts` — Fixture factories**
```typescript
// createStrain(db, opts?)        → strain_id (type: 'auto')
// createBatch(db, strainId, opts?) → batch_id (status: 'germ')
// advanceBatchTo(db, batchId, targetStatus, notes?)  → transitions batch through statuses
// createHarvestBatch(db, batchId, userId) → harvest_batch_id (batch must be 'harvesting')
// createContainerAssignment(db, batchId, containerId) → assignment_id
// putContainerActive(db, containerId, batchId) → sets container_state to 'active'
// putContainerTeardown(db, containerId, batchId) → sets state to 'teardown'
// putContainerStartup(db, containerId) → sets state to 'startup'
```

**Seed data available from migrations:**  
Zones, sub-zones, rows, and containers are seeded by `002_infrastructure.ts`. Tests can reference container IDs like `Z1-A-R1-C1` directly. No fixture factory needed for the physical layer.

---

## 3. Test Inventory

### Priority order for implementation:
1. Tier 1 — Regulatory (must not fail in production)
2. Tier 2 — Data integrity (should not fail)
3. Tier 3 — Business logic unit tests (already partially covered)

---

## 4. Tier 1 — Regulatory Rules

These rules directly affect METRC compliance, MN statute records, or data that auditors examine. A failing test in this tier means the app can produce legally invalid records.

---

### 4.1 `harvest.test.ts` — Harvest Event Gating

**Rule:** Both `partial_harvest` and `final_harvest` events are blocked unless batch.status = 'harvesting'. (CLAUDE.md Business Rule 43; MN Statute 342.25 event timing)

**How the gate works in code:**
- Harvest batch creation (`POST /api/harvest/batches`) requires batch.status = 'harvesting'
- Harvest event creation (`POST /api/harvest/batches/:id/events`) requires harvest_batch.status = 'in_progress'
- These two together enforce that harvest events can only exist when the batch is in 'harvesting'

**Tests:**
```
describe('Harvest batch creation — batch status gate')
  it('rejects harvest batch creation when batch is in germ')            → expect 400
  it('rejects harvest batch creation when batch is in field-veg')       → expect 400
  it('rejects harvest batch creation when batch is in harvest_window')  → expect 400
  it('allows harvest batch creation when batch is in harvesting')       → expect 201

describe('Harvest event — harvest_batch gate')
  it('rejects event when harvest batch is force_closed')                → expect 400
  it('rejects event when harvest batch is completed')                   → expect 400
  it('allows partial_harvest event when harvest_batch is in_progress')  → expect 201
  it('allows final_harvest event when harvest_batch is in_progress')    → expect 201
```

---

### 4.2 `harvest.test.ts` — Final Harvest Side Effects

**Rule:** final_harvest triggers: (1) plant assignment unassigned with reason 'harvested', (2) container → teardown, (3) auto-close if all plants done. (CLAUDE.md Rules 45, 48; MN Statute 342.25)

**Tests:**
```
describe('Final harvest side effects')
  it('unassigns the plant assignment with reason=harvested after final_harvest')
  it('transitions container to teardown after final_harvest')
  it('auto-closes cultivation batch when last plant is final-harvested')
  it('auto-closes harvest batch when last plant is final-harvested')
  it('does NOT auto-close batch when plants remain active')
  it('rejects a second final_harvest for the same plant assignment')    → expect 400
```

---

### 4.3 `harvest.test.ts` — Waste Trim

**Rule:** Waste trim requires wet_weight (positive) and trim_reason; available at ANY batch status (not gated on 'harvesting'). (CLAUDE.md Rule 49, 50; MN Statute 342.25)

**Tests:**
```
describe('Waste trim')
  it('allows waste trim on a field-veg batch')                          → expect 201
  it('allows waste trim on a harvesting batch')                         → expect 201
  it('rejects waste trim with missing trim_reason')                     → expect 400
  it('rejects waste trim with wet_weight = 0')                         → expect 400
  it('rejects waste trim for a non-existent batch')                    → expect 400
  it('sets initial waste_status to collected')
  it('sets metrc_sync_status to pending')
```

---

### 4.4 `harvest.test.ts` — Force-Close Harvest Batch

**Rule:** Force-close requires close_notes (min 10 chars); creates new harvest batch (sequence_number+1); cultivation batch stays in 'harvesting'. (CLAUDE.md Rule 47)

**Tests:**
```
describe('Force-close harvest batch')
  it('rejects force-close with missing close_notes')                    → expect 400
  it('rejects force-close with close_notes shorter than 10 chars')     → expect 400
  it('rejects force-close of a completed harvest batch')                → expect 400
  it('force-closes the harvest batch and creates a new one')            → expect 201
  it('new harvest batch has sequence_number one higher than the closed one')
  it('cultivation batch remains in harvesting status after force-close')
```

---

### 4.5 `applications/pesticide.test.ts` — Lot Required

**Rule:** Pesticide applications require `input_lot_id`. Lot tracking is non-negotiable for pesticides. (CLAUDE.md Business Rule 16; MN Statute 18B.37)

**Tests:**
```
describe('Pesticide application — input_lot_id required')
  it('rejects pesticide application with no input_lot_id')             → expect 400 (Zod validation)
  it('accepts pesticide application with valid input_lot_id')           → expect 201
```

---

### 4.6 `applications/pesticide.test.ts` — Required Environmental Fields

**Rule:** target_pest, ambient_temp_f, and wind_speed_mph are required on every pesticide application. (CLAUDE.md Business Rule 17; MN Statute 18B.37)

**Tests:**
```
describe('Pesticide application — required MDA fields')
  it('rejects application with no target_pest')                        → expect 400
  it('rejects application with empty target_pest string')             → expect 400
  it('rejects application with no ambient_temp_f')                    → expect 400
  it('rejects application with no wind_speed_mph')                    → expect 400
  it('accepts application with all three fields present')             → expect 201
```

---

### 4.7 `applications/pesticide.test.ts` — PHI Enforcement

**Rule:** PHI is checked against `phi_days_operational` (not label PHI). Non-compliant applications require `phi_override_notes` to proceed. (CLAUDE.md Business Rule 18; MN Statute 18B.37)

**Note:** PHI checks are conditional on farmstock returning a product with `phi_days_operational`. In tests, FARMSTOCK_URL is not set, so farmstock returns null and PHI is skipped. Integration tests for PHI require either: (a) a test-mode farmstock mock, or (b) a direct DB insertion of a product with known PHI values and a test-only code path.

**Design decision:** These tests should use a mock for the `fetchFarmstockItem` function (vitest `vi.mock()`).

**Tests:**
```
describe('Pesticide PHI enforcement (with mocked farmstock)')
  it('blocks application when days_until_harvest < phi_days_operational and no override')
                                                                       → expect 422 with phi_violation: true
  it('allows application when days_until_harvest >= phi_days_operational') → expect 201
  it('allows PHI-violating application when phi_override_notes provided') → expect 201 with warning
  it('stores phi_compliant=0 when PHI override is used')
  it('stores phi_compliant=1 when PHI is satisfied')
```

---

### 4.8 `applications/pesticide.test.ts` — Stage Block (Hard Reject)

**Rule:** If `input_phi_stage_overrides` has `allowed = 0` for the current stage, the application is blocked with no override. (CLAUDE.md Business Rule 19)

**Tests:**
```
describe('Pesticide stage block')
  it('blocks application when stage override exists with allowed=0')   → expect 422 with stage_blocked: true
  it('allows application when no stage override exists for this input+stage')
  it('allows application when stage override has allowed=1')
```

---

### 4.9 `applications/pesticide.test.ts` — REI Computation

**Rule:** REI is computed as `applied_at + rei_hours`. Stored as `rei_expires_at`. (CLAUDE.md Business Rule 20)

**Tests:**
```
describe('Pesticide REI computation (with mocked farmstock)')
  it('stores rei_expires_at = applied_at + rei_hours when rei_hours is present')
  it('leaves rei_expires_at null when farmstock returns no rei_hours')
  it('clears REI via POST /clear-rei with rei_cleared_at and rei_cleared_by')
  it('rejects clear-rei if already cleared')                          → expect 409
  it('rejects clear-rei if no REI exists on this application')       → expect 409
```

---

### 4.10 `applications/pesticide.test.ts` — Restricted-Use Pesticide

**Rule:** If `restricted_use = true` from farmstock, `applicator_license` is required. (CLAUDE.md Business Rule 21)

**Tests:**
```
describe('Pesticide RUP license requirement (with mocked farmstock)')
  it('blocks restricted-use pesticide application when applicator_license is empty') → expect 422
  it('allows restricted-use pesticide with applicator_license provided')             → expect 201
  it('allows non-RUP pesticide without applicator_license')                          → expect 201
```

---

### 4.11 `applications/foliar.test.ts` — EPA Product Redirect

**Rule:** If the selected product has an EPA registration number, the system must redirect to the Pesticide Application form (422). (CLAUDE.md Business Rule 13)

**Tests:**
```
describe('Foliar — EPA product redirect (with mocked farmstock)')
  it('returns 422 redirect=pesticide when product has EPA number')
  it('returns redirect with correct input_id for frontend routing')
  it('allows foliar when product has no EPA number')
```

---

### 4.12 `applications/foliar.test.ts` — Stage Block (Hard Block)

**Rule:** Foliar stage block (`input_phi_stage_overrides.allowed = 0`) blocks the application. (CLAUDE.md Business Rule 14)

**Tests:**
```
describe('Foliar stage block')
  it('blocks application when stage override exists with allowed=0')  → expect 422 with stage_blocked: true
  it('allows application when no stage override blocks this input+stage')
```

---

### 4.13 `applications/foliar.test.ts` — Harvesting Batch Block

**Rule:** Foliar applications cannot be logged during active harvest (batch.status = 'harvesting'). This protects harvest record integrity.

**Tests:**
```
describe('Foliar — harvesting batch block')
  it('blocks foliar application when batch is in harvesting status')  → expect 400
  it('allows foliar application when batch is in field-flower')        → expect 201
```

---

### 4.14 `plant-loss.test.ts` — METRC Sync Status

**Rule:** Every `plant_loss_event` must have `metrc_sync_status = 'pending'` on creation. (CLAUDE.md Business Rule 39)

**Tests:**
```
describe('Plant loss — METRC sync queued')
  it('sets metrc_sync_status=pending on every new plant loss event')
```

---

## 5. Tier 2 — Data Integrity Rules

These rules prevent state corruption. A failing test here means containers, batches, or assignments are in an impossible state that breaks other features.

---

### 5.1 `batches.test.ts` — Status Transition State Machine

**Rule:** Only valid transitions allowed per VALID_TRANSITIONS. Closed batch cannot be transitioned. (CLAUDE.md; implied by all status-gated features)

**Tests:**
```
describe('Batch status transitions — VALID_TRANSITIONS only')
  it('allows germ → seedling')                                         → expect 200
  it('allows seedling → cult-hoop')                                    → expect 200
  it('allows cult-hoop → field-veg when sub_zone_id is set')          → expect 200
  it('allows field-veg → field-flower')                                → expect 200
  it('allows field-flower → flush')                                    → expect 200
  it('allows flush → harvest_window')                                  → expect 200
  it('allows harvest_window → harvesting when notes provided')         → expect 200
  it('rejects germ → field-veg (skipping steps)')                     → expect 400
  it('rejects field-veg → germ (backwards)')                          → expect 400
  it('rejects transition of a closed batch')                           → expect 400
  it('rejects unknown to_status values')                               → expect 400

describe('Batch transition pre-conditions')
  it('rejects cult-hoop → field-veg when sub_zone_id is not set')     → expect 400
  it('rejects harvest_window → harvesting with no notes')              → expect 400
  it('accepts harvest_window → harvesting with notes provided')        → expect 200
```

---

### 5.2 `batches.test.ts` — Locked Fields

**Rule:** `sub_zone_id` cannot be changed once batch is in field status. `plant_count_initial` cannot be changed once plant assignments exist. (CLAUDE.md Business Rules in PATCH /:id)

**Tests:**
```
describe('Batch PATCH — locked fields')
  it('allows sub_zone_id change when batch is in germ')                → expect 200
  it('rejects sub_zone_id change when batch is in field-veg')          → expect 400
  it('rejects sub_zone_id change when batch is in harvesting')         → expect 400
  it('allows plant_count_initial change before any assignments')       → expect 200
  it('rejects plant_count_initial change after assignments exist')     → expect 400
```

---

### 5.3 `batches.test.ts` — Recipe Assignment

**Rule:** Only active recipes can be assigned to a batch.

**Tests:**
```
describe('Batch recipe assignment')
  it('assigns an active recipe to a batch')                            → expect 201
  it('rejects an inactive recipe')                                     → expect 400
  it('rejects a non-existent recipe_id')                              → expect 400
  it('closes the previous active recipe assignment when a new one is made')
```

---

### 5.4 `containers.test.ts` — Container State Machine

**Rule:** Teardown requires 'active' or 'empty' state; startup requires 'teardown'; ready sign-off requires 'startup'. Startup clears `current_batch_id`. (CLAUDE.md Container Lifecycle Rules 30–37)

**Tests:**
```
describe('Container teardown — state gate')
  it('allows teardown from active state')                              → expect 201
  it('allows teardown from empty state')                               → expect 201
  it('rejects teardown from teardown state')                           → expect 400
  it('rejects teardown from startup state')                            → expect 400
  it('rejects teardown from ready state')                              → expect 400
  it('rejects teardown when batch_id does not match container batch')  → expect 400

describe('Container startup — state gate')
  it('allows startup from teardown state')                             → expect 201
  it('rejects startup from active state')                              → expect 400
  it('rejects startup from empty state')                               → expect 400
  it('rejects startup from startup state (already in startup)')        → expect 400
  it('transitions container to startup state')
  it('clears current_batch_id after startup transition')

describe('Container ready sign-off — state gate')
  it('allows ready sign-off from startup state (supervisor)')          → expect 200
  it('rejects ready sign-off from teardown state')                     → expect 400
  it('rejects ready sign-off from active state')                       → expect 400
  it('rejects ready sign-off from non-supervisor role')                → expect 403
  it('transitions container to ready state')
  it('current_batch_id remains null after ready sign-off')
```

---

### 5.5 `plant-loss.test.ts` — Plant Loss State Transitions

**Rule:** Plant loss: container must be 'active', assignment must be active and belong to correct batch/container, container → empty when no active assignments remain. (CLAUDE.md Container Lifecycle Rule 32)

**Tests:**
```
describe('Plant loss — state validation')
  it('rejects plant loss for a closed batch')                          → expect 400
  it('rejects plant loss for an already-unassigned assignment')        → expect 400
  it('rejects plant loss when assignment belongs to wrong batch')      → expect 400
  it('rejects plant loss when assignment belongs to wrong container')  → expect 400
  it('rejects plant loss when container is not active')                → expect 400

describe('Plant loss — side effects')
  it('unassigns the plant assignment after loss')
  it('transitions container active → empty when last plant is lost')
  it('does NOT transition container when other plants remain active (plants_per_container > 1)')
  it('records plant loss event with metrc_sync_status=pending')

describe('Plant replacement')
  it('rejects replacement when container is active (not empty)')       → expect 400
  it('rejects replacement when container batch does not match')        → expect 400
  it('rejects replacement for a closed batch')                         → expect 400
  it('creates replacement assignment with metrc_plant_tag=null')
  it('transitions container empty → active after replacement')
```

---

### 5.6 `tag-assignments.test.ts` — METRC Tag Format

**Rule:** All METRC plant tags must be exactly 24 alphanumeric characters. (CLAUDE.md Business Rule 25; Zod enforcement)

**Tests:**
```
describe('METRC tag format validation')
  it('accepts a valid 24-char alphanumeric tag')                       → expect 201
  it('rejects a tag shorter than 24 chars')                            → expect 400
  it('rejects a tag longer than 24 chars')                             → expect 400
  it('rejects a tag with hyphens or special characters')               → expect 400
```

---

### 5.7 `tag-assignments.test.ts` — One Active Tag Per Assignment

**Rule:** A METRC plant tag can only be actively assigned to one container at a time. No silent reassignment. (CLAUDE.md Business Rule 24, 29)

**Tests:**
```
describe('METRC tag uniqueness')
  it('rejects tag assignment when tag is already active on another assignment')
                                                                       → expect 409 TAG_ALREADY_ASSIGNED
  it('returns existing assignment details in the 409 response')
  it('allows the same tag to be used after the original assignment is unassigned')

describe('Tag reassign — no silent reassignment')
  it('reassigns tag from one assignment to another with a reason')     → expect 200
  it('rejects reassign when from_assignment does not hold the specified tag')
                                                                       → expect 400
  it('rejects reassign with no reason')                                → expect 400
  it('clears metrc_plant_tag from the from_assignment after reassign')
```

---

### 5.8 `tag-assignments.test.ts` — Bulk Assignment

**Rule:** Bulk assignment is all-or-nothing; duplicate tags within the batch are rejected before hitting the DB. (tag-assignments.ts)

**Tests:**
```
describe('Bulk tag assignment')
  it('assigns multiple tags in a single transaction')                  → expect 201
  it('rejects the entire batch if any tag is already assigned')        → expect 409
  it('rejects duplicate tags within the same bulk request')            → expect 400
  it('returns assigned_count equal to input length on success')
```

---

### 5.9 `applications/fertigation.test.ts` — EC/pH Required

**Rule:** EC and pH are required on every fertigation application (CLAUDE.md Business Rule 11). Fields are `z.number()` in Zod — `0` is valid (meter-error case), but missing fields are rejected.

**Tests:**
```
describe('Fertigation — EC/pH required')
  it('rejects application with no ec_measured')                        → expect 400
  it('rejects application with no ph_measured')                        → expect 400
  it('accepts ec_measured = 0 (meter-error case)')                    → expect 201
  it('accepts ph_measured = 0 (meter-error case)')                    → expect 201
  it('rejects application for a closed batch')                         → expect 400
  it('accepts bulk application for multiple batches in one request')   → expect 201
  it('rejects bulk when any batch_id is closed')                       → expect 400

describe('Fertigation — 24-hour edit lock')
  it('allows PATCH within 24 hours of applied_at')                    → expect 200
  it('rejects PATCH after 24 hours')                                   → expect 409
  it('rejects applied_at change to a different calendar day')          → expect 400
```

---

### 5.10 `applications/foliar.test.ts` — Purpose and Recipe XOR

**Rule:** Purpose is required. Either foliar_recipe_id or input_id must be provided, but not both. rate_value and rate_unit required with single-product. (CLAUDE.md Business Rule 12; foliar route cross-field checks)

**Tests:**
```
describe('Foliar — required fields and XOR constraint')
  it('rejects application with no purpose')                            → expect 400
  it('rejects application with neither foliar_recipe_id nor input_id')  → expect 400
  it('rejects application with both foliar_recipe_id and input_id')     → expect 400
  it('rejects single-product application with no rate_value')           → expect 400
  it('rejects single-product application with no rate_unit')            → expect 400
  it('accepts recipe-based application without rate fields')            → expect 201
  it('accepts single-product application with rate_value and rate_unit') → expect 201
  it('rejects application for a closed batch')                          → expect 400
```

---

### 5.11 `harvest.test.ts` — Harvest Batch Type Constraint

**Rule:** Only one 'harvest' type batch can be in_progress at a time. Multiple 'manicure' (partial harvest) batches are allowed. (harvest.ts lines 154-164)

**Tests:**
```
describe('Harvest batch — in-progress uniqueness')
  it('rejects a second in-progress harvest batch when one already exists') → expect 400
  it('allows a second manicure batch when one already exists')             → expect 201
  it('allows a new harvest batch after the first is force-closed')        → expect 201
  it('allows a new harvest batch after the first is completed')           → expect 201
```

---

### 5.12 `harvest.test.ts` — Sequence Number

**Rule:** Force-close creates a new harvest batch with `sequence_number = max(existing) + 1`. (harvest.ts)

**Tests:**
```
describe('Harvest batch sequence numbers')
  it('first harvest batch has sequence_number=1')
  it('force-closed replacement has sequence_number=2')
  it('second force-close replacement has sequence_number=3')
```

---

## 6. Tier 3 — Business Logic Unit Tests

These are pure function tests — no HTTP, no database. Most of Tier 3 is already covered by the existing `domain-utils.test.ts`.

### Already covered (27 tests in `domain-utils.test.ts`):
- `formatMetrcDate` — ISO → MM/DD/YYYY
- `toMetrcPhase` — all batch statuses mapped to METRC phases
- `makeBatchName` — auto vs photo strain name generation
- `makeHarvestBatchName` — HB vs MB type codes
- METRC UID regex — 24 alphanumeric
- Container ID regex — `Z{n}-{A|B}-R{n}-C{n}`

### To add to `domain-utils.test.ts` (or a new unit test file):
```
describe('REI calculation')
  it('computes rei_expires_at = applied_at + rei_hours * 3600000ms')
  it('produces a future timestamp when applied recently')

describe('getBatchStageKey — flower week calculation')
  it('maps field-flower with 0 days to field_flower_w1')
  it('maps field-flower with 6 days to field_flower_w1')
  it('maps field-flower with 7 days to field_flower_w2')
  it('maps field-flower with 14 days to field_flower_w3')
  it('maps field-flower with 21 days to field_flower_w4plus')
  it('maps flush to flush')
  it('maps germ to germ')
  it('maps closed to null')
```

---

## 7. Execution

### Running tests

```powershell
# All tests (unit + integration)
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npx vitest run --coverage
```

### CI integration
Tests run as part of `npm test` and should be included in the deploy pipeline before any build is shipped to Railway. The existing `npm test` script already invokes vitest.

### Coverage targets
- **Tier 1 rules:** 100% — no regulatory rule should be unexercised
- **Tier 2 rules:** 100% — no state machine path should be untested
- **Overall line coverage:** 70%+ is a reasonable target after Tier 1 and 2 are complete

---

## 8. Priority Implementation Order

Implement integration tests in this sequence:

1. **Infrastructure first** (`helpers/db.ts`, `helpers/auth.ts`, `helpers/fixtures.ts`) — nothing else works without this
2. **`harvest.test.ts`** — highest regulatory risk; harvest events are METRC-reported
3. **`applications/pesticide.test.ts`** — PHI/REI/RUP are MN statute requirements
4. **`batches.test.ts`** — state machine is the backbone of all other features
5. **`plant-loss.test.ts`** — METRC waste reporting depends on correct loss records
6. **`containers.test.ts`** — container lifecycle supports harvest and loss correctly
7. **`tag-assignments.test.ts`** — tag integrity is a METRC audit requirement
8. **`applications/foliar.test.ts`** — EPA redirect and stage block are compliance critical
9. **`applications/fertigation.test.ts`** — data completeness for cultivation records
10. **Tier 3 additions** to `domain-utils.test.ts` — REI calculation, stage key mapping

---

## 9. Known Gaps and Constraints

**Farmstock dependency:** PHI checks, REI values, and the EPA-product redirect all depend on the farmstock API (`FARMSTOCK_URL` env var). When `FARMSTOCK_URL` is not set, these checks are skipped silently. Integration tests for PHI, REI, RUP, and the EPA redirect require vitest `vi.mock()` to mock `fetchFarmstockItem` in the route modules. This is the correct approach — don't try to spin up a real farmstock instance for unit/integration tests.

**`setDB()` requirement:** The `src/db/index.ts` singleton (`let db`) needs a `setDB(instance)` export for tests to inject a fresh in-memory DB. This is a one-line change that must be made before integration tests can run.

**No auth seeding:** Tests create a user directly in the DB (via INSERT into cv_users) and use `app.jwt.sign()` to generate tokens for that user. No password/PIN hashing needed in tests — just a row with the right role.

**Container seed data:** The infrastructure migrations seed all 1,180 containers. Tests can reference any valid container ID (e.g., `Z1-A-R1-C1`) without creating it. The fixture factories only need to set the `container_state` row to the desired state.

**Transaction integrity:** Integration tests that verify "all-or-nothing" behavior (bulk tag assignment, harvest + container transition) must query the DB directly after the request to confirm side effects. The API response alone is not sufficient to verify transaction atomicity.
