export type CsvRow = Record<string, string | number>;

// Converts an ISO-8601 date/datetime string to METRC CSV date format: M/D/YYYY h:mm:ss AM/PM
// Date-only strings (YYYY-MM-DD) are treated as UTC midnight → 12:00:00 AM
export function formatMetrcDatetime(isoDate: string): string {
  const d = new Date(isoDate.includes('T') ? isoDate : isoDate + 'T00:00:00.000Z');
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  let hours = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const seconds = d.getUTCSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

export interface CsvResult {
  filePath: string;
  rowCount: number;
  uploadId: number;
}

export type CsvUploadType =
  | 'additive-template'
  | 'create-plantings'
  | 'destroy-immature'
  | 'destroy-plants'
  | 'harvest-plants'
  | 'immature-additive-applications'
  | 'immature-growth-phase'
  | 'immature-packages'
  | 'immature-waste'
  | 'location-additive-applications'
  | 'manicure-plants'
  | 'package-adjustment'
  | 'package-from-veg'
  | 'package-planting-from-plant'
  | 'packages-from-harvest'
  | 'plant-additive-applications'
  | 'plantings-from-package'
  | 'plantings-from-plant'
  | 'plants-growth-phase'
  | 'plants-location'
  | 'plants-waste'
  | 'split-planting';
