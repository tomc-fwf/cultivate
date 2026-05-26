export interface DestroyWasteParams {
  waste_weight: number;
  waste_method_name?: string | null;
  waste_uom?: string | null;
}

/**
 * Validates destruction waste fields.
 * Returns warnings array (may be empty).
 * Throws if waste_weight > 0 but method or UOM are missing.
 */
export function validateDestroyWaste(data: DestroyWasteParams): string[] {
  const warnings: string[] = [];

  if (data.waste_weight === 0) {
    warnings.push(
      'waste_weight is 0 — no waste will be recorded in METRC; ' +
        'waste_method_name and waste_uom will be omitted from CSV',
    );
    return warnings;
  }

  if (!data.waste_method_name || data.waste_method_name.trim() === '') {
    throw new Error('waste_method_name is required when waste_weight > 0');
  }
  if (!data.waste_uom || data.waste_uom.trim() === '') {
    throw new Error('waste_uom is required when waste_weight > 0');
  }

  return warnings;
}
