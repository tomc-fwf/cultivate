import type { Knex } from 'knex';

// Migration 056 reverted the prematurely-transitioned batch back to cult-hoop but
// did not remove the plant assignments that were made during the test session.
// Those 145 assignments in Z1B still show as "assigned" in the field-assignment
// view and those containers still show current_state='active' rather than 'ready'.
//
// This migration:
//   1. Unassigns any active plant_assignments belonging to a cult-hoop batch
//      (pre-field batches should have no container assignments)
//   2. Returns those containers to current_state='ready' in cv_container_state
//
// Safe to re-run: WHERE conditions only match assignments that are still active
// for batches that are still in cult-hoop status.

export async function up(knex: Knex): Promise<void> {
  const now = new Date().toISOString();

  // Find active assignments for cult-hoop batches
  const strayAssignments = await knex('cv_plant_assignments as pa')
    .join('cv_batches as b', 'b.batch_id', 'pa.batch_id')
    .where('b.status', 'cult-hoop')
    .whereNull('pa.unassigned_at')
    .select('pa.assignment_id', 'pa.container_id', 'pa.batch_id') as Array<{
      assignment_id: number;
      container_id: string;
      batch_id: number;
    }>;

  if (strayAssignments.length === 0) {
    console.log('[058] No stray assignments found — already clean.');
    return;
  }

  console.log(`[058] Found ${strayAssignments.length} stray assignment(s) on cult-hoop batch(es) — clearing.`);

  const assignmentIds = strayAssignments.map(r => r.assignment_id);
  const containerIds  = strayAssignments.map(r => r.container_id);

  // 1. Unassign the plant assignments
  await knex('cv_plant_assignments')
    .whereIn('assignment_id', assignmentIds)
    .update({
      unassigned_at:  now,
      unassign_reason: 'other',
      unassign_notes: 'Reverted by migration 058: batch returned to cult-hoop pre-field status',
    });

  console.log(`[058] Unassigned ${assignmentIds.length} assignment(s).`);

  // 2. Return containers to ready state
  await knex('cv_container_state')
    .whereIn('container_id', containerIds)
    .update({
      current_state:    'ready',
      current_batch_id: null,
      state_since:      now,
      updated_at:       now,
    });

  console.log(`[058] Reset ${containerIds.length} container(s) to ready.`);
}

export async function down(_knex: Knex): Promise<void> {
  // Forward direction is always the correct state — no rollback.
}
