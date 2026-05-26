export type CsvRow = Record<string, string | number>;

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
