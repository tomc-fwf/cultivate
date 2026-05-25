import type { Knex } from 'knex';

// Stage protocol templates — define what tasks should be performed at each batch stage
// and how frequently. The Today screen generates a task queue by comparing last-performed
// dates against these protocols.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cv_stage_protocols', (table) => {
    table.increments('protocol_id').primary();
    table.text('stage').notNullable();           // batch status value: 'germ', 'seedling', etc.
    table.text('task_type').notNullable();        // 'fertigation' | 'observation' | 'amendment' | 'foliar'
    table.text('title').notNullable();            // display name shown in task card
    table.integer('frequency_days').notNullable().defaultTo(1); // how often (1=daily, 3=every 3 days)
    table.integer('day_min').nullable();          // only applicable after N days in stage
    table.integer('day_max').nullable();          // stop generating after N days in stage
    table.text('description').nullable();         // brief note on what to check / why
    table.integer('active').notNullable().defaultTo(1);
    table.integer('order_index').notNullable().defaultTo(0); // display order within a stage
    table.text('created_at').notNullable();
  });

  const now = new Date().toISOString();

  // Seed protocols for all active stages.
  // Fertigation tasks always come first (order_index 0), observations second (order_index 1).
  await knex('cv_stage_protocols').insert([
    // ── Germination ──────────────────────────────────────────────────────────
    { stage: 'germ',          task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'BASE recipe — tray-level bottom feed',             active: 1, created_at: now },

    // ── Seedlings ─────────────────────────────────────────────────────────────
    { stage: 'seedling',      task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'SEEDLING recipe — sub-location drip',              active: 1, created_at: now },
    { stage: 'seedling',      task_type: 'observation', title: 'Plant health check',             frequency_days: 2, order_index: 1, description: 'Germination rate, damping off, stretch, vigor',    active: 1, created_at: now },

    // ── Cult-Hoop Hardening ───────────────────────────────────────────────────
    { stage: 'cult-hoop',     task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'SEEDLING recipe — sub-location drip',              active: 1, created_at: now },
    { stage: 'cult-hoop',     task_type: 'observation', title: 'Hardening check',                frequency_days: 2, order_index: 1, description: 'Stress response, root development, sun exposure',  active: 1, created_at: now },

    // ── Field — Veg ───────────────────────────────────────────────────────────
    { stage: 'field-veg',     task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'VEG recipe via drip',                             active: 1, created_at: now },
    { stage: 'field-veg',     task_type: 'observation', title: 'Veg scouting',                   frequency_days: 3, order_index: 1, description: 'Pest pressure, deficiencies, structure, vigor',   active: 1, created_at: now },

    // ── Field — Flower ────────────────────────────────────────────────────────
    { stage: 'field-flower',  task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'FLOWER recipe via drip',                          active: 1, created_at: now },
    { stage: 'field-flower',  task_type: 'observation', title: 'Flower scouting',                frequency_days: 3, order_index: 1, description: 'Pest pressure, bud development, deficiencies',    active: 1, created_at: now },

    // ── Flush ─────────────────────────────────────────────────────────────────
    { stage: 'flush',         task_type: 'fertigation', title: 'Daily fertigation',              frequency_days: 1, order_index: 0, description: 'FLUSH recipe — reduced EC, plain water finish',   active: 1, created_at: now },
    { stage: 'flush',         task_type: 'observation', title: 'Maturity check',                 frequency_days: 2, order_index: 1, description: 'Trichome color, pistil color, readiness',         active: 1, created_at: now },

    // ── Harvest Window ────────────────────────────────────────────────────────
    { stage: 'harvest_window', task_type: 'observation', title: 'Harvest readiness assessment', frequency_days: 1, order_index: 0, description: 'Per-container maturity, trichome and pistil check', active: 1, created_at: now },

    // ── Harvesting ────────────────────────────────────────────────────────────
    { stage: 'harvesting',    task_type: 'observation', title: 'Harvest progress check',         frequency_days: 1, order_index: 0, description: 'Remaining plants, harvest batch completeness',     active: 1, created_at: now },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_stage_protocols');
}
