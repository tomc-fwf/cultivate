import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Fertigation recipes — versioned, immutable once approved
  await knex.schema.createTableIfNotExists('cv_fertigation_recipes', (table) => {
    table.increments('recipe_id');
    // name: "BASE" | "SEEDLING" | "AUTO-VEG" | "AUTO-FLOWER" | "PHOTO-VEG" | "PHOTO-FLOWER" | "FLUSH"
    table.text('name').notNullable();
    table.text('version').notNullable().defaultTo('1.0');
    table.integer('active').notNullable().defaultTo(1); // only one active per name
    table.float('ec_target_low').nullable();
    table.float('ec_target_high').nullable();
    table.float('ph_target_low').nullable();
    table.float('ph_target_high').nullable();
    table.text('mixing_order').nullable(); // numbered steps as text
    table.text('notes').nullable();
    table.integer('approved_by').nullable().references('id').inTable('cv_users');
    table.text('approved_at').nullable();
    table.text('superseded_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Fertigation recipe ingredients
  await knex.schema.createTableIfNotExists('cv_fertigation_recipe_ingredients', (table) => {
    table.increments('id');
    table.integer('recipe_id').notNullable().references('recipe_id').inTable('cv_fertigation_recipes');
    // input_id references items.id in shared farmstock DB (no FK constraint across app boundary)
    table.integer('input_id').notNullable();
    table.float('rate_value').notNullable();
    // rate_unit: e.g. "tsp_per_gal", "ml_per_gal", "drops_per_gal"
    table.text('rate_unit').notNullable();
    table.integer('order_index').notNullable().defaultTo(0);
    table.text('notes').nullable(); // e.g. "Day 9 only" for Dynomyco
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Foliar recipes — optional, for repeat foliar mixes
  await knex.schema.createTableIfNotExists('cv_foliar_recipes', (table) => {
    table.increments('foliar_recipe_id');
    table.text('name').notNullable(); // e.g. "Weekly Preventive Foliar", "Cal-Mag Foliar"
    table.text('version').notNullable().defaultTo('1.0');
    table.integer('active').notNullable().defaultTo(1);
    table.text('purpose').nullable(); // what this foliar is intended to address
    table.text('notes').nullable();
    table.integer('approved_by').nullable().references('id').inTable('cv_users');
    table.text('approved_at').nullable();
    table.text('superseded_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.integer('created_by').nullable().references('id').inTable('cv_users');
  });

  // Foliar recipe ingredients — must be non-pesticide products
  await knex.schema.createTableIfNotExists('cv_foliar_recipe_ingredients', (table) => {
    table.increments('id');
    table.integer('foliar_recipe_id').notNullable().references('foliar_recipe_id').inTable('cv_foliar_recipes');
    // input_id references items.id in shared farmstock DB
    table.integer('input_id').notNullable();
    table.float('rate_value').notNullable();
    table.text('rate_unit').notNullable();
    table.integer('order_index').notNullable().defaultTo(0);
    table.text('notes').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // Per-product stage-specific PHI / application rules
  await knex.schema.createTableIfNotExists('cv_input_phi_stage_overrides', (table) => {
    table.increments('override_id');
    // input_id references items.id in shared farmstock DB
    table.integer('input_id').notNullable();
    // batch_stage: "germ" | "seedling" | "cult_hoop" | "field_veg" |
    //              "field_flower_w1" | "field_flower_w2" | "field_flower_w3" | "field_flower_w4plus" | "flush"
    table.text('batch_stage').notNullable();
    table.integer('allowed').notNullable().defaultTo(1); // 0 = blocked at this stage
    table.float('phi_days_override').nullable();
    table.text('reason').nullable(); // required when allowed = 0
    table.integer('created_by').nullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_input_phi_stage_overrides');
  await knex.schema.dropTableIfExists('cv_foliar_recipe_ingredients');
  await knex.schema.dropTableIfExists('cv_foliar_recipes');
  await knex.schema.dropTableIfExists('cv_fertigation_recipe_ingredients');
  await knex.schema.dropTableIfExists('cv_fertigation_recipes');
}
