export interface PlantsWasteRow {
  waste_method_name: string;
  mixed_material?: string | null;
  waste_weight: number;
  unit_of_measure_name: string;
  reason_name: string;
  note?: string | null;
  location_name?: string | null;
  sublocation_name?: string | null;
  waste_date: string; // YYYY-MM-DD
  plant_labels?: string[]; // 24-char METRC tags; joined with | in CSV
}

export const PLANTS_WASTE_HEADERS =
  'WasteMethodName,MixedMaterial,WasteWeight,UnitOfMeasureName,ReasonName,Note,LocationName,SublocationName,WasteDate,PlantLabels';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantsWasteCsv(rows: PlantsWasteRow[]): string {
  const lines: string[] = [PLANTS_WASTE_HEADERS];
  for (const r of rows) {
    const plantLabels =
      r.plant_labels && r.plant_labels.length > 0 ? r.plant_labels.join('|') : '';
    lines.push(
      [
        csvSafe(r.waste_method_name),
        csvSafe(r.mixed_material),
        String(r.waste_weight),
        csvSafe(r.unit_of_measure_name),
        csvSafe(r.reason_name),
        csvSafe(r.note),
        csvSafe(r.location_name),
        csvSafe(r.sublocation_name),
        csvSafe(r.waste_date),
        csvSafe(plantLabels),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
