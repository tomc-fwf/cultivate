import Database from 'better-sqlite3';
import path from 'path';
import { knex as createKnex } from 'knex';
import { buildApp } from '../../api/app.js';
import { setDB } from '../../db/index.js';

export type TestContext = {
  db: Database.Database;
  app: Awaited<ReturnType<typeof buildApp>>;
};

export async function createTestContext(): Promise<TestContext> {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const migrationsDir = path.join(__dirname, '../../db/migrations');

  const k = createKnex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
    migrations: {
      directory: migrationsDir,
      extension: 'ts',
      tableName: 'cv_knex_migrations',
    },
  });

  // Override connection creation to use our pre-created in-memory DB.
  // This ensures all migrations run against the same DB instance that the app will use.
  (k.client as Record<string, unknown>).acquireRawConnection = () => Promise.resolve(db);
  (k.client as Record<string, unknown>).destroyRawConnection = () => Promise.resolve(undefined);

  await k.migrate.latest();
  await k.destroy();

  // Seed test users (id 1=admin, 2=supervisor, 3=grower)
  const now = new Date().toISOString();
  const pinHash = 'test-pin-hash'; // only used for login; JWTs are signed directly in tests
  db.prepare(`
    INSERT INTO cv_users (id, name, email, pin_hash, role, active, created_at, updated_at)
    VALUES (1, 'Test Admin', 'admin@test.local', ?, 'admin', 1, ?, ?)
  `).run(pinHash, now, now);
  db.prepare(`
    INSERT INTO cv_users (id, name, email, pin_hash, role, active, created_at, updated_at)
    VALUES (2, 'Test Supervisor', 'supervisor@test.local', ?, 'supervisor', 1, ?, ?)
  `).run(pinHash, now, now);
  db.prepare(`
    INSERT INTO cv_users (id, name, email, pin_hash, role, active, created_at, updated_at)
    VALUES (3, 'Test Grower', 'grower@test.local', ?, 'grower', 1, ?, ?)
  `).run(pinHash, now, now);

  setDB(db);

  const app = await buildApp();
  await app.ready();

  return { db, app };
}

export async function teardownTestContext(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  ctx.db.close();
}
