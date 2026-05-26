// #5 Harvest Plants — generates CSV for PUT /plants/v2/harvest (Phase 5)
// HarvestName is always required. Use cv_harvest_batches.harvest_name or derive
// as {strain}_{sow_date}_batch{sequence_number}. PUT /plants/v2/harvest returns
// no response body, so auto-generated METRC names cannot be captured.

export interface HarvestPlantsRow {
  plant_tag: string;        // 24-char METRC tag
  weight: number;
  unit_of_weight: string;
  drying_location: string;  // cv_locations.metrc_name
  drying_sublocation?: string | null;
  harvest_name: string;
  patient_license_number?: string | null;
  actual_date: string;      // YYYY-MM-DD
}

export const HARVEST_PLANTS_HEADERS =
  'Plant,Weight,UnitOfWeight,DryingLocation,DryingSublocation,HarvestName,PatientLicenseNumber,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateHarvestPlantsCsv(rows: HarvestPlantsRow[]): string {
  const lines: string[] = [HARVEST_PLANTS_HEADERS];
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
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
