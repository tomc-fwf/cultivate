import type { Knex } from 'knex';

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  // ── PRAGMA tuning ──────────────────────────────────────────────────────────
  // These apply to the Knex connection used for migrations and normal DB use.
  // The main app also sets these via db.pragma() in initDB(); this ensures
  // the migration connection benefits during any long-running index builds.
  await knex.raw("PRAGMA synchronous = NORMAL");
  await knex.raw("PRAGMA busy_timeout = 5000");
  await knex.raw("PRAGMA cache_size = -20000");
  await knex.raw("PRAGMA temp_store = MEMORY");
  await knex.raw("PRAGMA mmap_size = 268435456");

  // ── cv_plant_assignments ───────────────────────────────────────────────────
  // (batch_id, unassigned_at): BATCH_SELECT correlated subquery (every list load)
  // and harvest/plant-loss active count checks.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_batch_active
    ON cv_plant_assignments (batch_id, unassigned_at)
  `);

  // (container_id, unassigned_at): tag-assignment and container detail current-tag lookup.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_container_active
    ON cv_plant_assignments (container_id, unassigned_at)
  `);

  // (metrc_plant_tag): tag deduplication check on every tag assignment.
  // Covers WHERE metrc_plant_tag = ? AND unassigned_at IS NULL.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_assignments_tag
    ON cv_plant_assignments (metrc_plant_tag)
  `);

  // ── cv_batch_stage_recipes ─────────────────────────────────────────────────
  // (batch_id, effective_to): BATCH_SELECT LEFT JOIN WHERE effective_to IS NULL.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_stage_recipes_batch_active
    ON cv_batch_stage_recipes (batch_id, effective_to)
  `);

  // ── cv_observations ────────────────────────────────────────────────────────
  // (batch_id, category): readiness summary query and general list filter.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_observations_batch_category
    ON cv_observations (batch_id, category)
  `);

  // (container_id): harvest walkthrough per-container filter.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_observations_container
    ON cv_observations (container_id)
  `);

  // ── cv_plant_harvest_events ────────────────────────────────────────────────
  // (plant_assignment_id, event_type): EXISTS check per plant in harvest status query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_assignment_type
    ON cv_plant_harvest_events (plant_assignment_id, event_type)
  `);

  // (harvest_batch_id, event_type): COUNT subqueries in harvest status query.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_batch_type
    ON cv_plant_harvest_events (harvest_batch_id, event_type)
  `);

  // (batch_id): cultivation-record export and auto-close active-count check.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_events_batch
    ON cv_plant_harvest_events (batch_id)
  `);

  // ── cv_batch_phase_history ─────────────────────────────────────────────────
  // (batch_id): queried on every batch detail load, transition, and export.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_phase_history_batch
    ON cv_batch_phase_history (batch_id)
  `);

  // ── cv_batch_location_history ──────────────────────────────────────────────
  // (batch_id): same frequency as phase history.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_batch_location_history_batch
    ON cv_batch_location_history (batch_id)
  `);

  // ── cv_applications_fertigation ────────────────────────────────────────────
  // (batch_id, applied_at): list filter + date filter + ORDER BY.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_fertigation_batch_date
    ON cv_applications_fertigation (batch_id, applied_at)
  `);

  // ── cv_applications_foliar ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_foliar_batch_date
    ON cv_applications_foliar (batch_id, applied_at)
  `);

  // ── cv_applications_pesticide ──────────────────────────────────────────────
  // applied_at also used standalone in MDA date-range export.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pesticide_batch_date
    ON cv_applications_pesticide (batch_id, applied_at)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_pesticide_date
    ON cv_applications_pesticide (applied_at)
  `);

  // ── cv_container_state_transitions ────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_state_transitions_container
    ON cv_container_state_transitions (container_id)
  `);

  // ── cv_container_amendments ────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_amendments_container
    ON cv_container_amendments (container_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_container_amendments_batch
    ON cv_container_amendments (batch_id)
  `);

  // ── cv_teardown_events ─────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_teardown_events_container
    ON cv_teardown_events (container_id)
  `);

  // ── cv_startup_events ──────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_startup_events_container
    ON cv_startup_events (container_id)
  `);

  // ── cv_soil_samples ────────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_soil_samples_container
    ON cv_soil_samples (container_id)
  `);

  // ── cv_plant_loss_events ───────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_loss_batch
    ON cv_plant_loss_events (batch_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_plant_loss_sync_status
    ON cv_plant_loss_events (metrc_sync_status)
  `);

  // ── cv_harvest_batches ─────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_harvest_batches_batch
    ON cv_harvest_batches (batch_id)
  `);

  // ── cv_plant_waste_trim_events ─────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_waste_trim_batch
    ON cv_plant_waste_trim_events (batch_id)
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_waste_trim_status
    ON cv_plant_waste_trim_events (waste_status)
  `);

  // ── cv_metrc_sync_log ──────────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_metrc_sync_log_status
    ON cv_metrc_sync_log (status)
  `);

  // ── cv_planting_plan_items ─────────────────────────────────────────────────
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_planting_plan_items_plan_status
    ON cv_planting_plan_items (plan_id, status)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes in reverse order
  const indexes = [
    'idx_planting_plan_items_plan_status',
    'idx_metrc_sync_log_status',
    'idx_waste_trim_status',
    'idx_waste_trim_batch',
    'idx_harvest_batches_batch',
    'idx_plant_loss_sync_status',
    'idx_plant_loss_batch',
    'idx_soil_samples_container',
    'idx_startup_events_container',
    'idx_teardown_events_container',
    'idx_container_amendments_batch',
    'idx_container_amendments_container',
    'idx_container_state_transitions_container',
    'idx_pesticide_date',
    'idx_pesticide_batch_date',
    'idx_foliar_batch_date',
    'idx_fertigation_batch_date',
    'idx_batch_location_history_batch',
    'idx_batch_phase_history_batch',
    'idx_harvest_events_batch',
    'idx_harvest_events_batch_type',
    'idx_harvest_events_assignment_type',
    'idx_observations_container',
    'idx_observations_batch_category',
    'idx_batch_stage_recipes_batch_active',
    'idx_plant_assignments_tag',
    'idx_plant_assignments_container_active',
    'idx_plant_assignments_batch_active',
  ];
  for (const idx of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${idx}`);
  }

  // Note: PRAGMA changes are not reversible via migration.
  // synchronous/busy_timeout/cache_size/temp_store/mmap_size revert to
  // SQLite defaults when the database file is opened with no PRAGMA set.
  // Ensure initDB() explicitly sets these so they apply at runtime.
}
