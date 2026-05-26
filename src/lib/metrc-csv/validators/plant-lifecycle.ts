export interface PlantGrowthPhaseValidationRow {
  label: string;
  new_tag: string;
}

/**
 * Validates plants-growth-phase rows for cross-row integrity.
 * Collects ALL errors before returning so the caller can report them together.
 * Returns an array of error messages (empty = valid).
 */
export function validatePlantsGrowthPhaseRows(
  rows: PlantGrowthPhaseValidationRow[],
): string[] {
  const errors: string[] = [];

  // Check for duplicate new_tag values within the request
  const seenNewTags = new Set<string>();
  const dupNewTags = new Set<string>();
  for (const r of rows) {
    if (seenNewTags.has(r.new_tag)) dupNewTags.add(r.new_tag);
    seenNewTags.add(r.new_tag);
  }
  if (dupNewTags.size > 0) {
    errors.push(`Duplicate new_tag values in request: ${[...dupNewTags].join(', ')}`);
  }

  // Check overlap between label set and new_tag set
  const labelSet = new Set(rows.map((r) => r.label));
  const overlapTags = [...seenNewTags].filter((t) => labelSet.has(t));
  if (overlapTags.length > 0) {
    errors.push(
      `new_tag values overlap with existing label values: ${overlapTags.join(', ')}`,
    );
  }

  return errors;
}
