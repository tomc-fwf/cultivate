import type { Knex } from 'knex';

// Migration 040 created cv_task_checklist_progress with checked_by referencing
// cv_users(user_id), but cv_users uses `id` as the primary key column name.
// SQLite stores FK constraints but validates at INSERT time against the named
// column. This migration recreates the table with the correct FK reference.
// All existing progress rows (if any) are preserved.

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('cv_task_checklist_progress');
  if (!hasTable) {
    // Table wasn't created by migration 040 — create it correctly now.
    await knex.schema.createTable('cv_task_checklist_progress', (table) => {
      table.increments('progress_id').primary();
      table.integer('protocol_id').notNullable()
        .references('protocol_id').inTable('cv_stage_protocols').onDelete('CASCADE');
      table.integer('batch_id').notNullable()
        .references('batch_id').inTable('cv_batches').onDelete('CASCADE');
      table.integer('item_id').notNullable()
        .references('item_id').inTable('cv_protocol_checklist_items').onDelete('CASCADE');
      table.integer('checked').notNullable().defaultTo(0);
      table.float('value_numeric').nullable();
      table.text('value_text').nullable();
      table.integer('checked_by').notNullable()
        .references('id').inTable('cv_users');
      table.text('checked_at').notNullable();
      table.unique(['protocol_id', 'batch_id', 'item_id']);
    });
    return;
  }

  // Table exists — recreate with corrected FK.
  await knex.schema.raw(`
    CREATE TABLE cv_task_checklist_progress_new (
      progress_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol_id   INTEGER NOT NULL REFERENCES cv_stage_protocols(protocol_id) ON DELETE CASCADE,
      batch_id      INTEGER NOT NULL REFERENCES cv_batches(batch_id) ON DELETE CASCADE,
      item_id       INTEGER NOT NULL REFERENCES cv_protocol_checklist_items(item_id) ON DELETE CASCADE,
      checked       INTEGER NOT NULL DEFAULT 0,
      value_numeric REAL,
      value_text    TEXT,
      checked_by    INTEGER NOT NULL REFERENCES cv_users(id),
      checked_at    TEXT NOT NULL,
      UNIQUE (protocol_id, batch_id, item_id)
    )
  `);

  await knex.schema.raw(`
    INSERT INTO cv_task_checklist_progress_new
      SELECT progress_id, protocol_id, batch_id, item_id, checked,
             value_numeric, value_text, checked_by, checked_at
      FROM cv_task_checklist_progress
  `);

  await knex.schema.raw(`DROP TABLE cv_task_checklist_progress`);
  await knex.schema.raw(`ALTER TABLE cv_task_checklist_progress_new RENAME TO cv_task_checklist_progress`);
}

export async function down(knex: Knex): Promise<void> {
  // No meaningful rollback — leave the table as-is.
}
