export interface AdditiveTemplateInput {
  name: string;
  additive_type: string;
  product_trade_name?: string | null;
  epa_registration_number?: string | null;
  note?: string | null;
  rei_quantity?: string | null;
  rei_time_unit?: string | null;
  product_supplier?: string | null;
  application_device?: string | null;
  active_ingredients: Array<{ name: string; percentage: number }>;
}

export const ADDITIVE_TEMPLATE_HEADERS =
  'Name,AdditiveTypeName,ProductTradeName,EpaRegistrationNumber,Note,' +
  'RestrictiveEntryIntervalQuantityDescription,RestrictiveEntryIntervalTimeDescription,' +
  'ProductSupplier,ApplicationDevice,ActiveIngredientName,ActiveIngredientPercentage';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateAdditiveTemplateCsv(templates: AdditiveTemplateInput[]): string {
  const rows: string[] = [ADDITIVE_TEMPLATE_HEADERS];
  for (const t of templates) {
    for (const ing of t.active_ingredients) {
      rows.push([
        csvSafe(t.name),
        csvSafe(t.additive_type),
        csvSafe(t.product_trade_name),
        csvSafe(t.epa_registration_number),
        csvSafe(t.note),
        csvSafe(t.rei_quantity),
        csvSafe(t.rei_time_unit),
        csvSafe(t.product_supplier),
        csvSafe(t.application_device),
        csvSafe(ing.name),
        String(ing.percentage),
      ].join(','));
    }
  }
  return rows.join('\r\n') + '\r\n';
}
