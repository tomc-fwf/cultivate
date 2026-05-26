// #17 Plantings from Package — generates CSV for POST /packages/v2/plantings (Phase 5)

export interface PlantingsFromPackageInput {
  package_label: string; // 24-char METRC tag
  package_adjustment_amount?: number | null;
  package_adjustment_uom?: string | null;
  plant_batch_name: string;
  plant_batch_type: string; // Clone | Seed
  plant_count: number;
  strain_name: string;
  location_name: string;
  sublocation_name?: string | null;
  patient_license_number?: string | null;
  planted_date: string; // YYYY-MM-DD
  unpackaged_date: string; // YYYY-MM-DD
}

export const PLANTINGS_FROM_PACKAGE_HEADERS =
  'PackageLabel,PackageAdjustmentAmount,PackageAdjustmentUnitOfMeasureName,PlantBatchName,PlantBatchType,PlantCount,StrainName,LocationName,SublocationName,PatientLicenseNumber,PlantedDate,UnpackagedDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantingsFromPackageCsv(input: PlantingsFromPackageInput): string {
  const lines: string[] = [PLANTINGS_FROM_PACKAGE_HEADERS];

  lines.push(
    [
      csvSafe(input.package_label),
      input.package_adjustment_amount != null ? String(input.package_adjustment_amount) : '',
      csvSafe(input.package_adjustment_uom),
      csvSafe(input.plant_batch_name),
      csvSafe(input.plant_batch_type),
      String(input.plant_count),
      csvSafe(input.strain_name),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.patient_license_number),
      csvSafe(input.planted_date),
      csvSafe(input.unpackaged_date),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
