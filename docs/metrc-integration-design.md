# METRC API Integration Design — Phase 4

**Prepared:** 2026-05-21  
**Status:** Design document — implementation gated on Phase 1–3 completion  
**Scope:** Minnesota OCM METRC API integration for the cultivate application  
**Context:** Phase 1 (features 1–16) is complete. Phase 4 covers full bidirectional METRC sync.
Phases 2–3 (field ops enhancement, intelligence) are non-blocking — sync infrastructure can
begin once Phase 1 is stable.

---

## Section 1: METRC API Overview (MN OCM)

### Base URL

```
Production:  https://api-mn.metrc.com
Sandbox:     https://sandbox-api-mn.metrc.com
```

All paths documented in this file are relative to the base URL.

### Authentication

METRC uses HTTP Basic Authentication with a composite credential:

```
Username: {user_api_key}
Password: {software_api_key}
```

Both keys are base64-encoded together as the `Authorization: Basic {base64}` header.
Two distinct keys are required:

| Key | Purpose | Scope |
|-----|---------|-------|
| **User API Key** | Identifies the facility user account in METRC | Specific to the MN OCM METRC account for Fairwater Farm |
| **Software API Key** | Identifies this software as a METRC-licensed integration | Issued by METRC to the software vendor; same key across all facilities using this software |

Keys are obtained from the METRC OCM portal. The user API key can be rotated per the
facility's security policy; the software key is issued once and rotated only at vendor request.

### Required Request Headers

```
Content-Type: application/json
Authorization: Basic {base64(user_key:software_key)}
```

### Facility License Number

Most METRC API endpoints require the facility license number as a query parameter:

```
?licenseNumber={facility_license_number}
```

Example:
```
POST /plantbatches/v2/createplantings?licenseNumber=MN-C2-00000000-LIC
```

Store the license number in the `METRC_FACILITY_LICENSE` environment variable (see Section 4).

### Rate Limits

METRC enforces rate limits per API key. Documented limits (subject to change per METRC):

| Scope | Limit |
|-------|-------|
| Requests per second per key | ~10 req/sec (verify with OCM) |
| Requests per minute | Varies by endpoint type |
| Concurrent connections | 1 recommended per facility |

The sync worker must implement **exponential backoff** on HTTP 429 responses. See Section 3
for the retry strategy.

### API Versioning

METRC uses path versioning. All endpoints in this document use `/v2/` (current version as of
2026). A version header is not used; versioning is in the URL path only.

### Content Encoding

- All request bodies: `application/json`
- All timestamps: ISO 8601 with timezone (METRC expects the facility's local timezone for
  date fields — `America/Chicago` for MN OCM)
- Dates in METRC format: `MM/DD/YYYY` (see `formatMetrcDate()` in `src/lib/domain-utils.ts`)
- Weight units METRC accepts: `Grams`, `Ounces`, `Pounds`, `Milligrams`, `Kilograms`

---

## Section 2: Event Type Mapping

Each subsection covers one METRC submission type: the endpoint, when we trigger it, our source
data, the payload structure, how we track the response, and idempotency behavior.

### 2.1 Create Immature Plant Batch

**Endpoint:** `POST /plantbatches/v2/createplantings?licenseNumber={license}`

**Trigger:** When a `cv_batches` record is saved with a non-null `metrc_plant_batch_uid` request,
OR when an operator explicitly submits an unsynced batch to METRC from the batch detail page.
Since METRC UID is optional at batch creation (business rule 6), this submission may happen
days after batch creation.

In Phase 4, this submission fires when:
- A batch is created AND `metrc_plant_batch_uid` is null (we create in METRC and store the UID)
- Or the operator manually triggers "Sync to METRC" from batch detail for an unsynced batch

**Source data:**

```sql
SELECT
  b.batch_id,
  b.metrc_plant_batch_uid,
  b.plant_count_initial,
  b.sow_date,
  b.status,
  b.metrc_batch_name,      -- computed field: makeBatchName(strain, sow_date, type)
  s.name  AS strain_name,
  s.type  AS strain_type,
  l.metrc_name AS location_metrc_name
FROM cv_batches b
JOIN cv_strains s ON s.strain_id = b.strain_id
JOIN cv_locations l ON l.location_id = b.current_location_id
WHERE b.batch_id = ?
```

**METRC payload structure:**

```json
[
  {
    "Name":                "Blue Dream | 05/21/2026 | Auto",
    "Type":                "Seed",
    "Count":               30,
    "Strain":              "Blue Dream",
    "Location":            "Germ-01",
    "PatientLicenseNumber": null,
    "ActualDate":          "05/21/2026"
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `Name` | `makeBatchName(strain_name, sow_date, strain_type)` | e.g. `"Blue Dream \| 05/21/2026 \| Auto"` |
| `Type` | Always `"Seed"` | Facility uses seeds; adjust to `"Clone"` if clones are introduced |
| `Count` | `cv_batches.plant_count_initial` | Initial count at creation time |
| `Strain` | `cv_strains.name` | Must match exact METRC strain name on record |
| `Location` | `cv_locations.metrc_name` | Must match exact METRC location name |
| `PatientLicenseNumber` | `null` | Medical program — not applicable for MN OCM adult-use |
| `ActualDate` | `formatMetrcDate(sow_date)` | Planting date |

**Response handling:**

METRC does not return a batch UID in the creation response body for `/createplantings` —
the batch is identified by its `Name`. After successful creation:
1. Store the batch `Name` as `cv_batches.metrc_plant_batch_uid` (the name IS the identifier
   for subsequent METRC calls — METRC uses the batch name string, not a numeric UID, for
   plant batch operations).
2. Set the corresponding `cv_batch_phase_history` initial row `metrc_sync_status = 'synced'`.
3. Write a `cv_metrc_sync_log` entry with `sync_type = 'plant_batch'`, `status = 'success'`.

**Idempotency:** METRC rejects a second creation with the same batch name with a 400 error.
Before submitting, query METRC's `GET /plantbatches/v2/active?licenseNumber={license}` to
check if the name already exists. If found, update `cv_batches.metrc_plant_batch_uid` with
the found name and mark synced — do not re-submit.

---

### 2.2 Change Growth Phase

**Endpoint:** `POST /plantbatches/v2/changegrowthphase?licenseNumber={license}`

**Trigger:** When a `cv_batch_phase_history` record is written with `metrc_sync_status = 'pending'`
AND the transition crosses a METRC phase boundary:

| Our transition | METRC submission required? | METRC phase change |
|----------------|---------------------------|-------------------|
| `germ → seedling` | No | Still Immature |
| `seedling → cult-hoop` | No | Still Immature |
| `cult-hoop → field-veg` | **Yes** | Immature → Vegetative |
| `field-veg → field-flower` | **Yes** | Vegetative → Flowering |
| `field-flower → flush` | No | Still Flowering |
| `flush → harvest_window` | No | Still Flowering |
| `harvest_window → harvesting` | No | Still Flowering |
| `harvesting → closed` | No | Handled by harvest event |

Transitions that don't cross METRC phases get `metrc_sync_status = 'not_required'` set by
the batch route when the phase_history row is written. Only the two transitions above should
arrive with `metrc_sync_status = 'pending'`.

**Source data:**

```sql
SELECT
  ph.phase_history_id,
  ph.batch_id,
  ph.from_status,
  ph.to_status,
  ph.transitioned_at,
  b.metrc_plant_batch_uid,
  b.plant_count_initial,
  l.metrc_name AS location_metrc_name
FROM cv_batch_phase_history ph
JOIN cv_batches b ON b.batch_id = ph.batch_id
JOIN cv_locations l ON l.location_id = b.current_location_id
WHERE ph.metrc_sync_status = 'pending'
  AND ph.to_status IN ('field-veg', 'field-flower')
ORDER BY ph.transitioned_at ASC
```

**METRC payload structure:**

```json
[
  {
    "Name":               "Blue Dream | 05/21/2026 | Auto",
    "Count":              30,
    "NewTag":             null,
    "GrowthPhase":        "Vegetative",
    "NewRoom":            "Z1A",
    "GrowthDate":         "05/28/2026",
    "PatientLicenseNumber": null
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `Name` | `cv_batches.metrc_plant_batch_uid` | The stored batch name |
| `Count` | Current active plant count (see §2.2 note) | Active assignment count at transition time |
| `NewTag` | `null` | Individual plant tags — only if METRC requires individual tagging at this phase (verify with OCM) |
| `GrowthPhase` | `toMetrcPhase(to_status)` | `"Vegetative"` or `"Flowering"` |
| `NewRoom` | `cv_locations.metrc_name` | Current location at transition time |
| `GrowthDate` | `formatMetrcDate(transitioned_at)` | Date of phase change |
| `PatientLicenseNumber` | `null` | Not applicable |

**Count note:** Use `SELECT COUNT(*) FROM cv_plant_assignments WHERE batch_id = ? AND unassigned_at IS NULL` as the live count. Do NOT use `plant_count_initial`.

**Response handling:** HTTP 200 on success (no response body). Set `metrc_sync_status = 'synced'`
and `metrc_synced_at = NOW()` on the `cv_batch_phase_history` row.

**Idempotency:** METRC may reject a duplicate phase change. The worker checks `metrc_sync_status`
before submitting — already-synced records are skipped.

---

### 2.3 Move Plant Batches

**Endpoint:** `POST /plantbatches/v2/moveplantbatches?licenseNumber={license}`

**Trigger:** When a `cv_batch_location_history` record is written with `metrc_sync_status = 'pending'`.
Not all moves require a METRC submission — moves within the same METRC location class
(e.g., sub-zone to sub-zone within the same METRC location) may not. The sync worker
determines this by comparing `from_location_id.metrc_name` with `to_location_id.metrc_name`;
if they differ, submit to METRC.

**Source data:**

```sql
SELECT
  lh.move_id,
  lh.batch_id,
  lh.moved_at,
  b.metrc_plant_batch_uid,
  l_to.metrc_name AS to_location_metrc_name
FROM cv_batch_location_history lh
JOIN cv_batches b ON b.batch_id = lh.batch_id
JOIN cv_locations l_to ON l_to.location_id = lh.to_location_id
WHERE lh.metrc_sync_status = 'pending'
ORDER BY lh.moved_at ASC
```

**METRC payload structure:**

```json
[
  {
    "Name":     "Blue Dream | 05/21/2026 | Auto",
    "Location": "Z1A",
    "MoveDate": "05/28/2026"
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `Name` | `cv_batches.metrc_plant_batch_uid` | The stored batch name |
| `Location` | `cv_locations.metrc_name` (to_location) | Must match exact METRC location |
| `MoveDate` | `formatMetrcDate(moved_at)` | Date of physical move |

**Response handling:** HTTP 200 on success. Set `metrc_sync_status = 'synced'` on the
`cv_batch_location_history` row.

---

### 2.4 Record Additives

**Endpoint:** `POST /plantbatches/v2/additives?licenseNumber={license}`

**Trigger:** Any application record across all four application types where `metrc_sync_status = 'pending'`.

> **Schema gap (requires migration before Phase 4):** The current application tables
> (`cv_applications_fertigation`, `cv_applications_foliar`, `cv_applications_pesticide`,
> `cv_container_amendments`) do not have a `metrc_sync_status` column. Migration `016_additive_sync.ts`
> must add this column (with default `'pending'`) to all four tables before Phase 4 sync begins.
> See Section 5 for migration sequencing.

**Source queries (one per table, then unioned for the worker):**

```sql
-- Fertigation
SELECT
  'fertigation'      AS source_type,
  f.application_id   AS source_id,
  f.batch_id,
  f.applied_at,
  f.volume_gallons,
  f.recipe_id,
  b.metrc_plant_batch_uid,
  NULL               AS input_id,
  NULL               AS input_lot_id,
  NULL               AS rate_value,
  NULL               AS rate_unit,
  NULL               AS epa_reg_no
FROM cv_applications_fertigation f
JOIN cv_batches b ON b.batch_id = f.batch_id
WHERE f.metrc_sync_status = 'pending'

-- Foliar (non-pesticide)
SELECT
  'foliar'           AS source_type,
  fl.foliar_id       AS source_id,
  fl.batch_id,
  fl.applied_at,
  fl.volume_applied  AS volume,
  NULL               AS recipe_id,
  b.metrc_plant_batch_uid,
  fl.input_id,
  fl.input_lot_id,
  fl.rate_value,
  fl.rate_unit,
  NULL               AS epa_reg_no
FROM cv_applications_foliar fl
JOIN cv_batches b ON b.batch_id = fl.batch_id
WHERE fl.metrc_sync_status = 'pending'

-- Pesticide
SELECT
  'pesticide'        AS source_type,
  p.pesticide_app_id AS source_id,
  p.batch_id,
  p.applied_at,
  p.volume_applied   AS volume,
  NULL               AS recipe_id,
  b.metrc_plant_batch_uid,
  p.input_id,
  p.input_lot_id,
  p.rate_value,
  p.rate_unit,
  NULL               AS epa_reg_no  -- fetched from farmstock at sync time
FROM cv_applications_pesticide p
JOIN cv_batches b ON b.batch_id = p.batch_id
WHERE p.metrc_sync_status = 'pending'
```

**METRC payload structure:**

```json
[
  {
    "AdditiveType":             "Fertilizer",
    "ProductTradeName":         "Organic Gem Liquid Fish",
    "EPARegistrationNumber":    null,
    "ProductSupplier":          "True Organics",
    "ApplicationDevice":        "Drip irrigation",
    "TotalAmountApplied":       5.0,
    "TotalAmountUnitOfMeasure": "Gallons",
    "ActiveIngredients":        null,
    "PlantBatchName":           "Blue Dream | 05/21/2026 | Auto",
    "AdditiveDate":             "05/28/2026"
  }
]
```

**AdditiveType mapping:**

| Our application type | METRC `AdditiveType` | Notes |
|---------------------|---------------------|-------|
| `fertigation` (any recipe ingredient) | `"Fertilizer"` | Nutrient solution drip |
| `foliar` (foliar_nutrient, fertilizer category) | `"Fertilizer"` | Foliar nutrient spray |
| `foliar` (biocontrol_non_pesticide) | `"Other Additive"` | Non-pesticide biocontrol |
| `pesticide` (pesticide, fungicide) | `"Pesticide"` | EPA-registered product |
| `pesticide` (biocontrol_pesticide) | `"Pesticide"` | EPA-registered biocontrol |
| `container_amendment` (amendment) | `"Other Additive"` | Soil amendment |
| `container_amendment` (biocontrol_non_pesticide) | `"Other Additive"` | Inoculant |

**Field mapping:**

| METRC field | Source | Notes |
|-------------|--------|-------|
| `AdditiveType` | Mapped from our `category` (above table) | |
| `ProductTradeName` | Farmstock API: `items.name` by `input_id` | Cache farmstock lookup; see §2.4 note |
| `EPARegistrationNumber` | Farmstock API: `items.epa_reg_no` | Null for non-pesticides |
| `ProductSupplier` | Farmstock API: `items.manufacturer` | Null acceptable |
| `ApplicationDevice` | Mapped from our `application_method` | "Drip irrigation", "Foliar spray", "Soil drench", etc. |
| `TotalAmountApplied` | `volume_applied` or `volume_gallons` | Convert to METRC unit |
| `TotalAmountUnitOfMeasure` | Mapped from our unit string | "Gallons", "Ounces", "Grams", etc. |
| `ActiveIngredients` | Farmstock API: `items.active_ingredients` | For pesticides especially |
| `PlantBatchName` | `cv_batches.metrc_plant_batch_uid` | The stored batch name string |
| `AdditiveDate` | `formatMetrcDate(applied_at)` | Application date |

**Farmstock resolution note:** Product details (name, manufacturer, EPA reg #, active
ingredients) live in the farmstock database. At sync time, the worker calls the farmstock
API (`FARMSTOCK_URL/api/catalog/items/{input_id}`) to retrieve them. If farmstock is
unavailable, the sync worker queues the submission with a retry. Product data is NOT cached
permanently — it must be fetched at sync time to capture current farmstock state.

**For fertigation recipe ingredients:** A single fertigation application uses a recipe with
multiple ingredients. METRC requires **one additive record per ingredient**. The worker
expands recipe ingredients at sync time by joining `cv_fertigation_recipe_ingredients` with
farmstock item lookups.

**Response handling:** HTTP 200 on success. Set `metrc_sync_status = 'synced'` on the
source application record. Log to `cv_metrc_sync_log` with `sync_type = 'additive'`.

**Idempotency:** The additives endpoint is NOT idempotent in METRC — duplicate submissions
create duplicate records. The worker must check `metrc_sync_status = 'pending'` before
submitting and set it to `'synced'` atomically after a confirmed HTTP 200. Use a DB
transaction: update status to `'processing'` before the API call, then update to `'synced'`
or `'failed'` based on the result.

---

### 2.5 Create Harvest Batch

**Endpoint:** `POST /harvests/v2/createharvests?licenseNumber={license}`

**Trigger:** When a `cv_harvest_batches` record is created with `metrc_harvest_batch_uid = NULL`
and the first plant harvest event is ready to submit.

> Note: `cv_harvest_batches.metrc_harvest_batch_uid` stores the response UID. Until sync,
> it is null. The `metrc_name` column stores the computed name that will be submitted to METRC.

**Source data:**

```sql
SELECT
  hb.harvest_batch_id,
  hb.batch_id,
  hb.batch_type,
  hb.metrc_name,
  hb.started_at,
  hb.ambient_temp_f,
  hb.ambient_rh,
  s.name AS strain_name
FROM cv_harvest_batches hb
JOIN cv_batches b ON b.batch_id = hb.batch_id
JOIN cv_strains s ON s.strain_id = b.strain_id
WHERE hb.metrc_harvest_batch_uid IS NULL
  AND hb.status IN ('in_progress', 'completed', 'force_closed')
```

**METRC payload structure (Harvest Batch):**

```json
[
  {
    "Name":             "Blue Dream | 05/21/2026 | HB | Auto",
    "HarvestType":      "WholePlant",
    "DryingRoom":       "Z1A",
    "HarvestStartDate": "05/21/2026",
    "Strains": [
      { "StrainName": "Blue Dream" }
    ]
  }
]
```

**METRC payload structure (Manicure Batch):**

```json
[
  {
    "Name":             "Blue Dream | 05/21/2026 | MB | Auto",
    "HarvestType":      "Manicure",
    "DryingRoom":       "Z1A",
    "HarvestStartDate": "05/21/2026",
    "Strains": [
      { "StrainName": "Blue Dream" }
    ]
  }
]
```

**Field mapping:**

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `Name` | `cv_harvest_batches.metrc_name` | `makeHarvestBatchName(...)` result stored at creation |
| `HarvestType` | `batch_type = 'harvest'` → `"WholePlant"`; `'manicure'` → `"Manicure"` | |
| `DryingRoom` | Current location `metrc_name` at harvest start | Use batch's `current_location_id` at `started_at` |
| `HarvestStartDate` | `formatMetrcDate(started_at)` | |
| `Strains` | Array with `strain_name` | Only one strain per batch in our model |

**Response handling:** METRC returns the created harvest UID in the response body. Store this
in `cv_harvest_batches.metrc_harvest_batch_uid`.

---

### 2.6 Harvest Plants (Final Harvest)

**Endpoint:** `POST /plantbatches/v2/harvestplants?licenseNumber={license}`

**Trigger:** `cv_plant_harvest_events` records where `event_type = 'final_harvest'` AND
`metrc_sync_status = 'pending'`.

**Source data:**

```sql
SELECT
  phe.harvest_event_id,
  phe.harvest_batch_id,
  phe.plant_assignment_id,
  phe.container_id,
  phe.harvested_at,
  phe.wet_weight,
  phe.weight_unit,
  pa.metrc_plant_tag,
  hb.metrc_harvest_batch_uid,
  hb.metrc_name AS harvest_batch_name,
  hb.ambient_temp_f,
  hb.ambient_rh,
  b.metrc_plant_batch_uid,
  l.metrc_name AS location_metrc_name
FROM cv_plant_harvest_events phe
JOIN cv_plant_assignments pa ON pa.assignment_id = phe.plant_assignment_id
JOIN cv_harvest_batches hb ON hb.harvest_batch_id = phe.harvest_batch_id
JOIN cv_batches b ON b.batch_id = phe.batch_id
JOIN cv_locations l ON l.location_id = b.current_location_id
WHERE phe.event_type = 'final_harvest'
  AND phe.metrc_sync_status = 'pending'
ORDER BY phe.harvested_at ASC
```

**Pre-condition:** `cv_harvest_batches.metrc_harvest_batch_uid` must be set (harvest batch
must already exist in METRC — submit §2.5 first if not). Worker checks this and defers
harvest plant events until the harvest batch is synced.

**METRC payload structure:**

```json
[
  {
    "DryingRoom":              "Z1A",
    "PatientLicenseNumber":    null,
    "ActualDate":              "05/21/2026",
    "Plant":                   "ABCDEFGHIJKLMNOPQRSTUVWX",
    "Weight":                  125.5,
    "UnitOfWeight":            "Grams",
    "HarvestName":             "Blue Dream | 05/21/2026 | HB | Auto"
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `DryingRoom` | `cv_locations.metrc_name` for batch current location | |
| `PatientLicenseNumber` | `null` | |
| `ActualDate` | `formatMetrcDate(harvested_at)` | |
| `Plant` | `cv_plant_assignments.metrc_plant_tag` | 24-char METRC UID |
| `Weight` | `wet_weight` converted to selected unit | |
| `UnitOfWeight` | Mapped from `weight_unit` | `"g"` → `"Grams"`, `"oz"` → `"Ounces"`, `"lb"` → `"Pounds"` |
| `HarvestName` | `cv_harvest_batches.metrc_name` | Must match the batch name submitted in §2.5 |

**Response handling:** HTTP 200 on success. Set `metrc_sync_status = 'synced'` on the
`cv_plant_harvest_events` row.

**Note on untagged plants:** A `metrc_plant_tag = NULL` assignment cannot be harvested in
METRC — the tag is required. The worker surfaces these as action items in the sync dashboard.
Operator must assign a METRC tag via the tag-assignment workflow before harvest sync proceeds.

---

### 2.7 Manicure Plants (Partial Harvest)

**Endpoint:** `POST /plantbatches/v2/manicureplants?licenseNumber={license}`

**Trigger:** `cv_plant_harvest_events` records where `event_type = 'partial_harvest'` AND
`metrc_sync_status = 'pending'`.

**Same pre-condition as §2.6:** The manicure harvest batch (`batch_type = 'manicure'`) must
exist in METRC before plant-level events can be submitted.

**METRC payload structure:**

```json
[
  {
    "Room":                    "Z1A",
    "PatientLicenseNumber":    null,
    "ActualDate":              "05/21/2026",
    "Plant":                   "ABCDEFGHIJKLMNOPQRSTUVWX",
    "Weight":                  18.2,
    "UnitOfWeight":            "Grams",
    "HarvestName":             "Blue Dream | 05/21/2026 | MB | Auto"
  }
]
```

Field mapping is identical to §2.6 (`DryingRoom` is called `Room` in the manicure endpoint).

---

### 2.8 Plant Waste

**Endpoint:** `POST /plantbatches/v2/waste?licenseNumber={license}`

**Trigger:** `cv_plant_waste_trim_events` where `metrc_sync_status = 'pending'` AND
`waste_status = 'disposed'`. Waste cannot be reported to METRC until it has been disposed
(has a `disposed_at` timestamp and `disposition` value). The worker polls for disposed-but-unsynced
waste trim records.

**Source data:**

```sql
SELECT
  wte.waste_trim_id,
  wte.batch_id,
  wte.trimmed_at,
  wte.wet_weight,
  wte.weight_unit,
  wte.trim_reason,
  wte.disposed_at,
  wte.disposition,
  wte.notes,
  b.metrc_plant_batch_uid
FROM cv_plant_waste_trim_events wte
JOIN cv_batches b ON b.batch_id = wte.batch_id
WHERE wte.metrc_sync_status = 'pending'
  AND wte.waste_status = 'disposed'
ORDER BY wte.trimmed_at ASC
```

**METRC payload structure:**

```json
[
  {
    "PlantBatchName":          "Blue Dream | 05/21/2026 | Auto",
    "WasteMethodName":         "Compost",
    "WasteMaterialMixed":      false,
    "WasteWeight":             45.0,
    "WasteUnitOfMeasureName":  "Grams",
    "WasteReasonName":         "Plant Material",
    "Notes":                   "Defoliation - lower canopy fan leaves",
    "ActualDate":              "05/21/2026"
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `PlantBatchName` | `cv_batches.metrc_plant_batch_uid` | Batch name string |
| `WasteMethodName` | Mapped from `disposition` | `"composted"` → `"Compost"`, `"incinerated"` → `"Incineration"`, otherwise `"Other"` |
| `WasteMaterialMixed` | `false` | We track per-product; waste is not mixed materials |
| `WasteWeight` | `wet_weight` | |
| `WasteUnitOfMeasureName` | Mapped from `weight_unit` | `"g"` → `"Grams"`, etc. |
| `WasteReasonName` | `"Plant Material"` | Standard reason for cultivation waste trim |
| `Notes` | `trim_reason` + `trim_reason_notes` | Concatenated: `"defoliation: lower canopy fan leaves"` |
| `ActualDate` | `formatMetrcDate(disposed_at)` | Date of disposal, NOT date of trim |

**Response handling:** HTTP 200 on success. Set `metrc_sync_status = 'synced'`, update
`waste_status = 'reported'`, set `metrc_synced_at = NOW()`.

---

### 2.9 Plant Destruction (Loss Events)

**Endpoint:** `POST /plantbatches/v2/destroy?licenseNumber={license}`

**Trigger:** `cv_plant_loss_events` where `metrc_sync_status = 'pending'`.

**Source data:**

```sql
SELECT
  ple.loss_id,
  ple.batch_id,
  ple.occurred_at,
  ple.loss_type,
  ple.loss_cause,
  ple.plant_count,
  ple.metrc_plant_tag,
  ple.notes,
  b.metrc_plant_batch_uid
FROM cv_plant_loss_events ple
JOIN cv_batches b ON b.batch_id = ple.batch_id
WHERE ple.metrc_sync_status = 'pending'
ORDER BY ple.occurred_at ASC
```

**METRC payload structure:**

```json
[
  {
    "PlantBatchName":  "Blue Dream | 05/21/2026 | Auto",
    "DestroyedCount":  1,
    "DestroyedNote":   "Root rot — removed per IPM protocol",
    "DestroyedDate":   "05/21/2026"
  }
]
```

Field mapping:

| METRC field | Our source | Notes |
|-------------|-----------|-------|
| `PlantBatchName` | `cv_batches.metrc_plant_batch_uid` | Batch name string |
| `DestroyedCount` | `cv_plant_loss_events.plant_count` | Usually 1 |
| `DestroyedNote` | `loss_type` + `": "` + `loss_cause` + optional `notes` | e.g. `"death_disease: root rot"` |
| `DestroyedDate` | `formatMetrcDate(occurred_at)` | Date of loss |

**Response handling:** HTTP 200 on success. Set `metrc_sync_status = 'synced'` and
`metrc_synced_at = NOW()` on the `cv_plant_loss_events` row.

---

### 2.10 Summary: Tables with metrc_sync_status

| Table | Field | Current state | Phase 4 action |
|-------|-------|--------------|----------------|
| `cv_batch_phase_history` | `metrc_sync_status` | Present | Use as-is |
| `cv_batch_location_history` | `metrc_sync_status` | Present | Use as-is |
| `cv_plant_harvest_events` | `metrc_sync_status` | Present | Use as-is |
| `cv_plant_waste_trim_events` | `metrc_sync_status` | Present | Use as-is |
| `cv_plant_loss_events` | `metrc_sync_status` | Present | Use as-is |
| `cv_applications_fertigation` | — | **Missing** | Add in migration 016 |
| `cv_applications_foliar` | — | **Missing** | Add in migration 016 |
| `cv_applications_pesticide` | — | **Missing** | Add in migration 016 |
| `cv_container_amendments` | — | **Missing** | Add in migration 016 |
| `cv_metrc_sync_log` | — | Present (audit log) | Use as-is |

---

## Section 3: Sync Architecture Design

### Sync Queue Model

The `metrc_sync_status` field on each event table IS the queue. No separate queue table is
needed. The worker polls by querying for records where `metrc_sync_status = 'pending'` in
chronological order.

The `cv_metrc_sync_log` table is the **full audit trail** — every API call is logged there
regardless of outcome, with payload and response stored as JSON text.

### Worker Design

The sync worker runs as a separate Node.js process (`src/sync/metrc-worker.ts`). It is NOT
part of the main Fastify application — it runs alongside it as a separate process managed by
the Railway deployment configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│ Sync Worker Process (metrc-worker.ts)                           │
│                                                                 │
│  ┌────────────┐   poll every    ┌──────────────────────────┐   │
│  │ PollLoop   │  15 min (idle)  │ SyncQueue                │   │
│  │            │─────────────►   │  Phase history pending   │   │
│  │ or on DB   │  or triggered   │  Location moves pending  │   │
│  │ NOTIFY     │  by new inserts │  Harvest events pending  │   │
│  └────────────┘                 │  Waste trim pending      │   │
│                                 │  Plant loss pending      │   │
│                                 │  Additive records pending│   │
│                                 └──────────────────────────┘   │
│                                           │                     │
│                                  process in order:             │
│                              1. batch creation / phase         │
│                              2. location moves                 │
│                              3. harvest batch creation         │
│                              4. harvest plant events           │
│                              5. additives                      │
│                              6. waste + loss                   │
│                                           │                     │
│                                  ┌────────▼────────┐           │
│                                  │  METRC API      │           │
│                                  │  (HTTP calls)   │           │
│                                  └────────┬────────┘           │
│                                           │                     │
│                              ┌────────────▼────────────┐       │
│                              │  cv_metrc_sync_log      │       │
│                              │  + update source record │       │
│                              └─────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Sync Ordering Invariant

METRC requires events to arrive in the correct dependency order:

1. **Batch creation** — batch must exist in METRC before any other submissions for it
2. **Phase changes** — must be submitted in chronological order per batch
3. **Location moves** — chronological order per batch
4. **Harvest batch creation** — must exist before harvest plant events
5. **Harvest plant events** (final + partial) — after harvest batch creation
6. **Additives** — independent; can be submitted in any order relative to phase/location
7. **Waste and loss** — independent

The worker must check dependencies before submitting. If batch creation is pending, defer all
downstream events for that batch until batch creation succeeds.

### Poll Interval and Triggering

| Mode | Interval | Notes |
|------|---------|-------|
| Idle poll | Every 15 minutes | When no pending records exist |
| Active sync | Runs continuously until queue drained | When pending records exist |
| On-demand | Via API endpoint `POST /api/admin/metrc/sync` | Operator triggers from UI |

In Phase 4, the Railway deployment runs the worker as a separate "worker" Dyno/service. It
connects to the same SQLite database file as the main app (shared filesystem via Railway
volume).

### Retry Strategy

```
Attempt 1:  immediate
Attempt 2:  wait 30 seconds
Attempt 3:  wait 2 minutes
Attempt 4+: mark metrc_sync_status = 'failed', surface as action item
```

Failure conditions and handling:

| HTTP Status | Error type | Handling |
|-------------|-----------|---------|
| 200 | Success | Mark synced, log |
| 400 | METRC validation error | Mark `failed`, log METRC error message, surface to operator |
| 401 | Auth failure | Pause all sync, alert operator via `cv_metrc_sync_log` error entry |
| 404 | Resource not found | Mark `failed`, log — likely missing METRC dependency |
| 429 | Rate limit | Exponential backoff: 5s, 10s, 20s, 40s |
| 500 | METRC server error | Retry with backoff |
| Network error | Connection failed | Retry with backoff; never mark `failed` on network errors alone |

### Processing Failed Records

Failed records (`metrc_sync_status = 'failed'`) are surfaced in the admin sync dashboard.
Operators can:
1. Review the error (stored in `cv_metrc_sync_log.error`)
2. Fix the underlying data if possible
3. Manually reset `metrc_sync_status = 'pending'` to re-queue via the admin UI

### The "Processing" Intermediate State

To prevent double-submission on worker restart, the worker uses an intermediate state:

```
pending → processing  (worker claims the record atomically before API call)
processing → synced   (on HTTP 200)
processing → failed   (on final retry exhaustion)
processing → pending  (on worker crash — records reset to 'pending' on startup)
```

This requires adding `'processing'` to the valid `metrc_sync_status` enum values. Records
stuck in `'processing'` for >10 minutes are reset to `'pending'` at worker startup.

The intermediate state transition uses a SQLite transaction with row-level locking semantics:

```typescript
const claimed = db.prepare(`
  UPDATE cv_plant_harvest_events
  SET metrc_sync_status = 'processing'
  WHERE harvest_event_id = ?
    AND metrc_sync_status = 'pending'
`).run(eventId);

if (claimed.changes === 0) {
  // Another worker claimed it — skip
  continue;
}
```

### Sync Dashboard (Admin UI — Phase 4)

A new admin page at `/admin/metrc-sync` showing:
- Counts by status: pending / synced / failed / not_required per event type
- Failed records with METRC error messages and a "Retry" button
- Last sync timestamp and health indicator
- Manual "Sync Now" trigger button
- Log view: last 100 `cv_metrc_sync_log` entries

---

## Section 4: Credentials and Security

### Environment Variables

All METRC credentials are stored as environment variables — never in the database, never
in code, never in `.env` files checked into version control.

| Variable | Description | Required for |
|----------|-------------|-------------|
| `METRC_USER_API_KEY` | METRC user API key for Fairwater Farm | All API calls |
| `METRC_SOFTWARE_API_KEY` | METRC software vendor API key | All API calls |
| `METRC_FACILITY_LICENSE` | MN OCM facility license number | All endpoint requests |
| `METRC_BASE_URL` | Base URL (prod vs sandbox) | Defaults to `https://api-mn.metrc.com` |
| `METRC_SANDBOX_MODE` | `"true"` to use sandbox URL override | Dev/test environments |

Set these in the Railway environment configuration per-service (main app + worker service
each need the credentials in their respective environments).

### Key Rotation

METRC user API keys can be rotated from the METRC portal. When rotated:
1. Update `METRC_USER_API_KEY` in Railway environment configuration
2. Redeploy the worker service
3. In-flight sync operations will fail once (401), then succeed after redeploy

Software API keys do not rotate on a regular schedule.

### Logging Security

All `cv_metrc_sync_log` entries store:
- `payload` — the full JSON body sent to METRC (includes product names, batch names, weights)
- `response` — the METRC response body

These fields do NOT contain API credentials (credentials are only in HTTP headers, which
are not logged). The sync log is an internal compliance trail.

```typescript
// Correct — no credentials in log
await db.prepare(`
  INSERT INTO cv_metrc_sync_log (sync_type, batch_id, related_id, synced_at, status, payload, response)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(syncType, batchId, relatedId, new Date().toISOString(), status,
       JSON.stringify(payload), JSON.stringify(response));
```

### Test Connection Endpoint

```
POST /api/admin/metrc/test-connection
```

Returns `{ connected: true, facility: "...", license: "..." }` or `{ error: "..." }`.
Used by the admin UI to verify credentials are correct before Phase 4 goes live.
Implemented by calling `GET /facilities/v2?licenseNumber={license}` and checking the response.

---

## Section 5: Implementation Phases

Phase 4 is divided into 7 implementation steps. Each step is independently deployable.
Steps 1–2 are infrastructure; steps 3–7 are per-event-type.

### Step 1: Credentials + Test Connection

**Deliverables:**
- Environment variable configuration in Railway (prod + sandbox)
- `src/sync/metrc-client.ts` — HTTP client wrapper with Basic Auth, rate limit handling,
  retry logic, and request/response logging to `cv_metrc_sync_log`
- `POST /api/admin/metrc/test-connection` endpoint
- Test connection UI on the admin page

**Acceptance criteria:**
- `metrc-client.ts` exports `metrcPost(path, payload)` returning `{ ok, status, body, error }`
- All calls log to `cv_metrc_sync_log`
- Test connection endpoint returns 200 with facility data when credentials are valid
- Test connection endpoint returns 400 with METRC error when credentials are invalid

### Step 2: Sync Worker Infrastructure

**Deliverables:**
- Migration `016_additive_sync.ts` — adds `metrc_sync_status` (default `'pending'`),
  `metrc_synced_at` to `cv_applications_fertigation`, `cv_applications_foliar`,
  `cv_applications_pesticide`, `cv_container_amendments`; adds `'processing'` to the valid
  status set (documented in column comments)
- `src/sync/metrc-worker.ts` — poll loop, dependency-order processing, retry logic, worker
  startup reset of stuck `'processing'` records
- Railway `worker` service configuration (separate process, same volume mount)
- Admin sync dashboard at `/admin/metrc-sync` (counts, failed records, last sync time, manual trigger)

**Acceptance criteria:**
- Worker starts cleanly with no pending records (logs "Sync worker idle")
- Worker resets `'processing'` records to `'pending'` on startup
- Rate limit (429) triggers exponential backoff
- Auth failure (401) halts sync and logs an alert entry

### Step 3: Plant Batch Creation Sync

**Deliverables:**
- Sync handler for `cv_batches` where `metrc_plant_batch_uid IS NULL`
- Idempotency check via `GET /plantbatches/v2/active`
- Stores returned batch name in `metrc_plant_batch_uid`
- Updates corresponding `cv_batch_phase_history` initial row to `synced`

**Acceptance criteria:**
- New batch syncs to METRC within one poll cycle
- Duplicate creation is detected and skipped (idempotency)
- `metrc_plant_batch_uid` is set after successful sync

### Step 4: Phase Change and Location Move Sync

**Deliverables:**
- Sync handler for `cv_batch_phase_history` where `to_status IN ('field-veg', 'field-flower')`
  and `metrc_sync_status = 'pending'`
- Sync handler for `cv_batch_location_history` where `metrc_sync_status = 'pending'`
- Dependency check: batch must be synced first

**Acceptance criteria:**
- `cult-hoop → field-veg` triggers Immature → Vegetative submission
- `field-veg → field-flower` triggers Vegetative → Flowering submission
- Other transitions remain `not_required` or `synced`
- Location moves trigger Move Plants submission when `from_metrc_name ≠ to_metrc_name`

### Step 5: Record Additives Sync

**Deliverables:**
- Sync handler for all four application tables where `metrc_sync_status = 'pending'`
- Farmstock API integration for product name/EPA/manufacturer lookup
- Recipe ingredient expansion for fertigation applications
- `AdditiveType` mapping logic

**Acceptance criteria:**
- Fertigation application expands to N additive records (one per ingredient)
- Pesticide application includes `EPARegistrationNumber` from farmstock
- Farmstock unavailability defers sync with retry (does not permanently fail)
- `'processing'` intermediate state prevents double-submission

### Step 6: Harvest Sync

**Deliverables:**
- Sync handler for `cv_harvest_batches` where `metrc_harvest_batch_uid IS NULL`
- Sync handler for `cv_plant_harvest_events` where `event_type = 'final_harvest'`
  and `metrc_sync_status = 'pending'` (depends on harvest batch creation)
- Sync handler for `cv_plant_harvest_events` where `event_type = 'partial_harvest'`
  and `metrc_sync_status = 'pending'` (depends on manicure batch creation)
- Untagged plant detection: surface plants with `metrc_plant_tag IS NULL` as blockers

**Acceptance criteria:**
- Harvest batch is created in METRC before plant harvest events are submitted
- Final harvest events submit to `harvestplants`; partial harvest to `manicureplants`
- Untagged plants block sync and surface as action items in the sync dashboard
- Batch `metrc_harvest_batch_uid` is populated after successful creation

### Step 7: Waste and Loss Sync

**Deliverables:**
- Sync handler for `cv_plant_waste_trim_events` where `waste_status = 'disposed'`
  and `metrc_sync_status = 'pending'`
- Sync handler for `cv_plant_loss_events` where `metrc_sync_status = 'pending'`

**Acceptance criteria:**
- Waste trim only syncs after `disposed_at` is set and `waste_status = 'disposed'`
- Plant loss events sync immediately (no disposal prerequisite)
- `waste_status` transitions to `'reported'` after successful METRC sync

---

## Section 6: Reconciliation

Once sync is live, drift can occur between our database and METRC (manual METRC edits, sync
failures, rejected submissions). A reconciliation report compares state.

### Reconciliation Report (`GET /api/admin/metrc/reconciliation`)

For each active batch, compares:

| Check | Our data | METRC API source | Flag on mismatch |
|-------|---------|-----------------|-----------------|
| Batch exists in METRC | `metrc_plant_batch_uid IS NOT NULL` | `GET /plantbatches/v2/active` | Missing in METRC |
| Plant count | Active `cv_plant_assignments` count | METRC batch `Quantity` | Discrepancy |
| Current growth phase | `toMetrcPhase(status)` | METRC batch `GrowthPhase` | Phase mismatch |
| Active REI | `cv_applications_pesticide.rei_expires_at` | N/A (our data) | For reference only |
| Unsynced events | Count of `metrc_sync_status = 'pending'` | N/A | Action required |
| Failed events | Count of `metrc_sync_status = 'failed'` | N/A | Operator review |

The reconciliation report is an on-demand read — it calls METRC's read endpoints and compares
against our state. It does NOT write to METRC.

---

## Section 7: Testing Strategy

### Sandbox Environment

METRC provides a sandbox for integration testing that mirrors the production API:

| Item | Value |
|------|-------|
| Sandbox base URL | `https://sandbox-api-mn.metrc.com` |
| Credentials | Separate sandbox API keys issued by METRC — contact OCM for access |
| Data isolation | Sandbox data is completely separate from production; resets periodically |
| Facility | A test facility is provisioned with a test license number |

Set `METRC_SANDBOX_MODE=true` and configure `METRC_BASE_URL=https://sandbox-api-mn.metrc.com`
in the Railway staging environment.

### What Can Be Tested in Sandbox

| Submission type | Testable in sandbox? |
|----------------|---------------------|
| Create plant batch | Yes |
| Change growth phase | Yes |
| Move plant batches | Yes |
| Record additives | Yes |
| Create harvest batch | Yes |
| Harvest plants | Yes |
| Manicure plants | Yes |
| Plant waste | Yes |
| Plant destruction | Yes |
| Test connection / facility lookup | Yes |

### Integration Test Approach

**Unit tests (`src/tests/sync/`):**
- `metrc-client.test.ts` — stub `fetch`; test retry logic, 429 backoff, auth failure halt,
  request formatting, log insertion
- `sync-queue.test.ts` — test ordering invariant (batch before phase before harvest),
  dependency deferral, `'processing'` state transitions
- `additive-mapper.test.ts` — test `AdditiveType` mapping, recipe ingredient expansion,
  farmstock fallback behavior
- `payload-builders.test.ts` — test each payload builder function against known input/output

**Integration tests (against sandbox):**
These run in a separate test suite tagged `@sandbox` and require sandbox credentials:

```typescript
// vitest.config.ts: include sandbox tests only when METRC_SANDBOX_MODE=true
```

Sandbox test sequence (run in order — each step depends on the previous):
1. Create a test batch → verify it appears in METRC sandbox
2. Transition to field-veg → verify Vegetative phase in METRC
3. Log a fertigation application → verify additive record in METRC
4. Log a pesticide application → verify pesticide additive with EPA reg #
5. Create harvest batch → verify harvest batch in METRC
6. Record final harvest → verify harvest event in METRC
7. Record waste trim → verify waste record in METRC

**Local integration test (no sandbox credentials required):**
Use the existing `createTestContext()` helper with an in-memory SQLite and mock `fetch` to
simulate METRC responses:

```typescript
vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
  if (url.includes('/plantbatches/v2/createplantings')) {
    return new Response('[]', { status: 200 });
  }
  // ... per-endpoint mocks
});
```

This tests the full sync worker pipeline including DB state transitions without real METRC calls.

---

## Appendix A: METRC Payload Quick Reference

### Batch Name Format

```
Plant Batch:  "{Strain} | {MM/DD/YYYY} | {Auto|Photo}"
Harvest Batch: "{Strain} | {MM/DD/YYYY} | HB | {Auto|Photo}"
Manicure Batch: "{Strain} | {MM/DD/YYYY} | MB | {Auto|Photo}"
```

All three are produced by functions in `src/lib/domain-utils.ts`.

### Growth Phase Mapping

| Our status | METRC GrowthPhase |
|-----------|------------------|
| germ, seedling, cult-hoop | Immature |
| field-veg | Vegetative |
| field-flower, flush, harvest_window, harvesting | Flowering |
| closed | (no submission needed) |

### Weight Unit Mapping

| Our unit | METRC UnitOfWeight |
|----------|--------------------|
| `g` | `Grams` |
| `oz` | `Ounces` |
| `lb` | `Pounds` |
| `kg` | `Kilograms` |
| `mg` | `Milligrams` |

### AdditiveType Mapping

| Our category | METRC AdditiveType |
|-------------|-------------------|
| `fertilizer`, `foliar_nutrient` | `Fertilizer` |
| `pesticide`, `fungicide`, `biocontrol_pesticide` | `Pesticide` |
| `amendment`, `biocontrol_non_pesticide`, `plant_regulator`, `other` | `Other Additive` |

---

## Appendix B: Required Schema Changes for Phase 4

Migration `016_additive_sync.ts` must add these columns before Phase 4 implementation begins:

```typescript
// cv_applications_fertigation
table.text('metrc_sync_status').notNullable().defaultTo('pending');
table.text('metrc_synced_at').nullable();

// cv_applications_foliar
table.text('metrc_sync_status').notNullable().defaultTo('pending');
table.text('metrc_synced_at').nullable();

// cv_applications_pesticide
table.text('metrc_sync_status').notNullable().defaultTo('pending');
table.text('metrc_synced_at').nullable();

// cv_container_amendments
table.text('metrc_sync_status').notNullable().defaultTo('pending');
table.text('metrc_synced_at').nullable();
```

Default `'pending'` means existing records will appear as needing sync. For a clean Phase 4
rollout on an existing database with months of accumulated records, set the default to
`'not_required'` for historical records and use `'pending'` only for new records going forward.
Alternatively, batch-submit the historical records in a one-time migration run.

The migration must also add an index on `(metrc_sync_status)` for each of these tables to
support efficient worker polling. These indexes should be included in `016_additive_sync.ts`
alongside the column additions.

---

*Last updated: 2026-05-21. Maintained in version control. Implementation gates on Phase 1 stability.*
