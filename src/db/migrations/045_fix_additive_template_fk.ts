import type { Knex } from 'knex';

// Migration 042 created cv_metrc_additive_templates with a FK reference to cv_crop_inputs,
// but cv_crop_inputs lives in farmstock (separate DB). SQLite enforces FK table existence
// at statement-prepare time when foreign_keys=ON, so any INSERT fails with
// "no such table: main.cv_crop_inputs". This migration recreates the table without that FK.

export async function up(knex: Knex): Promise<void> {
  const now = knex.raw("(datetime('now'))");

  await knex.schema.createTable('cv_metrc_additive_templates_new', (table) => {
    table.increments('template_id').primary();
    table.text('name').notNullable().unique();
    table.text('additive_type').notNullable();
    table.text('product_trade_name').nullable();
    table.text('epa_registration_number').nullable();
    table.text('note').nullable();
    table.text('rei_quantity').nullable();
    table.text('rei_time_unit').nullable();
    table.text('product_supplier').nullable();
    table.text('application_device').nullable();
    table.text('active_ingredients').notNullable();
    table.integer('crop_input_id').nullable(); // plain integer — no FK; cv_crop_inputs is in farmstock
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.raw(`
    INSERT INTO cv_metrc_additive_templates_new
      SELECT * FROM cv_metrc_additive_templates
  `);

  await knex.schema.dropTable('cv_metrc_additive_templates');
  await knex.schema.renameTable('cv_metrc_additive_templates_new', 'cv_metrc_additive_templates');
}

export async function down(knex: Knex): Promise<void> {
  const now = knex.raw("(datetime('now'))");

  await knex.schema.createTable('cv_metrc_additive_templates_old', (table) => {
    table.increments('template_id').primary();
    table.text('name').notNullable().unique();
    table.text('additive_type').notNullable();
    table.text('product_trade_name').nullable();
    table.text('epa_registration_number').nullable();
    table.text('note').nullable();
    table.text('rei_quantity').nullable();
    table.text('rei_time_unit').nullable();
    table.text('product_supplier').nullable();
    table.text('application_device').nullable();
    table.text('active_ingredients').notNullable();
    table.integer('crop_input_id').nullable();
    table.integer('metrc_id').nullable();
    table.text('metrc_csv_generated_at').nullable();
    table.text('metrc_csv_file_path').nullable();
    table.text('metrc_submitted_at').nullable();
    table.integer('created_by').notNullable().references('id').inTable('cv_users');
    table.text('created_at').notNullable().defaultTo(now);
    table.text('updated_at').notNullable().defaultTo(now);
  });

  await knex.raw(`
    INSERT INTO cv_metrc_additive_templates_old
      SELECT * FROM cv_metrc_additive_templates
  `);

  await knex.schema.dropTable('cv_metrc_additive_templates');
  await knex.schema.renameTable('cv_metrc_additive_templates_old', 'cv_metrc_additive_templates');
}
