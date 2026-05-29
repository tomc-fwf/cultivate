import type { Knex } from 'knex';

// Extend cv_planting_plans to support auto-generated snapshots from the
// quick-assign flow. snapshot_type distinguishes manual plans from auto
// snapshots. change_summary holds a human-readable diff line per version.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_planting_plans', (t) => {
    t.string('snapshot_type').notNullable().defaultTo('manual');
    t.text('change_summary').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_planting_plans', (t) => {
    t.dropColumn('snapshot_type');
    t.dropColumn('change_summary');
  });
}
