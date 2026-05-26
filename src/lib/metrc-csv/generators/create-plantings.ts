// #2 Create Plantings — generates CSV for POST /plantbatches/v2/plantings (Phase 5)

export interface CreatePlantingsInput {
  name: string;
  type: 'Clone' | 'Seed';
  count: number;
  strain: string;
  location: string; // metrc_name from cv_locations
  sublocation?: string | null;
  patient_license_number?: string | null;
  actual_date: string; // YYYY-MM-DD
  ingredient_batch_names: string[];
}

export const CREATE_PLANTINGS_HEADERS =
  'Name,Type,Count,Strain,Location,Sublocation,PatientLicenseNumber,ActualDate,IngredientPlantBatchName';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateCreatePlantingsCsv(input: CreatePlantingsInput): string {
  const lines: string[] = [CREATE_PLANTINGS_HEADERS];
  const names =
    input.ingredient_batch_names.length > 0 ? input.ingredient_batch_names : [''];

  for (const batchName of names) {
    lines.push(
      [
        csvSafe(input.name),
        csvSafe(input.type),
        String(input.count),
        csvSafe(input.strain),
        csvSafe(input.location),
        csvSafe(input.sublocation),
        csvSafe(input.patient_license_number),
        csvSafe(input.actual_date),
        csvSafe(batchName || null),
      ].join(','),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
