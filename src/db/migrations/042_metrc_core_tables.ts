import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const now = knex.raw("(datetime('now'))");

  // cv_employees must be created before cv_metrc_package_adjustments (FK dependency)
  await knex.schema.createTable('cv_employees', (table) => {
    table.increments('employee_id').primary();
    table.text('license_number').notNullable().unique();
    table.text('name').notNullable();
    table.text('role').nullable();
    table.integer('user_id').nullable().references('id').inTable('cv_users');
    table.integer('is_active').notNullable().defaultTo(1);
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_csv_uploads', (table) => {
    table.increments('upload_id').primary();
    table.text('upload_type').notNullable();
    table.text('file_path').notNullable();
    table.integer('row_count').notNullable();
    table.text('generated_at').notNullable();
    table.integer('generated_by').notNullable().references('id').inTable('cv_users');
    table.text('metrc_submitted_at').nullable();
    table.text('metrc_response').nullable();
    table.text('status').notNullable().defaultTo('generated');
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_additive_templates', (table) => {
    table.increments('template_id').primary();
    table.text('name').notNullable().unique();
    table.text('additive_type').notNullable();
    table.text('product_trade_name').nullable();
    table.text('epa_registration_number').nullable();
    table.text('note').nullable();
    table.text('rei_quantity').nullable();
    table.text('rei_time_unit').nullable();
    table.text('product_supplier').nullable();
    table.text('application_device').nullable();
    table.text('active_ingredients').notNullable(); // JSON: [{name, percentage}]
    table.integer('crop_input_id').nullable().references('input_id').inTable('cv_crop_inputs');
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_additive_applications', (table) => {
    table.increments('application_id').primary();
    table.text('application_type').notNullable(); // immature_batch | plant | location
    table.integer('template_id').notNullable().references('template_id').inTable('cv_metrc_additive_templates');
    table.integer('target_plant_batch_id').nullable().references('batch_id').inTable('cv_batches');
    table.text('target_plant_tag').nullable();
    table.integer('target_location_id').nullable().references('location_id').inTable('cv_locations');
    table.text('target_sublocation').nullable();
    table.text('rate').nullable();
    table.text('volume').nullable();
    table.float('total_amount_applied').notNullable();
    table.text('total_amount_uom').notNullable();
    table.text('actual_date').notNullable();
    table.integer('cultivate_application_id').nullable();
    table.text('cultivate_application_table').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_plant_state', (table) => {
    table.increments('plant_state_id').primary();
    table.text('plant_tag').notNullable().unique();
    table.text('previous_plant_tag').nullable();
    table.text('tag_change_date').nullable();
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.integer('strain_id').notNullable().references('strain_id').inTable('cv_strains');
    table.text('growth_phase').notNullable(); // Vegetative | Flowering
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('sublocation').nullable();
    table.text('phase_transition_date').notNullable();
    table.integer('is_mother_plant').notNullable().defaultTo(0);
    table.text('patient_license_number').nullable();
    table.text('status').notNullable().defaultTo('active'); // active | harvested | manicured | destroyed | packaged
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_submitted_at').nullable();
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_packages', (table) => {
    table.increments('package_id').primary();
    table.text('package_tag').notNullable().unique();
    table.text('item_name').notNullable();
    table.text('source_type').notNullable(); // immature_batch | plant_group | mother_plant | harvest
    table.integer('source_plant_batch_id').nullable().references('batch_id').inTable('cv_batches');
    table.text('source_plant_group_label').nullable();
    table.text('source_plant_label').nullable();
    table.text('source_harvest_ingredients').nullable(); // JSON
    table.text('plant_batch_type').nullable(); // Clone | Seed
    table.integer('item_count').nullable();
    table.float('weight_amount').nullable();
    table.text('weight_uom').nullable();
    table.integer('location_id').nullable().references('location_id').inTable('cv_locations');
    table.text('sublocation').nullable();
    table.text('patient_license_number').nullable();
    table.text('note').nullable();
    table.integer('is_trade_sample').notNullable().defaultTo(0);
    table.integer('is_donation').notNullable().defaultTo(0);
    table.text('production_batch_number').nullable();
    table.text('actual_date').notNullable();
    table.text('expiration_date').nullable();
    table.text('sell_by_date').nullable();
    table.text('use_by_date').nullable();
    table.text('status').notNullable().defaultTo('active');
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_package_adjustments', (table) => {
    table.increments('adjustment_id').primary();
    table.integer('package_id').notNullable().references('package_id').inTable('cv_metrc_packages');
    table.float('quantity_change').notNullable();
    table.text('unit_of_measure').notNullable();
    table.text('adjustment_reason').notNullable();
    table.text('reason_note').nullable();
    table.text('adjustment_date').notNullable();
    table.integer('employee_id').notNullable().references('employee_id').inTable('cv_employees');
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_immature_waste_events', (table) => {
    table.increments('waste_event_id').primary();
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('waste_method').notNullable();
    table.text('mixed_material').nullable();
    table.float('waste_weight').notNullable();
    table.text('waste_uom').notNullable();
    table.text('waste_reason').notNullable();
    table.text('note').nullable();
    table.text('waste_date').notNullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
  });

  await knex.schema.createTable('cv_metrc_immature_destruction_events', (table) => {
    table.increments('destruction_id').primary();
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.integer('count').notNullable();
    table.text('waste_method').nullable();
    table.text('waste_material_mixed').nullable();
    table.text('waste_reason').notNullable();
    table.text('reason_note').nullable();
    table.float('waste_weight').notNullable().defaultTo(0);
    table.text('waste_uom').nullable();
    table.text('actual_date').notNullable();
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_metrc_immature_destruction_events');
  await knex.schema.dropTableIfExists('cv_metrc_immature_waste_events');
  await knex.schema.dropTableIfExists('cv_metrc_package_adjustments');
  await knex.schema.dropTableIfExists('cv_metrc_packages');
  await knex.schema.dropTableIfExists('cv_metrc_plant_state');
  await knex.schema.dropTableIfExists('cv_metrc_additive_applications');
  await knex.schema.dropTableIfExists('cv_metrc_additive_templates');
  await knex.schema.dropTableIfExists('cv_metrc_csv_uploads');
  await knex.schema.dropTableIfExists('cv_employees');
}
