// #18 Plantings from Plant — generates CSV for POST /plants/v2/plantings (Phase 5)

export interface PlantingsFromPlantInput {
  plant_label: string; // 24-char METRC tag of mother plant
  plant_batch_name: string;
  plant_batch_type: string; // Clone | Seed
  plant_count: number;
  strain_name: string;
  location_name: string;
  sublocation_name?: string | null;
  patient_license_number?: string | null;
  actual_date: string; // YYYY-MM-DD
}

export const PLANTINGS_FROM_PLANT_HEADERS =
  'PlantLabel,PlantBatchName,PlantBatchType,PlantCount,StrainName,LocationName,SublocationName,PatientLicenseNumber,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantingsFromPlantCsv(input: PlantingsFromPlantInput): string {
  const lines: string[] = [PLANTINGS_FROM_PLANT_HEADERS];

  lines.push(
    [
      csvSafe(input.plant_label),
      csvSafe(input.plant_batch_name),
      csvSafe(input.plant_batch_type),
      String(input.plant_count),
      csvSafe(input.strain_name),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.patient_license_number),
      csvSafe(input.actual_date),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
