// #16 Plant Additives using Template — CSV-only upload type (no METRC API in MN)

import { formatMetrcDatetime } from '../types.js';

export interface PlantAdditiveAppRow {
  plant_tag: string; // 24-char METRC tag
  template_name: string;
  rate?: string | null;
  volume?: string | null;
  total_amount_applied: number;
  total_amount_uom: string;
  actual_date: string; // YYYY-MM-DD (serialized to M/D/YYYY h:mm:ss AM in CSV)
}

export const PLANT_ADDITIVE_APPS_HEADERS =
  'PlantTag,AdditivesTemplateName,Rate,Volume,TotalAmountApplied,TotalAmountUnitOfMeasure,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantAdditiveAppsCsv(rows: PlantAdditiveAppRow[]): string {
  const lines: string[] = [PLANT_ADDITIVE_APPS_HEADERS];
  for (const r of rows) {
    lines.push(
      [
        csvSafe(r.plant_tag),
        csvSafe(r.template_name),
        csvSafe(r.rate),
        csvSafe(r.volume),
        String(r.total_amount_applied),
        csvSafe(r.total_amount_uom),
        csvSafe(formatMetrcDatetime(r.actual_date)),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
