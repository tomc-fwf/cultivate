import type { Knex } from 'knex';

// SQLite does not support DROP COLUMN — down() is intentionally a no-op.
// To reverse this migration, recreate the affected tables without these columns.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_batches', (table) => {
    table.text('metrc_source_type').nullable();
    table.text('metrc_source_package_label').nullable();
    table.text('metrc_source_plant_label').nullable();
    table.text('metrc_source_batch_name').nullable();
    table.text('metrc_ingredient_batch_names').nullable(); // JSON array of batch names
    table.float('metrc_package_adjustment_amount').nullable();
    table.text('metrc_package_adjustment_uom').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
  });

  await knex.schema.alterTable('cv_harvest_batches', (table) => {
    table.integer('is_auto_generated_name').notNullable().defaultTo(0);
    table.integer('metrc_harvest_id').nullable();
    table.float('total_packaged_weight').notNullable().defaultTo(0);
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_submitted_at').nullable();
  });

  await knex.schema.alterTable('cv_plant_harvest_events', (table) => {
    table.integer('metrc_event_id').nullable();
    table.integer('plant_count').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
  });

  await knex.schema.alterTable('cv_plant_waste_trim_events', (table) => {
    table.text('metrc_waste_method').nullable();
    table.text('metrc_mixed_material').nullable();
    table.text('metrc_waste_reason').nullable();
    table.text('metrc_plant_labels_pipe').nullable(); // pipe-delimited plant tags
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
  });

  await knex.schema.alterTable('cv_plant_loss_events', (table) => {
    table.text('metrc_waste_method').nullable();
    table.text('metrc_waste_material_mixed').nullable();
    table.text('metrc_waste_reason').nullable();
    table.float('metrc_waste_weight').nullable();
    table.text('metrc_waste_uom').nullable();
    table.text('metrc_reason_note').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
  });
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN — this migration cannot be reversed automatically.
  // To roll back, recreate the affected tables (cv_batches, cv_harvest_batches,
  // cv_plant_harvest_events, cv_plant_waste_trim_events, cv_plant_loss_events)
  // without the metrc_* columns added above.
}
