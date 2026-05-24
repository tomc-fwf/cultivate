import type { Knex } from 'knex';

// Add "when to use" metadata columns to cv_fertigation_recipes:
//   applicable_stages — JSON array of stage strings (null = any stage)
//   day_min           — minimum days since sow_date (inclusive), nullable
//   day_max           — maximum days since sow_date (inclusive), nullable
//   is_base_recipe    — boolean flag (1 = can be used as standalone/base)
//   usage_notes       — one-line description of when to use this recipe

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_fertigation_recipes', (table) => {
    table.text('applicable_stages').nullable();   // JSON array, e.g. '["germ","seedling"]'
    table.integer('day_min').nullable();
    table.integer('day_max').nullable();
    table.integer('is_base_recipe').notNullable().defaultTo(0);
    table.text('usage_notes').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_fertigation_recipes', (table) => {
    table.dropColumn('applicable_stages');
    table.dropColumn('day_min');
    table.dropColumn('day_max');
    table.dropColumn('is_base_recipe');
    table.dropColumn('usage_notes');
  });
}
