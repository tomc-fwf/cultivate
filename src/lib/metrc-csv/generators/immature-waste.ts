// #9 Immature Plants Waste — generates CSV for POST /plantbatches/v2/waste (Phase 5)

export interface ImmatureWasteRow {
  waste_method_name: string;
  mixed_material?: string | null;
  waste_weight: number;                // > 0
  uom_name: string;
  reason_name: string;
  note?: string | null;
  waste_date: string;                  // YYYY-MM-DD
  plant_batch_name: string;           // METRC batch name (resolved before calling generator)
}

export const IMMATURE_WASTE_HEADERS =
  'WasteMethodName,MixedMaterial,WasteWeight,UnitOfMeasureName,ReasonName,Note,WasteDate,PlantBatchName';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateImmatureWasteCsv(rows: ImmatureWasteRow[]): string {
  const lines: string[] = [IMMATURE_WASTE_HEADERS];

  for (const row of rows) {
    lines.push(
      [
        csvSafe(row.waste_method_name),
        csvSafe(row.mixed_material),
        String(row.waste_weight),
        csvSafe(row.uom_name),
        csvSafe(row.reason_name),
        csvSafe(row.note),
        csvSafe(row.waste_date),
        csvSafe(row.plant_batch_name),
      ].join(','),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
