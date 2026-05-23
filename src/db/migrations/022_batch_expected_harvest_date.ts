import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_batches', (table) => {
    table.text('expected_harvest_date').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_batches', (table) => {
    table.dropColumn('expected_harvest_date');
  });
}
