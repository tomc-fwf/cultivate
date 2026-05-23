import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Seed package inventory — tracks physical seed lots used to start batches
  await knex.schema.createTable('cv_seed_packages', (table) => {
    table.increments('package_id').primary();
    table.integer('strain_id').notNullable().references('strain_id').inTable('cv_strains');
    table.integer('location_id').nullable().references('location_id').inTable('cv_locations'); // typically the Seed Vault location
    table.text('lot_number').notNullable();
    table.text('supplier').nullable();
    table.text('received_date').nullable(); // ISO-8601 date string
    table.integer('seed_count_initial').notNullable();
    table.integer('seed_count_remaining').notNullable(); // decremented when a batch uses seeds from this package
    table.float('weight_g_initial').nullable(); // total weight of seeds in this package
    table.text('notes').nullable();
    table.integer('active').notNullable().defaultTo(1);
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // 2. Add source/origin fields to cv_batches
  await knex.schema.alterTable('cv_batches', (table) => {
    table.text('source_type').nullable(); // 'seed' | 'clone'
    table.integer('seed_package_id').nullable().references('package_id').inTable('cv_seed_packages');
    table.integer('seed_count_used').nullable(); // how many seeds from the package went into this batch
    table.float('seed_weight_g').nullable(); // total weight in grams of seeds used
    table.text('initial_phase').nullable(); // 'immature' | 'veg' | 'flower' — METRC-level classification at creation
  });
}

export async function down(knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN — recreate cv_batches without the 5 new columns
  await knex.raw(`
    CREATE TABLE cv_batches_backup_025 AS
    SELECT batch_id, strain_id, sub_zone_id, metrc_plant_batch_uid, plant_count_initial,
           status, sow_date, transplant_date, field_move_date, harvest_date, closed_date,
           notes, supervisor, created_at, updated_at, created_by,
           current_stage_since, current_location_id, expected_harvest_date
    FROM cv_batches
  `);
  await knex.raw(`DROP TABLE cv_batches`);
  await knex.raw(`ALTER TABLE cv_batches_backup_025 RENAME TO cv_batches`);

  await knex.schema.dropTableIfExists('cv_seed_packages');
}
