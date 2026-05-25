import type { Knex } from 'knex';

// Adds 'record' task type support to stage protocols:
// - sample_count: how many containers to pull per sampling round
// - record_fields: JSON array defining what to measure per container
//
// Sampling sessions capture the results: one session per task execution,
// with one reading row per (sample × field). Aggregates are computed at
// read time — no derived columns stored.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_stage_protocols', (table) => {
    table.integer('sample_count').nullable();  // number of containers to sample
    table.text('record_fields').nullable();    // JSON: [{key,label,unit,type}]
  });

  await knex.schema.createTable('cv_sampling_sessions', (table) => {
    table.increments('session_id').primary();
    table.integer('protocol_id').notNullable()
      .references('protocol_id').inTable('cv_stage_protocols');
    table.integer('batch_id').notNullable()
      .references('batch_id').inTable('cv_batches');
    table.integer('sample_count_target').notNullable().defaultTo(3);
    table.integer('sample_count_actual').notNullable().defaultTo(0);
    table.integer('performed_by').notNullable()
      .references('user_id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('started_at').notNullable();
    table.text('completed_at').nullable();
    table.text('created_at').notNullable();
  });

  await knex.schema.createTable('cv_sampling_readings', (table) => {
    table.increments('reading_id').primary();
    table.integer('session_id').notNullable()
      .references('session_id').inTable('cv_sampling_sessions');
    table.integer('sequence_number').notNullable();  // 1, 2, 3…
    table.text('container_id').nullable();           // specific container if known
    table.text('container_label').nullable();        // display label e.g. "R3-C12"
    table.text('field_key').notNullable();           // e.g. "moisture_pct"
    table.text('field_label').notNullable();         // e.g. "Soil moisture"
    table.text('field_unit').nullable();             // e.g. "%"
    table.float('value_numeric').nullable();
    table.text('value_text').nullable();
    table.text('recorded_at').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_sampling_readings');
  await knex.schema.dropTableIfExists('cv_sampling_sessions');
  await knex.schema.alterTable('cv_stage_protocols', (table) => {
    table.dropColumn('sample_count');
    table.dropColumn('record_fields');
  });
}
