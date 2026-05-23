import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add display_order and col_span columns
  await knex.schema.alterTable('cv_locations', (table) => {
    table.integer('display_order').defaultTo(999).notNullable();
    table.integer('col_span').defaultTo(1).notNullable(); // 1=normal, 2=full-width in a 2-col grid
  });

  // 2. Indoor locations (Germ-01, Seedlings)
  await knex('cv_locations').where('location_id', 1).update({ display_order: 10 }); // Germ-01
  await knex('cv_locations').where('location_id', 2).update({ display_order: 20 }); // Seedlings
  // Cult-Hoop (hoop_house section)
  await knex('cv_locations').where('location_id', 3).update({ display_order: 10 });

  // 3. Outdoor top-level zones
  await knex('cv_locations').where('location_id', 12).update({ display_order: 20 }); // Zone 1
  await knex('cv_locations').where('location_id', 13).update({ display_order: 30 }); // Zone 2
  await knex('cv_locations').where('location_id', 14).update({ display_order: 40 }); // Zone 3
  await knex('cv_locations').where('location_id', 15).update({ display_order: 50 }); // Zone 4

  // 4. If a Zone 5 exists, pin it first with col_span=2
  const zone5 = await knex('cv_locations')
    .where('name', 'Zone 5')
    .where('location_category', 'outdoor')
    .whereNull('parent_location_id')
    .first();
  if (zone5) {
    await knex('cv_locations').where('location_id', zone5.location_id).update({ display_order: 10, col_span: 2 });
  }

  // 5. Sub-zone display order within their parents
  await knex('cv_locations').where('location_id', 4).update({ display_order: 10 });  // Z1A
  await knex('cv_locations').where('location_id', 5).update({ display_order: 20 });  // Z1B
  await knex('cv_locations').where('location_id', 6).update({ display_order: 10 });  // Z2A
  await knex('cv_locations').where('location_id', 7).update({ display_order: 20 });  // Z2B
  await knex('cv_locations').where('location_id', 8).update({ display_order: 10 });  // Z3A
  await knex('cv_locations').where('location_id', 9).update({ display_order: 20 });  // Z3B
  await knex('cv_locations').where('location_id', 10).update({ display_order: 10 }); // Z4A
  await knex('cv_locations').where('location_id', 11).update({ display_order: 20 }); // Z4B
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN — recreate table without the two new columns
  await knex.raw(`
    CREATE TABLE cv_locations_backup_024 AS
    SELECT location_id, name, location_type, location_category, metrc_name, metrc_uid,
           sub_zone_id, parent_location_id, description, active, created_at
    FROM cv_locations
  `);
  await knex.raw(`DROP TABLE cv_locations`);
  await knex.raw(`ALTER TABLE cv_locations_backup_024 RENAME TO cv_locations`);
}
