import type { Knex } from 'knex';

// Official METRC location list (2026 season):
// Seed Vault | Germination | Seedlings | Bubble House | Z1A | Z1B | Z2A | Z2B
// Z3A | Z3B | Z4A | Z4B | Z5 | Z6 | Dry Room

export async function up(knex: Knex): Promise<void> {
  // Update metrc_name values to match official METRC list
  const updates: [string, string][] = [
    ['Seed Vault',   'Seed Vault'],
    ['Germination',  'Germination'],
    ['Seedlings',    'Seedlings'],
    ['Cult-Hoop',    'Bubble House'],
    ['Z1A',          'Z1A'],
    ['Z1B',          'Z1B'],
    ['Z2A',          'Z2A'],
    ['Z2B',          'Z2B'],
    ['Z3A',          'Z3A'],
    ['Z3B',          'Z3B'],
    ['Z4A',          'Z4A'],
    ['Z4B',          'Z4B'],
    ['Zone 5',       'Z5'],
  ];

  for (const [name, metrc_name] of updates) {
    await knex('cv_locations').where({ name }).update({ metrc_name });
  }

  // Add Zone 6 parent location (metrc_name matches name; sub-zone Z6 is the actual METRC location)
  const [zone6Id] = await knex('cv_locations').insert({
    name: 'Zone 6',
    location_type: 'field',
    location_category: 'outdoor',
    metrc_name: 'Zone 6',
    display_order: 60,
    col_span: 1,
    active: 1,
    created_at: new Date().toISOString(),
  });

  // Add Z6 as sub-location under Zone 6
  await knex('cv_locations').insert({
    name: 'Z6',
    location_type: 'field',
    location_category: 'outdoor',
    metrc_name: 'Z6',
    parent_location_id: zone6Id,
    sub_zone_id: null,
    display_order: 10,
    col_span: 1,
    active: 1,
    created_at: new Date().toISOString(),
  });

}

export async function down(knex: Knex): Promise<void> {
  // Remove added locations
  await knex('cv_locations').where({ name: 'Z6' }).delete();
  await knex('cv_locations').where({ name: 'Zone 6' }).delete();

  // Revert metrc_name updates (best effort — restore known prior values)
  await knex('cv_locations').where({ name: 'Germination' }).update({ metrc_name: 'Germ-01' });
  await knex('cv_locations').where({ name: 'Cult-Hoop' }).update({ metrc_name: 'Cult-Hoop' });
  await knex('cv_locations').where({ name: 'Zone 5' }).update({ metrc_name: 'Zone 5' });
}
