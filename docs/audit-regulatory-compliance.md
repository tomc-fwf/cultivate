# Regulatory Compliance Gap Analysis

**Prepared:** 2026-05-21  
**Scope:** MN Statute 342.25, MN Rule 4770, MN Statute 18B.37, METRC, Data Retention, Business Rules  
**Source:** All 14 migration files + all 18 route files + docs/harvest-model.md + CLAUDE.md  
**Status:** Audit complete — findings are actionable against current codebase

---

## Executive Summary

The system captures far more compliance data than most cannabis cultivation software. The underlying schema is solid: all four application types are tracked with distinct tables, METRC sync status flows throughout, and PHI/REI/RUP enforcement is implemented in the API layer. Most of MN Statute 18B.37's pesticide requirements are met today.

However, five issues require remediation before the system can be considered fully compliant with MN Statute 342.25's cultivation record requirement and Business Rule 5's 5-year retention mandate:

1. **DELETE endpoints exist on compliance tables** — application records can be destroyed within 24 hours by admins.
2. **In-place PATCH edits overwrite original values** — no pre-edit snapshot is preserved, meaning the original quantity, timing, or EC reading is permanently lost.
3. **Fertigation recipe ingredients not expanded in exports** — the cultivation record shows "BASE recipe v1.2 at 100 gal" but not "12.5 tsp Fish Hydrolysate + 6.25 tsp Cal-Mag." Regulators cannot verify per-product quantities.
4. **Product names and EPA numbers live only in farmstock** — a compliance export generated when farmstock is unavailable degrades to "Input #12" for every product.
5. **Batch close does not automatically transition all containers to TEARDOWN** — containers in EMPTY state within a closing batch stay EMPTY in perpetuity.

Severity rankings follow: **CRITICAL** = non-compliant today; **HIGH** = would likely fail an audit; **MEDIUM** = best-practice gap or future-licensing concern.

---

## Section 1: MN Statute 342.25 — Cultivation Record Requirements

Statute 342.25 requires cultivation records per plant batch, retained for five years, documenting the quantity and timing of every pesticide, fertilizer, soil amendment, and plant amendment applied.

### 1.1 Fertigation (Fertilizer Applications)

| Requirement | Schema Status | UI Status | Export Status | Gap | Severity |
|---|---|---|---|---|---|
| Per-batch association | cv_applications_fertigation.batch_id (FK, required) | Batch picker on form | Included in cultivation record | None | — |
| Date and time of application | applied_at (text, required, UTC ISO) | Pre-filled to now, editable | Included | None | — |
| Applicator identity | applicator (FK → cv_users, **nullable in schema**) | Auto-set from auth token; not user-editable | Included (applicator_name join) | Schema allows NULL; cannot be NULL in practice due to requireAuth but DB has no NOT NULL constraint | LOW |
| **Per-product quantity** | recipe_id pinned to version; rate_value per ingredient in cv_fertigation_recipe_ingredients | Implicit via recipe card | **Cultivation record shows "BASE v1.2 at 100 gal" only — does NOT expand to per-ingredient quantities** | **Per-product quantity (e.g., "12.5 tsp Fish Hydrolysate") is NOT in the cultivation record or METRC additives export. Regulators cannot verify ingredient-level quantities without manual recipe calculation.** | **CRITICAL** |
| Lot number per product | Not captured — fertigation has no per-ingredient input_lot_id | Not shown | METRC additives export shows lot_number = null for fertigation | Lot tracking for fertilizer products is absent. Industry practice varies but MN Rule 4770 does not explicitly require lots for non-pesticide fertilizers. Risk is low unless auditor requests batch-level traceability to specific supply lots. | MEDIUM |
| EC and pH measured | ec_measured and ph_measured (both required, validated by Zod, NOT NULL equivalent) | Required fields with numeric keypad | Included as notes in METRC additives | None | — |
| Volume applied | volume_gallons (required) | Required field | Included | None | — |
| Recipe version at time of application | recipe_id is a FK to the specific version; recipes are immutable once approved | Shown in detail view | recipe_name + recipe_version in cultivation record | None | — |
| 5-year retention | No DELETE in schema after 24h lock; **but DELETE endpoint exists within 24h** | Records editable within 24h only | All records returned regardless of age | See Section 5 | HIGH |

**Summary for fertigation:** The most significant gap is recipe ingredient expansion. The system records that "BASE v1.2 was applied at 100 gallons" but not the quantity of each constituent product. To reconstruct per-product quantities requires a runtime join through cv_fertigation_recipe_ingredients × volume_gallons, which is currently not done in any export path.

---

### 1.2 Foliar Applications (Non-Pesticide)

| Requirement | Schema Status | UI Status | Export Status | Gap | Severity |
|---|---|---|---|---|---|
| Per-batch association | batch_id (required) | Batch picker | Included | None | — |
| Date and time | applied_at (required, UTC ISO) | Pre-filled | Included | None | — |
| Applicator identity | applicator (FK, nullable in schema; auto-set from auth) | Implicit | Included | Same low-severity nullable as fertigation | LOW |
| Purpose / why applied | purpose (TEXT, required in Zod schema) | Required field | Included | None | — |
| Target area (row/container) | row_id and container_id (both optional) | Optional pickers | Exported as location field | Granularity is optional — sub-zone-level applications with no row/container captured are legally sufficient | LOW |
| Product name | input_id references farmstock; not stored locally | Product picker (farmstock catalog) | Fetched from farmstock at export time; falls back to "Input #N" | Product name is runtime-dependent on farmstock availability | HIGH |
| Rate applied | rate_value + rate_unit (required when single-product, optional for recipe) | Required when single-product | Included | None | — |
| Volume applied | volume_applied + volume_unit (optional in schema) | Optional fields | Included when present | volume_applied is nullable — not enforced as required at API level | MEDIUM |
| Lot number | input_lot_id (nullable in schema) | Optional field | Not included in METRC additives export (lot_number = null) | Lot tracking for foliar is optional, not enforced | MEDIUM |
| PHI compliance flag | phi_compliant computed and stored | PHI banner shown; stage blocks enforced | Not surfaced in cultivation record JSON | phi_compliant value not included in cultivation record output | MEDIUM |

---

### 1.3 Soil Amendments (Container Amendments)

| Requirement | Schema Status | UI Status | Export Status | Gap | Severity |
|---|---|---|---|---|---|
| Container-scoped record | cv_container_amendments (correct table; batch_id set when applied during active batch) | Amendment entry form | Included in cultivation record via batch_id join | None — Business Rule 15 correctly implemented | — |
| Date and time | applied_at (required) | Pre-filled | Included | None | — |
| Applicator identity | applicator (FK, nullable; auto-set from auth) | Implicit | Included | Same LOW gap as above | LOW |
| Amendment type | amendment_type (required enum) | Type chips | Included | None | — |
| Product reference | input_id (references farmstock; nullable — allowed for "removed 1/3 media" actions) | Optional product picker | Falls back to amendment_type string when input_id is null | Null input_id is intentional for media removal actions; product-name dependency still applies when input_id is set | HIGH |
| **Purpose / why applied** | purpose (TEXT, **nullable** in schema and Zod) | Optional field | Included when present | **Purpose is not required for amendments despite being important context for audit reviews.** CLAUDE.md operational model cites "pH correction per Mar 2026 sample" as an expected value. | MEDIUM |
| Quantity applied | quantity (float, nullable) | Optional | Included when present | quantity nullable — acceptable for qualitative amendments | LOW |
| Lot number | input_lot_id (nullable) | Optional | Not exported | Not enforced | MEDIUM |

---

### 1.4 Pesticide Applications

| Requirement | Schema Status | UI Status | Export Status | Gap | Severity |
|---|---|---|---|---|---|
| Per-batch association | batch_id (required) | Batch picker | Included | None | — |
| Date and time | applied_at (required) | Pre-filled | **MDA report strips time (`slice(0, 10)`)** | **18B.37 requires date AND time. MDA report outputs date-only for pesticide applications.** | HIGH |
| Applicator name | applicator (FK, nullable in schema; auto-set from auth) | Implicit | Included (applicator_name join) | LOW nullable gap | LOW |
| Applicator license | applicator_license (optional in schema and Zod) | Optional field | Included in MDA report | License is only required for RUP today. 18B.37 requires it for all commercial applicators. Currently not applicable (operator unlicensed) but must be enforced once licensed. | MEDIUM |
| Product name | input_id references farmstock; not local | Product picker | Fetched from farmstock at export time; falls back to "Input #N" | Same farmstock dependency risk | HIGH |
| EPA registration number | stored in farmstock; not local | Shown on product card | Fetched from farmstock at export time; null if unavailable | Farmstock dependency — EPA reg # must be in export for 18B.37 compliance | HIGH |
| Target pest | target_pest (required, Zod enforced) | Required field | Included | None | — |
| Application site | sub_zone_id (via batch), row_id, container_id (optional) | Optional pickers | location field in MDA report | None | — |
| Rate applied | rate_value + rate_unit (both required, Zod enforced) | Required fields | Included | None | — |
| Total amount | volume_applied + volume_unit (both required, Zod enforced) | Required fields | Included | None | — |
| Total area treated | Not captured — no acreage or container-count-as-area field | Not in form | Not in MDA report | For container grows this is ambiguous. Container count or row count could serve. No explicit area field exists. | MEDIUM |
| Lot number | input_lot_id (required, NOT NULL via Zod — Business Rule 16 enforced) | Required field | Not included in MDA report | **input_lot_id is required at entry but NOT included in the MDA pesticide export output.** Auditors routinely ask which lot was applied. | HIGH |
| Wind speed | wind_speed_mph (required, Zod enforced) | Required field | Included | None | — |
| Wind direction | wind_direction (optional) | Optional field | Included | None | — |
| Temperature | ambient_temp_f (required, Zod enforced) | Required field | Included | None | — |
| PHI observed | phi_compliant computed and stored | PHI banner; override documented | phi_compliant included in MDA report | None | — |
| REI posted | rei_expires_at computed; rei_cleared_at/by tracked | REI modal on save; clear-REI endpoint | rei_expires_at included in MDA report | REI "posting" is digital only — no physical posting log or worker notification record | MEDIUM |
| Lot tracking (input_lot_id in export) | Not in MDA report output | — | Excluded from MDA CSV/JSON | **Must add input_lot_id to MDA report** | HIGH |

---

### 1.5 Cultivation Record Export (Feature 13)

The `GET /api/exports/cultivation-record/:batchId` route (exports.ts:358) generates a JSON document including:

- Batch metadata, phase history, location history, recipe history ✓
- All fertigation applications (recipe name + version; not ingredient details) ✗ (gap)
- All foliar applications ✓
- All pesticide applications (full MDA fields) ✓ (except ingredient lot)
- All container amendments (batch-scoped) ✓
- All observations ✓
- All harvest batches, harvest events, waste trim events ✓
- All plant assignments and plant losses ✓

**Format is JSON only.** No PDF generation is implemented. For regulatory handoff, a PDF is the expected deliverable. CLAUDE.md specifies "cultivate record designed for regulator handoff."

**The cultivation record does not expand fertigation recipe ingredients.** A regulator who runs this export will see:
```json
{ "recipe_name": "AUTO-FLOWER", "recipe_version": "1.1", "volume_gallons": 240 }
```
Not:
```json
{ "Fish Hydrolysate": "30 tsp (0.125 tsp/gal × 240 gal)", "Cal-Mag": "15 tsp ..." }
```

This fails the core purpose of 342.25: documenting the quantity of every fertilizer used.

---

## Section 2: MN Rule 4770 — Crop Input Tracking

Rule 4770 defines "crop input" broadly to include fertilizers, pesticides, fungicides, plant regulators, and similar materials. Required elements: type of input, product name, quantity used, date of application. Lot numbers are not explicitly required by 4770 for non-pesticide inputs.

### 2.1 Coverage by Input Class

| Input Class | 4770 Required Fields | Schema Captures | Gap |
|---|---|---|---|
| Fertigation (fertilizer) | Type, product name, quantity, date | Type (recipe), date, volume; quantity per product requires recipe expansion | Per-product quantity not in export. Product name from farmstock. |
| Foliar (foliar nutrient) | Type, product name, rate/quantity, date | Type captured, date, rate, volume (optional) | Product name from farmstock. Volume nullable. |
| Soil amendment | Type, product name, quantity, date | Amendment type, date, quantity (optional), purpose (optional) | Product name from farmstock. Quantity and purpose both nullable. |
| Pesticide | Type, product name, EPA reg #, quantity, date + full 18B.37 requirements | Full MDA fields captured | EPA reg # from farmstock at export time. |

### 2.2 Export Coverage

The METRC additives export (`GET /api/exports/metrc-additives`) covers all four types in a unified format. This export effectively serves a 4770-compliant crop input log, with the following caveats:

- **Fertigation**: product_name is the recipe name, not individual ingredients. Volume is total solution volume, not per-product quantity.
- **Foliar, pesticide, amendment**: product names fetched from farmstock at runtime. If farmstock is unavailable, names fall back to "Input #N".
- **No lot number for fertigation or foliar** in the export (lot_number = null for those rows).

### 2.3 4770-Compliant Report Availability

There is no dedicated "MN Rule 4770 Crop Inputs Report." The two existing exports (METRC additives + MDA pesticide) together approximate full 4770 coverage but have the ingredient-expansion and farmstock-dependency gaps documented above. A true 4770-compliant report would be a single document combining all four application types with expanded product-level detail.

---

## Section 3: MN Statute 18B.37 — Pesticide Application Records

18B.37 is the most prescriptive requirement. The table below maps each required field to our implementation.

| 18B.37 Field | cv_applications_pesticide Column | Captured | In MDA Export | Gap | Severity |
|---|---|---|---|---|---|
| Applicator name | applicator → cv_users.name (join) | Yes | Yes | None | — |
| Applicator license # | applicator_license (optional in schema) | Optional (required for RUP only) | Yes | License not required for non-RUP applications today. Future licensing changes this. | MEDIUM |
| **Date AND time** | applied_at (UTC ISO timestamp) | Yes | **Date only** (MDA report does `.slice(0,10)`) | **Time component stripped in MDA report.** 18B.37 requires time. Fix: use full applied_at in export. | HIGH |
| Product trade name | input_id → farmstock.items.name | Yes (runtime) | Yes (runtime from farmstock) | Falls back to "Input #N" if farmstock unavailable | HIGH |
| EPA registration # | input_id → farmstock.items.epa_reg_no | Yes (runtime) | Yes (runtime from farmstock) | Falls back to null if farmstock unavailable | HIGH |
| Pest targeted | target_pest (required, min 1 char) | Yes | Yes | None | — |
| Application method | application_method (required enum) | Yes | Yes | None | — |
| Rate applied (per unit) | rate_value + rate_unit (both required) | Yes | Yes | None | — |
| Total amount applied | volume_applied + volume_unit (both required) | Yes | Yes | None | — |
| **Lot number (product lot)** | input_lot_id (required in schema, stored) | Yes | **Not in MDA export** | input_lot_id is required at entry but excluded from the MDA report output. Must be added. | HIGH |
| Location / application site | sub_zone_id (via batch) + row_id/container_id (optional) | Partial (sub_zone is implicit via batch) | site field in export | Site is derived from batch sub_zone; explicit field name not captured | LOW |
| Crop/commodity | batch_id → strain.name | Yes | Yes (crop field) | None | — |
| Total area treated | Not implemented | Not in form | Not in MDA report | No area/acreage field exists. Cannabis container grows don't map cleanly to acres; container count would be a proxy. | MEDIUM |
| Wind speed | wind_speed_mph (required) | Yes | Yes | None | — |
| Wind direction | wind_direction (optional) | Optional | Yes | Optional per our implementation; 18B.37 requires it for commercial applicators | LOW |
| Ambient temperature | ambient_temp_f (required) | Yes | Yes | None | — |
| PHI observed | phi_compliant (computed and stored) | Yes | Yes | None | — |
| REI posted | rei_expires_at (computed) + rei_cleared_at/by | Yes | rei_expires_at in export | Physical REI "posting" not recorded; digital only | MEDIUM |

### 3.1 Applicator Source Verification

The pesticide route auto-sets `applicator = request.user.id` from the authenticated session. The `applicator_license` is a separate optional text field. There is no link between the user's profile and an official license number stored at the user level — each application requires the license to be re-typed. This is acceptable today (operator unlicensed) but creates data entry friction once licensed.

**Recommendation:** Add `applicator_license_number` to cv_users; auto-fill on pesticide forms; override per-application for unusual cases.

### 3.2 PHI Enforcement Chain

The PHI enforcement chain is correctly implemented:
1. `phi_days_operational` fetched from farmstock (not label PHI — Business Rule 18)
2. Stage-specific blocks from cv_input_phi_stage_overrides enforced as hard rejects
3. PHI non-compliance with override_notes documented in notes
4. `phi_compliant` boolean stored in the record for audit queries

The only gap is that `phi_compliant` is computed relative to `expected_harvest_date` which is supplied by the applicator. If no expected_harvest_date is provided and the batch has no harvest_date, `phi_compliant` is NULL (not computed). This means applications on batches with no estimated harvest date have no PHI compliance record.

### 3.3 REI Enforcement Chain

REI enforcement is correctly computed (`rei_expires_at = applied_at + rei_hours × 3600000`), stored, and surfaced:
- `GET /api/pesticide-applications?rei_active=1` returns all active REIs
- `POST /api/pesticide-applications/:id/clear-rei` records clearance with user and timestamp
- The REI status is visible in the cultivation record

The gap is enforcement — there is no API-layer check when a user enters a container or row with an active REI. REI enforcement is entirely UI-side (see UX audit findings). A bad actor or offline re-sync scenario could log work in an REI area without acknowledgment.

---

## Section 4: METRC Compliance

Minnesota requires all licensed cannabis cultivators to use METRC for plant and product tracking. Phase 1 of this application is manual-entry-assisted (exports for human entry) rather than API-integrated (Phase 4). This section audits whether we capture the fields required for each METRC event type, even if the push mechanism is not yet automated.

### 4.1 METRC Event Type Coverage

| METRC Event | Required Fields | Schema Captures | Sync Tracking | Export | Gap | Severity |
|---|---|---|---|---|---|---|
| **Create Immature Plant Batch** | Strain name, location, plant count, batch type (e.g., "Seed"), METRC batch name | cv_batches: strain_id, sub_zone_id, plant_count_initial, metrc_plant_batch_uid, metrc_name computed via `makeBatchName()` | cv_batch_phase_history.metrc_sync_status | No dedicated export; batch detail accessible via cultivation record | METRC batch UID required before harvest (CLAUDE.md Rule 6) — system warns but does not block batch creation. No export specifically formatted for METRC batch submission. | HIGH |
| **Change Growth Phase** (Immature → Vegetative → Flowering) | METRC batch UID, new phase, date | cv_batch_phase_history tracks all transitions; `toMetrcPhase()` maps statuses to METRC phases | metrc_sync_status per transition row | Not in any export — phase changes must be manually entered in METRC by operator | Phase mapping: germ/seedling/cult-hoop all resolve to "Immature" in METRC; field-veg → Vegetative; field-flower → Flowering. This is correct. But no METRC-formatted phase-change export exists. | HIGH |
| **Move Plants** (Change Location) | METRC batch UID, new METRC location name/UID, date | cv_batch_location_history with cv_locations.metrc_name per location; cv_locations seeded with METRC-mirrored names | metrc_sync_status per move | No dedicated export | cv_locations.metrc_uid is nullable and unpopulated (Phase 4). Location moves captured but METRC UIDs for locations not yet stored. | HIGH |
| **Record Additives** | Batch METRC UID, product name, EPA reg #, lot, amount, date, unit | All four application types fully captured | cv_metrc_sync_log (separate audit log, not per-record) | **`GET /api/exports/metrc-additives`** — unified CSV/JSON | METRC additives export exists and is usable. Gaps: per-record metrc_sync_status tracking is absent (only a global sync log table exists). No "mark as exported" mechanism per application record. | MEDIUM |
| **Manicure (Partial Harvest)** | METRC batch UID, date, weight, product type, harvest batch name | cv_plant_harvest_events (event_type=partial_harvest) + cv_harvest_batches (batch_type=manicure, metrc_name) | metrc_sync_status per harvest event | No dedicated METRC manicure export | metrc_harvest_batch_uid on harvest_batches is nullable (user must enter after METRC submission). No export formatted for METRC Manicure Batch submission. | HIGH |
| **Harvest** | METRC batch UID, date, weight, harvest batch name, strain | cv_plant_harvest_events (final_harvest) + cv_harvest_batches (batch_type=harvest, metrc_name) | metrc_sync_status per event | No dedicated METRC harvest export | Same as manicure. Additionally: aggregate wet weight per harvest batch is not pre-computed in any export — would need to be summed from plant_harvest_events. | HIGH |
| **Plant Waste / Destruction** | METRC tag ID, weight, reason, date, disposal method | cv_plant_waste_trim_events: trim_reason, wet_weight, waste_status lifecycle, disposition | metrc_sync_status per event | **No plant waste export exists** | **cv_plant_waste_trim_events has metrc_sync_status='pending' for all records but there is no export route for METRC plant waste submission.** Also: cv_plant_loss_events (mid-batch deaths) have metrc_sync_status tracked but also no dedicated export. | CRITICAL |
| **Assign Plant Tags** | Container METRC UID, plant tag METRC UID, date | cv_plant_assignments: metrc_plant_tag, placed_at, tagged_at (separate placement vs. tagging after migration 014) | No metrc_sync_status on cv_plant_assignments | No METRC tag assignment export | Plant tag assignments have no metrc_sync_status column. Tag assignments must be manually entered in METRC. No export to assist. | HIGH |

### 4.2 METRC Sync Infrastructure

- **cv_metrc_sync_log** exists as a global audit trail for METRC submissions. It tracks sync_type, status, payload, and response.
- **Per-record metrc_sync_status** is tracked on: cv_plant_loss_events, cv_plant_harvest_events, cv_plant_waste_trim_events, cv_batch_phase_history, cv_batch_location_history. Statuses are: pending | synced | failed | not_required.
- **Missing metrc_sync_status** on: cv_applications_fertigation, cv_applications_foliar, cv_applications_pesticide, cv_container_amendments. These are submitted via the METRC additives export but individual records have no sync tracking.
- **No sync dashboard** — there is no UI or API endpoint that surfaces all pending metrc_sync_status records for operator review and manual submission tracking.

---

## Section 5: Data Retention

### 5.1 Missing `updated_at` Columns

MN Statute 342.25 requires records to be retained for 5 years. If records are edited, the audit trail should reflect modification timestamps.

| Table | created_at | updated_at | Impact |
|---|---|---|---|
| cv_applications_fertigation | ✓ | **Missing** | Edits within 24h leave no modification timestamp |
| cv_applications_foliar | ✓ | **Missing** | Same |
| cv_applications_pesticide | ✓ | **Missing** | Same |
| cv_container_amendments | ✓ | **Missing** | Same |
| cv_observations | ✓ | **Missing** | Same |
| cv_plant_loss_events | ✓ | **Missing** | Same |
| cv_plant_assignments | ✓ | Missing | Unassignment updates but no updated_at |
| cv_teardown_events | ✓ | Missing | Checklist updates leave no modification record |
| cv_soil_samples | ✓ | Missing | Lab result updates not timestamped |
| cv_startup_events | ✓ | Missing | Sign-off updates not timestamped |
| cv_plant_harvest_events | ✓ | ✓ | OK |
| cv_plant_waste_trim_events | ✓ | ✓ | OK |
| cv_harvest_batches | ✓ | ✓ | OK |

All compliance application tables (fertigation, foliar, pesticide, amendments) are missing `updated_at`. When a record is PATCHed within the 24-hour window, there is no database-level record of when the edit occurred or what the original value was.

### 5.2 DELETE Endpoints on Compliance Tables

Business Rule 5 states: "No deletion of audit records. Mistakes get corrected via a follow-up entry with a corrects_id reference. Original record is preserved for the 5-year retention requirement."

The following DELETE handlers exist and **violate this rule**:

| Route | Handler | Condition | Status |
|---|---|---|---|
| `DELETE /api/fertigation-applications/:id` | Hard delete | Admin role + within 24h | **Violates Rule 5 / 342.25** |
| `DELETE /api/foliar-applications/:id` | Hard delete | Admin role + within 24h | **Violates Rule 5 / 342.25** |
| `DELETE /api/pesticide-applications/:id` | Hard delete | Admin role + within 24h | **Violates Rule 5 / 342.25** |
| `DELETE /api/observations/:id` | Hard delete | Admin role + within 24h | Observations are compliance-adjacent; LOW risk relative to applications |
| `DELETE /api/fertigation-recipes/:id` | Hard delete | Only if never used in applications | OK — unused recipes have no compliance impact |
| `DELETE /api/foliar-recipes/:id` | Hard delete | Only if never used in applications | OK — same rationale |

The four application DELETE routes should be removed entirely. The corrects_id pattern is already in the schema for all four application tables. Operators must use that pattern for corrections.

### 5.3 In-Place PATCH Edits Overwrite Original Values

All four application PATCH routes update records in-place within 24 hours. There is no pre-edit snapshot mechanism (no shadow table, no row versioning, no audit log row written before update). A modification to an EC reading, PHI override note, or wind speed measurement permanently overwrites the original value.

For a 5-year retention compliance system, this is a structural gap. The corrects_id pattern is the canonical fix: instead of PATCHing, the operator creates a new record referencing `corrects_id = original_id` with the corrected values, and the original is preserved.

Until PATCH is replaced by corrects_id workflows, the 24-hour edit window effectively provides a write hole in the compliance record.

### 5.4 corrects_id Pattern Coverage

| Table | corrects_id present | corrects_id in UI | Notes |
|---|---|---|---|
| cv_applications_fertigation | ✓ | No UI for correction entry | Schema ready; UI not built |
| cv_applications_foliar | ✓ | No UI | Same |
| cv_applications_pesticide | ✓ | No UI | Same |
| cv_container_amendments | ✓ | No UI | Same |

The corrects_id columns are in the schema but no UI flow exists to create a correction record. Until the PATCH workflows are replaced by correction-record creation, the corrects_id columns are unused.

### 5.5 Product Data Retention Risk

Product names, EPA registration numbers, PHI values, and REI hours are stored in farmstock, not in cultivate's database. The cultivation record and MDA report fetch these at export time via farmstock API calls. If farmstock is unavailable, all product names degrade to "Input #N" and EPA reg numbers become null.

For 5-year retention compliance, this means: a cultivation record from 2026 that needs to be produced in 2031 will only be complete if farmstock still exists and has not changed its item data. There is no snapshot mechanism.

**Minimum mitigation:** At the time an application is saved, denormalize and store the product name and EPA reg # in the application record. This ensures the cultivation record is self-contained at the time of the regulated event, regardless of future farmstock changes.

---

## Section 6: Business Rules Enforcement Audit

Cross-reference of all 51 business rules from CLAUDE.md against route and schema implementations.

| Rule | Description (abbreviated) | Status | Notes |
|---|---|---|---|
| 1 | Recipes immutable once approved; new versions via POST /:id/version | **ENFORCED** | Versioning logic in fertigation-recipes.ts and foliar-recipes.ts |
| 2 | Sub-zones are permanent identifiers | **ENFORCED** | Seeded via migration 002; no modification routes |
| 3 | Container ID pattern Z{zone}-{sub}-R{row}-C{container} | **ENFORCED** | Generated by seed migration; validated in scanner |
| 4 | Every application must capture applicator/observer | **PARTIAL** | applicator auto-set from auth (userId), so functionally always captured; but DB column is nullable — no NOT NULL constraint. If row inserted directly to DB bypassing API, applicator would be NULL. |
| 5 | No deletion of audit records | **NOT ENFORCED** | DELETE endpoints exist on 3 application tables (admin + 24h window). Also, in-place PATCH overwrites without audit trail. |
| 6 | METRC UID optional at creation, required before harvest | **PARTIAL** | batches.ts warns in GET enrichBatch if no METRC UID; harvest route does not verify METRC UID is set before allowing harvest event creation. |
| 7 | All timestamps in UTC | **ENFORCED** | All applied_at/created_at stored as ISO-8601 UTC strings |
| 8 | Date math is calendar-day based (America/Chicago) | **ENFORCED** | domain-utils.ts formatMetrcDate uses America/Chicago; date-only fields use YYYY-MM-DD |
| 9 | EPA number = pesticide; auto-restrict category | **ENFORCED** | foliar-applications.ts and pesticide-applications.ts both check farmstock EPA reg number and redirect at 422 if mismatched |
| 10 | Product category effectively immutable | **ENFORCED** | Category lives in farmstock (source of truth); cultivate does not have a local category field on applications |
| 11 | EC and pH required on every fertigation application | **ENFORCED** | Zod schema: `ec_measured: z.number()`, `ph_measured: z.number()` — non-optional |
| 12 | Foliar applications require a purpose | **ENFORCED** | Zod schema: `purpose: z.string().min(1)` |
| 13 | Foliar cannot use pesticide-class products | **ENFORCED** | Farmstock EPA check in foliar-applications.ts returns 422 if product has epa_reg_no |
| 14 | Foliar applications enforce PHI for non-pesticide biologicals | **ENFORCED** | phi_compliant computed; stage blocks enforced as hard rejects in foliar route |
| 15 | Soil amendments are container-scoped, not batch-scoped | **ENFORCED** | cv_container_amendments is the correct table; plant_batch_id captured for context when active |
| 16 | Pesticide applications require input_lot_id | **ENFORCED** | Zod schema: `input_lot_id: z.number().int().positive()` — required |
| 17 | Pesticide require target_pest, ambient_temp_f, wind_speed_mph | **ENFORCED** | All three required in Zod PesticideCreateSchema |
| 18 | PHI uses phi_days_operational, not label PHI | **ENFORCED** | pesticide route reads phi_days_operational from farmstock item |
| 19 | Stage-specific PHI blocks are hard rejects | **ENFORCED** | Hard reject (422) on allowed=0 in both foliar and pesticide routes |
| 20 | REI must be enforced | **PARTIAL** | rei_expires_at computed and stored; clear-REI endpoint exists; but **no API check when entering an REI area** — enforcement is UI-only (flagged as CRITICAL in UX audit) |
| 21 | Applicator license required for RUP | **ENFORCED** | pesticide route: blocks if restricted_use=true and no license provided |
| 22 | MDA-ready, not MDA-required | **ENFORCED** | MDA export exists; UI notes unlicensed status |
| 23 | Multiple plants per container supported | **ENFORCED** | No unique constraint on (container_id, active); plants_per_container in schema |
| 24 | One active assignment per METRC tag | **ENFORCED** | tag-assignments.ts returns 409 if duplicate active tag |
| 25 | METRC tag format validation | **ENFORCED** | 24 alphanumeric regex in Zod AssignSchema |
| 26 | Tag-container desync detection | **PARTIAL** | API detects conflict at assignment; harvest route verifies via FinalHarvestForm UI visual check; no automated desync scan |
| 27 | Scan history is preserved | **NOT IMPLEMENTED** | No scan_history table. ContainerScanner.jsx does not log scans to any database table. Every scan is ephemeral. |
| 28 | Harvest requires container scan + visual tag verification | **PARTIAL** | FinalHarvestForm implements the visual last-4-digit check; not enforced at API layer — harvest event can be created via API without visual verification |
| 29 | No silent reassignment | **ENFORCED** | 409 returned if tag already assigned; explicit POST /reassign required |
| 30 | Container state constraints | **ENFORCED** | container-lifecycle.ts validates active/empty require batch; ready/startup require no batch |
| 31 | Container must be ready to receive new batch | **ENFORCED** | Planting plan commit rejects non-ready containers |
| 32 | Plant loss transitions container to EMPTY | **ENFORCED** | plant-loss.ts: transactional unassign + container state update |
| 33 | Mid-batch replacement is supported | **ENFORCED** | POST /plant-loss/replacements creates new assignment, empty→active |
| 34 | Batch close transitions ALL containers to TEARDOWN | **NOT IMPLEMENTED** | harvest.ts transitions the specific container of the final harvest. EMPTY containers from mid-batch losses within a closing batch remain in EMPTY state. Batch auto-close does not include a bulk container state update. |
| 35 | Teardown recommends soil sample | **PARTIAL** | Schema allows soil_sample_collected=false; route creates teardown record without requiring it; no warning flag surfaced |
| 36 | Startup amendments reference driving soil sample | **PARTIAL** | StartupForm pre-populates prior_soil_sample_id suggestion; not enforced at API layer |
| 37 | Container ready requires sign-off | **ENFORCED** | startup-ready endpoint requires supervisor role; ready_sign_off_at + by required |
| 38 | Container history is permanent | **ENFORCED** | All container lifecycle tables are append-only |
| 39 | Plant loss records require METRC sync tracking | **PARTIAL** | metrc_sync_status='pending' set on creation; no sync infrastructure yet; no dashboard to surface pending losses |
| 40 | plant_count_current is derived, not edited | **ENFORCED** | enrichBatch() computes from active assignment count; no direct edit endpoint |
| 41 | Harvest-ready is batch-level state | **ENFORCED** | harvest_readiness observations are per-container evidence; batch transition is separate management action |
| 42 | harvest_window → harvesting logged but not gated | **ENFORCED** | TransitionSchema requires notes for harvesting transition; no approval queue |
| 43 | Harvest events require harvesting status | **ENFORCED** | harvest.ts checks batch status before writing harvest event |
| 44 | Partial harvest leaves plant alive | **ENFORCED** | partial_harvest does not trigger unassignment or container state change |
| 45 | Final harvest kills the plant | **ENFORCED** | Transactional: unassign + container → teardown + batch auto-close check |
| 46 | Harvest must complete within 1–2 days | **NOT ENFORCED** | No date range enforcement on harvest batches; a harvest batch can theoretically remain in_progress indefinitely |
| 47 | Weather events force-close harvest batch | **ENFORCED** | POST /harvest/batches/:id/force-close implemented; creates new sequence_number batch |
| 48 | Batch closes automatically when all plants final-harvested | **ENFORCED** | Auto-close logic in harvest.ts final_harvest handler |
| 49 | Waste trim is independent of harvest status | **ENFORCED** | waste trim route accepts any batch status |
| 50 | Waste trim requires wet weight and reason | **ENFORCED** | Zod WasteTrimCreateSchema: wet_weight and trim_reason required |
| 51 | Harvest and waste trim are peer event types | **ENFORCED** | Separate tables with optional cross-reference via harvest_event_id |

**Summary:**
- **ENFORCED**: 1, 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 29, 30, 31, 32, 33, 37, 38, 40, 41, 42, 43, 44, 45, 47, 48, 49, 50, 51 — **39 rules**
- **PARTIAL**: 4, 6, 20, 26, 28, 35, 36, 39 — **8 rules**
- **NOT IMPLEMENTED**: 5, 27, 34, 46 — **4 rules**

---

## Section 7: Prioritized Remediation Plan

### CRITICAL — Non-compliant Today

These findings represent direct violations of MN Statute 342.25's cultivation record and 5-year retention requirements, or a gap that would prevent METRC submission.

---

**C1 — Remove DELETE endpoints from all compliance application tables**  
*Violates: MN Statute 342.25, Business Rule 5*

Files: `src/api/routes/fertigation-applications.ts` (DELETE /:id), `foliar-applications.ts` (DELETE /:id), `pesticide-applications.ts` (DELETE /:id)

These three DELETE handlers allow admin-role users to permanently destroy compliance records within 24 hours. Remove all three. The corrects_id pattern (columns already in schema) is the correct mechanism for corrections.

---

**C2 — Expand fertigation recipe ingredients in cultivation record and METRC additives export**  
*Violates: MN Statute 342.25 (quantity of every fertilizer used)*

File: `src/api/routes/exports.ts`

The cultivation record (line 413–421) and METRC additives export (line 187–201) both represent fertigation as "BASE recipe v1.2 at 100 gal" without expanding per-product quantities. Add a sub-query joining `cv_fertigation_recipe_ingredients` for each fertigation application row, computing `rate_value × volume_gallons` per ingredient. Both exports must emit per-product rows.

Example target output for one fertigation application:
```
Fertigation | 2026-05-21 14:30 | AUTO-FLOWER batch | Fish Hydrolysate (farmstock #3) | 12.5 tsp | lot: optional
Fertigation | 2026-05-21 14:30 | AUTO-FLOWER batch | Cal-Mag Pro | 6.25 tsp | lot: optional
```

---

**C3 — Snapshot product name and EPA registration number at application save time**  
*Violates: MN Statute 342.25 5-year retention (product identity)*

Files: all four application route POST handlers

At the time a foliar, pesticide, or amendment application is saved, fetch the farmstock item and store `product_name_snapshot` and `epa_reg_no_snapshot` (for pesticides) in the application record. These fields do not exist in the current schema — a migration is required. This ensures the cultivation record is self-contained even if farmstock is unavailable or its catalog is modified.

Schema additions needed:
- cv_applications_foliar: `product_name_snapshot TEXT`
- cv_applications_pesticide: `product_name_snapshot TEXT`, `epa_reg_no_snapshot TEXT`
- cv_container_amendments: `product_name_snapshot TEXT`

---

**C4 — Implement METRC plant waste export**  
*Violates: METRC compliance for waste/destruction events*

File: `src/api/routes/exports.ts` (missing route)

`cv_plant_waste_trim_events` and `cv_plant_loss_events` both have metrc_sync_status='pending' for all records, but no export route exists for METRC plant waste submission. Add `GET /api/exports/metrc-waste` that aggregates both tables in METRC Waste Report format: plant METRC tag, batch UID, weight, reason, disposal method, disposal date. This is required before any waste can be reported to METRC manually.

---

**C5 — Auto-transition all containers to TEARDOWN on batch close**  
*Violates: Business Rule 34; creates zombie EMPTY containers*

File: `src/api/routes/harvest.ts` (auto-close logic); `src/api/routes/batches.ts` (transition handler)

When a batch auto-closes (last final_harvest recorded), or when an admin transitions a batch to 'closed', every container with `current_batch_id = batch_id` that is in EMPTY or ACTIVE state must transition to TEARDOWN. Currently, only the container of the final harvest event transitions; all EMPTY containers from mid-batch losses remain EMPTY after batch closure.

---

### HIGH — Would Likely Fail an Audit

**H1 — MDA pesticide report strips time from applied_at**  
File: `exports.ts` line 315: `application_date: String(r['applied_at'] ?? '').slice(0, 10)`. Change to include full timestamp or add a separate `application_time` field. 18B.37 requires date and time.

**H2 — input_lot_id missing from MDA pesticide report output**  
File: `exports.ts` line 311. The `output.map()` does not include `r['input_lot_id']`. Add `lot_id: r['input_lot_id'] ?? null` and include it in CSV columns. Auditors specifically ask which lot was applied.

**H3 — No METRC batch phase-change export**  
There is no export for METRC "Change Growth Phase" submissions. cv_batch_phase_history has all the data (from_status, to_status, transitioned_at, metrc_sync_status) but no export route formats it for METRC. Add `GET /api/exports/metrc-phases/:batchId`.

**H4 — No METRC plant tag assignment export**  
cv_plant_assignments has metrc_plant_tag, placed_at, tagged_at, container_id, batch_id but no metrc_sync_status column and no export route. METRC requires tag assignments to be submitted. Add metrc_sync_status to cv_plant_assignments (migration required) and add `GET /api/exports/metrc-tag-assignments`.

**H5 — No METRC harvest export**  
Harvest events are tracked in cv_plant_harvest_events with metrc_sync_status but there is no export route that aggregates and formats them for METRC harvest batch submission. Add `GET /api/exports/metrc-harvest/:batchId`.

**H6 — All compliance application tables missing updated_at**  
cv_applications_fertigation, cv_applications_foliar, cv_applications_pesticide, cv_container_amendments, cv_observations, cv_plant_loss_events are all missing `updated_at`. When PATCH edits occur (within 24h), there is no modification timestamp. Migrations required to add updated_at to these tables, and routes updated to set `updated_at = NOW()` on PATCH.

**H7 — METRC UID not verified before harvest event creation**  
Rule 6 states METRC UID is required before harvest. harvest.ts creates harvest events without checking `batch.metrc_plant_batch_uid IS NOT NULL`. Add this check: reject harvest event creation with 422 if batch has no METRC UID set.

**H8 — Cultivation record has no PDF output**  
The cultivation record (Feature 13, `/api/exports/cultivation-record/:batchId`) returns JSON only. For regulatory handoff, a signed PDF is expected. Phase 3 lists PDF generation — but this should be prioritized over Phase 3 given its compliance function.

---

### MEDIUM — Best Practice / Future Licensing Gaps

**M1 — In-place PATCH edits destroy original values; corrects_id workflow not implemented in UI**  
The 24h edit window is a compliance risk for 5-year retention. The corrects_id pattern is in the schema but no UI workflow creates correction records. Longer-term fix: replace PATCH handlers with a `POST /corrections` flow that creates a new record with corrects_id set.

**M2 — Scan history not logged (Rule 27)**  
ContainerScanner.jsx does not log scans to the database. Add a `cv_scan_history` table (container_id, scanned_at, scanned_by, result) and log every scan attempt from the backend when the container QR code resolves.

**M3 — Amendment purpose is nullable; should be required for compliance context**  
cv_container_amendments.purpose is TEXT nullable in schema and optional in Zod. Purpose captures the audit rationale for why an amendment was applied. Make it required (z.string().min(1)) — the applicator should always be able to provide a one-line reason.

**M4 — Applicator license not stored on user profile**  
Once the operation obtains a private applicator license, every pesticide application will need it. Add `applicator_license_number` to cv_users; auto-populate on pesticide form; allow per-application override. Eliminates re-typing friction.

**M5 — phi_compliant is NULL when no harvest date is set**  
If batch.harvest_date is NULL and no expected_harvest_date is provided on the pesticide application, phi_compliant stores NULL. This means no PHI compliance record for applications on batches without a harvest date estimate. Either require harvest_date on batches before pesticide applications are allowed, or explicitly store phi_compliant=null with a documented reason.

**M6 — No "exported" tracking on METRC additives export**  
CLAUDE.md Feature 11 specifies that the METRC additives export "marks records as exported with timestamp." This is not implemented. When the same application is exported multiple times, there is no record of when it was first submitted to METRC. Add a `metrc_exported_at` column to cv_applications_fertigation, cv_applications_foliar, cv_applications_pesticide, cv_container_amendments, or use a separate metrc_export_log table.

**M7 — No total area treated field for pesticide applications**  
MN Statute 18B.37 requires total area treated. For a container grow, this could be expressed as container count (derived from row_id or container_id) or sub-zone area. Currently no field captures this. Even a derived field in the MDA export (container count from row × plants, or total pot count in sub_zone) would satisfy the requirement.

**M8 — REI enforcement is UI-only**  
The API permits recording any application against a container with an active REI without enforcement. Add a check to foliar-applications.ts and pesticide-applications.ts: if container_id is provided and that container has an active pesticide application with rei_expires_at > NOW() and rei_cleared_at IS NULL, warn or block (configurable).

---

## Appendix: Cross-Reference Index

| Finding | Statute / Rule | Route File | Schema Table |
|---|---|---|---|
| C1 — DELETE on compliance tables | 342.25, Rule 5 | fertigation-applications.ts, foliar-applications.ts, pesticide-applications.ts | — |
| C2 — Recipe ingredient expansion | 342.25 | exports.ts | cv_fertigation_recipe_ingredients |
| C3 — Product name snapshot | 342.25 | All application POST routes | cv_applications_* (migration needed) |
| C4 — METRC plant waste export | METRC | exports.ts (missing route) | cv_plant_waste_trim_events, cv_plant_loss_events |
| C5 — Batch close container teardown | Rule 34 | harvest.ts, batches.ts | cv_container_state |
| H1 — MDA report time stripped | 18B.37 | exports.ts:315 | cv_applications_pesticide |
| H2 — Lot # missing from MDA report | 18B.37 | exports.ts:311 | cv_applications_pesticide |
| H3 — No METRC phase change export | METRC | exports.ts (missing route) | cv_batch_phase_history |
| H4 — No METRC tag assignment export | METRC | exports.ts (missing route) | cv_plant_assignments |
| H5 — No METRC harvest export | METRC | exports.ts (missing route) | cv_plant_harvest_events |
| H6 — Missing updated_at on application tables | 342.25 | All PATCH routes | cv_applications_* (migrations needed) |
| H7 — METRC UID not verified before harvest | Rule 6, METRC | harvest.ts | cv_batches |
| H8 — No PDF cultivation record | 342.25 | exports.ts | — |
