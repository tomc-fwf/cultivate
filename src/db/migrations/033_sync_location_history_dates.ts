import type { Knex } from 'knex';

// Backfill cv_batch_location_history.moved_at from the canonical date fields on cv_batches.
// Location history entries were written at system-entry time (the day the batch was first
// created/transitioned in the app), not at the real-world date the move occurred. This
// migration aligns them so the Phase & Location History timeline reflects actual field dates.
//
// Uses substr(date, 1, 10) || 'T12:00:00.000Z' to normalise any storage format (bare date
// string or ISO timestamp) into a noon-UTC value that fmtTs displays on the correct day.
export async function up(knex: Knex): Promise<void> {
  // Initial placement → Germination (from_location_id IS NULL): align with sow_date
  await knex.raw(`
    UPDATE cv_batch_location_history
    SET moved_at = (
      SELECT substr(b.sow_date, 1, 10) || 'T12:00:00.000Z'
      FROM cv_batches b
      WHERE b.batch_id = cv_batch_location_history.batch_id
        AND b.sow_date IS NOT NULL
    )
    WHERE from_location_id IS NULL
      AND EXISTS (
        SELECT 1 FROM cv_batches b
        WHERE b.batch_id = cv_batch_location_history.batch_id
          AND b.sow_date IS NOT NULL
      )
  `);

  // Move to Seedlings (to_location_id = 2): align with transplant_date
  await knex.raw(`
    UPDATE cv_batch_location_history
    SET moved_at = (
      SELECT substr(b.transplant_date, 1, 10) || 'T12:00:00.000Z'
      FROM cv_batches b
      WHERE b.batch_id = cv_batch_location_history.batch_id
        AND b.transplant_date IS NOT NULL
    )
    WHERE to_location_id = 2
      AND EXISTS (
        SELECT 1 FROM cv_batches b
        WHERE b.batch_id = cv_batch_location_history.batch_id
          AND b.transplant_date IS NOT NULL
      )
  `);

  // Move to Cult-Hoop or Field (to_location_id >= 3): align with field_move_date
  await knex.raw(`
    UPDATE cv_batch_location_history
    SET moved_at = (
      SELECT substr(b.field_move_date, 1, 10) || 'T12:00:00.000Z'
      FROM cv_batches b
      WHERE b.batch_id = cv_batch_location_history.batch_id
        AND b.field_move_date IS NOT NULL
    )
    WHERE to_location_id >= 3
      AND EXISTS (
        SELECT 1 FROM cv_batches b
        WHERE b.batch_id = cv_batch_location_history.batch_id
          AND b.field_move_date IS NOT NULL
      )
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // Not reversible — original moved_at values were system timestamps, not meaningful field dates.
}
