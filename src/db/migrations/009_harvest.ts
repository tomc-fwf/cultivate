import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Alter cv_batches ────────────────────────────────────────────────────
  // Add plants_per_container: intended planting density for the batch.
  // Default 1; 2 is common for autoflowers. Consistent across the plant
  // batch — not per-container. Multiple active plant_assignments per
  // container are valid; no unique constraint on (container_id, active).
  //
  // Note: status comment below reflects the new enum values. SQLite TEXT
  // columns have no enforced CHECK here — enforcement is at the app layer.
  // New valid values: harvest_window | harvesting  (replaces old "harvest")
  await knex.schema.alterTable('cv_batches', (table) => {
    table.integer('plants_per_container').notNullable().defaultTo(1);
  });

  // ── Alter cv_observations ────────────────────────────────────────────────
  // Add harvest_readiness fields. These are only populated when
  // category = 'harvest_readiness'. All three are nullable so existing
  // observation rows are unaffected.
  await knex.schema.alterTable('cv_observations', (table) => {
    // maturity_pct: estimated trichome/pistil maturity 0–100
    table.integer('maturity_pct').nullable();
    // ready_to_harvest: staff judgment — this plant is ready now (boolean 0/1)
    table.integer('ready_to_harvest').nullable();
    // harvest_priority: relative processing order within the row (1 = highest)
    table.integer('harvest_priority').nullable();
  });

  // ── harvest_batches ──────────────────────────────────────────────────────
  // Groups plants harvested together under consistent conditions in a 1–2 day
  // window. Normally one per plant batch. A major weather event force-closes
  // the current harvest_batch and creates a new one (sequence_number+1) for
  // the remaining plants. Maps 1:1 to a METRC harvest lot.
  await knex.schema.createTableIfNotExists('cv_harvest_batches', (table) => {
    table.increments('harvest_batch_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    // sequence_number: 1 for the normal case; increments on weather-forced splits
    table.integer('sequence_number').notNullable().defaultTo(1);
    // status: "in_progress" | "completed" | "force_closed"
    table.text('status').notNullable().defaultTo('in_progress');
    // close_reason: "completed" | "weather_event" | "other"
    table.text('close_reason').nullable();
    // close_notes: required when close_reason = 'weather_event'
    table.text('close_notes').nullable();
    table.text('started_at').notNullable();
    table.text('completed_at').nullable();
    // Environmental conditions recorded at the harvest batch level and applied
    // to all plant_harvest_events within this batch.
    table.float('ambient_temp_f').nullable();
    table.float('ambient_rh').nullable();
    table.float('wind_speed_mph').nullable();
    // Assigned in METRC at harvest time (Phase 4 auto-sync; Phase 1 manual)
    table.text('metrc_harvest_batch_uid').nullable();
    table.integer('started_by').nullable().references('id').inTable('cv_users');
    table.integer('closed_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // ── plant_harvest_events ─────────────────────────────────────────────────
  // Records both partial harvest (METRC: "manicure") and final harvest events
  // against individual plants. Always associated with a harvest_batch.
  //
  // event_type = partial_harvest: plant lives, container stays active.
  //   Multiple partial harvests allowed per plant per harvest_batch.
  //   "Manicure" is METRC's term — do not use it in the UI.
  //
  // event_type = final_harvest: plant is cut. Triggers:
  //   - plant_assignment unassigned (reason: 'harvested')
  //   - container → teardown state
  //   - check if all plants in batch are final_harvested → batch → closed
  await knex.schema.createTableIfNotExists('cv_plant_harvest_events', (table) => {
    table.increments('harvest_event_id');
    table.integer('harvest_batch_id').notNullable().references('harvest_batch_id').inTable('cv_harvest_batches');
    // Denormalized for query convenience — avoids join through harvest_batches
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.integer('plant_assignment_id').notNullable().references('assignment_id').inTable('cv_plant_assignments');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    // event_type: "partial_harvest" | "final_harvest"
    table.text('event_type').notNullable();
    table.text('harvested_at').notNullable();
    // product_type: "flower" | "larf" | "popcorn" | "trim_product" | "other"
    table.text('product_type').notNullable();
    table.float('wet_weight').notNullable();
    table.text('weight_unit').notNullable(); // e.g. "g", "oz", "lb"
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    // metrc_sync_status: "pending" | "synced" | "failed" | "not_required"
    table.text('metrc_sync_status').notNullable().defaultTo('pending');
    table.text('metrc_synced_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // ── plant_waste_trim_events ──────────────────────────────────────────────
  // Standalone waste trim events — distinct from harvest events. Occur at
  // any batch status (veg, flower, flush, harvest_window, harvesting).
  // Generate waste, not product. Have their own disposal lifecycle.
  //
  // Peer of plant_harvest_events — not subordinate to them. An event during
  // a harvest session may optionally reference a harvest_batch_id or
  // harvest_event_id for context, but is a first-class record in its own right.
  await knex.schema.createTableIfNotExists('cv_plant_waste_trim_events', (table) => {
    table.increments('waste_trim_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('container_id').nullable().references('container_id').inTable('cv_containers');
    table.text('row_id').nullable().references('row_id').inTable('cv_rows');
    table.integer('plant_assignment_id').nullable().references('assignment_id').inTable('cv_plant_assignments');
    // Set when occurring during harvesting stage — for context only
    table.integer('harvest_batch_id').nullable().references('harvest_batch_id').inTable('cv_harvest_batches');
    // Set when tied to a specific harvest event — for context only
    table.integer('harvest_event_id').nullable().references('harvest_event_id').inTable('cv_plant_harvest_events');
    table.text('trimmed_at').notNullable();
    // trim_reason: "defoliation" | "lollipoping" | "ipm_removal" | "disease_removal" |
    //              "pest_damage" | "physical_damage" | "senescence" | "other"
    table.text('trim_reason').notNullable();
    table.text('trim_reason_notes').nullable();
    table.float('wet_weight').notNullable();
    table.text('weight_unit').notNullable(); // e.g. "g", "oz", "lb"
    // waste_status: "collected" | "held" | "disposed" | "reported"
    // collected: material removed and weighed, not yet disposed
    // held:      quarantine, testing, or awaiting disposal window
    // disposed:  composted, incinerated, etc. per disposition field
    // reported:  METRC waste/destruction event synced
    table.text('waste_status').notNullable().defaultTo('collected');
    table.text('waste_status_updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('disposed_at').nullable();
    // disposition: "composted" | "incinerated" | "quarantined" | "tested" | "other"
    table.text('disposition').nullable();
    table.integer('disposed_by').nullable().references('id').inTable('cv_users');
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    // metrc_sync_status: "pending" | "synced" | "failed" | "not_required"
    table.text('metrc_sync_status').notNullable().defaultTo('pending');
    table.text('metrc_synced_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_plant_waste_trim_events');
  await knex.schema.dropTableIfExists('cv_plant_harvest_events');
  await knex.schema.dropTableIfExists('cv_harvest_batches');

  await knex.schema.alterTable('cv_observations', (table) => {
    table.dropColumn('harvest_priority');
    table.dropColumn('ready_to_harvest');
    table.dropColumn('maturity_pct');
  });

  await knex.schema.alterTable('cv_batches', (table) => {
    table.dropColumn('plants_per_container');
  });
}
