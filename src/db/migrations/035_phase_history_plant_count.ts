import type { Knex } from 'knex';

// Add plant_count to cv_batch_phase_history so each stage transition records
// how many plants entered that stage. Enables loss-per-stage metrics in the UI.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_batch_phase_history', (table) => {
    table.integer('plant_count').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_batch_phase_history', (table) => {
    table.dropColumn('plant_count');
  });
}
