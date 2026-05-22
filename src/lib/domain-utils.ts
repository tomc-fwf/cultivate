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

/** Converts Celsius to Fahrenheit, rounded to one decimal place. */
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

/**
 * Calculates dew point from temperature (°C) and relative humidity (%).
 * Returns value in Fahrenheit. Uses Magnus approximation (±0.35°C accuracy).
 */
export function calcDewPoint(tempC: number, humidity: number): number {
  const a = 17.625;
  const b = 243.04;
  const gamma = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
  const dewC = (b * gamma) / (a - gamma);
  return dewC * 9 / 5 + 32;
}

/**
 * Calculates Vapour Pressure Deficit (kPa) from temperature (°C) and relative humidity (%).
 * Uses Tetens equation for saturation vapor pressure. Returns 3 decimal places.
 */
export function calcVPD(tempC: number, humidity: number): number {
  const svp = 0.6108 * Math.exp(17.27 * tempC / (tempC + 237.3));
  const avp = svp * (humidity / 100);
  return Math.round((svp - avp) * 1000) / 1000;
}
