import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_seed_packages', (table) => {
    table.text('package_name').nullable();
    table.text('metrc_package_id').nullable();
    table.integer('feminized').notNullable().defaultTo(0);
    table.integer('season_year').nullable();
    table.text('source_detail').nullable();
  });
  await knex('cv_seed_packages').update({ season_year: 2026 });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE cv_seed_packages_backup_026 AS
    SELECT package_id, strain_id, location_id, lot_number, supplier, received_date,
           seed_count_initial, seed_count_remaining, weight_g_initial, notes, active, created_at, created_by
    FROM cv_seed_packages
  `);
  await knex.raw(`DROP TABLE cv_seed_packages`);
  await knex.raw(`ALTER TABLE cv_seed_packages_backup_026 RENAME TO cv_seed_packages`);
}
