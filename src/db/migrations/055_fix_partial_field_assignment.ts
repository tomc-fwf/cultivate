import type { Knex } from 'knex';

// Data recovery migration: undo the erroneous auto cult-hoop → field-veg transition
// that fired when the first 145 containers were assigned in Z1B for a 508-plant batch.
// The assign-zone endpoint has been fixed (see batches.ts) to never trigger this
// transition again. This migration reverts the one batch that was affected.
//
// Safe to re-run: the WHERE condition only matches batches still in the broken state.

export async function up(knex: Knex): Promise<void> {
  // Find batches that were auto-transitioned to field-veg by assign-zone but still
  // have fewer active assignments than their initial plant count — i.e., they moved to
  // field-veg prematurely during a partial assignment session.
  //
  // Look for the incorrect location_history entry created by assign-zone
  // (trigger = 'planting_plan_commit') and use from_location_id to restore.
  const affected = await knex.raw(`
    SELECT
      b.batch_id,
      b.plant_count_initial,
      b.status,
      b.sub_zone_id,
      (SELECT COUNT(*) FROM cv_plant_assignments pa
       WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL) AS active_count,
      lh.from_location_id AS restore_location_id,
      lh.move_id AS bad_location_history_id,
      ph.phase_history_id AS bad_phase_history_id
    FROM cv_batches b
    JOIN cv_batch_location_history lh
      ON lh.batch_id = b.batch_id
      AND lh.trigger = 'planting_plan_commit'
      AND lh.from_location_id IS NOT NULL
    JOIN cv_batch_phase_history ph
      ON ph.batch_id = b.batch_id
      AND ph.from_status = 'cult-hoop'
      AND ph.to_status = 'field-veg'
      AND ph.notes LIKE 'First field assignment:%'
    WHERE b.status = 'field-veg'
      AND (SELECT COUNT(*) FROM cv_plant_assignments pa
           WHERE pa.batch_id = b.batch_id AND pa.unassigned_at IS NULL) < b.plant_count_initial
  `);

  const rows = (affected as any).rows ?? affected;
  if (!rows || rows.length === 0) {
    console.log('[055] No affected batches found — migration is a no-op.');
    return;
  }

  for (const row of rows) {
    console.log(
      `[055] Reverting batch ${row.batch_id} from field-veg → cult-hoop ` +
      `(${row.active_count}/${row.plant_count_initial} plants assigned, ` +
      `restoring location_id=${row.restore_location_id})`
    );

    // Restore batch to cult-hoop with original location
    await knex('cv_batches')
      .where('batch_id', row.batch_id)
      .update({
        status: 'cult-hoop',
        current_location_id: row.restore_location_id,
        sub_zone_id: null,        // multi-zone — no single sub_zone_id is correct
        field_move_date: null,    // not yet moved to field
        updated_at: new Date().toISOString(),
      });

    // Remove the spurious phase history entry
    if (row.bad_phase_history_id) {
      await knex('cv_batch_phase_history')
        .where('phase_history_id', row.bad_phase_history_id)
        .delete();
    }

    // Remove the spurious location history entry
    if (row.bad_location_history_id) {
      await knex('cv_batch_location_history')
        .where('move_id', row.bad_location_history_id)
        .delete();
    }

    console.log(`[055] Batch ${row.batch_id} reverted. ${row.active_count} container assignments in Z1B are preserved.`);
  }
}

export async function down(knex: Knex): Promise<void> {
  // This migration fixes corrupt data — there is no meaningful rollback.
  // The forward direction is always the correct state.
}
