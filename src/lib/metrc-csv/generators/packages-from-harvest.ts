// #15 Packages From Harvest — generates CSV for POST /harvests/v2/packages (Phase 5)
// One CSV row per (package, ingredient) pair — same denormalization as additive template.

export interface PackagesFromHarvestIngredient {
  harvest_name: string;
  weight: number;
  unit_of_weight: string;
}

export interface PackagesFromHarvestPackage {
  tag: string;              // 24-char METRC package tag
  location_name?: string | null;
  sublocation_name?: string | null;
  item_name: string;
  unit_of_weight: string;
  patient_license_number?: string | null;
  note?: string | null;
  production_batch_number?: string | null;
  is_trade_sample: boolean;
  is_donation: boolean;
  actual_date: string;      // YYYY-MM-DD
  ingredients: PackagesFromHarvestIngredient[];
}

export const PACKAGES_FROM_HARVEST_HEADERS =
  'Tag,Location,Sublocation,Item,UnitOfWeight,PatientLicenseNumber,Note,ProductionBatchNumber,IsTradeSample,IsDonation,ActualDate,IngredientHarvestName,IngredientWeight,IngredientUnitOfWeight';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePackagesFromHarvestCsv(packages: PackagesFromHarvestPackage[]): string {
  const lines: string[] = [PACKAGES_FROM_HARVEST_HEADERS];
  for (const pkg of packages) {
    for (const ingredient of pkg.ingredients) {
      lines.push(
        [
          csvSafe(pkg.tag),
          csvSafe(pkg.location_name),
          csvSafe(pkg.sublocation_name),
          csvSafe(pkg.item_name),
          csvSafe(pkg.unit_of_weight),
          csvSafe(pkg.patient_license_number),
          csvSafe(pkg.note),
          csvSafe(pkg.production_batch_number),
          pkg.is_trade_sample ? 'True' : 'False',
          pkg.is_donation ? 'True' : 'False',
          csvSafe(pkg.actual_date),
          csvSafe(ingredient.harvest_name),
          String(ingredient.weight),
          csvSafe(ingredient.unit_of_weight),
        ].join(','),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}
