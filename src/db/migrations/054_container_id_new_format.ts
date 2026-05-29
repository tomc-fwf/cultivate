import type { Knex } from 'knex';

// PRAGMA foreign_keys = OFF is silently ignored inside a transaction in SQLite,
// so this migration must run outside any transaction.
export const config = { transaction: false };

/**
 * Reformat container_id and row_id to match physical QR label format.
 *
 * Old: Z1-A-R3-C12    (designation letter, no padding)
 * New: Z1-30-R03-C012 (pot_size_gal, row padded to 2 digits, container padded to 3 digits)
 *
 * The conversion joins cv_sub_zones to get actual pot_size_gal — does NOT assume A=30/B=10
 * because Zone 5 has designation A with pot_size=10 and Zone 6 has designation A with pot_size=30.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    // 1. Build row mapping: old_row_id → new_row_id
    const rowRows = await knex.raw<{ row_id: string; row_number: number; zone_id: number; pot_size_gal: number }[]>(`
      SELECT r.row_id, r.row_number, sz.zone_id, sz.pot_size_gal
      FROM cv_rows r
      JOIN cv_sub_zones sz ON r.sub_zone_id = sz.sub_zone_id
    `);

    const rowMap = new Map<string, string>();
    for (const r of rowRows) {
      const newRowId = `Z${r.zone_id}-${r.pot_size_gal}-R${String(r.row_number).padStart(2, '0')}`;
      if (r.row_id !== newRowId) rowMap.set(r.row_id, newRowId);
    }

    // 2. Build container mapping: old_container_id → new_container_id
    const containerRows = await knex.raw<{ container_id: string; position: number; row_number: number; zone_id: number; pot_size_gal: number }[]>(`
      SELECT c.container_id, c.position, r.row_number, sz.zone_id, sz.pot_size_gal
      FROM cv_containers c
      JOIN cv_rows r ON c.row_id = r.row_id
      JOIN cv_sub_zones sz ON r.sub_zone_id = sz.sub_zone_id
    `);

    const containerMap = new Map<string, string>();
    for (const c of containerRows) {
      const newContainerId = `Z${c.zone_id}-${c.pot_size_gal}-R${String(c.row_number).padStart(2, '0')}-C${String(c.position).padStart(3, '0')}`;
      if (c.container_id !== newContainerId) containerMap.set(c.container_id, newContainerId);
    }

    // 3. Update FK tables that reference container_id (before updating cv_containers PK)
    const containerFkTables = [
      'cv_plant_assignments',
      'cv_container_state',
      'cv_container_state_transitions',
      'cv_container_amendments',
      'cv_container_qr_codes',
      'cv_teardown_events',
      'cv_startup_events',
      'cv_plant_loss_events',
      'cv_planting_plan_items',
      'cv_soil_samples',
      'cv_plant_harvest_events',
      'cv_plant_waste_trim_events',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
    ];

    for (const [oldId, newId] of containerMap) {
      for (const table of containerFkTables) {
        await knex(table).where('container_id', oldId).update({ container_id: newId });
      }
    }

    // 4. Update cv_containers PK
    for (const [oldId, newId] of containerMap) {
      await knex('cv_containers').where('container_id', oldId).update({ container_id: newId });
    }

    // 5. Update FK tables that reference row_id (after container_id PK is updated)
    const rowFkTables = [
      'cv_containers',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
      'cv_plant_waste_trim_events',
    ];

    for (const [oldId, newId] of rowMap) {
      for (const table of rowFkTables) {
        await knex(table).where('row_id', oldId).update({ row_id: newId });
      }
    }

    // 6. Update cv_rows PK
    for (const [oldId, newId] of rowMap) {
      await knex('cv_rows').where('row_id', oldId).update({ row_id: newId });
    }
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    // In down(), IDs are in new format. Join cv_sub_zones (still has designation column)
    // to reconstruct old-format IDs.
    const rowRows = await knex.raw<{ row_id: string; row_number: number; zone_id: number; designation: string }[]>(`
      SELECT r.row_id, r.row_number, sz.zone_id, sz.designation
      FROM cv_rows r
      JOIN cv_sub_zones sz ON r.sub_zone_id = sz.sub_zone_id
    `);

    const rowMap = new Map<string, string>(); // new → old
    for (const r of rowRows) {
      const oldRowId = `Z${r.zone_id}-${r.designation}-R${r.row_number}`;
      if (r.row_id !== oldRowId) rowMap.set(r.row_id, oldRowId);
    }

    const containerRows = await knex.raw<{ container_id: string; position: number; row_number: number; zone_id: number; designation: string }[]>(`
      SELECT c.container_id, c.position, r.row_number, sz.zone_id, sz.designation
      FROM cv_containers c
      JOIN cv_rows r ON c.row_id = r.row_id
      JOIN cv_sub_zones sz ON r.sub_zone_id = sz.sub_zone_id
    `);

    const containerMap = new Map<string, string>(); // new → old
    for (const c of containerRows) {
      const oldContainerId = `Z${c.zone_id}-${c.designation}-R${c.row_number}-C${c.position}`;
      if (c.container_id !== oldContainerId) containerMap.set(c.container_id, oldContainerId);
    }

    const containerFkTables = [
      'cv_plant_assignments',
      'cv_container_state',
      'cv_container_state_transitions',
      'cv_container_amendments',
      'cv_container_qr_codes',
      'cv_teardown_events',
      'cv_startup_events',
      'cv_plant_loss_events',
      'cv_planting_plan_items',
      'cv_soil_samples',
      'cv_plant_harvest_events',
      'cv_plant_waste_trim_events',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
    ];

    for (const [newId, oldId] of containerMap) {
      for (const table of containerFkTables) {
        await knex(table).where('container_id', newId).update({ container_id: oldId });
      }
    }

    for (const [newId, oldId] of containerMap) {
      await knex('cv_containers').where('container_id', newId).update({ container_id: oldId });
    }

    const rowFkTables = [
      'cv_containers',
      'cv_applications_foliar',
      'cv_applications_pesticide',
      'cv_observations',
      'cv_plant_waste_trim_events',
    ];

    for (const [newId, oldId] of rowMap) {
      for (const table of rowFkTables) {
        await knex(table).where('row_id', newId).update({ row_id: oldId });
      }
    }

    for (const [newId, oldId] of rowMap) {
      await knex('cv_rows').where('row_id', newId).update({ row_id: oldId });
    }
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}
