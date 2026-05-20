import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { knex as createKnex } from 'knex';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'farmstock.db');
let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

export async function initDB(): Promise<Database.Database> {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const isCompiled = __filename.endsWith('.js');
  const k = createKnex({
    client: 'better-sqlite3',
    connection: { filename: DB_PATH },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      extension: isCompiled ? 'js' : 'ts',
      // Separate migrations table so cultivate's migrations don't conflict with farmstock's
      tableName: 'cv_knex_migrations',
    },
  });

  await k.migrate.latest();
  await k.destroy();

  // Seed default admin user (cultivate-specific — cv_users only)
  const userCount = (db.prepare('SELECT COUNT(*) as n FROM cv_users').get() as { n: number }).n;
  if (userCount === 0) {
    db.prepare(
      "INSERT INTO cv_users (name, email, pin_hash, role) VALUES ('Admin', 'admin@cultivate.local', ?, 'admin')",
    ).run(bcrypt.hashSync('0000', 10));
    console.log('[cultivate] Created default admin (PIN: 0000)');
  }

  return db;
}
