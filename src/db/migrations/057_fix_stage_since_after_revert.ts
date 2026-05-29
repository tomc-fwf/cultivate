import type { Knex } from 'knex';

// Migration 056 reverted batches from field-veg → cult-hoop but did not restore
// current_stage_since, leaving it pointing to when the erroneous field-veg transition
// fired rather than when the batch genuinely entered cult-hoop.
//
// Fix: for any cult-hoop batch whose current_stage_since is newer than the most
// recent phase_history entry for that status, pull the correct transitioned_at
// from phase_history and write it back to current_stage_since.
//
// Safe to re-run: the WHERE clause only matches batches that are still mis-timed.

export async function up(knex: Knex): Promise<void> {
  // Find cult-hoop batches where current_stage_since post-dates their actual
  // cult-hoop phase_history entry — i.e., the revert left a stale timestamp.
  const affected = await knex('cv_batches as b')
    .where('b.status', 'cult-hoop')
    .whereNotNull('b.current_stage_since')
    .whereExists(
      knex('cv_batch_phase_history as ph')
        .where('ph.batch_id', knex.raw('b.batch_id'))
        .where('ph.to_status', 'cult-hoop')
        .whereRaw("ph.transitioned_at < b.current_stage_since")
        .select(knex.raw('1'))
    )
    .select(
      'b.batch_id',
      'b.current_stage_since',
      knex.raw(`(
        SELECT ph2.transitioned_at
        FROM cv_batch_phase_history ph2
        WHERE ph2.batch_id = b.batch_id AND ph2.to_status = 'cult-hoop'
        ORDER BY ph2.phase_history_id DESC
        LIMIT 1
      ) AS correct_stage_since`)
    ) as Array<{ batch_id: number; current_stage_since: string; correct_stage_since: string }>;

  if (affected.length === 0) {
    console.log('[057] No mis-timed cult-hoop batches found — already clean.');
    return;
  }

  for (const row of affected) {
    console.log(
      `[057] Batch ${row.batch_id}: current_stage_since ${row.current_stage_since} → ${row.correct_stage_since}`
    );
    await knex('cv_batches')
      .where('batch_id', row.batch_id)
      .update({
        current_stage_since: row.correct_stage_since,
        updated_at: new Date().toISOString(),
      });
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward direction is always the correct state — no rollback.
}
