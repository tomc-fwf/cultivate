import { describe, it, expect } from 'vitest';
import {
  formatMetrcDate,
  toMetrcPhase,
  makeBatchName,
  makeHarvestBatchName,
} from '../lib/domain-utils.js';

const METRC_UID_RE = /^[A-Za-z0-9]{24}$/;
const CONTAINER_ID_RE = /^Z\d+-(10|30)-R\d{1,2}-C\d{1,3}$/;

describe('formatMetrcDate', () => {
  it('converts ISO date to MM/DD/YYYY', () => {
    expect(formatMetrcDate('2026-05-21')).toBe('05/21/2026');
  });

  it('handles single-digit month/day correctly', () => {
    expect(formatMetrcDate('2026-01-03')).toBe('01/03/2026');
  });

  it('returns the input unchanged if it cannot be parsed', () => {
    expect(formatMetrcDate('')).toBe('');
  });
});

describe('toMetrcPhase', () => {
  it('maps germ to Immature', () => {
    expect(toMetrcPhase('germ')).toBe('Immature');
  });

  it('maps seedling to Immature', () => {
    expect(toMetrcPhase('seedling')).toBe('Immature');
  });

  it('maps cult-hoop to Immature', () => {
    expect(toMetrcPhase('cult-hoop')).toBe('Immature');
  });

  it('maps field-veg to Vegetative', () => {
    expect(toMetrcPhase('field-veg')).toBe('Vegetative');
  });

  it('maps field-flower to Flowering', () => {
    expect(toMetrcPhase('field-flower')).toBe('Flowering');
  });

  it('maps flush to Flowering', () => {
    expect(toMetrcPhase('flush')).toBe('Flowering');
  });

  it('maps harvest_window to Flowering', () => {
    expect(toMetrcPhase('harvest_window')).toBe('Flowering');
  });

  it('maps harvesting to Flowering', () => {
    expect(toMetrcPhase('harvesting')).toBe('Flowering');
  });

  it('maps closed to Closed', () => {
    expect(toMetrcPhase('closed')).toBe('Closed');
  });

  it('maps unknown status to Closed', () => {
    expect(toMetrcPhase('unknown-status')).toBe('Closed');
  });
});

describe('makeBatchName', () => {
  it('builds the correct METRC batch name for an auto strain', () => {
    expect(makeBatchName('Blue Dream', '2026-05-21', 'auto')).toBe('Blue Dream | 05/21/2026 | Auto');
  });

  it('builds the correct METRC batch name for a photo strain', () => {
    expect(makeBatchName('Northern Lights', '2026-05-21', 'photo')).toBe('Northern Lights | 05/21/2026 | Photo');
  });

  it('treats any non-auto strain type as Photo', () => {
    expect(makeBatchName('Test Strain', '2026-01-15', 'unknown')).toBe('Test Strain | 01/15/2026 | Photo');
  });
});

describe('makeHarvestBatchName', () => {
  it('builds a harvest batch name (HB) for an auto strain', () => {
    expect(makeHarvestBatchName('Blue Dream', '2026-05-21', 'harvest', 'auto'))
      .toBe('Blue Dream | 05/21/2026 | HB | Auto');
  });

  it('builds a manicure batch name (MB) for a photo strain', () => {
    expect(makeHarvestBatchName('Blue Dream', '2026-05-21', 'manicure', 'photo'))
      .toBe('Blue Dream | 05/21/2026 | MB | Photo');
  });
});

describe('METRC UID format', () => {
  it('accepts a valid 24-character alphanumeric UID', () => {
    expect(METRC_UID_RE.test('ABCDEF123456789012345678')).toBe(true);
    expect(METRC_UID_RE.test('abcdefABCDEF012345678901')).toBe(true);
  });

  it('rejects a UID that is too short', () => {
    expect(METRC_UID_RE.test('ABCDEF123456789012345')).toBe(false);
  });

  it('rejects a UID that is too long', () => {
    expect(METRC_UID_RE.test('ABCDEF1234567890123456789')).toBe(false);
  });

  it('rejects a UID with non-alphanumeric characters', () => {
    expect(METRC_UID_RE.test('ABCDEF-2345678901234567')).toBe(false);
  });
});

describe('Container ID format', () => {
  it('accepts a valid container ID', () => {
    expect(CONTAINER_ID_RE.test('Z1-30-R03-C012')).toBe(true);
    expect(CONTAINER_ID_RE.test('Z4-10-R05-C029')).toBe(true);
    expect(CONTAINER_ID_RE.test('Z2-30-R01-C001')).toBe(true);
  });

  it('rejects a container ID with a lowercase sub-zone', () => {
    expect(CONTAINER_ID_RE.test('Z1-30-r03-C012')).toBe(false);
  });

  it('rejects a container ID missing the zone prefix', () => {
    expect(CONTAINER_ID_RE.test('1-30-R03-C012')).toBe(false);
  });

  it('rejects a container ID with an invalid pot size', () => {
    expect(CONTAINER_ID_RE.test('Z1-20-R03-C012')).toBe(false);
  });

  it('rejects a container ID with missing row segment', () => {
    expect(CONTAINER_ID_RE.test('Z1-30-C012')).toBe(false);
  });
});
