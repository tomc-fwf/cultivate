import Database from 'better-sqlite3';

// ── Strains ──────────────────────────────────────────────────────────────────

export function createTestStrain(
  db: Database.Database,
  opts: { type?: 'auto' | 'photo'; name?: string } = {},
): { strain_id: number; name: string; type: string } {
  const name = opts.name ?? `Test Strain ${Date.now()}`;
  const type = opts.type ?? 'auto';
  const now = new Date().toISOString();
  const r = db.prepare(`
    INSERT INTO cv_strains (name, type, active, created_at, updated_at, created_by)
    VALUES (?, ?, 1, ?, ?, 1)
  `).run(name, type, now, now);
  return { strain_id: Number(r.lastInsertRowid), name, type };
}

// ── Batches ──────────────────────────────────────────────────────────────────

export function createTestBatch(
  db: Database.Database,
  strainId: number,
  opts: {
    status?: string;
    sub_zone_id?: string;
    plant_count_initial?: number;
    metrc_plant_batch_uid?: string | null;
  } = {},
): { batch_id: number; strain_id: number; status: string; sub_zone_id: string } {
  const status = opts.status ?? 'germ';
  const sub_zone_id = opts.sub_zone_id ?? 'Z1A';
  const plant_count_initial = opts.plant_count_initial ?? 3;
  // Default to a valid 24-char UID so harvest-event tests pass the METRC gate.
  // Pass null explicitly to test the missing-UID path.
  const metrc_uid = opts.metrc_plant_batch_uid !== undefined
    ? opts.metrc_plant_batch_uid
    : 'TESTUID000000000000000A';
  const now = new Date().toISOString();
  const sowDate = now.slice(0, 10);

  const r = db.prepare(`
    INSERT INTO cv_batches
      (strain_id, sub_zone_id, plant_count_initial, plants_per_container, sow_date,
       status, current_stage_since, current_location_id, supervisor,
       metrc_plant_batch_uid,
       created_by, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, 1, 1, ?, 1, ?, ?)
  `).run(strainId, sub_zone_id, plant_count_initial, sowDate, status, now, metrc_uid, now, now);

  const batchId = Number(r.lastInsertRowid);

  db.prepare(`
    INSERT INTO cv_batch_phase_history
      (batch_id, from_status, to_status, transitioned_at, transitioned_by,
       notes, metrc_sync_status, created_at)
    VALUES (?, NULL, ?, ?, 1, NULL, 'not_required', ?)
  `).run(batchId, status, now, now);

  db.prepare(`
    INSERT INTO cv_batch_location_history
      (batch_id, from_location_id, to_location_id, moved_at, moved_by,
       trigger, metrc_sync_status, created_at)
    VALUES (?, NULL, 1, ?, 1, 'manual', 'not_required', ?)
  `).run(batchId, now, now);

  return { batch_id: batchId, strain_id: strainId, status, sub_zone_id };
}

// Directly update batch status — for test setup, bypasses API validation
export function advanceBatchTo(
  db: Database.Database,
  batchId: number,
  targetStatus: string,
): void {
  const now = new Date().toISOString();
  const updates: string[] = ['status = ?', 'current_stage_since = ?', 'updated_at = ?'];
  const values: unknown[] = [targetStatus, now, now];

  if (targetStatus === 'harvesting') {
    updates.push('harvest_date = ?');
    values.push(now);
  }
  if (targetStatus === 'closed') {
    updates.push('closed_date = ?');
    values.push(now);
  }

  values.push(batchId);
  db.prepare(`UPDATE cv_batches SET ${updates.join(', ')} WHERE batch_id = ?`).run(...values);
}

// ── Harvest batches ───────────────────────────────────────────────────────────

export function createHarvestBatch(
  db: Database.Database,
  batchId: number,
  userId = 1,
  opts: { batch_type?: 'harvest' | 'manicure'; sequence_number?: number } = {},
): { harvest_batch_id: number } {
  const now = new Date().toISOString();
  const batch_type = opts.batch_type ?? 'harvest';
  const sequence_number = opts.sequence_number ?? 1;
  const r = db.prepare(`
    INSERT INTO cv_harvest_batches
      (batch_id, batch_type, sequence_number, status, started_at, started_by,
       metrc_name, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'in_progress', ?, ?, 'Test HB', ?, ?, ?)
  `).run(batchId, batch_type, sequence_number, now, userId, userId, now, now);
  return { harvest_batch_id: Number(r.lastInsertRowid) };
}

// ── Plant assignments ─────────────────────────────────────────────────────────

export function createPlantAssignment(
  db: Database.Database,
  batchId: number,
  containerId: string,
  opts: { metrc_plant_tag?: string | null } = {},
): { assignment_id: number } {
  const now = new Date().toISOString();
  const tag = opts.metrc_plant_tag ?? null;
  const r = db.prepare(`
    INSERT INTO cv_plant_assignments
      (batch_id, container_id, metrc_plant_tag, placed_at, placed_by, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(batchId, containerId, tag, now, now);
  return { assignment_id: Number(r.lastInsertRowid) };
}

// ── Container state helpers ───────────────────────────────────────────────────

export function putContainerActive(
  db: Database.Database,
  containerId: string,
  batchId: number,
): number {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cv_container_state
    SET current_state = 'active', current_batch_id = ?, state_since = ?, updated_at = ?
    WHERE container_id = ?
  `).run(batchId, now, now, containerId);
  const r = db.prepare(`
    INSERT INTO cv_plant_assignments
      (batch_id, container_id, metrc_plant_tag, placed_at, placed_by, created_at)
    VALUES (?, ?, NULL, ?, 1, ?)
  `).run(batchId, containerId, now, now);
  return Number(r.lastInsertRowid);
}

export function putContainerEmpty(
  db: Database.Database,
  containerId: string,
  batchId: number,
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cv_container_state
    SET current_state = 'empty', current_batch_id = ?, state_since = ?, updated_at = ?
    WHERE container_id = ?
  `).run(batchId, now, now, containerId);
}

export function putContainerTeardown(
  db: Database.Database,
  containerId: string,
  batchId: number,
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cv_container_state
    SET current_state = 'teardown', current_batch_id = ?, state_since = ?, updated_at = ?
    WHERE container_id = ?
  `).run(batchId, now, now, containerId);
}

// Returns the startup_id for use with the sign-off endpoint
export function putContainerStartup(db: Database.Database, containerId: string): number {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cv_container_state
    SET current_state = 'startup', current_batch_id = NULL, state_since = ?, updated_at = ?
    WHERE container_id = ?
  `).run(now, now, containerId);
  const r = db.prepare(`
    INSERT INTO cv_startup_events
      (container_id, started_at, performed_by, created_at, created_by)
    VALUES (?, ?, 1, ?, 1)
  `).run(containerId, now, now);
  return Number(r.lastInsertRowid);
}

// Insert a stage override row — used for stage-block tests
export function insertStageOverride(
  db: Database.Database,
  inputId: number,
  stage: string,
  opts: { allowed?: 0 | 1; reason?: string } = {},
): void {
  const allowed = opts.allowed ?? 0;
  const reason = opts.reason ?? 'Not permitted during this stage (test)';
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cv_input_phi_stage_overrides
      (input_id, batch_stage, allowed, reason, created_by, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(inputId, stage, allowed, reason, now);
}
