// #22 Split Planting — generates CSV for POST /plantbatches/v2/split (Phase 5)

export interface SplitPlantingInput {
  plant_batch_name: string; // name of the source batch (from cv_batches.name or metrc_plant_batch_uid)
  group_name: string;
  count: number;
  location_name: string;
  sublocation_name?: string | null;
  strain_name: string;
  patient_license_number?: string | null;
  actual_date: string; // YYYY-MM-DD
}

export const SPLIT_PLANTING_HEADERS =
  'PlantBatch,GroupName,Count,Location,Sublocation,Strain,PatientLicenseNumber,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateSplitPlantingCsv(input: SplitPlantingInput): string {
  const lines: string[] = [SPLIT_PLANTING_HEADERS];

  lines.push(
    [
      csvSafe(input.plant_batch_name),
      csvSafe(input.group_name),
      String(input.count),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.strain_name),
      csvSafe(input.patient_license_number),
      csvSafe(input.actual_date),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
