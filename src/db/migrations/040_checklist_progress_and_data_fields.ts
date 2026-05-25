import type { Knex } from 'knex';

// Adds two capabilities to the checklist system:
//
// 1. Data-capture field types on checklist items.
//    field_type: 'boolean' (tap to check) | 'number' (enter value, validated against min/max) | 'text'
//    field_unit: label shown next to the input (e.g. "mS/cm", "pH")
//    min_value / max_value: acceptable range for number fields; item auto-checks when in range.
//
// 2. Persistent checklist progress per task instance.
//    cv_task_checklist_progress stores checked state + captured values per
//    (protocol_id, batch_id, item_id). Cultivators can leave mid-task and
//    return to find their progress intact.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_protocol_checklist_items', (table) => {
    table.text('field_type').notNullable().defaultTo('boolean'); // 'boolean' | 'number' | 'text'
    table.text('field_unit').nullable();          // e.g. 'mS/cm', 'pH', 'in'
    table.float('min_value').nullable();          // acceptable range low (number type only)
    table.float('max_value').nullable();          // acceptable range high (number type only)
  });

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
      .references('user_id').inTable('cv_users');
    table.text('checked_at').notNullable();
    table.unique(['protocol_id', 'batch_id', 'item_id']);
  });

  // Update EC and pH seed items from migration 039 to number type with ranges.
  await knex('cv_protocol_checklist_items')
    .where('label', 'like', '%EC measured%')
    .update({ field_type: 'number', field_unit: 'mS/cm', min_value: 0.3, max_value: 2.5 });

  await knex('cv_protocol_checklist_items')
    .where('label', 'like', '%pH measured%')
    .update({ field_type: 'number', field_unit: 'pH', min_value: 5.8, max_value: 6.8 });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_task_checklist_progress');
  await knex.schema.alterTable('cv_protocol_checklist_items', (table) => {
    table.dropColumn('field_type');
    table.dropColumn('field_unit');
    table.dropColumn('min_value');
    table.dropColumn('max_value');
  });
}
