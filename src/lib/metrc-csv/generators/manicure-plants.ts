// #11 Manicure Plants (Partial Harvest) — generates CSV for POST /plants/v2/manicure (Phase 5)
// METRC uses the term "manicure"; Cultivate uses "partial harvest" in all user-facing strings.
// Plant survives the event — cv_metrc_plant_state.status remains 'active'.

export interface ManicurePlantsRow {
  plant_tag: string;        // 24-char METRC tag
  weight: number;
  unit_of_weight: string;
  drying_location: string;  // cv_locations.metrc_name
  drying_sublocation?: string | null;
  harvest_name: string;
  patient_license_number?: string | null;
  actual_date: string;      // YYYY-MM-DD
  plant_count?: number | null;
}

export const MANICURE_PLANTS_HEADERS =
  'Plant,Weight,UnitOfWeight,DryingLocation,DryingSublocation,HarvestName,PatientLicenseNumber,ActualDate,PlantCount';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateManicurePlantsCsv(rows: ManicurePlantsRow[]): string {
  const lines: string[] = [MANICURE_PLANTS_HEADERS];
  for (const r of rows) {
    lines.push(
      [
        csvSafe(r.plant_tag),
        String(r.weight),
        csvSafe(r.unit_of_weight),
        csvSafe(r.drying_location),
        csvSafe(r.drying_sublocation),
        csvSafe(r.harvest_name),
        csvSafe(r.patient_license_number),
        csvSafe(r.actual_date),
        String(r.plant_count ?? 1),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
