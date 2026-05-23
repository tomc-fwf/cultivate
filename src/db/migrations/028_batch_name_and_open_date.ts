import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // SQLite: add columns one at a time
  await knex.schema.alterTable('cv_batches', (table) => {
    table.text('name').nullable();            // user-defined batch label
    table.text('package_open_date').nullable(); // date seed package was opened (ISO date)
  });
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN — recreate without the two new columns
  await knex.raw(`
    CREATE TABLE cv_batches_backup_028 AS
    SELECT batch_id, strain_id, sub_zone_id, metrc_plant_batch_uid,
           plant_count_initial, status, sow_date, transplant_date,
           field_move_date, harvest_date, closed_date, notes, supervisor,
           created_at, updated_at, created_by, current_stage_since,
           current_location_id, expected_harvest_date, source_type,
           seed_package_id, seed_count_used, seed_weight_g, initial_phase
    FROM cv_batches
  `);
  await knex.raw('DROP TABLE cv_batches');
  await knex.raw('ALTER TABLE cv_batches_backup_028 RENAME TO cv_batches');
}
