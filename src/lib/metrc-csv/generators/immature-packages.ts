// #8 Immature Plant Packages — generates CSV for POST /plantbatches/v2/packages (Phase 5)

export interface ImmaturePackagesInput {
  plant_batch_name: string;            // METRC batch name (metrc_plant_batch_uid or fallback)
  item_name: string;
  tag: string;                         // 24-char package tag
  patient_license_number?: string | null;
  note?: string | null;
  is_trade_sample: boolean;
  is_donation: boolean;
  count: number;
  location_name?: string | null;
  sublocation_name?: string | null;
  actual_date: string;                 // YYYY-MM-DD
}

export const IMMATURE_PACKAGES_HEADERS =
  'PlantBatch,Item,Tag,PatientLicenseNumber,Note,IsTradeSample,IsDonation,Count,Location,Sublocation,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateImmaturePackagesCsv(input: ImmaturePackagesInput): string {
  const lines: string[] = [IMMATURE_PACKAGES_HEADERS];

  lines.push(
    [
      csvSafe(input.plant_batch_name),
      csvSafe(input.item_name),
      csvSafe(input.tag),
      csvSafe(input.patient_license_number),
      csvSafe(input.note),
      input.is_trade_sample ? 'True' : 'False',
      input.is_donation ? 'True' : 'False',
      String(input.count),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.actual_date),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
