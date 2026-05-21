import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cv_batches: add current_location_id ──────────────────────────────────
  // Tracks where the batch physically is right now — independent of status
  // (phase). A batch can change location without changing phase, and vice versa.
  // Both events generate separate METRC submissions.
  //
  // Nullable: existing batches get null; the Location View prompts for
  // backfill. New batches set this at creation (defaults to Germ-01).
  await knex.schema.alterTable('cv_batches', (table) => {
    table.integer('current_location_id').nullable().references('location_id').inTable('cv_locations');
  });

  // ── cv_batch_phase_history ────────────────────────────────────────────────
  // Formal, append-only log of every plant batch phase (status) transition.
  // Replaces the informal transition handling in the batches route.
  //
  // Each record maps to one METRC "Change Growth Phase" event submission.
  // metrc_sync_status tracks whether that submission has been made.
  //
  // from_status is null for the initial creation record (batch starts in germ
  // with no prior state).
  await knex.schema.createTableIfNotExists('cv_batch_phase_history', (table) => {
    table.increments('phase_history_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    // from_status: null for the initial germ record
    table.text('from_status').nullable();
    table.text('to_status').notNullable();
    table.text('transitioned_at').notNullable();
    table.integer('transitioned_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    // metrc_sync_status: "pending" | "synced" | "failed" | "not_required"
    // "not_required" for germ→seedling if METRC doesn't track immature phase changes
    table.text('metrc_sync_status').notNullable().defaultTo('pending');
    table.text('metrc_synced_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── cv_batch_location_history ─────────────────────────────────────────────
  // Formal, append-only log of every physical location move for a plant batch.
  // Independent of phase history — a location move does not imply a phase change.
  //
  // Each record maps to one METRC "Move Plants" event submission.
  //
  // trigger values:
  //   manual               — operator recorded a move directly in the Location View
  //   planting_plan_commit — generated automatically when a planting plan item is committed
  //   phase_transition     — implied by a phase change (e.g. germ→seedling may auto-move
  //                          from Germ-01 to Seedlings if not already there)
  //   other                — catch-all
  //
  // from_location_id is null for the initial placement record.
  await knex.schema.createTableIfNotExists('cv_batch_location_history', (table) => {
    table.increments('move_id');
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    // null for the first location record (initial placement)
    table.integer('from_location_id').nullable().references('location_id').inTable('cv_locations');
    table.integer('to_location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('moved_at').notNullable();
    table.integer('moved_by').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    // trigger: "manual" | "planting_plan_commit" | "phase_transition" | "other"
    table.text('trigger').notNullable().defaultTo('manual');
    // planting_plan_id: set when trigger = 'planting_plan_commit'
    // References cv_planting_plans — FK added in 013_planting_plans after that table exists
    table.integer('planting_plan_id').nullable();
    // metrc_sync_status: "pending" | "synced" | "failed" | "not_required"
    table.text('metrc_sync_status').notNullable().defaultTo('pending');
    table.text('metrc_synced_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_batch_location_history');
  await knex.schema.dropTableIfExists('cv_batch_phase_history');
  // SQLite does not support DROP COLUMN — current_location_id remains but is inert
}
