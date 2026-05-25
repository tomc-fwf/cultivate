import type { Knex } from 'knex';

// Adds SOP + checklist items to protocols, and a task postponements table.
//
// sop_text: instructional text the cultivator reads before starting a task.
// cv_protocol_checklist_items: ordered steps to work through during the task.
// cv_task_postponements: records when and why a task was deferred, with an
//   optional snooze_until timestamp. Tasks with an active postponement are
//   excluded from GET /tasks/today until the snooze window expires.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_stage_protocols', (table) => {
    table.text('sop_text').nullable(); // markdown/plain text SOP for this task type
  });

  await knex.schema.createTable('cv_protocol_checklist_items', (table) => {
    table.increments('item_id').primary();
    table.integer('protocol_id').notNullable()
      .references('protocol_id').inTable('cv_stage_protocols').onDelete('CASCADE');
    table.integer('order_index').notNullable().defaultTo(0);
    table.text('label').notNullable();
    table.integer('required').notNullable().defaultTo(0); // 0=optional, 1=required
    table.text('created_at').notNullable();
  });

  await knex.schema.createTable('cv_task_postponements', (table) => {
    table.increments('postponement_id').primary();
    table.integer('protocol_id').notNullable()
      .references('protocol_id').inTable('cv_stage_protocols');
    table.integer('batch_id').notNullable()
      .references('batch_id').inTable('cv_batches');
    table.integer('postponed_by').notNullable()
      .references('user_id').inTable('cv_users');
    table.text('reason').notNullable();       // 'weather' | 'staffing' | 'equipment' | 'priority' | 'other'
    table.text('reason_notes').nullable();    // free-text elaboration
    table.text('snooze_until').nullable();    // ISO timestamp; NULL = indefinite
    table.text('postponed_at').notNullable();
    table.text('created_at').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_task_postponements');
  await knex.schema.dropTableIfExists('cv_protocol_checklist_items');
  await knex.schema.alterTable('cv_stage_protocols', (table) => {
    table.dropColumn('sop_text');
  });
}
