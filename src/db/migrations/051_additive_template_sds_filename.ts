import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cv_metrc_additive_templates', (table) => {
    table.text('sds_file_name').nullable();
  });
}

export async function down(_knex: Knex): Promise<void> {
  // SQLite does not support DROP COLUMN natively.
  // To roll back, recreate cv_metrc_additive_templates without sds_file_name.
}
