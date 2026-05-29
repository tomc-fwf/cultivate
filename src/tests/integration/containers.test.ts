import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, teardownTestContext, type TestContext } from '../helpers/db.js';
import { authHeader } from '../helpers/auth.js';
import {
  createTestStrain, createTestBatch, putContainerActive, putContainerEmpty,
  putContainerTeardown, putContainerStartup,
} from '../helpers/fixtures.js';

describe('Container teardown workflow', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('transitions container from active to teardown', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });
    expect(res.statusCode).toBe(201);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('teardown');
  });

  it('transitions container from empty to teardown', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerEmpty(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });
    expect(res.statusCode).toBe(201);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('teardown');
  });

  it('creates a teardown event record', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });

    const event = ctx.db.prepare('SELECT * FROM cv_teardown_events WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown> | undefined;
    expect(event).toBeDefined();
    expect(event?.container_id).toBe('Z1-30-R01-C001');
  });

  it('rejects teardown when container is already in teardown', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerTeardown(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects teardown when container is in ready state', async () => {
    // Container is in 'ready' state by default (seed data)
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    // Container starts in 'ready', no batch assignment

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b.batch_id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects teardown when batch_id does not match container current batch', async () => {
    const s = createTestStrain(ctx.db);
    const b1 = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    const b2 = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b1.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/teardown',
      headers: authHeader(ctx.app, 'grower'),
      payload: { batch_id: b2.batch_id },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Container startup workflow', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('transitions container from teardown to startup', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerTeardown(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/startup',
      headers: authHeader(ctx.app, 'grower'),
      payload: { media_replaced_pct: 33 },
    });
    expect(res.statusCode).toBe(201);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('startup');
  });

  it('creates a startup event record', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerTeardown(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/startup',
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });

    const event = ctx.db.prepare('SELECT * FROM cv_startup_events WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown> | undefined;
    expect(event).toBeDefined();
    expect(event?.container_id).toBe('Z1-30-R01-C001');
  });

  it('rejects startup when container is not in teardown state', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/startup',
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects startup when container is already in startup state', async () => {
    putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/startup',
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Container ready sign-off', () => {
  let ctx: TestContext;
  beforeEach(async () => { ctx = await createTestContext(); });
  afterEach(async () => { await teardownTestContext(ctx); });

  it('transitions container from startup to ready after sign-off', async () => {
    const startupId = putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    const res = await ctx.app.inject({
      method: 'POST', url: `/api/containers/Z1-30-R01-C001/startup/${startupId}/ready`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const state = ctx.db.prepare('SELECT current_state FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_state).toBe('ready');
  });

  it('sets ready_sign_off_at on the startup event', async () => {
    const startupId = putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    await ctx.app.inject({
      method: 'POST', url: `/api/containers/Z1-30-R01-C001/startup/${startupId}/ready`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });

    const event = ctx.db.prepare('SELECT * FROM cv_startup_events WHERE startup_id = ?').get(startupId) as Record<string, unknown>;
    expect(event.ready_sign_off_at).not.toBeNull();
    expect(event.ready_sign_off_by).not.toBeNull();
  });

  it('clears current_batch_id on the container state after ready sign-off', async () => {
    const startupId = putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    await ctx.app.inject({
      method: 'POST', url: `/api/containers/Z1-30-R01-C001/startup/${startupId}/ready`,
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });

    const state = ctx.db.prepare('SELECT * FROM cv_container_state WHERE container_id = ?').get('Z1-30-R01-C001') as Record<string, unknown>;
    expect(state.current_batch_id).toBeNull();
  });

  it('rejects sign-off when container is not in startup state', async () => {
    const s = createTestStrain(ctx.db);
    const b = createTestBatch(ctx.db, s.strain_id, { status: 'field-veg' });
    putContainerActive(ctx.db, 'Z1-30-R01-C001', b.batch_id);

    const res = await ctx.app.inject({
      method: 'POST', url: '/api/containers/Z1-30-R01-C001/startup/1/ready',
      headers: authHeader(ctx.app, 'supervisor'),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects sign-off by grower role (requires supervisor)', async () => {
    const startupId = putContainerStartup(ctx.db, 'Z1-30-R01-C001');

    const res = await ctx.app.inject({
      method: 'POST', url: `/api/containers/Z1-30-R01-C001/startup/${startupId}/ready`,
      headers: authHeader(ctx.app, 'grower'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
