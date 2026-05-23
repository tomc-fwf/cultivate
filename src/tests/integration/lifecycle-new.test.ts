import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import { createTestStrain, createTestBatch, putContainerActive, putContainerEmpty } from '../helpers/fixtures.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createWasteTrim(
  db: Database.Database,
  batchId: number,
  wasteStatus: 'collected' | 'held' | 'disposed' | 'reported',
): number {
  const now = new Date().toISOString();
  const r = db.prepare(`
    INSERT INTO cv_plant_waste_trim_events
      (batch_id, trimmed_at, trim_reason, wet_weight, weight_unit,
       waste_status, waste_status_updated_at, applicator, metrc_sync_status,
       created_by, created_at, updated_at)
    VALUES (?, ?, 'defoliation', 30.0, 'g', ?, ?, 1, 'pending', 1, ?, ?)
  `).run(batchId, now, wasteStatus, now, now, now);
  return Number(r.lastInsertRowid);
}

// ── POST /tag-assignments/:id/move ────────────────────────────────────────────

describe('Tag assignment move — POST /tag-assignments/:id/move', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments/1/move',
      payload: { to_container_id: 'Z1-A-R2-C1', reason: 'test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when assignment does not exist', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tag-assignments/99999/move',
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R2-C1', reason: 'test move' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when destination is the same as source container', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R1-C1', reason: 'same container' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when destination container is occupied (active state)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);
    // Destination already has an active plant
    putContainerActive(ctx.db, 'Z1-A-R1-C2', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R1-C2', reason: 'move to occupied' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('moves assignment to a ready container and returns move details', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C1', b.batch_id);

    // Z1-A-R2-C1 is 'ready' by default from seed data
    const res = await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R2-C1', reason: 'transplant to larger pot' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.assignment_id).toBe(assignmentId);
    expect(body.from_container_id).toBe('Z1-A-R1-C1');
    expect(body.to_container_id).toBe('Z1-A-R2-C1');
    expect(body.moved_at).toBeDefined();
  });

  it('updates source to empty and destination to active in the database', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C3', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R2-C3', reason: 'transplant' },
    });

    const src = ctx.db.prepare(
      'SELECT current_state FROM cv_container_state WHERE container_id = ?'
    ).get('Z1-A-R1-C3') as { current_state: string };
    const dst = ctx.db.prepare(
      'SELECT current_state FROM cv_container_state WHERE container_id = ?'
    ).get('Z1-A-R2-C3') as { current_state: string };

    expect(src.current_state).toBe('empty');
    expect(dst.current_state).toBe('active');
  });

  it('moves assignment to an empty container in the same batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C4', b.batch_id);
    // Empty container in same batch (no active assignments)
    putContainerEmpty(ctx.db, 'Z1-A-R1-C5', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R1-C5', reason: 'fill empty slot' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).to_container_id).toBe('Z1-A-R1-C5');
  });

  it('logs a plant_replaced state transition for the destination container', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg', sub_zone_id: 'Z1A' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-A-R1-C6', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: `/api/tag-assignments/${assignmentId}/move`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { to_container_id: 'Z1-A-R3-C1', reason: 'transplant' },
    });

    const transitions = ctx.db.prepare(`
      SELECT * FROM cv_container_state_transitions
      WHERE container_id = ? AND to_state = 'active'
    `).all('Z1-A-R3-C1') as Array<Record<string, unknown>>;
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[transitions.length - 1]['trigger_event']).toBe('plant_replaced');
  });
});

// ── PATCH /harvest/waste-trim/:id/hold ───────────────────────────────────────

describe('Waste trim hold — PATCH /harvest/waste-trim/:id/hold', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH', url: '/api/harvest/waste-trim/1/hold',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a non-existent waste trim event', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH', url: '/api/harvest/waste-trim/99999/hold',
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when status is already held', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'held');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/hold`,
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('collected');
  });

  it('returns 400 when status is disposed', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'disposed');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/hold`,
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('transitions collected → held and returns updated record', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'collected');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/hold`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { notes: 'quarantine pending test results' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.waste_status).toBe('held');
    expect(body.waste_trim_id).toBe(trimId);
  });

  it('persists held status in the database', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'collected');

    await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/hold`,
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });

    const row = ctx.db.prepare(
      'SELECT waste_status FROM cv_plant_waste_trim_events WHERE waste_trim_id = ?'
    ).get(trimId) as { waste_status: string };
    expect(row.waste_status).toBe('held');
  });
});

// ── PATCH /harvest/waste-trim/:id/report ─────────────────────────────────────

describe('Waste trim report — PATCH /harvest/waste-trim/:id/report', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH', url: '/api/harvest/waste-trim/1/report',
      payload: { metrc_sync_status: 'synced' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a non-existent waste trim event', async () => {
    const res = await ctx.app.inject({
      method: 'PATCH', url: '/api/harvest/waste-trim/99999/report',
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'synced' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when status is collected (not disposed)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'collected');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/report`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'synced' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('disposed');
  });

  it('returns 400 when status is held (not disposed)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'held');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/report`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'synced' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('transitions disposed → reported with metrc_sync_status synced', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'disposed');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/report`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'synced' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.waste_status).toBe('reported');
    expect(body.metrc_sync_status).toBe('synced');
  });

  it('supports not_required as metrc_sync_status', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'disposed');

    const res = await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/report`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'not_required' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).metrc_sync_status).toBe('not_required');
  });

  it('persists reported status in the database', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id);
    const trimId = createWasteTrim(ctx.db, b.batch_id, 'disposed');

    await ctx.app.inject({
      method: 'PATCH', url: `/api/harvest/waste-trim/${trimId}/report`,
      headers: authHeader(ctx.app, 'grower'),
      payload: { metrc_sync_status: 'synced' },
    });

    const row = ctx.db.prepare(
      'SELECT waste_status FROM cv_plant_waste_trim_events WHERE waste_trim_id = ?'
    ).get(trimId) as { waste_status: string };
    expect(row.waste_status).toBe('reported');
  });
});
