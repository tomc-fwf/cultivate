// #7 Immature Plants Growth Phase — generates CSV for POST /plantbatches/v2/growthphase (Phase 5)

export interface ImmatureGrowthPhaseInput {
  name: string;                        // METRC batch name (metrc_plant_batch_uid or fallback)
  count: number;
  starting_tag: string;                // 24-char; first tag in range
  growth_phase: 'Vegetative' | 'Flowering';
  new_location: string;                // cv_locations.metrc_name
  new_sublocation?: string | null;
  growth_date: string;                 // YYYY-MM-DD
  patient_license_number?: string | null;
}

export const IMMATURE_GROWTH_PHASE_HEADERS =
  'Name,Count,StartingTag,GrowthPhase,NewLocation,NewSublocation,GrowthDate,PatientLicenseNumber';

function csvSafe(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function generateImmatureGrowthPhaseCsv(input: ImmatureGrowthPhaseInput): string {
  const lines: string[] = [IMMATURE_GROWTH_PHASE_HEADERS];

  lines.push(
    [
      csvSafe(input.name),
      String(input.count),
      csvSafe(input.starting_tag),
      csvSafe(input.growth_phase),
      csvSafe(input.new_location),
      csvSafe(input.new_sublocation),
      csvSafe(input.growth_date),
      csvSafe(input.patient_license_number),
    ].join(','),
  );

  return lines.join('\r\n') + '\r\n';
}
