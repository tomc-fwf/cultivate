import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Fertigation applications — routine drip applications at sub-zone level
  await knex.schema.createTableIfNotExists('cv_applications_fertigation', (table) => {
    table.increments('application_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.integer('recipe_id').notNullable().references('recipe_id').inTable('cv_fertigation_recipes');
    table.text('applied_at').notNullable();
    table.float('volume_gallons').notNullable();
    table.float('ec_measured').notNullable(); // required — "meter-error" captured in notes if broken
    table.float('ph_measured').notNullable(); // required — "meter-error" captured in notes if broken
    table.float('solution_temp_f').nullable();
    table.float('ambient_temp_f').nullable();
    table.float('ambient_rh').nullable();
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.integer('corrects_id').nullable().references('application_id').inTable('cv_applications_fertigation');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Foliar applications — non-pesticide foliar sprays at row/container level
  await knex.schema.createTableIfNotExists('cv_applications_foliar', (table) => {
    table.increments('foliar_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('row_id').nullable().references('row_id').inTable('cv_rows');
    table.text('container_id').nullable().references('container_id').inTable('cv_containers');
    table.text('applied_at').notNullable();
    table.integer('foliar_recipe_id').nullable().references('foliar_recipe_id').inTable('cv_foliar_recipes');
    // input_id: used when no recipe — must be non-pesticide category (enforced at app layer)
    table.integer('input_id').nullable();
    table.integer('input_lot_id').nullable();
    table.float('rate_value').nullable(); // required if no recipe
    table.text('rate_unit').nullable();
    table.float('volume_applied').nullable();
    table.text('volume_unit').nullable(); // e.g. "gal", "L"
    table.text('purpose').notNullable(); // required per business rule 12
    table.float('ambient_temp_f').nullable();
    table.float('ambient_rh').nullable();
    table.integer('phi_compliant').nullable(); // system-computed
    table.integer('stage_compliant').nullable(); // system-computed against cv_input_phi_stage_overrides
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.integer('corrects_id').nullable().references('foliar_id').inTable('cv_applications_foliar');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Pesticide applications — full MN MDA compliance records
  await knex.schema.createTableIfNotExists('cv_applications_pesticide', (table) => {
    table.increments('pesticide_app_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('row_id').nullable().references('row_id').inTable('cv_rows');
    table.text('container_id').nullable().references('container_id').inTable('cv_containers');
    table.text('applied_at').notNullable();
    // input_id references items.id in shared DB (must be pesticide | fungicide | biocontrol_pesticide)
    table.integer('input_id').notNullable();
    // input_lot_id required for pesticides per business rule 16
    table.integer('input_lot_id').notNullable();
    table.float('rate_value').notNullable();
    table.text('rate_unit').notNullable();
    table.float('volume_applied').notNullable();
    table.text('volume_unit').notNullable();
    // application_method: "foliar_spray" | "soil_drench" | "granular" | "other"
    table.text('application_method').notNullable();
    table.text('target_pest').notNullable(); // required per business rule 17
    // pest_pressure: "incidental" | "threshold" | "outbreak"
    table.text('pest_pressure').nullable();
    table.float('ambient_temp_f').notNullable(); // required per business rule 17
    table.float('ambient_rh').nullable();
    table.float('wind_speed_mph').notNullable(); // required per business rule 17
    table.text('wind_direction').nullable();
    table.integer('phi_compliant').nullable(); // system-computed using phi_days_operational
    table.text('expected_harvest_date').nullable();
    table.text('rei_expires_at').nullable(); // computed from applied_at + rei_hours
    table.text('rei_cleared_at').nullable();
    table.integer('rei_cleared_by').nullable().references('id').inTable('cv_users');
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('applicator_license').nullable(); // required for restricted-use pesticides
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.integer('corrects_id').nullable().references('pesticide_app_id').inTable('cv_applications_pesticide');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Observations — plant condition notes at row/container granularity
  await knex.schema.createTableIfNotExists('cv_observations', (table) => {
    table.increments('observation_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('row_id').nullable().references('row_id').inTable('cv_rows');
    table.text('container_id').nullable().references('container_id').inTable('cv_containers');
    table.text('observed_at').notNullable();
    // category: "healthy" | "pest" | "deficiency" | "disease" | "damage" | "other"
    table.text('category').notNullable();
    // severity: "low" | "medium" | "high"
    table.text('severity').notNullable();
    table.text('note').nullable();
    table.integer('observer').nullable().references('id').inTable('cv_users');
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.text('resolved_at').nullable();
    table.text('resolution_note').nullable();
    table.text('triggered_app_id').nullable(); // reference to follow-up application
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // METRC sync log — audit trail for all METRC submissions
  await knex.schema.createTableIfNotExists('cv_metrc_sync_log', (table) => {
    table.increments('sync_id');
    // sync_type: "additive" | "plant_batch" | "plant_tag_assignment" | "plant_waste" | "harvest" | "other"
    table.text('sync_type').notNullable();
    table.integer('batch_id').nullable().references('batch_id').inTable('cv_batches');
    table.text('related_id').nullable(); // ID of the source record (loss_id, harvest_id, etc.)
    table.text('synced_at').nullable();
    // status: "success" | "failed" | "pending"
    table.text('status').notNullable().defaultTo('pending');
    table.text('payload').nullable(); // JSON stored as text
    table.text('response').nullable(); // JSON stored as text
    table.text('error').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_metrc_sync_log');
  await knex.schema.dropTableIfExists('cv_observations');
  await knex.schema.dropTableIfExists('cv_applications_pesticide');
  await knex.schema.dropTableIfExists('cv_applications_foliar');
  await knex.schema.dropTableIfExists('cv_applications_fertigation');
}
