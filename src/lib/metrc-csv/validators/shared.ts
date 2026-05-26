import type Database from 'better-sqlite3';

export class MetrcTagFormatError extends Error {
  constructor(tag: string) {
    super(`Invalid METRC tag format: "${tag}" (must be exactly 24 alphanumeric characters)`);
    this.name = 'MetrcTagFormatError';
  }
}

export class MetrcTagNotAvailableError extends Error {
  constructor(tag: string, status: string) {
    super(`METRC tag ${tag} is not available (status: ${status})`);
    this.name = 'MetrcTagNotAvailableError';
  }
}

export class MetrcBatchNotFoundError extends Error {
  constructor(batchId: number | string) {
    super(`Plant batch not found: ${batchId}`);
    this.name = 'MetrcBatchNotFoundError';
  }
}

export class MetrcBatchStatusError extends Error {
  constructor(status: string, allowed: string[]) {
    super(
      `Batch status "${status}" is not allowed for this operation. Expected one of: ${allowed.join(', ')}`,
    );
    this.name = 'MetrcBatchStatusError';
  }
}

export class MetrcPlantNotActiveError extends Error {
  constructor(tag: string) {
    super(`Plant tag ${tag} not found or not active in cv_metrc_plant_state`);
    this.name = 'MetrcPlantNotActiveError';
  }
}

export class MetrcLocationNotFoundError extends Error {
  constructor(metrcName: string) {
    super(`Location not found in cv_locations.metrc_name: ${metrcName}`);
    this.name = 'MetrcLocationNotFoundError';
  }
}

export class MetrcTemplateNotFoundError extends Error {
  constructor(name: string) {
    super(`Additive template not found in cv_metrc_additive_templates: ${name}`);
    this.name = 'MetrcTemplateNotFoundError';
  }
}

const METRC_TAG_RE = /^[A-Za-z0-9]{24}$/;

export function validateMetrcTag(tag: string): void {
  if (!METRC_TAG_RE.test(tag)) throw new MetrcTagFormatError(tag);
}

export function validateTagAvailable(
  db: Database.Database,
  tag: string,
  pool: 'plant' | 'package',
): void {
  const table =
    pool === 'plant'
      ? 'cv_metrc_available_plant_tags'
      : 'cv_metrc_available_package_tags';
  const row = db
    .prepare(`SELECT status FROM ${table} WHERE tag = ?`)
    .get(tag) as { status: string } | undefined;
  if (!row) throw new MetrcTagNotAvailableError(tag, 'not-found');
  if (row.status !== 'available') throw new MetrcTagNotAvailableError(tag, row.status);
}

export interface BatchRow {
  batch_id: number;
  status: string;
  name: string | null;
  metrc_plant_batch_uid: string | null;
  plant_count_current: number | null;
  plant_count_initial: number;
}

export function validateBatchExists(db: Database.Database, batchId: number): BatchRow {
  const batch = db
    .prepare(
      `SELECT batch_id, status, name, metrc_plant_batch_uid, plant_count_current, plant_count_initial
       FROM cv_batches WHERE batch_id = ?`,
    )
    .get(batchId) as BatchRow | undefined;
  if (!batch) throw new MetrcBatchNotFoundError(batchId);
  return batch;
}

export function validateBatchStatus(batch: { status: string }, allowed: string[]): void {
  if (!allowed.includes(batch.status))
    throw new MetrcBatchStatusError(batch.status, allowed);
}

export function validatePlantStateActive(db: Database.Database, tag: string): void {
  const state = db
    .prepare(
      `SELECT plant_state_id FROM cv_metrc_plant_state WHERE plant_tag = ? AND status = 'active'`,
    )
    .get(tag);
  if (!state) throw new MetrcPlantNotActiveError(tag);
}

export function validateLocationByMetrcName(db: Database.Database, metrcName: string): void {
  const loc = db
    .prepare('SELECT location_id FROM cv_locations WHERE metrc_name = ?')
    .get(metrcName);
  if (!loc) throw new MetrcLocationNotFoundError(metrcName);
}

export function validateTemplateExists(db: Database.Database, name: string): void {
  const tpl = db
    .prepare('SELECT template_id FROM cv_metrc_additive_templates WHERE name = ?')
    .get(name);
  if (!tpl) throw new MetrcTemplateNotFoundError(name);
}
