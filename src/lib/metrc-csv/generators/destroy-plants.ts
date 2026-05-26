// #4 Destroy Plants — generates CSV for DELETE /plants/v2/ (Phase 5)

export interface DestroyPlantsInput {
  plant_tags: string[]; // 24-char METRC tags; one CSV row per tag
  waste_method_name: string;
  waste_material_mixed?: string | null;
  waste_weight: number;
  waste_uom?: string | null;
  waste_reason_name: string;
  reason_note?: string | null;
  actual_date: string; // YYYY-MM-DD
}

// Note: column is WasteUnitOfMeasureName (not WasteUnitOfMeasure) — distinct from #3
export const DESTROY_PLANTS_HEADERS =
  'Label,WasteMethodName,WasteMaterialMixed,WasteWeight,WasteUnitOfMeasureName,WasteReasonName,ReasonNote,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateDestroyPlantsCsv(input: DestroyPlantsInput): string {
  const lines: string[] = [DESTROY_PLANTS_HEADERS];

  for (const tag of input.plant_tags) {
    lines.push(
      [
        csvSafe(tag),
        csvSafe(input.waste_method_name),
        csvSafe(input.waste_material_mixed),
        String(input.waste_weight),
        csvSafe(input.waste_uom),
        csvSafe(input.waste_reason_name),
        csvSafe(input.reason_note),
        csvSafe(input.actual_date),
      ].join(','),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
