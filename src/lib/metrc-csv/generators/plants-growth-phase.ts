// #19 Plants Growth Phase — generates CSV for PUT /plants/v2/growthphase (Phase 5)

export interface PlantsGrowthPhaseRow {
  label: string;       // 24-char current plant tag
  new_tag: string;     // 24-char replacement tag from pool
  growth_phase: 'Vegetative' | 'Flowering';
  new_location: string; // cv_locations.metrc_name
  new_sublocation?: string | null;
  growth_date: string;  // YYYY-MM-DD
}

export const PLANTS_GROWTH_PHASE_HEADERS = 'Label,NewTag,GrowthPhase,NewLocation,NewSublocation,GrowthDate';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generatePlantsGrowthPhaseCsv(rows: PlantsGrowthPhaseRow[]): string {
  const lines: string[] = [PLANTS_GROWTH_PHASE_HEADERS];

  for (const row of rows) {
    lines.push(
      [
        csvSafe(row.label),
        csvSafe(row.new_tag),
        csvSafe(row.growth_phase),
        csvSafe(row.new_location),
        csvSafe(row.new_sublocation),
        csvSafe(row.growth_date),
      ].join(','),
    );
  }

  return lines.join('\r\n') + '\r\n';
}
