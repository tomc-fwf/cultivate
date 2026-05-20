import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Zones
  await knex.schema.createTableIfNotExists('cv_zones', (table) => {
    table.integer('zone_id').primary();
    table.text('name').notNullable();
  });

  // Sub-zones
  await knex.schema.createTableIfNotExists('cv_sub_zones', (table) => {
    table.text('sub_zone_id').primary(); // e.g. "Z1A"
    table.integer('zone_id').notNullable().references('zone_id').inTable('cv_zones');
    table.text('designation').notNullable(); // "A" | "B"
    table.integer('pot_size_gal').notNullable(); // 30 or 10
    table.integer('row_count').notNullable().defaultTo(5);
    table.integer('container_count').notNullable(); // 150 or 145
  });

  // Rows
  await knex.schema.createTableIfNotExists('cv_rows', (table) => {
    table.text('row_id').primary(); // e.g. "Z1-A-R3"
    table.text('sub_zone_id').notNullable().references('sub_zone_id').inTable('cv_sub_zones');
    table.integer('row_number').notNullable(); // 1-5
    table.integer('container_count').notNullable(); // 30 or 29
  });

  // Containers
  await knex.schema.createTableIfNotExists('cv_containers', (table) => {
    table.text('container_id').primary(); // e.g. "Z1-A-R3-C12"
    table.text('row_id').notNullable().references('row_id').inTable('cv_rows');
    table.integer('position').notNullable(); // 1-30 or 1-29
    table.text('qr_code').nullable();
    table.text('notes').nullable();
  });

  // -------------------------------------------------------------------------
  // Seed fixed physical infrastructure
  // -------------------------------------------------------------------------

  // 4 zones
  await knex('cv_zones').insert([
    { zone_id: 1, name: 'Zone 1' },
    { zone_id: 2, name: 'Zone 2' },
    { zone_id: 3, name: 'Zone 3' },
    { zone_id: 4, name: 'Zone 4' },
  ]);

  // 8 sub-zones: each zone has A (30-gal, 150 containers) and B (10-gal, 145 containers)
  const subZones = [];
  for (let z = 1; z <= 4; z++) {
    subZones.push({
      sub_zone_id: `Z${z}A`,
      zone_id: z,
      designation: 'A',
      pot_size_gal: 30,
      row_count: 5,
      container_count: 150, // 5 rows × 30 containers
    });
    subZones.push({
      sub_zone_id: `Z${z}B`,
      zone_id: z,
      designation: 'B',
      pot_size_gal: 10,
      row_count: 5,
      container_count: 145, // 5 rows × 29 containers
    });
  }
  await knex('cv_sub_zones').insert(subZones);

  // 40 rows (8 sub-zones × 5 rows each)
  const rows = [];
  for (let z = 1; z <= 4; z++) {
    for (const des of ['A', 'B']) {
      const containersPerRow = des === 'A' ? 30 : 29;
      for (let r = 1; r <= 5; r++) {
        rows.push({
          row_id: `Z${z}-${des}-R${r}`,
          sub_zone_id: `Z${z}${des}`,
          row_number: r,
          container_count: containersPerRow,
        });
      }
    }
  }
  await knex('cv_rows').insert(rows);

  // 1180 containers: 4 zones × (5 rows × 30 A-containers + 5 rows × 29 B-containers)
  // = 4 × (150 + 145) = 4 × 295 = 1180
  const containers = [];
  for (let z = 1; z <= 4; z++) {
    for (const des of ['A', 'B']) {
      const containersPerRow = des === 'A' ? 30 : 29;
      for (let r = 1; r <= 5; r++) {
        for (let c = 1; c <= containersPerRow; c++) {
          containers.push({
            container_id: `Z${z}-${des}-R${r}-C${c}`,
            row_id: `Z${z}-${des}-R${r}`,
            position: c,
            qr_code: null,
            notes: null,
          });
        }
      }
    }
  }

  // Insert in chunks to avoid SQLite limits
  const CHUNK = 500;
  for (let i = 0; i < containers.length; i += CHUNK) {
    await knex('cv_containers').insert(containers.slice(i, i + CHUNK));
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cv_containers');
  await knex.schema.dropTableIfExists('cv_rows');
  await knex.schema.dropTableIfExists('cv_sub_zones');
  await knex.schema.dropTableIfExists('cv_zones');
}
