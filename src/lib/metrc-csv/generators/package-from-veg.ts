// #13 Package from Vegetative Plants — generates CSV (Phase 5 API endpoint not confirmed for MN)

export interface PackageFromVegInput {
  package_tag: string;               // 24-char METRC package label (Label column)
  location_name?: string | null;
  sublocation_name?: string | null;
  item_name: string;
  actual_date: string;               // YYYY-MM-DD
  note?: string | null;
  is_trade_sample: boolean;
  is_donation: boolean;
  expiration_date?: string | null;   // YYYY-MM-DD or empty
  sell_by_date?: string | null;      // YYYY-MM-DD or empty
  use_by_date?: string | null;       // YYYY-MM-DD or empty
  plant_group_label: string;         // 24-char METRC plant group label
  quantity?: number | null;
}

export const PACKAGE_FROM_VEG_HEADERS =
  'Label,Location,Sublocation,Item,ActualDate,Note,IsTradeSample,IsDonation,ExpirationDate,SellByDate,UseByDate,PlantGroupLabel,Quantity';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePackageFromVegCsv(input: PackageFromVegInput): string {
  const lines: string[] = [PACKAGE_FROM_VEG_HEADERS];
  lines.push(
    [
      csvSafe(input.package_tag),
      csvSafe(input.location_name),
      csvSafe(input.sublocation_name),
      csvSafe(input.item_name),
      csvSafe(input.actual_date),
      csvSafe(input.note),
      input.is_trade_sample ? 'True' : 'False',
      input.is_donation ? 'True' : 'False',
      csvSafe(input.expiration_date),
      csvSafe(input.sell_by_date),
      csvSafe(input.use_by_date),
      csvSafe(input.plant_group_label),
      input.quantity != null ? String(input.quantity) : '',
    ].join(','),
  );
  return lines.join('\r\n') + '\r\n';
}
