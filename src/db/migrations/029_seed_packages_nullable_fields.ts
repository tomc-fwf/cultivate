import type { Knex } from 'knex';

// Make lot_number, seed_count_initial, and seed_count_remaining nullable.
// Migration 025 created these NOT NULL, but the seed vault form treats them
// as optional — lot number is user-defined and seed count may not be known.
export async function up(knex: Knex): Promise<void> {
  // SQLite: must recreate the table to change NOT NULL constraints
  await knex.raw(`
    CREATE TABLE cv_seed_packages_backup_029 AS
    SELECT * FROM cv_seed_packages
  `);
  await knex.raw('DROP TABLE cv_seed_packages');
  await knex.raw(`
    CREATE TABLE cv_seed_packages (
      package_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      strain_id        INTEGER REFERENCES cv_strains(strain_id),
      location_id      INTEGER REFERENCES cv_locations(location_id),
      lot_number       TEXT,
      package_name     TEXT,
      metrc_package_id TEXT,
      feminized        INTEGER NOT NULL DEFAULT 0,
      season_year      INTEGER,
      supplier         TEXT,
      source_detail    TEXT,
      received_date    TEXT,
      seed_count_initial   INTEGER,
      seed_count_remaining INTEGER,
      weight_g_initial     REAL,
      weight_g_remaining   REAL,
      notes   TEXT,
      active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES cv_users(id)
    )
  `);
  await knex.raw(`
    INSERT INTO cv_seed_packages
      SELECT * FROM cv_seed_packages_backup_029
  `);
  await knex.raw('DROP TABLE cv_seed_packages_backup_029');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE cv_seed_packages_backup_029r AS
    SELECT * FROM cv_seed_packages
  `);
  await knex.raw('DROP TABLE cv_seed_packages');
  await knex.raw(`
    CREATE TABLE cv_seed_packages (
      package_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      strain_id        INTEGER NOT NULL REFERENCES cv_strains(strain_id),
      location_id      INTEGER REFERENCES cv_locations(location_id),
      lot_number       TEXT NOT NULL,
      package_name     TEXT,
      metrc_package_id TEXT,
      feminized        INTEGER NOT NULL DEFAULT 0,
      season_year      INTEGER,
      supplier         TEXT,
      source_detail    TEXT,
      received_date    TEXT,
      seed_count_initial   INTEGER NOT NULL,
      seed_count_remaining INTEGER NOT NULL,
      weight_g_initial     REAL,
      weight_g_remaining   REAL,
      notes   TEXT,
      active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES cv_users(id)
    )
  `);
  await knex.raw(`
    INSERT INTO cv_seed_packages
      SELECT * FROM cv_seed_packages_backup_029r
  `);
  await knex.raw('DROP TABLE cv_seed_packages_backup_029r');
}
