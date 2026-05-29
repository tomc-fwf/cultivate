import type { Knex } from 'knex';

// Zone 5: single sub-zone (Z5), 10-gal, 2 rows × 30 containers = 60 total
// Zone 6: single sub-zone (Z6), 30-gal, 1 row × 60 containers = 60 total

export async function up(knex: Knex): Promise<void> {
  // 1. Zones
  await knex('cv_zones').insert([
    { zone_id: 5, name: 'Zone 5' },
    { zone_id: 6, name: 'Zone 6' },
  ]);

  // 2. Sub-zones (single per zone — no A/B split)
  await knex('cv_sub_zones').insert([
    { sub_zone_id: 'Z5', zone_id: 5, designation: 'A', pot_size_gal: 10, row_count: 2, container_count: 60 },
    { sub_zone_id: 'Z6', zone_id: 6, designation: 'A', pot_size_gal: 30, row_count: 1, container_count: 60 },
  ]);

  // 3. Rows
  await knex('cv_rows').insert([
    { row_id: 'Z5-A-R1', sub_zone_id: 'Z5', row_number: 1, container_count: 30 },
    { row_id: 'Z5-A-R2', sub_zone_id: 'Z5', row_number: 2, container_count: 30 },
    { row_id: 'Z6-A-R1', sub_zone_id: 'Z6', row_number: 1, container_count: 60 },
  ]);

  // 4. Containers
  const containers: { container_id: string; row_id: string; position: number; qr_code: null; notes: null }[] = [];

  for (let c = 1; c <= 30; c++) {
    containers.push({ container_id: `Z5-A-R1-C${c}`, row_id: 'Z5-A-R1', position: c, qr_code: null, notes: null });
    containers.push({ container_id: `Z5-A-R2-C${c}`, row_id: 'Z5-A-R2', position: c, qr_code: null, notes: null });
  }
  for (let c = 1; c <= 60; c++) {
    containers.push({ container_id: `Z6-A-R1-C${c}`, row_id: 'Z6-A-R1', position: c, qr_code: null, notes: null });
  }

  const CHUNK = 500;
  for (let i = 0; i < containers.length; i += CHUNK) {
    await knex('cv_containers').insert(containers.slice(i, i + CHUNK));
  }

  // 5. Initial container state — all ready
  await knex.raw(`
    INSERT OR IGNORE INTO cv_container_state (container_id, current_state, state_since, updated_at)
    SELECT container_id, 'ready', datetime('now'), datetime('now')
    FROM cv_containers
    WHERE container_id LIKE 'Z5-%' OR container_id LIKE 'Z6-%'
  `);

  // 6. Wire cv_locations sub_zone_id for Z5 and Z6 if those location entries exist
  //    Zone 5 was added via admin UI as a single outdoor location — link it to Z5
  await knex('cv_locations')
    .where({ name: 'Zone 5', location_category: 'outdoor' })
    .whereNull('sub_zone_id')
    .update({ sub_zone_id: 'Z5', location_type: 'field' });

  //    Z6 was added in migration 047 as a child of Zone 6 — link it to Z6
  await knex('cv_locations')
    .where({ name: 'Z6', location_category: 'outdoor' })
    .whereNull('sub_zone_id')
    .update({ sub_zone_id: 'Z6', location_type: 'field' });
}

export async function down(knex: Knex): Promise<void> {
  // Unlink locations
  await knex('cv_locations').where({ sub_zone_id: 'Z5' }).update({ sub_zone_id: null });
  await knex('cv_locations').where({ sub_zone_id: 'Z6' }).update({ sub_zone_id: null });

  // Remove containers and state (cascade in app layer — no FK cascade in SQLite)
  await knex('cv_container_state').where('container_id', 'like', 'Z5-%').delete();
  await knex('cv_container_state').where('container_id', 'like', 'Z6-%').delete();
  await knex('cv_containers').where('row_id', 'like', 'Z5-%').delete();
  await knex('cv_containers').where('row_id', 'like', 'Z6-%').delete();
  await knex('cv_rows').where('sub_zone_id', 'Z5').delete();
  await knex('cv_rows').where('sub_zone_id', 'Z6').delete();
  await knex('cv_sub_zones').whereIn('sub_zone_id', ['Z5', 'Z6']).delete();
  await knex('cv_zones').whereIn('zone_id', [5, 6]).delete();
}
