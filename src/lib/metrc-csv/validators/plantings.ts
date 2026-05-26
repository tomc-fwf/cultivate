import type Database from 'better-sqlite3';
import {
  validateMetrcTag,
  validateLocationByMetrcName,
  validateBatchExists,
  type BatchRow,
} from './shared.js';

export { validateMetrcTag, validateLocationByMetrcName };

/**
 * Validates that a batch exists and returns it.
 * Used by create-plantings (#2), plantings-from-package (#17),
 * plantings-from-plant (#18), and split-planting (#22).
 */
export function validatePlantingsBatch(
  db: Database.Database,
  batchId: number,
): BatchRow {
  return validateBatchExists(db, batchId);
}

/**
 * Validates that count does not exceed the batch's current plant count.
 * Throws if count > available.
 */
export function validatePlantingCount(
  batch: BatchRow,
  count: number,
): void {
  const available = batch.plant_count_current ?? batch.plant_count_initial;
  if (count > available) {
    throw new Error(
      `count (${count}) exceeds available plant count (${available}) in batch ${batch.batch_id}`,
    );
  }
}
