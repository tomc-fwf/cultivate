import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_harvest_batches', (table) => {
    // harvest_name: operator-specified or derived name for the METRC HarvestName field.
    // Always provided — never left blank — because PUT /plants/v2/harvest returns no
    // response body, so auto-generated METRC names cannot be captured after the fact.
    // When NULL, routes derive the name as: {strain}_{sow_date}_batch{sequence_number}
    table.text('harvest_name').nullable();
  });
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN — this migration cannot be reversed automatically.
}
