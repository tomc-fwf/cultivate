import type { Knex } from 'knex';

// Retry of 055: fixes the knex.raw() result-extraction bug that caused 055 to no-op.
// Reverts batches that were auto-transitioned cult-hoop → field-veg by the assign-zone
// endpoint before that bug was fixed. Uses proper Knex query builder (no raw SELECT).
//
// Safe to re-run: WHERE conditions only match batches still in the broken state.

export async function up(knex: Knex): Promise<void> {
  // Step 1: find field-veg batches that still have fewer active assignments than
  // their initial plant count — these were prematurely transitioned.
  const candidates = await knex('cv_batches as b')
    .where('b.status', 'field-veg')
    .whereRaw(
      '(SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL) < b.plant_count_initial'
    )
    .select(
      'b.batch_id',
      'b.plant_count_initial',
      knex.raw(
        '(SELECT COUNT(*) FROM cv_plant_assignments pa WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL) AS active_count'
      )
    ) as Array<{ batch_id: number; plant_count_initial: number; active_count: number }>;

  if (candidates.length === 0) {
    console.log('[056] No affected batches found — already clean.');
    return;
  }

  for (const candidate of candidates) {
    const { batch_id, plant_count_initial, active_count } = candidate;
    console.log(`[056] Fixing batch ${batch_id}: ${active_count}/${plant_count_initial} plants assigned, status=field-veg`);

    // Step 2: find the spurious location_history entry created by assign-zone
    // (trigger='planting_plan_commit' with a non-null from_location_id)
    const badLocHistory = await knex('cv_batch_location_history')
      .where({ batch_id, trigger: 'planting_plan_commit' })
      .whereNotNull('from_location_id')
      .orderBy('created_at', 'desc')
      .first() as { move_id: number; from_location_id: number } | undefined;

    // Step 3: find the spurious phase_history entry
    const badPhaseHistory = await knex('cv_batch_phase_history')
      .where({ batch_id, from_status: 'cult-hoop', to_status: 'field-veg' })
      .whereLike('notes', 'First field assignment:%')
      .orderBy('created_at', 'desc')
      .first() as { phase_history_id: number } | undefined;

    const restoreLocationId = badLocHistory?.from_location_id ?? null;

    // Step 4: revert the batch
    await knex('cv_batches')
      .where({ batch_id })
      .update({
        status: 'cult-hoop',
        current_location_id: restoreLocationId,
        sub_zone_id: null,
        field_move_date: null,
        updated_at: new Date().toISOString(),
      });
    console.log(`[056] Batch ${batch_id} reverted to cult-hoop, location restored to ${restoreLocationId}`);

    // Step 5: remove the spurious history records
    if (badPhaseHistory?.phase_history_id) {
      await knex('cv_batch_phase_history')
        .where('phase_history_id', badPhaseHistory.phase_history_id)
        .delete();
      console.log(`[056] Removed bad phase_history entry ${badPhaseHistory.phase_history_id}`);
    }

    if (badLocHistory?.move_id) {
      await knex('cv_batch_location_history')
        .where('move_id', badLocHistory.move_id)
        .delete();
      console.log(`[056] Removed bad location_history entry ${badLocHistory.move_id}`);
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Forward direction is always the correct state — no rollback.
}
