import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('cv_users', (table) => {
    table.increments('id');
    table.text('name').notNullable();
    table.text('email').nullable();
    table.text('pin_hash').notNullable();
    table.text('role').notNullable().defaultTo('grower'); // grower | supervisor | admin
    table.integer('active').notNullable().defaultTo(1);
    table.integer('failed_attempts').notNullable().defaultTo(0);
    table.text('locked_until').nullable();
    table.text('last_login_at').nullable();
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
    table.text('updated_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_users');
}
