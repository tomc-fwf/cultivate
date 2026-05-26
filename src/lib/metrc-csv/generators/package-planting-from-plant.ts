// #14 Package Planting from Plant — generates CSV for POST /plantbatches/v2/packages/frommotherplant (Phase 5)
// Creates both a package and a new immature batch from a mother plant.

export interface PackagePlantingFromPlantInput {
  plant_label: string;               // 24-char mother plant tag
  package_tag: string;               // 24-char new package tag
  plant_batch_type: string;          // Clone | Seed
  item_name: string;
  location_name?: string | null;
  sublocation_name?: string | null;
  note?: string | null;
  patient_license_number?: string | null;
  is_trade_sample: boolean;
  is_donation: boolean;
  count: number;
  actual_date: string;               // YYYY-MM-DD
}

export const PACKAGE_PLANTING_FROM_PLANT_HEADERS =
  'PlantLabel,PackageTag,PlantBatchType,Item,Location,Sublocation,Note,PatientLicenseNumber,IsTradeSample,IsDonation,Count,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePackagePlantingFromPlantCsv(input: PackagePlantingFromPlantInput): string {
  const lines: string[] = [PACKAGE_PLANTING_FROM_PLANT_HEADERS];
  lines.push(
    [
      csvSafe(input.plant_label),
      csvSafe(input.package_tag),
      csvSafe(input.plant_batch_type),
      csvSafe(input.item_name),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.note),
      csvSafe(input.patient_license_number),
      input.is_trade_sample ? 'True' : 'False',
      input.is_donation ? 'True' : 'False',
      String(input.count),
      csvSafe(input.actual_date),
    ].join(','),
  );
  return lines.join('\r\n') + '\r\n';
}
