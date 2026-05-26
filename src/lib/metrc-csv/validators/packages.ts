import type Database from 'better-sqlite3';
import { validateTagAvailable, MetrcTagNotAvailableError } from './shared.js';

export { MetrcTagNotAvailableError };

export class PackageQuantityZeroError extends Error {
  constructor() {
    super('Package adjustment quantity must be non-zero');
    this.name = 'PackageQuantityZeroError';
  }
}

/**
 * Package adjustment quantity (#12) must be non-zero.
 */
export function validatePackageQuantityNonZero(quantity: number): void {
  if (quantity === 0) throw new PackageQuantityZeroError();
}

/**
 * Validates that the package tag is available in cv_metrc_available_package_tags.
 */
export function validatePackageTagAvailable(db: Database.Database, tag: string): void {
  validateTagAvailable(db, tag, 'package');
}
