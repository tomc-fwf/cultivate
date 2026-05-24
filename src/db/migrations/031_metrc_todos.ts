import type { Knex } from 'knex';

// METRC manual action queue — created when batch transitions require METRC entry.
// Each todo represents one thing a supervisor must do in METRC (move plants, destroy plants, etc.)
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('cv_metrc_todos', (table) => {
    table.increments('todo_id');
    // 'move' — move plants between METRC locations
    // 'destroy' — destroy plants in METRC (pre-field losses)
    // 'phase_change' — change growth phase in METRC
    // 'other'
    table.text('todo_type').notNullable();
    table.integer('batch_id').notNullable().references('batch_id').inTable('cv_batches');
    table.text('description').notNullable(); // human-readable METRC instruction
    table.text('from_location').nullable();  // METRC location name (source)
    table.text('to_location').nullable();    // METRC location name (destination)
    table.integer('plant_count').nullable(); // plants involved in the action
    table.integer('loss_count').nullable();  // for destroy: how many plants lost
    table.text('loss_reason').nullable();    // 'never_sprouted' | 'died' | 'damaged' | 'missing' | 'other'
    table.text('loss_notes').nullable();
    // 'pending' | 'done'
    table.text('status').notNullable().defaultTo('pending');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
    table.text('completed_at').nullable();
    table.integer('completed_by').nullable().references('id').inTable('cv_users');
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_metrc_todos_batch ON cv_metrc_todos (batch_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_metrc_todos_status ON cv_metrc_todos (status)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_metrc_todos');
}
