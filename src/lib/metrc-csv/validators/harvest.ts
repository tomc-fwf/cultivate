import { validateBatchStatus, MetrcBatchStatusError } from './shared.js';

export { MetrcBatchStatusError };

export class HarvestNameRequiredError extends Error {
  constructor() {
    super('HarvestName must not be empty');
    this.name = 'HarvestNameRequiredError';
  }
}

export class HarvestWeightError extends Error {
  constructor(weight: number) {
    super(`Harvest weight must be > 0, got ${weight}`);
    this.name = 'HarvestWeightError';
  }
}

/**
 * Harvest events (#5 harvest-plants, #11 manicure-plants) require batch status = 'harvesting'.
 */
export function validateHarvestBatchStatus(batch: { status: string }): void {
  validateBatchStatus(batch, ['harvesting']);
}

export function validateHarvestName(harvestName: string | null | undefined): void {
  if (!harvestName || harvestName.trim() === '') throw new HarvestNameRequiredError();
}

export function validateHarvestWeight(weight: number): void {
  if (weight <= 0) throw new HarvestWeightError(weight);
}
