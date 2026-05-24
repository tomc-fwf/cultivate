import type { Knex } from 'knex';

// Replace boolean `feminized` with text `seed_sex` ('feminized' | 'regular' | 'unknown').
// Backfill: existing feminized=1 rows → 'feminized', all others → 'unknown'.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_seed_packages', (table) => {
    table.text('seed_sex').nullable(); // 'feminized' | 'regular' | 'unknown'
  });
  await knex.raw(`UPDATE cv_seed_packages SET seed_sex = CASE WHEN feminized = 1 THEN 'feminized' ELSE 'unknown' END`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE cv_seed_packages_backup_030 AS SELECT * FROM cv_seed_packages
  `);
  await knex.raw('DROP TABLE cv_seed_packages');
  await knex.raw(`
    CREATE TABLE cv_seed_packages AS
    SELECT package_id, strain_id, location_id, lot_number, package_name,
           metrc_package_id, feminized, season_year, supplier, source_detail,
           received_date, seed_count_initial, seed_count_remaining,
           weight_g_initial, weight_g_remaining, notes, active, created_at, created_by
    FROM cv_seed_packages_backup_030
  `);
  await knex.raw('DROP TABLE cv_seed_packages_backup_030');
}
