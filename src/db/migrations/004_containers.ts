import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Container state — 1:1 with cv_containers; current state of each container
  await knex.schema.createTableIfNotExists('cv_container_state', (table) => {
    table.text('container_id').primary().references('container_id').inTable('cv_containers');
    // current_state: "ready" | "active" | "empty" | "teardown" | "startup" | "out_of_service"
    table.text('current_state').notNullable().defaultTo('ready');
    table.text('state_since').notNullable();
    // current_batch_id: set when state IN ('active', 'empty', 'teardown'); NULL otherwise
    table.integer('current_batch_id').nullable().references('batch_id').inTable('cv_batches');
    table.text('media_first_used').nullable();
    table.text('last_full_replacement').nullable();
    table.text('last_teardown_date').nullable();
    table.text('last_startup_date').nullable();
    table.text('notes').nullable();
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Container state transitions — append-only audit log
  await knex.schema.createTableIfNotExists('cv_container_state_transitions', (table) => {
    table.increments('transition_id');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.text('from_state').nullable();
    table.text('to_state').notNullable();
    table.text('transitioned_at').notNullable();
    table.integer('transitioned_by').nullable().references('id').inTable('cv_users');
    table.integer('batch_id').nullable().references('batch_id').inTable('cv_batches');
    // trigger_event: "batch_assigned" | "plant_loss" | "plant_replaced" | "batch_closed" |
    //                "teardown_complete" | "startup_complete" | "manual" | "other"
    table.text('trigger_event').nullable();
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Container amendments — any addition to container media (batch-scoped OR container-only)
  // Note: soil_sample_id FK references cv_soil_samples (created in 005_soil)
  // We omit that FK here and rely on application-layer integrity until 005 runs.
  await knex.schema.createTableIfNotExists('cv_container_amendments', (table) => {
    table.increments('amendment_id');
    table.text('container_id').notNullable().references('container_id').inTable('cv_containers');
    table.integer('batch_id').nullable().references('batch_id').inTable('cv_batches');
    // container_state at time of amendment: "active" | "empty" | "teardown" | "startup"
    table.text('container_state').notNullable();
    table.text('applied_at').notNullable();
    // amendment_type: "media_replacement" | "amendment" | "inoculation" | "drench" |
    //                 "top_dress" | "mix_in" | "correction" | "removal" | "other"
    table.text('amendment_type').notNullable();
    // input_id references items.id in shared farmstock DB (no FK constraint across logical app boundary)
    table.integer('input_id').nullable();
    // input_lot_id references stock.id in shared farmstock DB
    table.integer('input_lot_id').nullable();
    table.float('quantity').nullable();
    table.text('quantity_unit').nullable();
    // application_method: "top_dress" | "mix_in" | "drench" | "side_dress" | "replaced" | "removed" | "other"
    table.text('application_method').nullable();
    table.text('purpose').nullable();
    // soil_sample_id will reference cv_soil_samples — deferred FK, managed at app layer
    table.integer('soil_sample_id').nullable();
    table.integer('applicator').nullable().references('id').inTable('cv_users');
    table.text('notes').nullable();
    table.text('photo_urls').nullable(); // JSON array stored as text
    table.integer('corrects_id').nullable().references('amendment_id').inTable('cv_container_amendments');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Container QR codes — permanent QR stickers on containers
  await knex.schema.createTableIfNotExists('cv_container_qr_codes', (table) => {
    table.increments('qr_id');
    table.text('container_id').notNullable().unique().references('container_id').inTable('cv_containers');
    table.text('qr_payload').notNullable(); // typically the container_id itself
    // qr_format: "text" | "url" | "json"
    table.text('qr_format').notNullable().defaultTo('text');
    table.text('printed_at').nullable();
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Seed cv_container_state for all 1180 containers — all start as "ready"
  await knex.raw(`
    INSERT OR IGNORE INTO cv_container_state (container_id, current_state, state_since, updated_at)
    SELECT container_id, 'ready', datetime('now'), datetime('now') FROM cv_containers
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_container_qr_codes');
  await knex.schema.dropTableIfExists('cv_container_amendments');
  await knex.schema.dropTableIfExists('cv_container_state_transitions');
  await knex.schema.dropTableIfExists('cv_container_state');
}
