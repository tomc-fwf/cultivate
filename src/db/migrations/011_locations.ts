import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── cv_locations ─────────────────────────────────────────────────────────
  // METRC-mirrored locations. Every physical area where a plant batch can
  // reside is represented here. Field locations link back to cv_sub_zones
  // for container-level tracking; pre-field locations stand alone.
  //
  // metrc_name is the exact string as it appears in METRC — may differ from
  // our internal display name. Used when generating METRC move events.
  await knex.schema.createTableIfNotExists('cv_locations', (table) => {
    table.increments('location_id');
    table.text('name').notNullable();
    // location_type: "germination" | "seedling" | "veg" | "field"
    table.text('location_type').notNullable();
    // Exact name as registered in METRC — used for METRC event payloads
    table.text('metrc_name').notNullable();
    // METRC API location UID — populated when Phase 4 sync is set up
    table.text('metrc_uid').nullable();
    // Field locations link to the physical sub-zone grid; pre-field locations null
    table.text('sub_zone_id').nullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.integer('active').notNullable().defaultTo(1);
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── cv_sub_locations ─────────────────────────────────────────────────────
  // Optional sub-divisions within a location (METRC sub-locations).
  // Schema is defined now; seed data added only when the operation defines them.
  await knex.schema.createTableIfNotExists('cv_sub_locations', (table) => {
    table.increments('sub_location_id');
    table.integer('location_id').notNullable().references('location_id').inTable('cv_locations');
    table.text('name').notNullable();
    table.text('metrc_name').notNullable();
    table.text('metrc_uid').nullable();
    table.integer('active').notNullable().defaultTo(1);
    table.text('created_at').notNullable().defaultTo(knex.raw("(datetime('now'))"));
  });

  // ── Seed: 11 fixed METRC locations ───────────────────────────────────────
  // 3 pre-field + 8 field (one per sub-zone).
  // metrc_name values are placeholders — update to match exact METRC room names
  // once the operation's METRC account is confirmed.
  await knex('cv_locations').insert([
    { location_id: 1, name: 'Germ-01',   location_type: 'germination', metrc_name: 'Germ-01',   sub_zone_id: null },
    { location_id: 2, name: 'Seedlings', location_type: 'seedling',    metrc_name: 'Seedlings', sub_zone_id: null },
    { location_id: 3, name: 'Cult-Hoop', location_type: 'veg',         metrc_name: 'Cult-Hoop', sub_zone_id: null },
    { location_id: 4, name: 'Z1A',       location_type: 'field',       metrc_name: 'Z1A',       sub_zone_id: 'Z1A' },
    { location_id: 5, name: 'Z1B',       location_type: 'field',       metrc_name: 'Z1B',       sub_zone_id: 'Z1B' },
    { location_id: 6, name: 'Z2A',       location_type: 'field',       metrc_name: 'Z2A',       sub_zone_id: 'Z2A' },
    { location_id: 7, name: 'Z2B',       location_type: 'field',       metrc_name: 'Z2B',       sub_zone_id: 'Z2B' },
    { location_id: 8, name: 'Z3A',       location_type: 'field',       metrc_name: 'Z3A',       sub_zone_id: 'Z3A' },
    { location_id: 9, name: 'Z3B',       location_type: 'field',       metrc_name: 'Z3B',       sub_zone_id: 'Z3B' },
    { location_id: 10, name: 'Z4A',      location_type: 'field',       metrc_name: 'Z4A',       sub_zone_id: 'Z4A' },
    { location_id: 11, name: 'Z4B',      location_type: 'field',       metrc_name: 'Z4B',       sub_zone_id: 'Z4B' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_sub_locations');
  await knex.schema.dropTableIfExists('cv_locations');
}
