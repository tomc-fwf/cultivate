import type Database from 'better-sqlite3';
import { validateTemplateExists, MetrcTemplateNotFoundError } from './shared.js';

export { validateTemplateExists, MetrcTemplateNotFoundError };

/**
 * Validates that all template names referenced in an additive application batch exist
 * in cv_metrc_additive_templates. Throws MetrcTemplateNotFoundError on first miss.
 */
export function validateAdditiveTemplateNames(
  db: Database.Database,
  templateNames: string[],
): void {
  for (const name of templateNames) {
    validateTemplateExists(db, name);
  }
}
