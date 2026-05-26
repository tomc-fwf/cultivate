// #10 Location Additives using Template — CSV-only upload type (no METRC API in MN)

import { formatMetrcDatetime } from '../types.js';

export interface LocationAdditiveAppRow {
  location_name: string;
  sublocation_name?: string | null;
  template_name: string;
  rate?: string | null;
  volume?: string | null;
  total_amount_applied: number;
  total_amount_uom: string;
  actual_date: string; // YYYY-MM-DD (serialized to M/D/YYYY h:mm:ss AM in CSV)
}

export const LOCATION_ADDITIVE_APPS_HEADERS =
  'LocationName,SublocationName,AdditivesTemplateName,Rate,Volume,TotalAmountApplied,TotalAmountUnitOfMeasure,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateLocationAdditiveAppsCsv(rows: LocationAdditiveAppRow[]): string {
  const lines: string[] = [LOCATION_ADDITIVE_APPS_HEADERS];
  for (const r of rows) {
    lines.push(
      [
        csvSafe(r.location_name),
        csvSafe(r.sublocation_name),
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
