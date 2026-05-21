import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const addIfMissing = async (table: string, col: string, adder: (t: Knex.AlterTableBuilder) => void) => {
    if (!(await knex.schema.hasColumn(table, col)))
      await knex.schema.alterTable(table, adder);
  };
  // Tracks when the batch entered its current status — used for days-in-stage calculation
  await addIfMissing('cv_batches', 'current_stage_since', t => t.text('current_stage_since').nullable());
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN
}
