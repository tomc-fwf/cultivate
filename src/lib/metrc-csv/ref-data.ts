import type Database from 'better-sqlite3';

export function getWasteMethods(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM cv_metrc_plant_waste_methods WHERE is_active = 1 ORDER BY name').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getPlantWasteReasons(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM cv_metrc_plant_waste_reasons WHERE is_active = 1 ORDER BY name').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getBatchWasteReasons(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM cv_metrc_batch_waste_reasons WHERE is_active = 1 ORDER BY name').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getUnitsOfMeasure(db: Database.Database): string[] {
  const rows = db.prepare('SELECT name FROM cv_metrc_units_of_measure WHERE is_active = 1 ORDER BY name').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getLocations(db: Database.Database): { name: string; metrc_name: string }[] {
  return db.prepare('SELECT name, metrc_name FROM cv_locations ORDER BY display_order').all() as { name: string; metrc_name: string }[];
}

export function getStrains(db: Database.Database): { strain_id: number; name: string }[] {
  return db.prepare('SELECT strain_id, name FROM cv_strains ORDER BY name').all() as { strain_id: number; name: string }[];
}
