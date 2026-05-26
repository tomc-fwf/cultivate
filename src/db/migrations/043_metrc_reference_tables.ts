import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cv_metrc_additive_types', (table) => {
    table.text('name').primary();
  });
  await knex('cv_metrc_additive_types').insert([
    { name: 'Fertilizer' },
    { name: 'Pesticide' },
    { name: 'Other' },
  ]);

  await knex.schema.createTable('cv_metrc_plant_types', (table) => {
    table.text('name').primary();
  });
  await knex('cv_metrc_plant_types').insert([
    { name: 'Clone' },
    { name: 'Seed' },
  ]);

  await knex.schema.createTable('cv_metrc_growth_phases', (table) => {
    table.text('name').primary();
  });
  await knex('cv_metrc_growth_phases').insert([
    { name: 'Vegetative' },
    { name: 'Flowering' },
  ]);

  await knex.schema.createTable('cv_metrc_plant_waste_methods', (table) => {
    table.increments('method_id').primary();
    table.text('name').notNullable().unique();
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_plant_waste_reasons', (table) => {
    table.increments('reason_id').primary();
    table.text('name').notNullable().unique();
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_batch_waste_reasons', (table) => {
    table.increments('reason_id').primary();
    table.text('name').notNullable().unique();
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_package_adjustment_reasons', (table) => {
    table.increments('reason_id').primary();
    table.text('name').notNullable().unique();
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_units_of_measure', (table) => {
    table.increments('uom_id').primary();
    table.text('name').notNullable().unique();
    table.text('unit_type').notNullable().defaultTo('weight');
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_items', (table) => {
    table.increments('item_id').primary();
    table.text('name').notNullable().unique();
    table.text('category').nullable();
    table.integer('is_active').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('cv_metrc_sublocations', (table) => {
    table.increments('sublocation_id').primary();
    table.text('name').notNullable();
    table.integer('location_id').nullable().references('location_id').inTable('cv_locations');
    table.text('sub_zone_id').nullable();
    table.integer('is_active').notNullable().defaultTo(1);
    table.unique(['name', 'location_id']);
  });

  await knex.schema.createTable('cv_metrc_available_plant_tags', (table) => {
    table.text('tag').primary();
    table.text('status').notNullable().defaultTo('available'); // available | reserved | used
    table.integer('reserved_for_batch_id').nullable().references('batch_id').inTable('cv_batches');
    table.text('reserved_at').nullable();
    table.text('used_at').nullable();
  });

  await knex.schema.createTable('cv_metrc_available_package_tags', (table) => {
    table.text('tag').primary();
    table.text('status').notNullable().defaultTo('available'); // available | used
    table.text('used_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_metrc_available_package_tags');
  await knex.schema.dropTableIfExists('cv_metrc_available_plant_tags');
  await knex.schema.dropTableIfExists('cv_metrc_sublocations');
  await knex.schema.dropTableIfExists('cv_metrc_items');
  await knex.schema.dropTableIfExists('cv_metrc_units_of_measure');
  await knex.schema.dropTableIfExists('cv_metrc_package_adjustment_reasons');
  await knex.schema.dropTableIfExists('cv_metrc_batch_waste_reasons');
  await knex.schema.dropTableIfExists('cv_metrc_plant_waste_reasons');
  await knex.schema.dropTableIfExists('cv_metrc_plant_waste_methods');
  await knex.schema.dropTableIfExists('cv_metrc_growth_phases');
  await knex.schema.dropTableIfExists('cv_metrc_plant_types');
  await knex.schema.dropTableIfExists('cv_metrc_additive_types');
}
