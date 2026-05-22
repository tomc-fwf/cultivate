import type { Knex } from 'knex';

// Adds product_name_snapshot and epa_reg_no_snapshot to application tables.
// These are captured at POST time from farmstock so compliance records remain
// self-contained even if farmstock is unavailable or items are renamed/deleted.
// Required by MN Statute 342.25 (5-year retention) per CRIT-04.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('cv_applications_foliar', (table) => {
    table.text('product_name_snapshot').nullable();
  });

  await knex.schema.table('cv_applications_pesticide', (table) => {
    table.text('product_name_snapshot').nullable();
    table.text('epa_reg_no_snapshot').nullable();
  });

  await knex.schema.table('cv_container_amendments', (table) => {
    table.text('product_name_snapshot').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN directly on all versions.
  // These columns are nullable additions — recreating tables is the safe rollback path.
  // In practice, this migration is not expected to be rolled back in production.
  await knex.schema.table('cv_applications_foliar', (table) => {
    table.dropColumn('product_name_snapshot');
  });

  await knex.schema.table('cv_applications_pesticide', (table) => {
    table.dropColumn('product_name_snapshot');
    table.dropColumn('epa_reg_no_snapshot');
  });

  await knex.schema.table('cv_container_amendments', (table) => {
    table.dropColumn('product_name_snapshot');
  });
}
