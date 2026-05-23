import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add new columns to cv_locations
  await knex.schema.alterTable('cv_locations', (table) => {
    table.text('location_category').nullable();
    // CHECK constraint not added inline — SQLite doesn't support inline CHECK on ALTER
    table.integer('parent_location_id').nullable().references('location_id').inTable('cv_locations');
    table.text('description').nullable();
  });

  // 2. Update existing records with location_category
  await knex('cv_locations').where('location_id', 1).update({ location_category: 'indoor' });         // Germ-01
  await knex('cv_locations').where('location_id', 2).update({ location_category: 'indoor' });         // Seedlings
  await knex('cv_locations').where('location_id', 3).update({ location_category: 'hoop_house' });     // Cult-Hoop
  await knex('cv_locations').whereIn('location_id', [4, 5, 6, 7, 8, 9, 10, 11]).update({ location_category: 'outdoor' }); // Z1A–Z4B

  // 3. Insert Zone 1–4 as outdoor parent locations (IDs 12–15)
  await knex('cv_locations').insert([
    { location_id: 12, name: 'Zone 1', location_type: 'field', location_category: 'outdoor', metrc_name: 'Zone 1', sub_zone_id: null, active: 1 },
    { location_id: 13, name: 'Zone 2', location_type: 'field', location_category: 'outdoor', metrc_name: 'Zone 2', sub_zone_id: null, active: 1 },
    { location_id: 14, name: 'Zone 3', location_type: 'field', location_category: 'outdoor', metrc_name: 'Zone 3', sub_zone_id: null, active: 1 },
    { location_id: 15, name: 'Zone 4', location_type: 'field', location_category: 'outdoor', metrc_name: 'Zone 4', sub_zone_id: null, active: 1 },
  ]);

  // 4. Wire sub-zone locations to their parent zone
  await knex('cv_locations').whereIn('location_id', [4, 5]).update({ parent_location_id: 12 });   // Z1A, Z1B → Zone 1
  await knex('cv_locations').whereIn('location_id', [6, 7]).update({ parent_location_id: 13 });   // Z2A, Z2B → Zone 2
  await knex('cv_locations').whereIn('location_id', [8, 9]).update({ parent_location_id: 14 });   // Z3A, Z3B → Zone 3
  await knex('cv_locations').whereIn('location_id', [10, 11]).update({ parent_location_id: 15 }); // Z4A, Z4B → Zone 4
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN natively — recreate table with original schema only.
  // Zone 1–4 rows are excluded via column selection (they have no sub_zone_id and were added here).
  await knex.raw(`
    CREATE TABLE cv_locations_backup AS
    SELECT location_id, name, location_type, metrc_name, metrc_uid, sub_zone_id, active, created_at
    FROM cv_locations
  `);
  await knex.raw(`DROP TABLE cv_locations`);
  await knex.raw(`ALTER TABLE cv_locations_backup RENAME TO cv_locations`);
  // Remove the Zone 1–4 parent rows that were added in up()
  await knex('cv_locations').whereIn('location_id', [12, 13, 14, 15]).delete();
}
