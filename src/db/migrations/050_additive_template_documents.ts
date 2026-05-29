import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_metrc_additive_templates', (table) => {
    table.text('label_url').nullable();
    table.text('label_file_name').nullable();
  });
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN natively.
  // To roll back, recreate cv_metrc_additive_templates without label_url and label_file_name.
}
