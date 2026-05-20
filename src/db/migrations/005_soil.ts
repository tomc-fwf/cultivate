import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Teardown events — created first so soil_samples can reference teardown_id
  await knex.schema.createTableIfNotExists('cv_teardown_events', (table) => {
    table.increments('teardown_id');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('started_at').notNullable();
    table.text('completed_at').nullable();
    table.integer('plant_removed').notNullable().defaultTo(0);
    table.integer('debris_disposed').notNullable().defaultTo(0);
    table.integer('container_cleaned').notNullable().defaultTo(0);
    table.integer('soil_sample_collected').notNullable().defaultTo(0);
    // soil_sample_id: populated after sample is created
    table.integer('soil_sample_id').nullable();
    table.integer('performed_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Soil samples
  await knex.schema.createTableIfNotExists('cv_soil_samples', (table) => {
    table.increments('sample_id');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.text('sub_zone_id').nullable().references('sub_zone_id').inTable('cv_sub_zones');
    // sample_type: "individual" | "composite_row" | "composite_subzone"
    table.text('sample_type').notNullable();
    table.text('sampled_at').notNullable();
    table.integer('sampled_by').nullable().references('id').inTable('cv_users');
    table.text('sample_label').notNullable();
    table.integer('teardown_id').nullable().references('teardown_id').inTable('cv_teardown_events');
    table.text('lab_name').nullable();
    table.text('lab_sent_at').nullable();
    table.text('lab_results_at').nullable();
    table.integer('results_received').notNullable().defaultTo(0);
    table.text('lab_report_url').nullable();
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Soil sample results — one row per parameter per sample
  await knex.schema.createTableIfNotExists('cv_soil_sample_results', (table) => {
    table.increments('result_id');
    table.integer('sample_id').notNullable().references('sample_id').inTable('cv_soil_samples');
    // parameter: e.g. "pH", "EC", "N_ppm", "P_ppm", "K_ppm", "Ca_ppm", "Mg_ppm", "OM_pct", "CEC", "Na_ppm"
    table.text('parameter').notNullable();
    table.float('value').notNullable();
    table.text('unit').nullable(); // e.g. "ppm", "%", "meq/100g"
    table.float('reference_low').nullable();
    table.float('reference_high').nullable();
    // interpretation: "deficient" | "low" | "optimal" | "high" | "excessive" | "unknown"
    table.text('interpretation').nullable();
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Startup events
  await knex.schema.createTableIfNotExists('cv_startup_events', (table) => {
    table.increments('startup_id');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.integer('prior_teardown_id').nullable().references('teardown_id').inTable('cv_teardown_events');
    table.integer('prior_soil_sample_id').nullable().references('sample_id').inTable('cv_soil_samples');
    table.text('started_at').notNullable();
    table.text('completed_at').nullable();
    table.float('media_replaced_pct').nullable(); // e.g. 33 for "replace 1/3", 100 for full
    table.text('media_brand').nullable(); // e.g. "Pro-Mix HP"
    table.integer('amendments_applied_count').notNullable().defaultTo(0);
    table.text('ready_sign_off_at').nullable();
    table.integer('ready_sign_off_by').nullable().references('id').inTable('cv_users');
    table.integer('performed_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_startup_events');
  await knex.schema.dropTableIfExists('cv_soil_sample_results');
  await knex.schema.dropTableIfExists('cv_soil_samples');
  await knex.schema.dropTableIfExists('cv_teardown_events');
}
