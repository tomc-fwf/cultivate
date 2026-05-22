import type { Knex } from 'knex';

// Adds METRC sync tracking columns to cv_plant_assignments.
// Existing tagged rows (metrc_plant_tag IS NOT NULL) start as 'pending' —
// they need to be submitted to METRC. Untagged rows start as 'not_required'.

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('cv_plant_assignments', (table) => {
    table.text('metrc_sync_status').notNullable().defaultTo('not_required');
    table.text('metrc_synced_at').nullable();
  });

  // Rows that already have a METRC tag need to be submitted to METRC
  await knex.raw(`
    UPDATE cv_plant_assignments
    SET metrc_sync_status = 'pending'
    WHERE metrc_plant_tag IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('cv_plant_assignments', (table) => {
    table.dropColumn('metrc_sync_status');
    table.dropColumn('metrc_synced_at');
  });
}
