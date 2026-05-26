export const MAX_ROWS = 500;

export class CsvTooLargeError extends Error {
  constructor(rowCount: number) {
    super(`CSV row count ${rowCount} exceeds maximum of ${MAX_ROWS}`);
    this.name = 'CsvTooLargeError';
  }
}

export class CsvHeaderMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`CSV header mismatch.\n  Expected: ${expected}\n  Got:      ${actual}`);
    this.name = 'CsvHeaderMismatchError';
  }
}

/**
 * RFC 4180 cell escaping.
 * Values containing comma, double-quote, CR, or LF are wrapped in double-quotes.
 * Internal double-quotes are doubled.
 */
export function escapeCell(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value).replace(/"/g, '""');
  if (/[,"\r\n]/.test(str)) return `"${str}"`;
  return str;
}

export function checkRowLimit(rowCount: number): void {
  if (rowCount > MAX_ROWS) throw new CsvTooLargeError(rowCount);
}

export function validateHeaders(actual: string, expected: string): void {
  if (actual.trim() !== expected.trim()) throw new CsvHeaderMismatchError(expected, actual);
}
