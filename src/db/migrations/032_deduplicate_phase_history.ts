import type { Knex } from 'knex';

// Remove duplicate cv_batch_phase_history rows that accrued during early date-correction
// work. Keep only the earliest (MIN phase_history_id) entry per (batch_id, to_status)
// pair so each stage appears exactly once per batch.
//
// The cv_metrc_todos table references batch_id independently, not phase_history_id,
// so deleting duplicate phase_history rows does not affect pending METRC actions.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM cv_batch_phase_history
    WHERE phase_history_id NOT IN (
      SELECT MIN(phase_history_id)
      FROM cv_batch_phase_history
      GROUP BY batch_id, to_status
    )
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Deduplication cannot be reversed — no-op.
}
