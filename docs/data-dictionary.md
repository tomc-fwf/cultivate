# Cultivate — Data Dictionary

Generated from migrations 001–018. All tables use SQLite. Timestamps are ISO-8601 TEXT in UTC; booleans are INTEGER 0/1; JSON arrays are TEXT.

---

## Summary

| Table | Type | Purpose |
|---|---|---|
| [cv_applications_fertigation](#cv_applications_fertigation) | Operational | Drip fertigation applications recorded against a batch |
| [cv_applications_foliar](#cv_applications_foliar) | Operational | Non-pesticide foliar spray applications at row/container level |
| [cv_applications_pesticide](#cv_applications_pesticide) | Operational | Pesticide applications with full MN MDA compliance fields |
| [cv_batch_location_history](#cv_batch_location_history) | Operational | Append-only log of every physical location move for a plant batch |
| [cv_batch_phase_history](#cv_batch_phase_history) | Operational | Append-only log of every batch status (phase) transition |
| [cv_batch_stage_recipes](#cv_batch_stage_recipes) | Operational | Active fertigation recipe for a batch at a given time period |
| [cv_batches](#cv_batches) | Operational | Plant batches — the core unit of cultivation tracking |
| [cv_container_amendments](#cv_container_amendments) | Operational | Additions to container growing media, persisting across batches |
| [cv_container_qr_codes](#cv_container_qr_codes) | Operational | QR code stickers permanently affixed to containers |
| [cv_container_state](#cv_container_state) | Operational | Current lifecycle state of every container (1:1 with cv_containers) |
| [cv_container_state_transitions](#cv_container_state_transitions) | Operational | Append-only audit log of container state changes |
| [cv_containers](#cv_containers) | **Seed** | 1,180 physical growing containers identified by position ID |
| [cv_fertigation_recipe_ingredients](#cv_fertigation_recipe_ingredients) | Operational | Ingredient lines within a fertigation recipe |
| [cv_fertigation_recipes](#cv_fertigation_recipes) | Operational | Versioned fertigation (drip nutrition) recipes |
| [cv_foliar_recipe_ingredients](#cv_foliar_recipe_ingredients) | Operational | Ingredient lines within a foliar recipe |
| [cv_foliar_recipes](#cv_foliar_recipes) | Operational | Versioned foliar spray recipes for repeat non-pesticide applications |
| [cv_harvest_batches](#cv_harvest_batches) | Operational | METRC harvest lots grouping plants harvested together in a 1–2 day window |
| [cv_input_phi_stage_overrides](#cv_input_phi_stage_overrides) | Operational | Per-product, per-stage PHI/application rules that block or override defaults |
| [cv_locations](#cv_locations) | **Seed** | Physical locations where batches reside, mirrored to METRC rooms |
| [cv_metrc_sync_log](#cv_metrc_sync_log) | Operational | Audit trail of all METRC API submissions |
| [cv_observations](#cv_observations) | Operational | Plant condition notes at row/container granularity |
| [cv_plant_assignments](#cv_plant_assignments) | Operational | Live registry mapping METRC plant tags to physical containers |
| [cv_plant_harvest_events](#cv_plant_harvest_events) | Operational | Individual partial and final harvest events against plants |
| [cv_plant_loss_events](#cv_plant_loss_events) | Operational | First-class records of mid-batch plant deaths and removals |
| [cv_plant_waste_trim_events](#cv_plant_waste_trim_events) | Operational | Waste trim events generating disposed material, not product |
| [cv_planting_plan_items](#cv_planting_plan_items) | Operational | Individual container assignments within a planting plan |
| [cv_planting_plans](#cv_planting_plans) | Operational | Versioned draft layouts for placing a batch into field containers |
| [cv_rows](#cv_rows) | **Seed** | 40 rows (5 per sub-zone × 8 sub-zones) within the field |
| [cv_sensor_location_assignments](#cv_sensor_location_assignments) | Operational | Append-only history of which sensor is assigned to which location |
| [cv_sensor_readings](#cv_sensor_readings) | Operational | Raw time-series environmental readings from SensorPush devices |
| [cv_sensor_readings_hourly](#cv_sensor_readings_hourly) | Operational | Hourly summary of sensor readings for long-term trend storage |
| [cv_sensors](#cv_sensors) | Operational | Master record per physical SensorPush device |
| [cv_skill_instances](#cv_skill_instances) | Operational | Evidence trail linking a completed UEM skill execution to an output record |
| [cv_soil_sample_results](#cv_soil_sample_results) | Operational | Structured lab results per parameter for a soil sample |
| [cv_soil_samples](#cv_soil_samples) | Operational | Soil samples collected from containers, tracked through lab analysis |
| [cv_startup_events](#cv_startup_events) | Operational | Media replacement and amendment work between teardown and READY state |
| [cv_strains](#cv_strains) | Operational | Cannabis cultivar definitions |
| [cv_sub_locations](#cv_sub_locations) | **Seed** | Optional METRC sub-locations within a location |
| [cv_sub_zones](#cv_sub_zones) | **Seed** | 8 sub-zones (A and B per zone, 4 zones) with fixed pot sizes |
| [cv_teardown_events](#cv_teardown_events) | Operational | Container cleanup and soil sampling work at end of a batch |
| [cv_users](#cv_users) | Operational | Application users with PIN-based authentication |
| [cv_zones](#cv_zones) | **Seed** | 4 irrigation zones in the field |

**Seed tables** are populated by migrations and represent fixed physical infrastructure. They are never created or deleted through the UI.

---

## cv_applications_fertigation

Routine drip fertigation applications recorded at batch (sub-zone) level. EC and pH are always required; `corrects_id` allows error correction without deleting records.

| Column | Type | Nullable | Description |
|---|---|---|---|
| application_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| recipe_id | INTEGER | No | FK → cv_fertigation_recipes; the exact version applied |
| applied_at | TEXT | No | ISO-8601 UTC timestamp of application |
| volume_gallons | REAL | No | Total volume delivered |
| ec_measured | REAL | No | EC reading at application time; record "meter-error" in notes if meter broken |
| ph_measured | REAL | No | pH reading at application time; same rule as ec_measured |
| solution_temp_f | REAL | Yes | Temperature of the nutrient solution |
| ambient_temp_f | REAL | Yes | Ambient air temperature |
| ambient_rh | REAL | Yes | Ambient relative humidity (%) |
| applicator | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text; capture meter errors, anomalies |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| corrects_id | INTEGER | Yes | FK → cv_applications_fertigation; links correction to original record (original preserved) |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; recipe_id → cv_fertigation_recipes; applicator, created_by → cv_users; corrects_id → self.

**Business rules:** EC and pH are mandatory per Rule 11. Records are never deleted; mistakes are corrected via a new record with `corrects_id` pointing to the original (Rule 5).

---

## cv_applications_foliar

Non-pesticide foliar spray applications at row or container level. Cannot use pesticide-category products (those go to cv_applications_pesticide). PHI is computed even for non-pesticide biologicals.

| Column | Type | Nullable | Description |
|---|---|---|---|
| foliar_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| row_id | TEXT | Yes | FK → cv_rows; set when application targets a row |
| container_id | TEXT | Yes | FK → cv_containers; set when application targets a single container |
| applied_at | TEXT | No | ISO-8601 UTC timestamp |
| foliar_recipe_id | INTEGER | Yes | FK → cv_foliar_recipes; null for single-product applications |
| input_id | INTEGER | Yes | Farmstock item ID; used when no recipe; must be non-pesticide category |
| input_lot_id | INTEGER | Yes | Farmstock lot ID |
| rate_value | REAL | Yes | Application rate; required when no recipe |
| rate_unit | TEXT | Yes | Rate unit (e.g. "tsp_per_gal") |
| volume_applied | REAL | Yes | Total volume applied |
| volume_unit | TEXT | Yes | Volume unit (e.g. "gal", "L") |
| purpose | TEXT | No | Required: why this foliar was applied (Rule 12) |
| ambient_temp_f | REAL | Yes | Ambient temperature |
| ambient_rh | REAL | Yes | Ambient relative humidity (%) |
| phi_compliant | INTEGER | Yes | System-computed (0/1): does application respect phi_days_operational? |
| stage_compliant | INTEGER | Yes | System-computed (0/1): does application pass cv_input_phi_stage_overrides? |
| applicator | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| product_name_snapshot | TEXT | Yes | Product name from farmstock captured at save time (5-year retention) |
| corrects_id | INTEGER | Yes | FK → self; links correction to original |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; row_id → cv_rows; container_id → cv_containers; foliar_recipe_id → cv_foliar_recipes; applicator, created_by → cv_users; corrects_id → self. `input_id` and `input_lot_id` reference farmstock (cross-app, no DB-level FK).

**Business rules:** `purpose` is mandatory (Rule 12). Products with an EPA number must not be saved here — redirect to cv_applications_pesticide (Rule 13). PHI enforcement applies even for non-pesticide biologicals (Rule 14). `product_name_snapshot` captured at save for compliance record integrity.

---

## cv_applications_pesticide

Pesticide applications with full MN MDA Statute 18B.37 compliance fields. The strictest application type. Lot tracking, environmental data, REI computation, and PHI checking are all mandatory.

| Column | Type | Nullable | Description |
|---|---|---|---|
| pesticide_app_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| row_id | TEXT | Yes | FK → cv_rows; set when targeting a row |
| container_id | TEXT | Yes | FK → cv_containers; set when targeting a container |
| applied_at | TEXT | No | ISO-8601 UTC timestamp |
| input_id | INTEGER | No | Farmstock item ID; must be category pesticide/fungicide/biocontrol_pesticide |
| input_lot_id | INTEGER | No | Farmstock lot ID; required for pesticides without exception (Rule 16) |
| rate_value | REAL | No | Application rate |
| rate_unit | TEXT | No | Rate unit (e.g. "oz_per_gal") |
| volume_applied | REAL | No | Total volume applied |
| volume_unit | TEXT | No | Volume unit |
| application_method | TEXT | No | Enum: foliar_spray \| soil_drench \| granular \| other |
| target_pest | TEXT | No | What is being controlled; required per MN Statute 18B.37 (Rule 17) |
| pest_pressure | TEXT | Yes | Enum: incidental \| threshold \| outbreak |
| ambient_temp_f | REAL | No | Required per MN Statute 18B.37 (Rule 17) |
| ambient_rh | REAL | Yes | Ambient relative humidity (%) |
| wind_speed_mph | REAL | No | Required per MN Statute 18B.37 (Rule 17) |
| wind_direction | TEXT | Yes | Cardinal or degrees |
| phi_compliant | INTEGER | Yes | System-computed (0/1): uses phi_days_operational, not label PHI |
| expected_harvest_date | TEXT | Yes | Date used for PHI calculation |
| rei_expires_at | TEXT | Yes | Computed: applied_at + product's rei_hours |
| rei_cleared_at | TEXT | Yes | When the area was posted as safe to re-enter |
| rei_cleared_by | INTEGER | Yes | FK → cv_users |
| applicator | INTEGER | Yes | FK → cv_users |
| applicator_license | TEXT | Yes | Applicator certification number; required for restricted-use pesticides (Rule 21) |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| product_name_snapshot | TEXT | Yes | Product name from farmstock captured at save time |
| epa_reg_no_snapshot | TEXT | Yes | EPA registration number from farmstock captured at save time |
| corrects_id | INTEGER | Yes | FK → self; links correction to original |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; row_id → cv_rows; container_id → cv_containers; rei_cleared_by, applicator, created_by → cv_users; corrects_id → self. `input_id` and `input_lot_id` reference farmstock (no DB FK).

**Business rules:** `input_lot_id` is required without exception (Rule 16). `target_pest`, `ambient_temp_f`, and `wind_speed_mph` are required (Rule 17). PHI uses `phi_days_operational` from farmstock, not the label PHI (Rule 18). Stage-specific blocks from cv_input_phi_stage_overrides are hard blocks with no override (Rule 19). `rei_expires_at` is computed at save and drives the REI dashboard (Rule 20). Both name and EPA reg number snapshots are captured for 5-year retention compliance.

---

## cv_batch_location_history

Append-only log of every physical location move for a plant batch. Independent of phase history — location and phase can change separately. Each record maps to one METRC "Move Plants" event.

| Column | Type | Nullable | Description |
|---|---|---|---|
| move_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| from_location_id | INTEGER | Yes | FK → cv_locations; null for the initial placement record |
| to_location_id | INTEGER | No | FK → cv_locations |
| moved_at | TEXT | No | ISO-8601 UTC timestamp |
| moved_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| trigger | TEXT | No | Enum: manual \| planting_plan_commit \| phase_transition \| other |
| planting_plan_id | INTEGER | Yes | FK → cv_planting_plans; set when trigger = planting_plan_commit |
| metrc_sync_status | TEXT | No | Enum: pending \| synced \| failed \| not_required |
| metrc_synced_at | TEXT | Yes | When METRC submission succeeded |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** batch_id → cv_batches; from_location_id, to_location_id → cv_locations; moved_by → cv_users; planting_plan_id → cv_planting_plans (app-layer enforced; no DB FK due to creation order).

**Business rules:** Append-only; never delete or update rows. Each row corresponds to one METRC move event submission.

---

## cv_batch_phase_history

Formal, append-only log of every plant batch status transition. Replaces informal transition handling in the batches route. Each record maps to one METRC "Change Growth Phase" event.

| Column | Type | Nullable | Description |
|---|---|---|---|
| phase_history_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| from_status | TEXT | Yes | Previous batch status; null for the initial germ record |
| to_status | TEXT | No | New batch status |
| transitioned_at | TEXT | No | ISO-8601 UTC timestamp |
| transitioned_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Required for harvest_window → harvesting transition (must reference observation evidence) |
| metrc_sync_status | TEXT | No | Enum: pending \| synced \| failed \| not_required |
| metrc_synced_at | TEXT | Yes | When METRC submission succeeded |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** batch_id → cv_batches; transitioned_by → cv_users.

**Business rules:** Append-only. Valid status transitions are enforced at the application layer (not via DB constraint). The `harvest_window → harvesting` transition requires `notes` referencing the observation log (Rule 42).

---

## cv_batch_stage_recipes

Records which fertigation recipe is active for a plant batch during a given time period. Used to produce the historical recipe trace for cultivation records and METRC exports. `effective_to` is NULL while the recipe is current.

| Column | Type | Nullable | Description |
|---|---|---|---|
| id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| recipe_id | INTEGER | No | Fertigation recipe ID; intended to FK → cv_fertigation_recipes but FK was never wired in migrations |
| effective_from | TEXT | No | ISO-8601 UTC timestamp when this recipe became active |
| effective_to | TEXT | Yes | ISO-8601 UTC timestamp when superseded; null = currently active |
| authorized_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Reason for recipe change |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** batch_id → cv_batches; authorized_by → cv_users. Note: `recipe_id` lacks a DB-level FK to cv_fertigation_recipes (known gap; see `docs/audit-schema-performance.md`).

---

## cv_batches

Plant batches — the central entity of the cultivation tracking system. One strain occupies one sub-zone per season run. All applications, observations, and harvest events reference a batch. `plant_count_current` is derived from active assignments and never stored directly.

| Column | Type | Nullable | Description |
|---|---|---|---|
| batch_id | INTEGER PK | No | Auto-increment primary key |
| strain_id | INTEGER | No | FK → cv_strains |
| sub_zone_id | TEXT | Yes | FK → cv_sub_zones; set when batch moves to field |
| metrc_plant_batch_uid | TEXT | Yes | METRC Plant Batch UID; required before harvest but nullable at creation (Rule 6) |
| plant_count_initial | INTEGER | No | Total plants at batch start |
| status | TEXT | No | Enum: germ \| seedling \| cult-hoop \| field-veg \| field-flower \| flush \| harvest_window \| harvesting \| closed |
| sow_date | TEXT | No | Calendar date (YYYY-MM-DD) in America/Chicago |
| transplant_date | TEXT | Yes | Date moved to seedling trays |
| field_move_date | TEXT | Yes | Date moved to field containers |
| harvest_date | TEXT | Yes | Date first harvest event was recorded |
| closed_date | TEXT | Yes | Date batch was closed (all plants final-harvested) |
| notes | TEXT | Yes | Free text |
| supervisor | INTEGER | Yes | FK → cv_users |
| plants_per_container | INTEGER | No | Intended planting density; default 1; 2 common for autoflowers (added migration 009) |
| current_stage_since | TEXT | Yes | Timestamp when batch entered current status; used for days-in-stage calculation (added migration 008) |
| current_location_id | INTEGER | Yes | FK → cv_locations; current physical location (added migration 012) |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** strain_id → cv_strains; sub_zone_id → cv_sub_zones; supervisor, created_by → cv_users; current_location_id → cv_locations.

**Business rules:** `plant_count_current` is derived from active cv_plant_assignments — never stored or edited directly (Rule 40). Valid status transitions are enforced at the application layer. All timestamps use UTC; display converts to America/Chicago (Rule 7). Date math is calendar-day based (Rule 8).

---

## cv_container_amendments

Any addition to container growing media — compost, nematodes, mycorrhizae, pH correctors, etc. Scoped to the container (not the batch), so amendments persist across batch cycles. When applied during an active batch, `batch_id` captures context for batch-scoped views.

| Column | Type | Nullable | Description |
|---|---|---|---|
| amendment_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers |
| batch_id | INTEGER | Yes | FK → cv_batches; null for container-only events (teardown/startup) |
| container_state | TEXT | No | Container state at application time: active \| empty \| teardown \| startup |
| applied_at | TEXT | No | ISO-8601 UTC timestamp |
| amendment_type | TEXT | No | Enum: media_replacement \| amendment \| inoculation \| drench \| top_dress \| mix_in \| correction \| removal \| other |
| input_id | INTEGER | Yes | Farmstock item ID; null for actions like "removed 1/3 media" |
| input_lot_id | INTEGER | Yes | Farmstock lot ID |
| quantity | REAL | Yes | Amount applied |
| quantity_unit | TEXT | Yes | Unit (e.g. "lb", "cup", "1/3 volume") |
| application_method | TEXT | Yes | Enum: top_dress \| mix_in \| drench \| side_dress \| replaced \| removed \| other |
| purpose | TEXT | Yes | Why this amendment was applied |
| soil_sample_id | INTEGER | Yes | FK → cv_soil_samples; links amendment to driving lab result (app-layer enforced) |
| applicator | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| product_name_snapshot | TEXT | Yes | Product name from farmstock captured at save time |
| corrects_id | INTEGER | Yes | FK → self; links correction to original |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** container_id → cv_containers; batch_id → cv_batches; applicator, created_by → cv_users; corrects_id → self. `soil_sample_id` FK is app-layer enforced (not DB-level, due to creation order). `input_id` and `input_lot_id` reference farmstock.

**Business rules:** Soil amendments are container-scoped, not batch-scoped (Rule 15). Append-only; corrections use `corrects_id`. `product_name_snapshot` captured for 5-year retention.

---

## cv_container_qr_codes

Permanent QR code stickers affixed to containers. Each QR encodes the container position ID for camera scanning. One record per container (UNIQUE on `container_id`).

| Column | Type | Nullable | Description |
|---|---|---|---|
| qr_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers; UNIQUE |
| qr_payload | TEXT | No | Encoded value (typically the container_id string, e.g. "Z1-A-R3-C12") |
| qr_format | TEXT | No | Enum: text \| url \| json; default "text" |
| printed_at | TEXT | Yes | When the label was printed |
| notes | TEXT | Yes | e.g. "replaced after damage 2026-04-15" |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** container_id → cv_containers (UNIQUE constraint enforces 1:1).

---

## cv_container_state

Current lifecycle state of every container — 1:1 with cv_containers. Seeded at migration time (all 1,180 containers start as "ready"). Updated on every state transition; the current snapshot.

| Column | Type | Nullable | Description |
|---|---|---|---|
| container_id | TEXT PK | No | FK → cv_containers (primary key is also the FK) |
| current_state | TEXT | No | Enum: ready \| active \| empty \| teardown \| startup \| out_of_service |
| state_since | TEXT | No | When the container entered its current state |
| current_batch_id | INTEGER | Yes | FK → cv_batches; set when state is active, empty, or teardown; null otherwise |
| media_first_used | TEXT | Yes | Date growing media was first added to this container |
| last_full_replacement | TEXT | Yes | Date of most recent full media replacement |
| last_teardown_date | TEXT | Yes | Date of most recent completed teardown |
| last_startup_date | TEXT | Yes | Date of most recent completed startup |
| notes | TEXT | Yes | Current status notes |
| updated_at | TEXT | No | Last modification timestamp |

**Foreign keys:** container_id → cv_containers; current_batch_id → cv_batches.

**Business rules:** State constraints are enforced at the application layer (Rule 30): `active` requires `current_batch_id` and an active plant assignment; `empty` requires `current_batch_id` and no active assignment; `ready`, `startup`, `out_of_service` require `current_batch_id` IS NULL. A container must be in `ready` state to accept a new batch (Rule 31).

---

## cv_container_state_transitions

Append-only audit log of every container state change. One row per transition. This is the permanent history; cv_container_state holds only the current snapshot.

| Column | Type | Nullable | Description |
|---|---|---|---|
| transition_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers |
| from_state | TEXT | Yes | Previous state; null for initial seed record |
| to_state | TEXT | No | New state |
| transitioned_at | TEXT | No | ISO-8601 UTC timestamp |
| transitioned_by | INTEGER | Yes | FK → cv_users |
| batch_id | INTEGER | Yes | FK → cv_batches; batch context at time of transition |
| trigger_event | TEXT | Yes | Enum: batch_assigned \| plant_loss \| plant_replaced \| batch_closed \| teardown_complete \| startup_complete \| manual \| other |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** container_id → cv_containers; transitioned_by → cv_users; batch_id → cv_batches.

**Business rules:** Append-only (Rule 38). Never delete or update rows.

---

## cv_containers

**Seed data.** 1,180 physical growing containers, each identified by a canonical position ID (e.g. `Z1-A-R3-C12`). Seeded by migration 002. Never created or deleted through the UI.

| Column | Type | Nullable | Description |
|---|---|---|---|
| container_id | TEXT PK | No | Position ID in format `Z{zone}-{sub}-R{row}-C{container}` (e.g. "Z1-A-R3-C12") |
| row_id | TEXT | No | FK → cv_rows |
| position | INTEGER | No | Container number within the row (1–30 for A sub-zones, 1–29 for B) |
| qr_code | TEXT | Yes | Legacy column; active QR data lives in cv_container_qr_codes |
| notes | TEXT | Yes | Physical notes (e.g. "broken drip", "damaged pot") |

**Foreign keys:** row_id → cv_rows.

**Business rules:** Container IDs follow the format `Z{zone}-{sub}-R{row}-C{pos}` (Rule 3). IDs are permanent and never renamed (Rule 2). The total is 1,180: 4 zones × (5 rows × 30 A-containers + 5 rows × 29 B-containers).

---

## cv_fertigation_recipe_ingredients

Individual ingredient lines within a fertigation recipe. Each line specifies one product, its rate, and mixing order position.

| Column | Type | Nullable | Description |
|---|---|---|---|
| id | INTEGER PK | No | Auto-increment primary key |
| recipe_id | INTEGER | No | FK → cv_fertigation_recipes |
| input_id | INTEGER | No | Farmstock item ID (must be fertilizer/amendment/biocontrol category) |
| rate_value | REAL | No | Application rate |
| rate_unit | TEXT | No | Rate unit (e.g. "tsp_per_gal", "ml_per_gal", "drops_per_gal") |
| order_index | INTEGER | No | Mixing order position (lower = earlier) |
| notes | TEXT | Yes | Conditional instructions (e.g. "Day 9 only" for Dynomyco) |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** recipe_id → cv_fertigation_recipes. `input_id` references farmstock (no DB FK).

**Business rules:** Recipes are immutable once approved (Rule 1). To change an ingredient, create a new recipe version.

---

## cv_fertigation_recipes

Versioned fertigation (drip nutrition) formulas. Immutable once approved. Seven named recipes exist: BASE, SEEDLING, AUTO-VEG, AUTO-FLOWER, PHOTO-VEG, PHOTO-FLOWER, FLUSH. Only one version per name is `active` at a time.

| Column | Type | Nullable | Description |
|---|---|---|---|
| recipe_id | INTEGER PK | No | Auto-increment primary key |
| name | TEXT | No | Enum: BASE \| SEEDLING \| AUTO-VEG \| AUTO-FLOWER \| PHOTO-VEG \| PHOTO-FLOWER \| FLUSH |
| version | TEXT | No | Semantic version string (e.g. "1.0", "1.1") |
| active | INTEGER | No | Boolean (0/1); only one active record per name |
| ec_target_low | REAL | Yes | Lower bound of target EC range |
| ec_target_high | REAL | Yes | Upper bound of target EC range |
| ph_target_low | REAL | Yes | Lower bound of target pH range |
| ph_target_high | REAL | Yes | Upper bound of target pH range |
| mixing_order | TEXT | Yes | Numbered mixing steps as plain text |
| notes | TEXT | Yes | Free text |
| approved_by | INTEGER | Yes | FK → cv_users |
| approved_at | TEXT | Yes | When the recipe was approved |
| superseded_at | TEXT | Yes | When this version was replaced by a newer version |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** approved_by, created_by → cv_users.

**Business rules:** Recipes are immutable once approved (Rule 1). To update, create a new version with incremented `version`, set `superseded_at` on the old, and set `active=0` on the old record. Applications always reference the exact version applied.

---

## cv_foliar_recipe_ingredients

Individual ingredient lines within a foliar recipe. Products must be non-pesticide categories.

| Column | Type | Nullable | Description |
|---|---|---|---|
| id | INTEGER PK | No | Auto-increment primary key |
| foliar_recipe_id | INTEGER | No | FK → cv_foliar_recipes |
| input_id | INTEGER | No | Farmstock item ID; must be foliar_nutrient/fertilizer/biocontrol_non_pesticide |
| rate_value | REAL | No | Application rate |
| rate_unit | TEXT | No | Rate unit |
| order_index | INTEGER | No | Mixing order position |
| notes | TEXT | Yes | Conditional instructions |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** foliar_recipe_id → cv_foliar_recipes. `input_id` references farmstock (no DB FK).

---

## cv_foliar_recipes

Versioned foliar spray recipes for repeat non-pesticide applications. Optional — single-product foliars do not require a recipe. Same immutability rules as fertigation recipes.

| Column | Type | Nullable | Description |
|---|---|---|---|
| foliar_recipe_id | INTEGER PK | No | Auto-increment primary key |
| name | TEXT | No | Display name (e.g. "Weekly Preventive Foliar") |
| version | TEXT | No | Semantic version string |
| active | INTEGER | No | Boolean (0/1) |
| purpose | TEXT | Yes | What this foliar is intended to address |
| notes | TEXT | Yes | Free text |
| approved_by | INTEGER | Yes | FK → cv_users |
| approved_at | TEXT | Yes | When approved |
| superseded_at | TEXT | Yes | When replaced by a newer version |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** approved_by, created_by → cv_users.

**Business rules:** Same immutability rules as cv_fertigation_recipes (Rule 1). Cannot include pesticide-category products (Rule 13).

---

## cv_harvest_batches

METRC harvest lots grouping plants harvested together under consistent environmental conditions in a 1–2 day window. Normally one per plant batch. A major weather event force-closes the current harvest batch and creates a new one (sequence_number+1) for remaining plants.

| Column | Type | Nullable | Description |
|---|---|---|---|
| harvest_batch_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches (the plant batch this harvest belongs to) |
| sequence_number | INTEGER | No | 1 for the normal case; increments when weather forces a split |
| batch_type | TEXT | No | Enum: harvest \| manicure (added migration 010); "harvest" = final cut batch, "manicure" = partial harvest batch |
| status | TEXT | No | Enum: in_progress \| completed \| force_closed |
| close_reason | TEXT | Yes | Enum: completed \| weather_event \| other |
| close_notes | TEXT | Yes | Required when close_reason = weather_event |
| started_at | TEXT | No | ISO-8601 UTC timestamp |
| completed_at | TEXT | Yes | Set when the last final_harvest event is recorded |
| ambient_temp_f | REAL | Yes | Environmental conditions applying to all events in this batch |
| ambient_rh | REAL | Yes | Ambient relative humidity (%) |
| wind_speed_mph | REAL | Yes | Wind speed |
| metrc_harvest_batch_uid | TEXT | Yes | Assigned in METRC at harvest time |
| metrc_name | TEXT | Yes | MN OCM required name: "Strain \| Date \| HB\|MB \| Auto\|Photo" (added migration 010) |
| started_by | INTEGER | Yes | FK → cv_users |
| closed_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; started_by, closed_by, created_by → cv_users.

**Business rules:** Environmental conditions (temp, RH, wind) recorded here apply to all cv_plant_harvest_events within. Weather event force-close creates a new harvest batch; the plant batch stays in `harvesting` status (Rule 47). `metrc_name` is immutable after METRC sync.

---

## cv_input_phi_stage_overrides

Per-product, per-batch-stage rules that override or block the default PHI. When `allowed = 0`, the application is completely blocked at that stage with no override. When `allowed = 1`, a stage-specific PHI replaces the product default.

| Column | Type | Nullable | Description |
|---|---|---|---|
| override_id | INTEGER PK | No | Auto-increment primary key |
| input_id | INTEGER | No | Farmstock item ID |
| batch_stage | TEXT | No | Enum: germ \| seedling \| cult_hoop \| field_veg \| field_flower_w1 \| field_flower_w2 \| field_flower_w3 \| field_flower_w4plus \| flush |
| allowed | INTEGER | No | Boolean (0/1); 0 = blocked at this stage entirely |
| phi_days_override | REAL | Yes | Alternative PHI (days) for this stage when allowed = 1 |
| reason | TEXT | Yes | Required when allowed = 0 (explains the block) |
| created_by | INTEGER | Yes | FK → cv_users |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** created_by → cv_users. `input_id` references farmstock (no DB FK).

**Business rules:** A block (`allowed = 0`) has no override path — the application is rejected entirely (Rule 19). This handles cases like "no biological foliars after flower week 3" where contamination risk is stage-based, not days-from-harvest.

---

## cv_locations

**Seed data.** Physical locations where plant batches reside, mirrored to METRC room names. 11 locations seeded by migration 011: 3 pre-field (Germ-01, Seedlings, Cult-Hoop) and 8 field (one per sub-zone). `metrc_name` must match the exact string as registered in METRC.

| Column | Type | Nullable | Description |
|---|---|---|---|
| location_id | INTEGER PK | No | Auto-increment primary key |
| name | TEXT | No | Internal display name (e.g. "Germ-01", "Z1A") |
| location_type | TEXT | No | Enum: germination \| seedling \| veg \| field |
| metrc_name | TEXT | No | Exact METRC room name; used in METRC event payloads |
| metrc_uid | TEXT | Yes | METRC API location UID; populated when Phase 4 sync is configured |
| sub_zone_id | TEXT | Yes | FK → cv_sub_zones; set for field locations; null for pre-field |
| active | INTEGER | No | Boolean (0/1) |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** sub_zone_id → cv_sub_zones.

---

## cv_metrc_sync_log

Audit trail of all METRC submissions. Every attempt to submit data to METRC (whether via Phase 1 manual queue or Phase 4 API) creates a record here. Immutable.

| Column | Type | Nullable | Description |
|---|---|---|---|
| sync_id | INTEGER PK | No | Auto-increment primary key |
| sync_type | TEXT | No | Enum: additive \| plant_batch \| plant_tag_assignment \| plant_waste \| harvest \| other |
| batch_id | INTEGER | Yes | FK → cv_batches |
| related_id | TEXT | Yes | ID of the source record (loss_id, harvest_id, etc.) |
| synced_at | TEXT | Yes | When the submission was made |
| status | TEXT | No | Enum: success \| failed \| pending |
| payload | TEXT | Yes | JSON payload sent to METRC |
| response | TEXT | Yes | JSON response from METRC |
| error | TEXT | Yes | Error detail on failure |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; created_by → cv_users.

---

## cv_observations

Plant condition notes logged at row or container granularity. Includes standard health observations and `harvest_readiness` observations (trichome/pistil maturity assessment). Observations with `category = harvest_readiness` populate additional fields.

| Column | Type | Nullable | Description |
|---|---|---|---|
| observation_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| row_id | TEXT | Yes | FK → cv_rows; set when observing at row level |
| container_id | TEXT | Yes | FK → cv_containers; set when observing a specific container |
| observed_at | TEXT | No | ISO-8601 UTC timestamp |
| category | TEXT | No | Enum: healthy \| pest \| deficiency \| disease \| damage \| harvest_readiness \| other |
| severity | TEXT | No | Enum: low \| medium \| high |
| note | TEXT | Yes | Free text description |
| observer | INTEGER | Yes | FK → cv_users |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| resolved_at | TEXT | Yes | When the issue was resolved |
| resolution_note | TEXT | Yes | How the issue was resolved |
| triggered_app_id | TEXT | Yes | Reference to a follow-up application record |
| maturity_pct | INTEGER | Yes | Trichome/pistil maturity 0–100; only for harvest_readiness (added migration 009) |
| ready_to_harvest | INTEGER | Yes | Boolean (0/1): staff judgment this plant is ready; only for harvest_readiness |
| harvest_priority | INTEGER | Yes | Processing order within row (1 = highest); only for harvest_readiness |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; row_id → cv_rows; container_id → cv_containers; observer, created_by → cv_users.

**Business rules:** `harvest_readiness` observations accumulate during `harvest_window` batch status and form the evidence base for the management decision to transition to `harvesting` (Rule 41). The transition is not gated — it is a management judgment call documented with notes (Rule 42).

---

## cv_plant_assignments

Live registry mapping METRC plant tags to physical containers. An active assignment (unassigned_at IS NULL) means a plant is currently in that container. Placement and tagging are separate events: a plant can be placed (plan committed) before a METRC tag is assigned.

| Column | Type | Nullable | Description |
|---|---|---|---|
| assignment_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| container_id | TEXT | No | FK → cv_containers |
| metrc_plant_tag | TEXT | Yes | 24-character METRC UID; null until tag is physically applied and scanned (changed to nullable in migration 014) |
| placed_at | TEXT | No | When plant went into the container (planting plan commit) |
| placed_by | INTEGER | Yes | FK → cv_users; who placed the plant |
| tagged_at | TEXT | Yes | When the METRC tag was associated; null until tag walk |
| tagged_by | INTEGER | Yes | FK → cv_users; who assigned the METRC tag |
| unassigned_at | TEXT | Yes | When the assignment ended; null = currently active |
| unassign_reason | TEXT | Yes | Enum: harvested \| destroyed \| died \| moved \| replaced \| other |
| unassign_notes | TEXT | Yes | Additional context for unassignment |
| unassigned_by | INTEGER | Yes | FK → cv_users |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** batch_id → cv_batches; container_id → cv_containers; placed_by, tagged_by, unassigned_by → cv_users.

**Business rules:** Multiple active assignments per container are supported for multi-plant containers (Rule 23). One active assignment per METRC tag — uniqueness on active tag is enforced at the application layer via partial unique index (Rule 24). METRC tag format must be 24 alphanumeric characters (Rule 25). Reassignment requires explicit confirmation showing the previous container (Rule 29).

---

## cv_plant_harvest_events

Individual harvest events against specific plants, always tied to a harvest batch. `partial_harvest` records product from a living plant; `final_harvest` cuts the plant and triggers container → teardown.

| Column | Type | Nullable | Description |
|---|---|---|---|
| harvest_event_id | INTEGER PK | No | Auto-increment primary key |
| harvest_batch_id | INTEGER | No | FK → cv_harvest_batches |
| batch_id | INTEGER | No | FK → cv_batches (denormalized for query convenience) |
| plant_assignment_id | INTEGER | No | FK → cv_plant_assignments |
| container_id | TEXT | No | FK → cv_containers |
| event_type | TEXT | No | Enum: partial_harvest \| final_harvest |
| harvested_at | TEXT | No | ISO-8601 UTC timestamp |
| product_type | TEXT | No | Enum: flower \| larf \| popcorn \| trim_product \| other |
| wet_weight | REAL | No | Weight of material harvested |
| weight_unit | TEXT | No | Unit (e.g. "g", "oz", "lb") |
| applicator | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| metrc_sync_status | TEXT | No | Enum: pending \| synced \| failed \| not_required |
| metrc_synced_at | TEXT | Yes | When METRC submission succeeded |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** harvest_batch_id → cv_harvest_batches; batch_id → cv_batches; plant_assignment_id → cv_plant_assignments; container_id → cv_containers; applicator, created_by → cv_users.

**Business rules:** Blocked unless batch status is `harvesting` (Rule 43). `partial_harvest` leaves the plant alive — no state changes (Rule 44). `final_harvest` unassigns the plant assignment (reason: harvested) and transitions the container to teardown (Rule 45). When all plants in a batch have a final_harvest, the batch auto-closes (Rule 48). Do not use "manicure" terminology in UI or code (Rule 44).

---

## cv_plant_loss_events

First-class records of mid-batch plant deaths and removals. Triggers plant assignment unassignment, container state change to EMPTY, and a METRC waste reporting queue item.

| Column | Type | Nullable | Description |
|---|---|---|---|
| loss_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| container_id | TEXT | No | FK → cv_containers |
| plant_assignment_id | INTEGER | No | FK → cv_plant_assignments (the assignment terminated by this loss) |
| metrc_plant_tag | TEXT | No | METRC UID denormalized at time of loss (for 5-year retention) |
| occurred_at | TEXT | No | Actual or estimated time of death |
| discovered_at | TEXT | No | When the loss was discovered (may differ from occurred_at) |
| loss_type | TEXT | No | Enum: death_natural \| death_disease \| death_pest \| physical_damage \| removal_culled \| removal_quality \| accidental \| other |
| loss_cause | TEXT | Yes | Specific cause (e.g. "root rot", "broken stem") |
| plant_disposition | TEXT | No | Enum: disposed_compost \| disposed_waste \| quarantined \| tested \| other |
| plant_count | INTEGER | No | Number of plants lost; default 1 |
| reported_by | INTEGER | Yes | FK → cv_users |
| metrc_sync_status | TEXT | No | Enum: pending \| synced \| failed \| not_required |
| metrc_synced_at | TEXT | Yes | When METRC submission succeeded |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** batch_id → cv_batches; container_id → cv_containers; plant_assignment_id → cv_plant_assignments; reported_by → cv_users.

**Business rules:** Recording a loss event must atomically unassign the plant assignment, transition the container to EMPTY, and queue the METRC waste event (Rule 32). All loss events must have `metrc_sync_status` tracked; unsynced losses surface as action items in the Today screen (Rule 39).

---

## cv_plant_waste_trim_events

Waste trim events recording material removed from a plant and disposed of as waste (not product). Available at any batch status. Independent of harvest events — these are first-class records, not sub-records.

| Column | Type | Nullable | Description |
|---|---|---|---|
| waste_trim_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| container_id | TEXT | Yes | FK → cv_containers; set for container-level trim |
| row_id | TEXT | Yes | FK → cv_rows; set for row-level trim |
| plant_assignment_id | INTEGER | Yes | FK → cv_plant_assignments |
| harvest_batch_id | INTEGER | Yes | FK → cv_harvest_batches; context only when occurring during harvesting |
| harvest_event_id | INTEGER | Yes | FK → cv_plant_harvest_events; context only when tied to a specific harvest event |
| trimmed_at | TEXT | No | ISO-8601 UTC timestamp |
| trim_reason | TEXT | No | Enum: defoliation \| lollipoping \| ipm_removal \| disease_removal \| pest_damage \| physical_damage \| senescence \| other |
| trim_reason_notes | TEXT | Yes | Additional reason detail |
| wet_weight | REAL | No | Weight of material trimmed |
| weight_unit | TEXT | No | Unit (e.g. "g", "oz", "lb") |
| waste_status | TEXT | No | Enum: collected \| held \| disposed \| reported |
| waste_status_updated_at | TEXT | No | When waste_status last changed |
| disposed_at | TEXT | Yes | When material was disposed |
| disposition | TEXT | Yes | Enum: composted \| incinerated \| quarantined \| tested \| other |
| disposed_by | INTEGER | Yes | FK → cv_users |
| applicator | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| metrc_sync_status | TEXT | No | Enum: pending \| synced \| failed \| not_required |
| metrc_synced_at | TEXT | Yes | When METRC submission succeeded |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** batch_id → cv_batches; container_id → cv_containers; row_id → cv_rows; plant_assignment_id → cv_plant_assignments; harvest_batch_id → cv_harvest_batches; harvest_event_id → cv_plant_harvest_events; disposed_by, applicator, created_by → cv_users.

**Business rules:** Available at any batch status — no `harvesting` prerequisite (Rule 49). `wet_weight` and `trim_reason` are required (Rule 50). Waste disposition lifecycle: collected → held → disposed → reported (Rule 50). Generates waste, not product — distinct from cv_plant_harvest_events (Rule 51).

---

## cv_planting_plan_items

Individual container assignments within a planting plan. Each item represents one container and how many plants it will receive. Items are locked (cannot be changed) once committed.

| Column | Type | Nullable | Description |
|---|---|---|---|
| item_id | INTEGER PK | No | Auto-increment primary key |
| plan_id | INTEGER | No | FK → cv_planting_plans |
| container_id | TEXT | No | FK → cv_containers |
| plants_count | INTEGER | No | Plants to place in this container (1 default; 2 for autoflower density) |
| status | TEXT | No | Enum: draft \| committed \| cancelled |
| committed_at | TEXT | Yes | When the item was committed |
| committed_by | INTEGER | Yes | FK → cv_users |
| plant_assignment_id | INTEGER | Yes | FK → cv_plant_assignments; set when commit creates the live assignment |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** plan_id → cv_planting_plans; container_id → cv_containers; committed_by → cv_users; plant_assignment_id → cv_plant_assignments.

**Business rules:** Committed items are locked — any container with an active plant assignment cannot be included in a new plan version. Committing an item creates the corresponding cv_plant_assignments record and transitions the container to active.

---

## cv_planting_plans

Versioned draft layouts for placing a plant batch into field containers. Created by admin. Supports partial commit workflows and versioning without mutation of committed items.

| Column | Type | Nullable | Description |
|---|---|---|---|
| plan_id | INTEGER PK | No | Auto-increment primary key |
| batch_id | INTEGER | No | FK → cv_batches |
| sub_zone_id | TEXT | No | FK → cv_sub_zones |
| version | INTEGER | No | Version number; increments when superseded |
| status | TEXT | No | Enum: draft \| active \| superseded \| cancelled |
| supersedes_plan_id | INTEGER | Yes | FK → self; null for version 1 |
| plants_to_place | INTEGER | No | Total plants this plan intends to place (informational) |
| notes | TEXT | Yes | Free text |
| created_by | INTEGER | Yes | FK → cv_users |
| created_at | TEXT | No | Record creation timestamp |
| activated_at | TEXT | Yes | Set when the first plan item is committed |
| superseded_at | TEXT | Yes | Set when a newer version is created |
| updated_at | TEXT | No | Last modification timestamp |

**Foreign keys:** batch_id → cv_batches; sub_zone_id → cv_sub_zones; supersedes_plan_id → self; created_by → cv_users.

**Business rules:** Plans are never deleted. Committed items from a superseded plan remain in place; only uncommitted items are carried to the new version. Admin-only creation is enforced at the API layer.

---

## cv_rows

**Seed data.** 40 rows within the field grid (5 rows per sub-zone × 8 sub-zones). Seeded by migration 002. Never created through the UI.

| Column | Type | Nullable | Description |
|---|---|---|---|
| row_id | TEXT PK | No | Row identifier (e.g. "Z1-A-R3") |
| sub_zone_id | TEXT | No | FK → cv_sub_zones |
| row_number | INTEGER | No | Row position within the sub-zone (1–5) |
| container_count | INTEGER | No | Number of containers in this row (30 for A sub-zones, 29 for B) |

**Foreign keys:** sub_zone_id → cv_sub_zones.

---

## cv_sensor_location_assignments

Append-only history of which SensorPush device is assigned to which location over time. When a sensor is moved, `unassigned_at` is set on the old row and a new row is inserted.

| Column | Type | Nullable | Description |
|---|---|---|---|
| assignment_id | INTEGER PK | No | Auto-increment primary key |
| sensor_id | TEXT | No | FK → cv_sensors |
| location_id | INTEGER | No | FK → cv_locations |
| sub_zone_id | TEXT | Yes | FK → cv_sub_zones; for field sensors; null for pre-field locations |
| assigned_at | TEXT | No | When the sensor was placed at this location |
| assigned_by | INTEGER | Yes | FK → cv_users |
| unassigned_at | TEXT | Yes | When the sensor was moved; null = currently assigned here |
| unassigned_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** sensor_id → cv_sensors; location_id → cv_locations; sub_zone_id → cv_sub_zones; assigned_by, unassigned_by → cv_users.

**Indexes:** `idx_sensor_assignments_location_unassigned` on (location_id, unassigned_at) for current-assignment lookups.

---

## cv_sensor_readings

Raw time-series environmental readings from SensorPush devices. Append-only. `location_id` and `sub_zone_id` are denormalized from the active assignment at ingest time. Full-resolution rows older than 90 days are deleted by the poller after hourly summaries are created.

| Column | Type | Nullable | Description |
|---|---|---|---|
| reading_id | INTEGER PK | No | Auto-increment primary key |
| sensor_id | TEXT | No | FK → cv_sensors |
| location_id | INTEGER | No | FK → cv_locations (denormalized from active assignment) |
| sub_zone_id | TEXT | Yes | Sub-zone ID (denormalized) |
| observed_at | TEXT | No | ISO-8601 UTC timestamp of the reading |
| temp_f | REAL | No | Temperature in Fahrenheit |
| humidity_rh | REAL | No | Relative humidity (%) |
| dew_point_f | REAL | No | Dew point in Fahrenheit |
| vpd_kpa | REAL | Yes | Vapor pressure deficit (kPa) |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** sensor_id → cv_sensors; location_id → cv_locations.

**Indexes:** UNIQUE on (sensor_id, observed_at) — enables `INSERT OR IGNORE` for idempotent polling. Additional indexes on (sensor_id, observed_at DESC) and (location_id, observed_at DESC).

---

## cv_sensor_readings_hourly

Hourly aggregated summary of environmental readings. Populated by the sensor poller's downsampling step. This is the permanent retention record after full-resolution rows are pruned.

| Column | Type | Nullable | Description |
|---|---|---|---|
| hourly_id | INTEGER PK | No | Auto-increment primary key |
| sensor_id | TEXT | No | FK → cv_sensors |
| location_id | INTEGER | No | FK → cv_locations |
| sub_zone_id | TEXT | Yes | Sub-zone ID (denormalized) |
| hour_at | TEXT | No | Hour bucket (ISO-8601 UTC, truncated to hour) |
| temp_f_avg | REAL | No | Average temperature |
| temp_f_min | REAL | No | Minimum temperature |
| temp_f_max | REAL | No | Maximum temperature |
| humidity_rh_avg | REAL | No | Average relative humidity (%) |
| humidity_rh_min | REAL | No | Minimum relative humidity (%) |
| humidity_rh_max | REAL | No | Maximum relative humidity (%) |
| dew_point_f_avg | REAL | No | Average dew point |
| vpd_kpa_avg | REAL | Yes | Average VPD (kPa) |
| vpd_kpa_min | REAL | Yes | Minimum VPD |
| vpd_kpa_max | REAL | Yes | Maximum VPD |
| sample_count | INTEGER | No | Number of raw readings averaged |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** sensor_id → cv_sensors; location_id → cv_locations.

**Indexes:** UNIQUE on (sensor_id, hour_at). Additional index on (location_id, hour_at).

---

## cv_sensors

Master record per physical SensorPush device. `sensor_id` is the SensorPush device identifier (string, not auto-increment).

| Column | Type | Nullable | Description |
|---|---|---|---|
| sensor_id | TEXT PK | No | SensorPush device ID |
| device_name | TEXT | No | Device name from SensorPush API |
| label | TEXT | Yes | Human-readable label (e.g. "Z1A Field Sensor") |
| model | TEXT | Yes | SensorPush hardware model |
| active | INTEGER | No | Boolean (0/1) |
| last_seen_at | TEXT | Yes | Most recent successful poll timestamp |
| battery_pct | INTEGER | Yes | Battery percentage from most recent poll |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |

---

## cv_skill_instances

Evidence trail linking a completed UEM (Uniform Enterprise Management) skill execution to an output record. Created whenever a skill-driven workflow (e.g. pesticide application via the skill UI) produces a compliance record. Preserves validation state at execution time.

| Column | Type | Nullable | Description |
|---|---|---|---|
| instance_id | INTEGER PK | No | Auto-increment primary key |
| skill_id | TEXT | No | Skill identifier (e.g. "pesticide-application") |
| skill_version | TEXT | No | Version of the skill definition used (e.g. "1.0") |
| sop_id | TEXT | Yes | Future: ff-dcs SOP reference |
| completed_by | INTEGER | No | FK → cv_users |
| completed_at | TEXT | No | ISO-8601 UTC timestamp |
| context | TEXT | No | JSON snapshot of key inputs at execution (batch_id, input_id, etc.) |
| validation_result | TEXT | No | JSON of full ValidationResult from skill-validator — which checks passed/failed |
| override_notes | TEXT | Yes | Required when warn_override checks were accepted |
| output_record_id | TEXT | Yes | ID of the created compliance record (e.g. pesticide_app_id) |
| output_table | TEXT | Yes | Table containing the output record (e.g. "cv_applications_pesticide") |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** completed_by → cv_users.

**Indexes:** idx_skill_instances_skill_id on skill_id; idx_skill_instances_output on (output_table, output_record_id); idx_skill_instances_completed_by on completed_by.

---

## cv_soil_sample_results

Structured lab analysis results for a soil sample. One row per measured parameter. Reference ranges and interpretation flags drive startup amendment decisions.

| Column | Type | Nullable | Description |
|---|---|---|---|
| result_id | INTEGER PK | No | Auto-increment primary key |
| sample_id | INTEGER | No | FK → cv_soil_samples |
| parameter | TEXT | No | Measurement name (e.g. "pH", "EC", "N_ppm", "P_ppm", "K_ppm", "Ca_ppm", "OM_pct") |
| value | REAL | No | Measured value |
| unit | TEXT | Yes | Unit (e.g. "ppm", "%", "meq/100g") |
| reference_low | REAL | Yes | Lower bound of optimal range |
| reference_high | REAL | Yes | Upper bound of optimal range |
| interpretation | TEXT | Yes | Enum: deficient \| low \| optimal \| high \| excessive \| unknown |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** sample_id → cv_soil_samples.

---

## cv_soil_samples

Soil samples collected from containers or sub-zones, tracked through the lab analysis lifecycle. Links to the driving teardown and the resulting amendments.

| Column | Type | Nullable | Description |
|---|---|---|---|
| sample_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers |
| sub_zone_id | TEXT | Yes | FK → cv_sub_zones; set for composite sub-zone samples |
| sample_type | TEXT | No | Enum: individual \| composite_row \| composite_subzone |
| sampled_at | TEXT | No | ISO-8601 UTC timestamp |
| sampled_by | INTEGER | Yes | FK → cv_users |
| sample_label | TEXT | No | Physical label on the sample bag (e.g. "Z1-A-R3-C12 2026-04-01") |
| teardown_id | INTEGER | Yes | FK → cv_teardown_events; set when collected during teardown |
| lab_name | TEXT | Yes | Laboratory where sample was sent |
| lab_sent_at | TEXT | Yes | Date sent to lab (YYYY-MM-DD) |
| lab_results_at | TEXT | Yes | Date results received (YYYY-MM-DD) |
| results_received | INTEGER | No | Boolean (0/1) |
| lab_report_url | TEXT | Yes | URL of attached PDF lab report |
| notes | TEXT | Yes | Free text |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** container_id → cv_containers; sub_zone_id → cv_sub_zones; sampled_by, created_by → cv_users; teardown_id → cv_teardown_events.

**Business rules:** Teardown without a soil sample is allowed but flagged (Rule 35). Results drive startup amendment decisions; the startup workflow pre-fills the most recent sample for the container (Rule 36).

---

## cv_startup_events

Records the media replacement and amendment work performed between teardown and READY state. Supervisor sign-off is required before the container can return to READY.

| Column | Type | Nullable | Description |
|---|---|---|---|
| startup_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers |
| prior_teardown_id | INTEGER | Yes | FK → cv_teardown_events |
| prior_soil_sample_id | INTEGER | Yes | FK → cv_soil_samples; sample that informed amendments |
| started_at | TEXT | No | ISO-8601 UTC timestamp |
| completed_at | TEXT | Yes | When startup was completed |
| media_replaced_pct | REAL | Yes | Percentage of media replaced (e.g. 33 for "1/3 replacement", 100 for full) |
| media_brand | TEXT | Yes | Growing media brand (e.g. "Pro-Mix HP") |
| amendments_applied_count | INTEGER | No | Number of amendments applied during startup |
| ready_sign_off_at | TEXT | Yes | Supervisor sign-off timestamp |
| ready_sign_off_by | INTEGER | Yes | FK → cv_users; required before READY transition (Rule 37) |
| performed_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** container_id → cv_containers; prior_teardown_id → cv_teardown_events; prior_soil_sample_id → cv_soil_samples; ready_sign_off_by, performed_by, created_by → cv_users.

**Business rules:** Container cannot transition from STARTUP to READY without `ready_sign_off_at` and `ready_sign_off_by` (Rule 37).

---

## cv_strains

Cannabis cultivar definitions. Referenced by plant batches to associate a genetic variety with a grow run.

| Column | Type | Nullable | Description |
|---|---|---|---|
| strain_id | INTEGER PK | No | Auto-increment primary key |
| name | TEXT | No | Cultivar name (e.g. "Northern Lights Auto") |
| type | TEXT | No | Enum: auto \| photo |
| genetics | TEXT | Yes | Parent genetics description |
| notes | TEXT | Yes | Free text |
| active | INTEGER | No | Boolean (0/1) |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** created_by → cv_users.

---

## cv_sub_locations

**Seed data (schema defined, no seed rows yet).** Optional METRC sub-locations within a location. Schema created in migration 011; rows added only when the operation configures METRC sub-locations.

| Column | Type | Nullable | Description |
|---|---|---|---|
| sub_location_id | INTEGER PK | No | Auto-increment primary key |
| location_id | INTEGER | No | FK → cv_locations |
| name | TEXT | No | Display name |
| metrc_name | TEXT | No | Exact METRC sub-location name |
| metrc_uid | TEXT | Yes | METRC API UID |
| active | INTEGER | No | Boolean (0/1) |
| created_at | TEXT | No | Record creation timestamp |

**Foreign keys:** location_id → cv_locations.

---

## cv_sub_zones

**Seed data.** 8 sub-zones (A and B per zone × 4 zones) with fixed pot sizes and container counts. Sub-zone IDs are permanent identifiers — never renamed or recycled.

| Column | Type | Nullable | Description |
|---|---|---|---|
| sub_zone_id | TEXT PK | No | Identifier (e.g. "Z1A", "Z2B") |
| zone_id | INTEGER | No | FK → cv_zones |
| designation | TEXT | No | "A" (30-gal, 150 containers) or "B" (10-gal, 145 containers) |
| pot_size_gal | INTEGER | No | Container size in gallons (30 for A, 10 for B) |
| row_count | INTEGER | No | Always 5 |
| container_count | INTEGER | No | Total containers (150 for A, 145 for B) |

**Foreign keys:** zone_id → cv_zones.

**Business rules:** Sub-zone IDs are permanent identifiers — never renamed or recycled (Rule 2).

---

## cv_teardown_events

Records the container cleanup and soil sampling work performed after a batch ends. Captures completion of each checklist item (plant removed, debris disposed, container cleaned, soil sample collected).

| Column | Type | Nullable | Description |
|---|---|---|---|
| teardown_id | INTEGER PK | No | Auto-increment primary key |
| container_id | TEXT | No | FK → cv_containers |
| batch_id | INTEGER | No | FK → cv_batches (the batch that was harvested out) |
| started_at | TEXT | No | ISO-8601 UTC timestamp |
| completed_at | TEXT | Yes | When teardown was completed |
| plant_removed | INTEGER | No | Boolean (0/1) |
| debris_disposed | INTEGER | No | Boolean (0/1) |
| container_cleaned | INTEGER | No | Boolean (0/1) |
| soil_sample_collected | INTEGER | No | Boolean (0/1) |
| soil_sample_id | INTEGER | Yes | FK → cv_soil_samples; set after sample is created (app-layer enforced) |
| performed_by | INTEGER | Yes | FK → cv_users |
| notes | TEXT | Yes | Free text |
| photo_urls | TEXT | Yes | JSON array of photo URLs |
| created_at | TEXT | No | Record creation timestamp |
| created_by | INTEGER | Yes | FK → cv_users |

**Foreign keys:** container_id → cv_containers; batch_id → cv_batches; performed_by, created_by → cv_users. `soil_sample_id` FK to cv_soil_samples is app-layer enforced (deferred due to creation order in migrations).

**Business rules:** Teardown with `soil_sample_collected = 0` is allowed but flagged (Rule 35). All containers assigned to a closing batch — whether ACTIVE or EMPTY — transition to TEARDOWN (Rule 34).

---

## cv_users

Application users with PIN-based authentication. Three roles: grower (field staff), supervisor (can approve transitions and sign off containers), admin (full access including system configuration).

| Column | Type | Nullable | Description |
|---|---|---|---|
| id | INTEGER PK | No | Auto-increment primary key |
| name | TEXT | No | Display name |
| email | TEXT | Yes | Email address |
| pin_hash | TEXT | No | Bcrypt hash of the 4–6 digit PIN |
| role | TEXT | No | Enum: grower \| supervisor \| admin; default "grower" |
| active | INTEGER | No | Boolean (0/1) |
| failed_attempts | INTEGER | No | Consecutive failed PIN attempts; used for lockout |
| locked_until | TEXT | Yes | ISO-8601 UTC timestamp until which login is blocked |
| last_login_at | TEXT | Yes | Most recent successful login timestamp |
| created_at | TEXT | No | Record creation timestamp |
| updated_at | TEXT | No | Last modification timestamp |

**Business rules:** All routes require authentication via `requireAuth` middleware. Write operations affecting compliance records require at minimum the `grower` role; batch transitions and sensitive operations require `supervisor`. Every compliance record stores a user FK for the applicator/observer.

---

## cv_zones

**Seed data.** 4 irrigation zones. Seeded by migration 002. Never created through the UI.

| Column | Type | Nullable | Description |
|---|---|---|---|
| zone_id | INTEGER PK | No | Zone number (1–4) |
| name | TEXT | No | Display name (e.g. "Zone 1") |
