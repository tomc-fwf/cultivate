import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain, createTestBatch, putContainerActive, putContainerEmpty,
} from '../helpers/fixtures.js';

describe('Plant loss — basic recording', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('records plant loss successfully for an active container', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_disease',
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('returns the loss event in response body', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_disease',
        plant_disposition: 'disposed_compost',
      },
    });
    const body = JSON.parse(res.body);
    expect(body.loss_id).toBeDefined();
    expect(body.loss_type).toBe('death_disease');
  });
});

describe('Plant loss — assignment unassignment', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('marks the plant assignment as unassigned', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId) as Record<string, unknown>;
    expect(assignment.unassigned_at).not.toBeNull();
  });

  it('sets unassign_reason to "died" for death_disease loss type', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_disease',
        plant_disposition: 'disposed_compost',
      },
    });
    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId) as Record<string, unknown>;
    expect(assignment.unassign_reason).toBe('died');
  });

  it('sets unassign_reason to "destroyed" for removal_culled loss type', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'removal_culled',
        plant_disposition: 'disposed_waste',
      },
    });
    const assignment = ctx.db.prepare('SELECT * FROM cv_plant_assignments WHERE assignment_id = ?').get(assignmentId) as Record<string, unknown>;
    expect(assignment.unassign_reason).toBe('destroyed');
  });
});

describe('Plant loss — container state transition', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('transitions container from active to empty when last plant is lost', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('empty');
  });

  it('does not transition container if other active plants remain (multi-plant container)', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const a1 = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    // Add a second plant assignment to the same container
    const now = new Date().toISOString();
    ctx.db.prepare(`
      INSERT INTO cv_plant_assignments (batch_id, container_id, metrc_plant_tag, placed_at, placed_by, created_at)
      VALUES (?, 'Z1-30-R01-C001', NULL, ?, 1, ?)
    `).run(b.batch_id, now, now);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: a1,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    // Still active because second plant remains
    expect(state.current_state).toBe('active');
  });
});

describe('Plant loss — METRC sync status', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('sets metrc_sync_status to pending on the loss event', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_pest',
        plant_disposition: 'disposed_waste',
      },
    });
    const body = JSON.parse(res.body);
    expect(body.metrc_sync_status).toBe('pending');
  });
});

describe('Plant loss — validation errors', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('rejects loss for a closed batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'closed' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects loss when assignment is already unassigned', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    // Manually unassign the assignment
    const now = new Date().toISOString();
    ctx.db.prepare(`UPDATE cv_plant_assignments SET unassigned_at=?, unassign_reason='other' WHERE assignment_id=?`).run(now, assignmentId);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects loss when container is not active', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);
    // Put the container in empty state
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects loss with missing loss_type', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        plant_disposition: 'disposed_compost',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects loss with missing plant_disposition', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const assignmentId = putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss',
      headers: authHeader(ctx.app, 'grower'),
      payload: {
        batch_id: b.batch_id,
        container_id: 'Z1-30-R01-C001',
        plant_assignment_id: assignmentId,
        loss_type: 'death_natural',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Plant replacement', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('creates a new plant assignment for an empty container', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    // Set container to empty (same batch)
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss/replacements',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-30-R01-C001' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.assignment_id).toBeDefined();
  });

  it('transitions container from empty back to active', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss/replacements',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-30-R01-C001' },
    });
    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('active');
  });

  it('rejects replacement for a container that is not empty', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss/replacements',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-30-R01-C001' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects replacement for a closed batch', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'closed' });
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss/replacements',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id, container_id: 'Z1-30-R01-C001' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects replacement when container belongs to a different batch', async () => {
    const s = createTestStrain(ctx.db);
    const b1 = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const b2 = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b1.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/plant-loss/replacements',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b2.batch_id, container_id: 'Z1-30-R01-C001' },
    });
    expect(res.statusCode).toBe(400);
  });
});
