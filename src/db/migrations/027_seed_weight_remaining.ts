import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_seed_packages', (table) => {
    table.float('weight_g_remaining').nullable();
  });
  // Backfill: for existing packages, remaining = initial
  await knex.raw('UPDATE cv_seed_packages SET weight_g_remaining = weight_g_initial WHERE weight_g_initial IS NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE cv_seed_packages_backup_027 AS
    SELECT package_id, strain_id, location_id, lot_number, supplier, received_date,
           seed_count_initial, seed_count_remaining, weight_g_initial,
           package_name, metrc_package_id, feminized, season_year, source_detail,
           notes, active, created_at, created_by
    FROM cv_seed_packages
  `);
  await knex.raw('DROP TABLE cv_seed_packages');
  await knex.raw('ALTER TABLE cv_seed_packages_backup_027 RENAME TO cv_seed_packages');
}
