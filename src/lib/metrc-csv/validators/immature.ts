import type Database from 'better-sqlite3';

export interface TagRangeError {
  tag: string;
  status: string;
}

/**
 * Queries all tags >= starting_tag (up to count), collects any that are not 'available'.
 * Returns errors for unavailable tags. An empty array means all tags are available.
 */
export function validateImmatureTagRange(
  db: Database.Database,
  startingTag: string,
  count: number,
): TagRangeError[] {
  const rows = db
    .prepare(
      `SELECT tag, status FROM cv_metrc_available_plant_tags
       WHERE tag >= ?
       ORDER BY tag
       LIMIT ?`,
    )
    .all(startingTag, count) as { tag: string; status: string }[];

  return rows.filter((r) => r.status !== 'available').map((r) => ({ tag: r.tag, status: r.status }));
}

/**
 * Validates that there are enough available tags in the pool starting from startingTag.
 * Returns an error string if not enough tags are available, null otherwise.
 */
export function validateTagRangeAvailableCount(
  db: Database.Database,
  startingTag: string,
  count: number,
): string | null {
  const available = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cv_metrc_available_plant_tags
       WHERE tag >= ? AND status = 'available'`,
    )
    .get(startingTag) as { n: number };

  if (available.n < count) {
    return `Not enough available plant tags starting from ${startingTag}. Requested ${count}, found ${available.n} available.`;
  }
  return null;
}
