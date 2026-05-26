// #3 Destroy Immature Plants — generates CSV for DELETE /plantbatches/v2/ (Phase 5)

export interface DestroyImmatureInput {
  plant_batch_name: string; // resolved METRC batch name for the PlantBatch column
  count: number;
  waste_method_name?: string | null; // empty in CSV when waste_weight = 0
  waste_material_mixed?: string | null;
  waste_reason_name: string;
  reason_note?: string | null;
  waste_weight: number; // 0 is allowed
  waste_uom?: string | null; // empty in CSV when waste_weight = 0
  actual_date: string; // YYYY-MM-DD
}

export const DESTROY_IMMATURE_HEADERS =
  'PlantBatch,Count,WasteMethodName,WasteMaterialMixed,WasteReasonName,ReasonNote,WasteWeight,WasteUnitOfMeasure,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateDestroyImmatureCsv(input: DestroyImmatureInput): string {
  const lines: string[] = [DESTROY_IMMATURE_HEADERS];

  // Per METRC template: when waste_weight = 0, method/material/uom columns must be empty
  const hasWaste = input.waste_weight > 0;

  lines.push(
    [
      csvSafe(input.plant_batch_name),
      String(input.count),
      hasWaste ? csvSafe(input.waste_method_name) : '',
      hasWaste ? csvSafe(input.waste_material_mixed) : '',
      csvSafe(input.waste_reason_name),
      csvSafe(input.reason_note),
      String(input.waste_weight),
      hasWaste ? csvSafe(input.waste_uom) : '',
      csvSafe(input.actual_date),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
