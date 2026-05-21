/** Converts an ISO date string 'YYYY-MM-DD' to METRC format 'MM/DD/YYYY'. */
export function formatMetrcDate(isoDate: string): string {
  const [y, m, d] = (isoDate ?? '').split('-');
  return m && d && y ? `${m}/${d}/${y}` : isoDate;
}

/** Maps a batch status to its METRC growth phase label. */
export function toMetrcPhase(status: string): string {
  if (['germ', 'seedling', 'cult-hoop'].includes(status)) return 'Immature';
  if (status === 'field-veg') return 'Vegetative';
  if (['field-flower', 'flush', 'harvest_window', 'harvesting'].includes(status)) return 'Flowering';
  return 'Closed';
}

/** Builds the METRC plant batch name from strain, sow date, and type. */
export function makeBatchName(strainName: string, sowDate: string, strainType: string): string {
  return `${strainName} | ${formatMetrcDate(sowDate)} | ${strainType === 'auto' ? 'Auto' : 'Photo'}`;
}

/**
 * Builds the METRC harvest batch name.
 * batchType 'harvest' → 'HB', 'manicure' → 'MB'.
 */
export function makeHarvestBatchName(
  strainName: string,
  date: string,
  batchType: 'harvest' | 'manicure',
  strainType: string,
): string {
  const typeCode = batchType === 'harvest' ? 'HB' : 'MB';
  const strainLabel = strainType === 'auto' ? 'Auto' : 'Photo';
  return `${strainName} | ${formatMetrcDate(date)} | ${typeCode} | ${strainLabel}`;
}
