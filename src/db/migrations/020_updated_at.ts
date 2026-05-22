import type { Knex } from 'knex';

// Adds updated_at TEXT column to 6 compliance tables that were missing it.
// Backfills existing rows with created_at so modification tracking is consistent
// from day one. PATCH routes now set updated_at = datetime('now') on every edit.

export async function up(knex: Knex): Promise<void> {
  const tables = [
    'cv_applications_fertigation',
    'cv_applications_foliar',
    'cv_applications_pesticide',
    'cv_container_amendments',
    'cv_observations',
    'cv_plant_loss_events',
  ];

  for (const table of tables) {
    await knex.schema.table(table, (t) => {
      t.text('updated_at').nullable();
    });
    await knex.raw(`UPDATE ${table} SET updated_at = created_at WHERE updated_at IS NULL`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN on all versions.
  // These columns are nullable additions — recreating tables is the safe rollback path.
  // In practice, this migration is not expected to be rolled back in production.
  const tables = [
    'cv_applications_fertigation',
    'cv_applications_foliar',
    'cv_applications_pesticide',
    'cv_container_amendments',
    'cv_observations',
    'cv_plant_loss_events',
  ];

  for (const table of tables) {
    await knex.schema.table(table, (t) => {
      t.dropColumn('updated_at');
    });
  }
}
