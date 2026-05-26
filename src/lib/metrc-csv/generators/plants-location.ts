// #20 Plants Location — generates CSV for PUT /plants/v2/location (Phase 5)

export interface PlantsLocationRow {
  label: string;         // 24-char current plant tag
  location: string;      // cv_locations.metrc_name
  sublocation?: string | null;
  actual_date: string;   // YYYY-MM-DD
}

export const PLANTS_LOCATION_HEADERS = 'Label,Location,Sublocation,ActualDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantsLocationCsv(rows: PlantsLocationRow[]): string {
  const lines: string[] = [PLANTS_LOCATION_HEADERS];

  for (const row of rows) {
    lines.push(
      [
        csvSafe(row.label),
        csvSafe(row.location),
        csvSafe(row.sublocation),
        csvSafe(row.actual_date),
      ].join(','),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
