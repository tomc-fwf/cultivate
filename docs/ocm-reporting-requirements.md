# OCM Reporting Requirements — Inspection Readiness Analysis

**Prepared:** 2026-05-21  
**Scope:** Minnesota OCM cultivation inspection scenarios, MDA pesticide inspection, METRC reconciliation, report specifications, dashboard design, and compliance gap analysis  
**Source:** MN Statute 342.25, MN Rule 4770, MN Statute 18B.37, METRC requirements, all 14 migration files, all route files, docs/audit-regulatory-compliance.md  
**Status:** Design specification — ready for implementation planning

---

## Executive Summary

The system is architecturally sound for OCM compliance: every event type that regulators would ask about has a table, every application record carries the applicator identity and timestamp, and the four-class application model correctly separates pesticides from other inputs. The data is there.

The readiness gaps are in **how quickly that data can be surfaced and in what format**. An OCM inspector arriving unannounced expects answers within minutes, not hours. Today the system has the raw data but lacks:

1. A real-time compliance dashboard that answers "are we clean right now?"
2. Several required report formats (METRC phase changes, plant waste, PDF cultivation record)
3. Full on-the-record product detail (recipe ingredients not expanded in exports)
4. Snapshot product data independent of farmstock availability

This document defines exactly what the inspector would ask for, what reports must be producible, how fast, and where the gaps are. The companion document `docs/audit-regulatory-compliance.md` provides code-level remediation for the underlying gaps; this document is the requirements specification.

---

## Section 1: Regulatory Reporting Framework

### 1.1 MN Statute 342.25 — Cultivation Record Requirements

**Governing body:** Minnesota Office of Cannabis Management (OCM)  
**What it requires:**

Cultivation records per plant batch documenting the quantity and timing of every pesticide, fertilizer, soil amendment, and plant amendment applied. The statute requires records sufficient to reconstruct the full input history of any batch on demand.

| Element | Statutory Basis | Our Schema | Status |
|---|---|---|---|
| Identity of each crop input | "quantity and timing of every pesticide, fertilizer, soil amendment, or plant amendment used" | input_id → farmstock catalog | PARTIAL — farmstock dependency; no local name snapshot |
| Quantity applied | Per-product quantity for each application event | Fertigation: volume × recipe rate (not pre-computed); Others: rate_value + volume_applied | PARTIAL — fertigation requires ingredient expansion |
| Date and time of application | "timing" | applied_at (UTC ISO string, all tables) | ENFORCED |
| Applicator identity | Implied by record integrity requirements | applicator FK → cv_users on all application tables | ENFORCED in practice (auto-set from auth) |
| Per-batch organization | "per plant batch" | All application tables have batch_id FK | ENFORCED |

**Retention period:** 5 years from the date of the application event. Records must be available for inspection during this period. A record destroyed or irretrievably altered before 5 years constitutes a violation.

**Format requirements:** The statute does not specify a format (no "must be PDF" requirement). However, records must be:
- Legible and organized by batch
- Producible within a reasonable timeframe on inspector request (OCM guidance suggests same-day production for records ≤1 year old; a few days for older records)
- Sufficient for an inspector to independently verify what was applied without needing the operator to interpret them

**Who can request records:**
- OCM inspectors — primary requesters; authority to inspect records during any visit
- MN Department of Agriculture (MDA) — pesticide-specific records under 18B.37 and 18B.07
- Law enforcement — in investigation contexts
- OCM can compel production; refusal is a separate violation

**Production timeline:** No explicit statutory deadline, but OCM inspection guidance indicates records must be "immediately available" during an unannounced inspection for current batches. Historical records (>90 days) may be produced within 24 hours on written request.

**Implication for this system:** The cultivation record export (Feature 13) must be producible in under 60 seconds for any active batch. The operator should be able to walk into an inspection with a tablet, pull up the report, and hand it to the inspector or print it.

---

### 1.2 MN Rule 4770 — Crop Input Tracking

**Governing body:** OCM (rulemaking authority), MDA (pesticide enforcement subset)  
**What constitutes a "crop input":**

Minnesota Rule 4770 defines "crop input" broadly: any fertilizer, pesticide, fungicide, plant regulator, soil amendment, or other substance applied to or incorporated into cannabis plants or their growing media. This encompasses all four of our application classes.

**Required elements per application event under Rule 4770:**

| Field | Fertigation | Foliar | Soil Amendment | Pesticide |
|---|---|---|---|---|
| Type of input | Recipe name (acceptable) | Product category | Amendment type | "Pesticide" + product name |
| Product name | Per ingredient (not just recipe name) | Product name | Product name | Product name |
| Quantity used | Per-product quantity (rate × volume) | Rate + volume applied | Quantity + unit | Rate + volume |
| Date of application | applied_at | applied_at | applied_at | applied_at |
| Location/batch | Batch + sub-zone | Batch + row/container | Container | Batch + row/container |

**How records must be organized:** Rule 4770 does not specify exact format, but records must be retrievable by batch (to reconstruct a batch's complete input history) and by date range (to respond to "what did you apply in June?"). Both query patterns are supported by our schema.

**Lot number requirement:** Rule 4770 does not explicitly require lot-number tracking for non-pesticide inputs. However, 18B.37 requires lot numbers for pesticide applications. Industry best practice (and what an OCM inspector will expect) is to have lot tracking for at least pesticides and any product with an expiration date.

**What a 4770-compliant crop input log looks like:** A unified, date-ordered list of all inputs across all four classes for a given batch or date range. Grouped by application event, with product-level detail within each event (not just "BASE recipe"). The METRC Additives export approximates this but does not expand fertigation recipe ingredients — a gap.

---

### 1.3 MN Statute 18B.37 — Pesticide Application Records

**Governing body:** MN Department of Agriculture (Pesticide and Fertilizer Management Division)  
**Nature of requirement:** Pesticide application records under 18B.37 are the most prescriptive requirement in our regulatory stack. They are a point-in-time snapshot of each application event, captured at the moment of application.

**Full field-by-field requirements of MN Statute 18B.37:**

| 18B.37 Required Field | Our Column | Captured | Exported (MDA Report) | Gap |
|---|---|---|---|---|
| Applicator name | cv_users.name (join on applicator) | Yes | Yes | None |
| Applicator license number | applicator_license (optional) | Optional | Yes | Required for commercial applicators; currently unlicensed so not enforced |
| **Date and time of application** | applied_at (full ISO timestamp) | Yes | **Date only** (strips time) | MDA report exports date-only; 18B.37 requires time |
| Product trade name | farmstock.items.name (runtime fetch) | Runtime | Runtime | Falls back to "Input #N" if farmstock unavailable |
| EPA registration number | farmstock.items.epa_reg_no (runtime) | Runtime | Runtime | Same farmstock dependency |
| Pest targeted | target_pest (required, Zod-enforced) | Yes | Yes | None |
| Method of application | application_method (enum, required) | Yes | Yes | None |
| Rate of application (per unit) | rate_value + rate_unit (both required) | Yes | Yes | None |
| Total amount applied | volume_applied + volume_unit (required) | Yes | Yes | None |
| **Lot number of the product** | input_lot_id (required, stored) | Yes | **Not in MDA export** | Stored but excluded from MDA report output |
| Application site | sub_zone via batch; row_id/container_id optional | Partial | site field | Site derived from batch sub_zone implicitly |
| Crop/commodity | strain.name via batch | Yes | crop field | None |
| Total area treated | No field | No | No | No acreage/container-count field exists |
| Wind speed | wind_speed_mph (required, Zod-enforced) | Yes | Yes | None |
| Wind direction | wind_direction (optional) | Optional | Yes | Optional in our schema; required for commercial applicators |
| Temperature at time of application | ambient_temp_f (required, Zod-enforced) | Yes | Yes | None |
| Relative humidity | ambient_rh (optional) | Optional | Not exported | Minor gap; RH not required by 18B.37 but captured |
| PHI compliance observed | phi_compliant (computed, stored) | Yes | Yes | None |
| REI posted | rei_expires_at (computed), rei_cleared_at/by | Yes | rei_expires_at | Digital-only posting; no physical posting log |

**Who must keep records:** Any person who applies a pesticide to a crop. The record requirement applies to unlicensed applicators too — 18B.37 record-keeping is separate from the licensing requirement. Our operation must keep these records now even without a license.

**Reporting vs. record-keeping distinction:**
- **Record-keeping** (required now): records are maintained internally and produced on MDA inspection request
- **MDA reporting** (not currently required): for commercial applicators, certain applications must be reported to MDA annually. Since we are not a licensed commercial applicator, routine MDA reporting is not required. However, MDA can inspect our records at any time under 18B.07.

**Inspection triggers for MDA:**
- Routine annual survey (less common for small operations)
- Complaint from a neighboring property (drift concerns)
- Disease or pest outbreak in the region
- A product recall or registration action affecting products we use
- Referral from OCM after a compliance inspection

---

### 1.4 METRC — Real-Time State Tracking

**Governing body:** OCM (METRC is the required tracking system for MN licensed cannabis)  
**Nature of system:** METRC is a seed-to-sale tracking platform. All licensed Minnesota cannabis operations are required to use it. OCM has direct read access to METRC — they can see our plant counts, batch status, and submitted records without requesting them from us.

**What OCM can see directly in METRC (without asking us):**
- All plant batch records (batch name, plant count, creation date, strain)
- Current plant batch status and location (Immature / Vegetative / Flowering)
- Batch phase change history
- Harvest batch records and weights
- Plant destruction/waste events (submitted)
- Record Additives (crop inputs submitted to METRC)
- Tag assignments (if submitted via METRC)

**What OCM must request from the licensee (not in METRC):**
- PHI/REI compliance documentation
- Environmental conditions (temperature, wind speed) at time of pesticide application
- Applicator identity and license number
- Container-level observation history
- Soil sample records and lab results
- Teardown and startup event records
- The reasoning behind recipe changes or pesticide applications
- Photo documentation
- Internal batch notes and supervisor sign-offs

**The reconciliation expectation:** When an OCM inspector arrives, they will compare what METRC shows against what our system shows. Discrepancies are serious. They will ask:
- Does our plant count match METRC's plant count for each batch?
- Do the additives we submitted to METRC match what our system recorded?
- Are all waste events in METRC?
- Do batch phase change dates align?

**Our METRC sync status today (Phase 1 / manual entry):** 
- We have metrc_sync_status tracking on most event types
- No actual API connection — all METRC entries are manual
- Every `pending` sync_status record is a reconciliation discrepancy risk
- The current assumption is that the operator manually enters in METRC what we capture internally; if that is not happening, METRC and our system diverge

**METRC UID alignment:** Our system generates a `metrc_name` (e.g., "Northern Lights Auto | 03/15/2026 | HB | Auto") for each batch. This must exactly match the name entered in METRC. If the manual entry uses a different name format, the reconciliation will fail. The `metrc_plant_batch_uid` field must be populated with the exact METRC UID before harvest — currently not verified by the system at harvest time.

---

### 1.5 MDA — Separate Pesticide Enforcement Authority

**Governing body:** MN Department of Agriculture, Pesticide and Fertilizer Management Division  
**Relationship to OCM:** MDA and OCM are separate agencies with overlapping jurisdiction over cannabis pesticide use. OCM enforces the cannabis licensing framework; MDA enforces the Pesticide Control Law (MN Ch. 18B). An operation can be inspected by both agencies independently.

**MDA inspection triggers and what they look for:**

| Trigger | What MDA Examines |
|---|---|
| Routine survey | Random compliance check; pesticide application records, labels on file, SDS availability |
| Complaint (drift, odor) | Records for the specific date/time; weather conditions; REI documentation; product labels |
| Product incident or recall | Records for all applications of the recalled product |
| Unlicensed use of RUP | License verification; application records for the restricted-use product |
| Cross-referral from OCM | Full pesticide record for the inspection period |

**MDA-specific concerns beyond OCM:**
- **Restricted-use pesticides (RUP):** Only licensed applicators may apply RUPs. If an inspector finds an RUP was used and the applicator has no license, the violation is under MN Statute 18B.32 (unlicensed use), which carries per-application penalties.
- **Label compliance:** Every pesticide must be applied according to its label. An inspector may ask to see the label and verify the application rate and method match. If the product label says "outdoor use only" and we applied it in a hoop house, that's a label violation under FIFRA and 18B.
- **Worker protection:** REI documentation demonstrates worker protection compliance. If an inspector finds a worker entered an REI zone before the interval expired, that's a worker protection violation.
- **SDS availability:** Safety Data Sheets for every pesticide must be on-site and accessible to workers.

---

## Section 2: Inspection Scenario Analysis

### Scenario A: Routine OCM Cultivation Inspection

**Context:** An OCM compliance officer arrives unannounced. They have their inspection checklist. This scenario is the most important to be prepared for.

**What they will ask for, in the order they typically ask:**

---

**A1. Current Plant Inventory**

*Question:* "Show me all your active plant batches, how many plants are in each, what stage they're in, and where they're located."

*What we need to produce:* A Current Plant Inventory Report (see Section 3, Report 1) showing all active batches with: batch name, strain, sub-zone, current status, current plant count, METRC batch UID, and days in current stage. Must be producible in under 60 seconds.

*Current system capability:* All batch data is available. The Batches list view shows active batches. However, there is no single "plant inventory" report — the inspector would need to navigate through multiple screens. A dedicated one-screen inventory view would be cleaner.

*METRC reconciliation point:* Inspector will compare our plant count per batch against METRC. If our `plant_count_current` (derived from active assignments) differs from METRC's count, we need to explain why. Each plant loss event with `metrc_sync_status = 'pending'` represents a discrepancy.

---

**A2. METRC Reconciliation Check**

*Question:* "Let me look at what you have in METRC. Walk me through how this batch (pointing at one) maps to your METRC records."

*What we need to produce:* For a given batch: our batch ID, the METRC plant batch UID, plant count at creation vs. now, all phase change events with METRC sync status, all crop input submissions with METRC sync status.

*Current system capability:* Data exists in batch detail views. No single reconciliation report. `metrc_sync_status = 'pending'` on any batch event is a risk point.

*METRC reconciliation point:* If we have pending sync records, we need to be able to show the inspector we know about them and have a plan (Phase 4 automation, or a log of manual METRC entries that correspond to the pending records).

---

**A3. Last 90 Days Pesticide Applications**

*Question:* "Show me all pesticide applications in the last 90 days. For each one I want to see the product, lot number, rate, who applied it, weather conditions, and PHI status."

*What we need to produce:* MDA Pesticide Report (see Section 3, Report 3), filtered to date range. Must include lot number — this is the field inspectors specifically ask for.

*Current system capability:* MDA report route exists. Gaps: time stripped from applied_at, lot_number not in output. Both are one-file fixes in exports.ts.

*METRC reconciliation point:* Inspector may cross-check against METRC Record Additives for the same date range.

---

**A4. Active REI Zones**

*Question:* "Do you have any areas currently under re-entry restriction? Show me."

*What we need to produce:* Immediately visible on the Today screen and the REI Status Dashboard (Feature 9). Inspector is checking whether workers are in REI areas without clearance.

*Current system capability:* REI data is stored; `GET /api/pesticide-applications?rei_active=1` works. The REI Status Dashboard page is referenced in CLAUDE.md but its implementation status should be verified. If the dashboard isn't built, we can show the pesticide applications list filtered by REI active.

*METRC reconciliation point:* Not directly relevant — REI is internal compliance.

---

**A5. One Active Batch — Complete Input History**

*Question:* "Pick a batch at random. Show me everything that's been applied to it."

*What we need to produce:* Cultivation Record Export (Feature 13) for that batch. Must include all four application types with per-product detail.

*Current system capability:* Route exists at `GET /api/exports/cultivation-record/:batchId`. Critical gap: fertigation applications show recipe name and volume only — no per-ingredient quantities. Inspector will see "AUTO-FLOWER recipe, 240 gal" but not "Fish Hydrolysate 30 tsp, Cal-Mag 15 tsp." This will fail a close audit.

---

**A6. Tag Assignment Verification — 10 Random Containers**

*Question:* "I'm going to pick 10 containers. For each one, show me what plant tag is assigned to it, and let me verify the physical tag matches."

*What we need to produce:* The Tag Assignment Verification Report (see Section 3, Report 9) — a list of containers with their assigned METRC tags. Inspector will physically walk to each container and check the tag matches.

*Current system capability:* Container records show assigned METRC tags. ContainerDetail.jsx shows the current assignment. A printable list of all container assignments does not currently exist as a dedicated report.

---

**A7. Plant Loss Records**

*Question:* "Any plants that died or were destroyed since your last inspection? Show me the records."

*What we need to produce:* Plant Loss and Destruction Log (see Section 3, Report 6), showing all plant_loss_events with METRC sync status.

*Current system capability:* `GET /api/plant-loss` returns records. No formatted report. Key detail: `metrc_sync_status = 'pending'` on any loss event means it hasn't been reported to METRC — this is a compliance failure inspector will flag.

---

**A8. Recent Harvest Records**

*Question:* "Show me any harvests in the last 90 days. I need to see the weights and which plants were harvested."

*What we need to produce:* Harvest Records Report (see Section 3, Report 7) — all plant_harvest_events for the period, with plant METRC tags, wet weights, product type, and harvest batch METRC UID.

*Current system capability:* Data is in cv_plant_harvest_events. No formatted harvest report exists. METRC harvest UIDs (metrc_harvest_batch_uid on cv_harvest_batches) may be null if not yet entered after manual METRC submission.

---

### Scenario B: MDA Pesticide Inspection

**Context:** An MDA inspector from the Pesticide and Fertilizer Management Division arrives. This may happen independently of OCM or as a referral. MDA's focus is exclusively pesticide use compliance.

---

**B1. Pesticide Application Log for the Season**

*Question:* "I need to see your pesticide application records for [date range]. Full records, all 18B.37 fields."

*What we need to produce:* MDA Pesticide Report, date range filtered. Must include: applicator, date AND time, product trade name, EPA reg #, target pest, method, rate, total amount, lot number, location, weather conditions (temp, wind speed, wind direction), PHI compliance.

*Current gaps:* Time stripped from date, lot number missing from output. See Remediation H1 and H2.

---

**B2. Product Labels and SDS On File**

*Question:* "For each pesticide you've used, I need to see the current product label and SDS."

*What we need to produce:* This is a physical/document management requirement, not a system report. However, our Crop Input detail view includes an `sds_url` field. If populated with links to stored SDS documents, we can produce these quickly. Labels are physical documents — we need a binder.

*System role:* Maintain `sds_url` for all pesticide-class crop inputs. The inspector can verify we have the SDS.

---

**B3. PHI Compliance Documentation**

*Question:* "For any pesticide applied in the last 120 days, show me your PHI calculation and confirm no harvest occurred within the PHI window."

*What we need to produce:* PHI Compliance Report (see Section 3, Report 10) — shows every pesticide application with its phi_days_operational, expected harvest date, and phi_compliant flag. Highlights any non-compliant applications with the override notes.

*Current system capability:* phi_compliant is computed and stored on each application. No dedicated PHI report exists. If phi_compliant is NULL (because no expected_harvest_date was provided), inspector will flag this as a gap.

---

**B4. REI Documentation**

*Question:* "For any pesticide application in the last 30 days, show me the REI clearance records. When was the area cleared and who cleared it?"

*What we need to produce:* REI clearance records from cv_applications_pesticide: rei_expires_at, rei_cleared_at, rei_cleared_by.

*Current system capability:* All fields stored. The MDA report includes rei_expires_at. rei_cleared_at and rei_cleared_by would need to be added to the export.

---

**B5. Applicator License Verification**

*Question (if RUPs were used):* "Show me the applicator license for the person who applied [restricted-use product]."

*What we need to produce:* The applicator_license field on the specific application record.

*Current system capability:* If a RUP was applied, the system requires applicator_license as non-null (Rule 21, enforced). If a non-RUP was applied by an unlicensed applicator, license is optional/empty — which is correct.

---

### Scenario C: METRC Audit / Reconciliation Request

**Context:** OCM requests a reconciliation of our METRC records against our internal system. This may happen after discrepancies are noticed in METRC, or as part of a focused audit.

---

**C1. Plant Batch UID Cross-Reference**

*Question:* "For each plant batch in your system, give me the METRC batch UID. I'm going to verify these match what's in METRC."

*What we need to produce:* A list of all batches with their `metrc_plant_batch_uid`. Any batch where this is null must be explained (was it ever registered in METRC?).

*Current system capability:* Available in the Batches list. Not a standalone report. The `metrc_plant_batch_uid` field is nullable — pre-harvest batches may not have one yet. Inspector will flag any active batches without a METRC UID as non-compliant.

---

**C2. Additive Submissions vs. Internal Records**

*Question:* "I see you submitted 45 additive records to METRC in May. Your internal system shows 52 applications. Explain the difference."

*What we need to produce:* METRC Reconciliation Report (see Section 3, Report 8) — shows all application records with their metrc_sync_status, grouped by type. Pending records can be explained as "awaiting manual entry."

*Current system capability:* Per-record metrc_sync_status is tracked on pesticide, foliar, and amendment applications. Fertigation applications do not have per-record sync status. cv_metrc_sync_log provides a global submission audit trail but is not per-record.

---

**C3. Plant Waste Submissions**

*Question:* "Show me all waste events you've reported to METRC. I see 12 waste reports in METRC — your system shows 18 waste trim events. What's missing?"

*What we need to produce:* A waste event reconciliation showing cv_plant_waste_trim_events and cv_plant_loss_events with their metrc_sync_status. Any `pending` or `failed` records are the discrepancy.

*Current system capability:* metrc_sync_status tracked on both tables. No METRC waste export exists (Critical gap C4 from audit-regulatory-compliance.md). Cannot generate a METRC-formatted waste submission report.

---

**C4. Harvest Record Match**

*Question:* "I see one harvest batch in METRC with a total weight of 287 lb. Your records should show the individual plant weights that aggregate to this."

*What we need to produce:* Harvest Records Report (Section 3, Report 7) showing per-plant harvest events, aggregated by harvest batch, with total weights.

*Current system capability:* Data in cv_plant_harvest_events. No formatted harvest report. The METRC harvest UID (`metrc_harvest_batch_uid` on cv_harvest_batches) must match the METRC UID; if null (manual entry not done yet), reconciliation cannot be completed.

---

## Section 3: Report Design Requirements

Each report below is specified for implementation. The "data sources" column references actual database tables. "Target production time" is the operator-facing SLA.

---

### Report 1: Current Plant Inventory Report

| Attribute | Value |
|---|---|
| **Purpose** | Real-time snapshot of all active plant batches with counts, stages, locations, and METRC UIDs |
| **Who requests it** | OCM inspector (A1 scenario), internal management |
| **Trigger** | Unannounced inspection; routine compliance check |
| **Format** | On-screen table + one-page PDF for handoff |
| **Target production time** | < 30 seconds |
| **Filter parameters** | Status (default: all active/non-closed); sub-zone; strain |

**Required fields per batch row:**

| Field | Data Source | Notes |
|---|---|---|
| Batch ID | cv_batches.batch_id | Internal reference |
| METRC Batch UID | cv_batches.metrc_plant_batch_uid | Red flag if null on active batch |
| METRC Batch Name | cv_batches.metrc_name (computed) | Must match METRC |
| Strain | cv_strains.name | Join |
| Strain type | cv_strains.type | auto / photo |
| Sub-zone | cv_batches.sub_zone_id | e.g., Z1A |
| Current status | cv_batches.status | human-readable (e.g., "Flowering") |
| Days in current stage | computed from batch_phase_history last transition | America/Chicago |
| Plant count (initial) | cv_batches.plant_count_initial | |
| Plant count (current) | COUNT(active cv_plant_assignments) | derived |
| Plants lost | initial − current | derived |
| Sow date | cv_batches.sow_date | |
| Field move date | cv_batches.field_move_date | |
| Supervisor | cv_users.name | Join on supervisor |
| Last application | MAX(applied_at) across all 4 application tables | Latest any input was applied |
| Active REI? | rei_expires_at > NOW AND rei_cleared_at IS NULL | Yes/No flag |
| METRC UID status | | Flag: "Set" / "Missing — required before harvest" |

**Data sources:**  
`cv_batches` + `cv_strains` + `cv_users` + `cv_plant_assignments` (count) + `cv_applications_pesticide` (REI check) + `cv_batch_phase_history` (last transition date)

**Gap analysis:** All data is available. This report requires a new route at `GET /api/reports/plant-inventory` that joins across the above tables. No schema changes needed. The existing `GET /api/batches` route is close but does not compute `last_application` or the REI flag, and is not formatted for one-page PDF handoff.

---

### Report 2: Plant Batch Cultivation Record

| Attribute | Value |
|---|---|
| **Purpose** | Complete history of all inputs for a specific plant batch — the MN Statute 342.25 deliverable |
| **Who requests it** | OCM inspector (A5 scenario), operator for self-audit |
| **Trigger** | Inspection; per-batch audit export |
| **Format** | PDF (primary for handoff) + JSON (archival) |
| **Target production time** | < 60 seconds for any batch |
| **Filter parameters** | batch_id (required) |

**Required sections:**

1. **Batch header:** batch name, METRC UID, strain, strain type, sub-zone, pot size, plant count (initial, current, lost), sow date, transplant date, field move date, closed date, supervisor.
2. **Phase history:** All status transitions with date, authorized by, and notes.
3. **Location history:** All location moves with date, from/to location, and METRC sync status.
4. **Recipe history:** All fertigation recipe assignments with effective dates and authorized by.
5. **Fertigation applications:** Ordered by applied_at. **Each application expands to per-ingredient detail.** Fields: applied_at, recipe name + version, total volume (gal), EC measured, pH measured, applicator, then per-ingredient: product name, rate per gal, total quantity applied (rate × volume), lot number (if tracked).
6. **Foliar applications:** applied_at, product name + EPA status, purpose, rate, volume, row/container target, PHI compliant, stage compliant, applicator.
7. **Pesticide applications:** applied_at, product name, EPA reg #, lot number, rate, total volume, method, target pest, weather conditions (temp, wind speed, wind direction), REI expires, REI cleared, PHI compliant, applicator + license.
8. **Container amendments:** applied_at, container, amendment type, product name, quantity, method, purpose, linked soil sample, applicator.
9. **Observations:** ordered by observed_at, per row/container, category, severity, notes, resolution.
10. **Harvest batches:** Each harvest batch with METRC harvest UID, dates, environmental conditions, total weight, plant count harvested.
11. **Plant harvest events:** Per-plant event (partial/final), METRC tag, product type, wet weight, applicator, METRC sync status.
12. **Waste trim events:** All waste trim events, trim reason, wet weight, waste status, disposal, METRC sync status.
13. **Plant losses:** All plant loss events, METRC tag, loss type, cause, disposition, METRC sync status.

**Gap analysis:**

| Section | Schema Status | Export Status | Gap | Severity |
|---|---|---|---|---|
| Batch header | Complete | Included | None | — |
| Phase history | cv_batch_phase_history | Included | None | — |
| Location history | cv_batch_location_history | Included | None | — |
| Recipe history | cv_batch_stage_recipes | Included | None | — |
| Fertigation applications | Complete | Included (not expanded) | **No per-ingredient expansion; 342.25 violation** | CRITICAL |
| Foliar applications | Complete | Included | phi_compliant not in output | MEDIUM |
| Pesticide applications | Complete | Included | All MDA fields present | None |
| Container amendments | Complete | Included (batch-scoped) | Product name from farmstock, may degrade | HIGH |
| Observations | Complete | Included | None | — |
| Harvest batches | Complete | Included | metrc_harvest_batch_uid often null | HIGH |
| Plant harvest events | Complete | Included | None | — |
| Waste trim events | Complete | Included | None | — |
| Plant losses | Complete | Included | None | — |
| **PDF format** | N/A | **JSON only** | **No PDF generation implemented** | HIGH |

---

### Report 3: Pesticide Application Log (MDA-Ready)

| Attribute | Value |
|---|---|
| **Purpose** | All pesticide applications in a date range per MN Statute 18B.37 |
| **Who requests it** | MDA inspector (B1 scenario); OCM inspector (A3 scenario) |
| **Trigger** | MDA or OCM inspection; self-audit; pre-licensing preparation |
| **Format** | PDF (primary) + CSV |
| **Target production time** | < 30 seconds |
| **Filter parameters** | date_from (required), date_to (required); batch_id (optional); input_id (optional) |

**Required fields per row (18B.37 complete):**

| Field | Column | Status |
|---|---|---|
| Application date | applied_at (full datetime) | Gap: MDA report strips time |
| Applicator name | cv_users.name | Included |
| Applicator license | applicator_license | Included |
| Product trade name | farmstock.items.name | Included (runtime) |
| EPA registration number | farmstock.items.epa_reg_no | Included (runtime) |
| Lot number | input_lot_id → lot_number from farmstock | **Gap: not in current export** |
| Target pest | target_pest | Included |
| Application method | application_method | Included |
| Rate applied (per unit) | rate_value + rate_unit | Included |
| Total amount applied | volume_applied + volume_unit | Included |
| Application site | sub_zone (via batch) + row_id + container_id | Included |
| Wind speed | wind_speed_mph | Included |
| Wind direction | wind_direction | Included |
| Temperature | ambient_temp_f | Included |
| PHI compliant | phi_compliant | Included |
| REI expiry | rei_expires_at | Included |
| REI cleared | rei_cleared_at + rei_cleared_by | **Gap: not in current export** |
| Batch name | cv_batches.metrc_name | Included |
| Crop (strain) | cv_strains.name | Included |
| Pest pressure | pest_pressure | Not currently in export |

**Gap analysis:** Two fixes needed in `exports.ts` (H1 and H2 from audit-regulatory-compliance.md): include full timestamp and add lot_number. A third fix: add rei_cleared_at and rei_cleared_by to output for REI documentation.

---

### Report 4: Crop Input Summary (Rule 4770 Unified Log)

| Attribute | Value |
|---|---|
| **Purpose** | All four input classes for a batch or date range — the MN Rule 4770 "crop input log" |
| **Who requests it** | OCM inspector; self-audit |
| **Trigger** | Inspection; regulatory review; annual summary |
| **Format** | PDF + CSV |
| **Target production time** | < 60 seconds |
| **Filter parameters** | batch_id (optional) OR date_from + date_to (optional); input_class filter (optional) |

**Structure:** Date-ordered rows across all four application types, unified into a single document.

| Column | Source | Notes |
|---|---|---|
| Date/time | applied_at | Full timestamp |
| Input class | "Fertigation" / "Foliar" / "Soil Amendment" / "Pesticide" | |
| Batch | batch metrc_name | |
| Location | sub_zone + row/container if set | |
| Product name | Expanded per ingredient for fertigation; farmstock name for others | |
| EPA reg # | farmstock (pesticides only) | |
| Quantity | Per-product quantity for fertigation; rate+volume for others | |
| Lot number | input_lot_id for pesticides (required); optional for others | |
| Applicator | cv_users.name | |

**Gap analysis:** This report does not currently exist as a standalone export. The METRC Additives export approximates it but: (a) does not expand fertigation ingredients, (b) is formatted for METRC, not MDA/OCM. A new route `GET /api/reports/crop-inputs` would aggregate all four application tables and format them for Rule 4770 review.

---

### Report 5: Active REI Status Report

| Attribute | Value |
|---|---|
| **Purpose** | Current re-entry restrictions across all sub-zones/rows — immediate safety reference |
| **Who requests it** | Internal (daily operations); OCM inspector (A4 scenario) |
| **Trigger** | Any pesticide application; daily check; inspection |
| **Format** | On-screen (primary); PDF for physical posting |
| **Target production time** | < 5 seconds |
| **Filter parameters** | Active only (default); all (to include cleared) |

**Required fields:**

| Field | Source | Notes |
|---|---|---|
| Location | batch.sub_zone + row_id/container_id | |
| Product applied | input_id → farmstock.name | |
| Applied at | applied_at | |
| REI expires at | rei_expires_at | Computed field |
| Time remaining | rei_expires_at − NOW() | Real-time |
| Cleared at | rei_cleared_at | Null if still active |
| Cleared by | rei_cleared_by → cv_users.name | |
| Applicator | applicator → cv_users.name | |

**Gap analysis:** Data exists. The REI Status Dashboard (Feature 9) should serve this function. Implementation status should be verified — if it's built, it covers this report. A "print REI status" button for physical posting is the only missing piece.

---

### Report 6: Plant Loss and Destruction Log

| Attribute | Value |
|---|---|
| **Purpose** | All plant losses with METRC waste status — shows disposition of every plant that did not make it to harvest |
| **Who requests it** | OCM inspector (A7 scenario); METRC reconciliation |
| **Trigger** | Inspection; before harvest (to confirm all losses are reported) |
| **Format** | PDF + CSV |
| **Target production time** | < 30 seconds |
| **Filter parameters** | batch_id (optional); date_from/to (optional); metrc_sync_status (optional) |

**Required fields:**

| Field | Source |
|---|---|
| Loss date | occurred_at |
| Discovery date | discovered_at |
| Batch | cv_batches.metrc_name |
| Container | container_id |
| METRC plant tag | cv_plant_loss_events.metrc_plant_tag |
| Loss type | loss_type (human-readable) |
| Loss cause | loss_cause |
| Plant count | plant_count |
| Disposition | plant_disposition |
| Reported by | reported_by → cv_users.name |
| METRC sync status | metrc_sync_status |
| METRC synced at | metrc_synced_at |

**Gap analysis:** All data captured. No formatted export route exists for this report. A new route `GET /api/reports/plant-losses` would output this. Any record with `metrc_sync_status = 'pending'` is a METRC compliance gap that must be resolved before inspection.

---

### Report 7: Harvest Records Report

| Attribute | Value |
|---|---|
| **Purpose** | All harvest events with wet weights — demonstrates compliance with METRC harvest tracking and batch closure |
| **Who requests it** | OCM inspector (A8 scenario); METRC reconciliation (C4) |
| **Trigger** | Inspection; after batch closure; METRC reconciliation |
| **Format** | PDF + CSV |
| **Target production time** | < 30 seconds |
| **Filter parameters** | batch_id (required or date_from/to); event_type (partial/final/all) |

**Required fields:**

| Field | Source |
|---|---|
| Harvest batch | cv_harvest_batches.metrc_name |
| METRC harvest UID | cv_harvest_batches.metrc_harvest_batch_uid |
| Environmental conditions | ambient_temp_f, ambient_rh, wind_speed_mph on harvest batch |
| Event type | partial_harvest / final_harvest |
| Plant METRC tag | cv_plant_assignments.metrc_plant_tag (at time of harvest) |
| Container | cv_plant_harvest_events.container_id |
| Harvested at | harvested_at |
| Product type | product_type |
| Wet weight | wet_weight + weight_unit |
| Applicator | applicator → cv_users.name |
| METRC sync status | metrc_sync_status |
| **Totals** | SUM(wet_weight) per product_type per harvest_batch | |

**Gap analysis:** All data captured. No formatted harvest report route exists. A new route `GET /api/reports/harvest` would produce this. When `metrc_harvest_batch_uid` is null on any harvest batch, flag it in the report — inspector will flag it too.

---

### Report 8: METRC Reconciliation Report

| Attribute | Value |
|---|---|
| **Purpose** | Cross-reference of internal records vs. METRC sync status — shows what has and hasn't been reported to METRC |
| **Who requests it** | Internal (daily); OCM/METRC auditor (C scenario) |
| **Trigger** | Before any inspection; daily operations review; after Phase 4 sync runs |
| **Format** | On-screen (primary) + PDF |
| **Target production time** | < 15 seconds |
| **Filter parameters** | Status filter (pending/failed/all); event type; date range |

**Report sections:**

| Section | Source Tables | Key Metric |
|---|---|---|
| Plant batch registrations | cv_batches (metrc_plant_batch_uid IS NULL count) | Batches not registered in METRC |
| Phase changes | cv_batch_phase_history (metrc_sync_status counts) | Pending / synced / failed |
| Location moves | cv_batch_location_history (metrc_sync_status counts) | Same |
| Additives — pesticide | cv_applications_pesticide (no per-record sync status yet) | All treated as pending until Phase 4 |
| Additives — foliar | cv_applications_foliar (no per-record sync status yet) | Same |
| Additives — fertigation | cv_applications_fertigation (no per-record sync status yet) | Same |
| Additives — amendments | cv_container_amendments (no per-record sync status yet) | Same |
| Harvest events | cv_plant_harvest_events (metrc_sync_status counts) | Pending / synced / failed |
| Plant waste (trim) | cv_plant_waste_trim_events (metrc_sync_status counts) | Pending / synced / failed |
| Plant losses | cv_plant_loss_events (metrc_sync_status counts) | Pending / synced / failed |
| Tag assignments | cv_plant_assignments (no metrc_sync_status column) | Cannot track — schema gap |

**Gap analysis:**

- `cv_applications_pesticide`, `cv_applications_foliar`, `cv_applications_fertigation`, `cv_container_amendments` do not have per-record `metrc_sync_status` columns. All are effectively "pending" until Phase 4 API sync is implemented. Migration `016_additive_sync.ts` (documented in docs/metrc-integration-design.md) adds these columns.
- `cv_plant_assignments` has no `metrc_sync_status`. Tag assignments cannot be tracked for METRC sync status without a schema addition.
- This report cannot be fully accurate until the per-record sync status is added to additive and tag assignment tables.

---

### Report 9: Tag Assignment Verification Report

| Attribute | Value |
|---|---|
| **Purpose** | Printable list of all active container-to-METRC-tag mappings for physical walkthrough verification |
| **Who requests it** | OCM inspector (A6 scenario); quarterly self-audit |
| **Trigger** | Inspection; quarterly audit; batch start |
| **Format** | PDF (designed for printing and carrying into the field) |
| **Target production time** | < 30 seconds |
| **Filter parameters** | sub_zone_id (optional); batch_id (optional) |

**Required fields:**

| Field | Source |
|---|---|
| Container ID | cv_plant_assignments.container_id |
| Sub-zone | derived from container_id |
| Row | derived from container_id |
| METRC plant tag | cv_plant_assignments.metrc_plant_tag |
| Last 4 of METRC tag | last 4 chars of metrc_plant_tag |
| Batch name | cv_batches.metrc_name |
| Strain | cv_strains.name |
| Assignment date | cv_plant_assignments.placed_at |
| **Verified?** | Blank checkbox column for physical walkthrough |

**Format detail:** Sorted by sub-zone, then row, then container position. One row per active plant assignment. A blank "Verified ☐" checkbox column that an inspector can check off during a physical walkthrough. Print-optimized: JetBrains Mono for METRC tags (easy to read last 4 digits), earthy palette consistent with other printed outputs.

**Gap analysis:** No dedicated route exists. New route `GET /api/reports/tag-verification` would JOIN `cv_plant_assignments` (where unassigned_at IS NULL) + `cv_batches` + `cv_strains` + `cv_containers`. No schema changes needed.

---

### Report 10: PHI Compliance Report

| Attribute | Value |
|---|---|
| **Purpose** | Show all pesticide applications within the last 90 days with PHI windows — pre-harvest compliance check |
| **Who requests it** | MDA inspector (B3 scenario); internal pre-harvest gate |
| **Trigger** | Before any harvest begins; MDA inspection |
| **Format** | On-screen (with RAG status) + PDF |
| **Target production time** | < 30 seconds |
| **Filter parameters** | date_from (default: 90 days ago); batch_id (optional) |

**Required fields:**

| Field | Source |
|---|---|
| Applied at | applied_at |
| Product name | farmstock.items.name |
| PHI days (operational) | farmstock.items.phi_days_operational |
| Expected harvest date | expected_harvest_date (on application record) |
| Days until harvest (at time of application) | expected_harvest_date − applied_at |
| PHI window met? | phi_compliant (stored boolean) |
| Override note | notes (if phi_compliant was overridden) |
| Batch name | cv_batches.metrc_name |
| Current batch status | cv_batches.status |
| **⚠ PHI risk flag** | If batch is approaching harvest AND a recent application's PHI window hasn't expired | |

**PHI risk calculation:** For any active batch in `flush`, `harvest_window`, or `harvesting` status, scan all pesticide applications for that batch. For each, compute whether `NOW() − applied_at < phi_days_operational × 86400000`. If yes and batch is approaching harvest, flag with red warning.

**Gap analysis:** phi_compliant is stored but the "approaching harvest" PHI risk flag is not implemented anywhere. A new route `GET /api/reports/phi-compliance` would compute this. The Today screen should also surface this as an alert.

---

### Report 11: Batch Status Summary (Annual / YTD)

| Attribute | Value |
|---|---|
| **Purpose** | Year-to-date summary: batches started, plants grown, harvested, lost |
| **Who requests it** | Internal management; OCM annual license renewal review |
| **Trigger** | Annual license renewal; year-end; management review |
| **Format** | PDF + CSV |
| **Target production time** | < 60 seconds |
| **Filter parameters** | year (default: current); strain (optional) |

**Required aggregate fields:**

| Metric | Source |
|---|---|
| Total batches started | COUNT(cv_batches) |
| By strain type (auto / photo) | GROUP BY cv_strains.type |
| Total plants placed | SUM(plant_count_initial) |
| Total plants lost | COUNT(cv_plant_loss_events) |
| Total plants harvested | COUNT(final_harvest events) |
| Total wet weight harvested | SUM(cv_plant_harvest_events.wet_weight) by product_type |
| Total waste trim weight | SUM(cv_plant_waste_trim_events.wet_weight) |
| Total pesticide applications | COUNT(cv_applications_pesticide) |
| REI incidents (any REI not cleared within 8h) | Computed |
| PHI non-compliance events | COUNT(phi_compliant = 0 on pesticide applications) |
| METRC sync pending count (all types) | Aggregated pending counts |

**Gap analysis:** All data is available but no aggregate query route exists. New route `GET /api/reports/annual-summary?year=2026` would compute these. No schema changes needed.

---

## Section 4: OCM Compliance Dashboard Design

The OCM Compliance Dashboard is a single screen accessible from the Today screen (or the main navigation) that gives an operator confidence about their compliance posture at a glance. It should answer: "Are we clean right now? If an inspector walked in today, what would we show them?"

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  OCM COMPLIANCE STATUS                       As of: 14:32 today  │
│                                                                  │
│  ●  OVERALL:  AMBER — 2 items need attention                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────┐
│  REI STATUS          │ │  METRC SYNC          │ │  PHI WATCH     │
│                      │ │                      │ │                │
│  ✓  No active REIs   │ │  ⚠ 3 pending         │ │  ✓  No batches │
│                      │ │    6 synced          │ │  approaching   │
│  [VIEW REI HISTORY]  │ │    0 failed          │ │  PHI window    │
│                      │ │                      │ │                │
│  GREEN               │ │  AMBER               │ │  GREEN         │
└──────────────────────┘ └──────────────────────┘ └────────────────┘

┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────┐
│  PLANT LOSSES        │ │  UNTAGGED PLANTS     │ │  MISSING       │
│                      │ │                      │ │  METRC UIDs    │
│  ⚠ 1 loss pending    │ │  ✓  All plants       │ │                │
│  METRC reporting     │ │  have METRC tags     │ │  ✓  All active │
│                      │ │                      │ │  batches have  │
│  [REPORT NOW]        │ │  (VERIFIED)          │ │  METRC UIDs    │
│                      │ │                      │ │                │
│  AMBER               │ │  GREEN               │ │  GREEN         │
└──────────────────────┘ └──────────────────────┘ └────────────────┘

┌──────────────────────┐ ┌──────────────────────┐
│  WASTE TRIM          │ │  COMPLIANCE ITEMS    │
│  PENDING DISPOSAL    │ │                      │
│                      │ │  342.25 Cultivation  │
│  2 events in        │ │  records: ✓ Ready    │
│  "collected" status  │ │                      │
│                      │ │  18B.37 Pesticide    │
│  [VIEW + DISPOSE]    │ │  records: ✓ Ready    │
│                      │ │                      │
│  AMBER               │ │  METRC: ⚠ 3 pending │
└──────────────────────┘ └──────────────────────┘
```

### Dashboard Panel Specifications

**Panel 1: REI Status**
- Data: `SELECT COUNT(*) FROM cv_applications_pesticide WHERE rei_expires_at > datetime('now') AND rei_cleared_at IS NULL`
- GREEN: count = 0
- RED: count > 0 (any active REI is a safety concern; link to REI Status Dashboard)
- Action: "View Active REIs" → REI Status Dashboard

**Panel 2: METRC Sync Status**
- Data: Aggregate pending/failed counts across all tracked tables (plant_loss, harvest events, waste trim, phase history, location history)
- GREEN: all 0 pending, 0 failed
- AMBER: pending > 0 (expected in Phase 1 — operator needs to enter in METRC manually)
- RED: failed > 0 (failed means a Phase 4 API call failed; investigation needed)
- Detail: "N pending — last manual entry: [date from cv_metrc_sync_log]"
- Action: "View METRC Reconciliation" → Report 8

**Panel 3: PHI Watch List**
- Data: For each batch in status IN ('flush', 'harvest_window', 'harvesting'), check if any pesticide application in the last [max phi_days_operational] days has phi_compliant = 0 or remaining PHI window
- GREEN: no batches approaching harvest with PHI concerns
- AMBER: a batch approaching harvest has a recent application within operational PHI
- RED: a batch is in harvesting status and has an application within PHI window (should be blocked by system, but surfaced here as belt-and-suspenders)
- Action: "View PHI Report" → Report 10

**Panel 4: Plant Loss Pending METRC**
- Data: `SELECT COUNT(*) FROM cv_plant_loss_events WHERE metrc_sync_status = 'pending'`
- GREEN: count = 0
- AMBER: count > 0 (need manual METRC entry or Phase 4 sync)
- Action: "Report to METRC" → Plant Loss list filtered to pending

**Panel 5: Untagged Plants**
- Data: `SELECT COUNT(*) FROM cv_plant_assignments WHERE unassigned_at IS NULL AND (metrc_plant_tag IS NULL OR metrc_plant_tag = '')`
- GREEN: count = 0
- AMBER: count > 0 (plants placed but no METRC tag assigned)
- Action: "View Untagged" → Plant Assignments list filtered to untagged

**Panel 6: Missing METRC UIDs**
- Data: `SELECT COUNT(*) FROM cv_batches WHERE status NOT IN ('closed') AND (metrc_plant_batch_uid IS NULL OR metrc_plant_batch_uid = '')`
- GREEN: count = 0
- AMBER: count > 0 — any active batch without a METRC UID is a pre-harvest compliance risk
- Action: "View Batches" → Batches list filtered to missing METRC UID

**Panel 7: Waste Trim Pending Disposal**
- Data: `SELECT COUNT(*) FROM cv_plant_waste_trim_events WHERE waste_status IN ('collected', 'held')`
- GREEN: count = 0 (all waste is disposed or reported)
- AMBER: count > 0 (collected/held waste must eventually be disposed and reported)
- Action: "View Waste Queue" → Waste Trim list filtered to pending disposal

**Panel 8: Compliance Items Quick-Check**
- Static readiness summary: shows whether the key reports can be generated today (routes are available and working)
- Links: "Generate 342.25 Report" → Cultivation Record export; "Generate 18B.37 Report" → MDA Pesticide Report

**Overall status calculation:**
- RED if: any active REI, any PHI non-compliance on harvesting batch, any failed METRC sync
- AMBER if: any pending METRC sync, any untagged plants, any missing METRC UIDs, any pending waste disposal
- GREEN if: all panels are green

**Route:** `GET /api/reports/compliance-status` returns a JSON object with all panel data. Frontend renders the dashboard from this single call. Response must be < 500ms.

---

## Section 5: Gaps and Remediation

For each report, the following table assesses whether the required data is captured, whether UI exists to enter it, and estimated implementation effort.

### Report Gap Matrix

| Report | Data in Schema | Export Route Exists | PDF Format | Effort to Close |
|---|---|---|---|---|
| 1. Current Plant Inventory | YES | NO | NO | S — new route joining existing tables |
| 2. Cultivation Record | YES (with gaps) | YES (JSON only) | NO | M — ingredient expansion + PDF generation |
| 3. MDA Pesticide Log | YES | YES (gaps) | NO | S — 3 field fixes in exports.ts + PDF |
| 4. Crop Input Summary (4770) | YES | NO | NO | M — new unified route across 4 tables |
| 5. Active REI Status | YES | PARTIAL (screen exists) | NO | S — print button + PDF layout |
| 6. Plant Loss Log | YES | NO | NO | S — new route from cv_plant_loss_events |
| 7. Harvest Records | YES | NO | NO | S — new route from cv_plant_harvest_events |
| 8. METRC Reconciliation | PARTIAL (no additive sync columns) | NO | NO | M — new route + migration 016 for additive sync |
| 9. Tag Verification | YES | NO | NO | S — new route + printable PDF layout |
| 10. PHI Compliance | YES | NO | NO | S — new route; PHI risk calculation |
| 11. Annual Summary | YES | NO | NO | M — aggregate queries across all tables |
| Dashboard | YES | NO | NO | M — new consolidated route |

### Critical Data Gaps (Schema Changes Required)

These gaps require migration files in addition to route/UI changes:

| Gap | Tables Affected | Migration | Priority |
|---|---|---|---|
| Per-record metrc_sync_status on additive tables | cv_applications_fertigation/foliar/pesticide, cv_container_amendments | 016_additive_sync.ts (designed in metrc-integration-design.md) | HIGH — needed for Report 8 accuracy |
| metrc_sync_status on cv_plant_assignments | cv_plant_assignments | 016 or new migration | HIGH — needed for Report 8 |
| Product name snapshot at application save time | cv_applications_foliar/pesticide, cv_container_amendments | New: `017_product_snapshots.ts` | CRITICAL — 5-year retention risk |
| updated_at on application tables | cv_applications_fertigation/foliar/pesticide, cv_container_amendments, cv_observations | New: `018_updated_at_cols.ts` | HIGH — audit trail completeness |
| applicator_license_number on cv_users | cv_users | New: `019_user_license.ts` | MEDIUM — friction reduction once licensed |

### UI Gaps (No UI for Entering Required Data)

| Gap | What's Missing | Impact |
|---|---|---|
| corrects_id workflow | No UI to create a correction record referencing an existing application | Operators use in-place edit (PATCH) instead; original values lost |
| Scan history logging | ContainerScanner.jsx doesn't log scans to DB | Rule 27 not implemented; no scan audit trail |
| Physical REI posting record | No way to record when a physical "REI Active" sign was posted or removed | Digital clearance only; MDA may expect paper posting record |
| SDS upload for pesticide inputs | sds_url field exists but no upload UI | Inspector may ask to see SDS; must be produced separately |
| Amendment purpose (required) | purpose is nullable in Zod schema | Amendments without purpose rationale are less defensible in audit |

---

## Section 6: Inspection Readiness Checklist

A pre-inspection checklist the operator should run through before any OCM or MDA visit. Can be printed from the Compliance Dashboard.

**Run this checklist before any inspection. Target: all items green.**

---

### Batch Compliance

- [ ] **All active batches have METRC UIDs** (`metrc_plant_batch_uid IS NOT NULL` for all non-closed batches)
  - Check: Compliance Dashboard Panel 6 shows GREEN
  - Fix: Enter the METRC batch UID in the batch edit form for any missing batches

- [ ] **Plant counts match METRC** — verify our `plant_count_current` (derived from active assignments) matches METRC's count for each batch
  - Check: Tag Verification Report — count active assignments per batch, compare to METRC
  - Fix: If discrepancy, trace missing/extra assignments; submit plant loss events as needed

- [ ] **All active plants have METRC tags assigned**
  - Check: Compliance Dashboard Panel 5 shows GREEN
  - Fix: Use METRC Tag Assignment workflow for any untagged plants

- [ ] **All batch phase changes have been entered in METRC**
  - Check: METRC Reconciliation Report — Phase Changes section shows all synced
  - Fix: Log each pending phase change in METRC manually; mark as synced

---

### Pesticide and Chemical Compliance

- [ ] **No active REI zones**
  - Check: Compliance Dashboard Panel 1 shows GREEN
  - Fix: Clear any expired REIs using the Clear-REI workflow

- [ ] **PHI compliance verified for any batch approaching harvest**
  - Check: PHI Compliance Report for any batch in flush/harvest_window/harvesting status
  - Fix: If a batch is within PHI of a recent application, document the decision to proceed or delay harvest

- [ ] **All pesticide applications in the last 90 days have REI clearance documented**
  - Check: Review cv_applications_pesticide for any rei_expires_at in the past with rei_cleared_at IS NULL
  - Fix: If REI is past and area was re-entered (as it should have been), enter the clearance retroactively with notes

- [ ] **All pesticide application lot numbers are entered**
  - Check: Pesticide Application Log — verify no null lot_id fields
  - Fix: If any application is missing a lot reference, update via the application edit form; this is a CRITICAL gap

- [ ] **SDS available for every pesticide in the crop input catalog**
  - Check: Crop Inputs list — verify sds_url is populated for all pesticide-class inputs
  - Fix: Upload or link to SDS for any missing products

---

### METRC Reporting

- [ ] **All plant loss events reported to METRC**
  - Check: Compliance Dashboard Panel 4 shows GREEN (0 pending)
  - Fix: For each pending plant loss, manually enter in METRC; mark metrc_sync_status = 'synced'

- [ ] **All waste trim events disposed and reported to METRC**
  - Check: Compliance Dashboard Panel 7 shows GREEN (0 collected/held)
  - Fix: For any events in 'collected' status, complete the disposal workflow and report to METRC

- [ ] **All harvest events reported to METRC with harvest batch UIDs entered**
  - Check: Harvest Records Report — verify metrc_harvest_batch_uid is populated on all completed harvest batches
  - Fix: Enter the METRC harvest batch UID in the harvest batch record after completing METRC manual entry

- [ ] **All additive applications entered in METRC (Record Additives)**
  - Check: METRC Additives export — generate the report for the last 90 days and verify each row has been manually entered in METRC
  - Fix: Use the METRC Additives CSV to do manual entry in METRC for any missing records

---

### Records and Documentation

- [ ] **Cultivation records are producible within 60 seconds for every active batch**
  - Check: Try generating the Cultivation Record Export for each active batch — verify it loads and all sections are populated
  - Fix: If fertigation applications show recipe-only (no ingredient expansion), see Critical Finding C2 from audit-regulatory-compliance.md

- [ ] **No failed METRC syncs in the sync log**
  - Check: METRC Reconciliation Report — no failed rows
  - Fix: Investigate each failed record; retry after resolving the underlying cause

- [ ] **All corrections made via corrects_id, not via overwrites**
  - Check: Review any applications where notes mention "correction" — verify they reference a corrects_id
  - Fix: If an overwrite was made within the 24h edit window, document the change in the correcting record's notes

---

### Pre-Harvest Gate (Run Before Beginning Harvest on Any Batch)

- [ ] Batch has a METRC UID set
- [ ] No pesticide applications within the last `phi_days_operational` days for any product applied to this batch
- [ ] All plant losses for this batch are reported to METRC
- [ ] All waste trim events for this batch have waste_status = 'disposed' or 'reported'
- [ ] Harvest batch record created in METRC (or ready to be created)
- [ ] All plants in the batch have METRC tags assigned
- [ ] Environmental conditions (temp, wind speed) are logged on the harvest batch record

---

*End of OCM Reporting Requirements. For code-level gap remediation details, see `docs/audit-regulatory-compliance.md`. For METRC API integration design (Phase 4 sync that will automate most manual steps above), see `docs/metrc-integration-design.md`.*
