#!/usr/bin/env bash
# Backs up the cultivate SQLite database with a timestamp, keeps the last 7.
set -euo pipefail

DB_PATH="${DB_PATH:-$(dirname "$0")/../data/cultivate.db}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../data/backups}"
KEEP=7

timestamp=$(date +"%Y-%m-%d-%H-%M")
dest="$BACKUP_DIR/cultivate-backup-${timestamp}.db"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] ERROR: database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# sqlite3 .backup is safe with WAL mode; fall back to cp if sqlite3 is absent
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_PATH" ".backup '$dest'"
else
  cp "$DB_PATH" "$dest"
fi

echo "[backup] Wrote $dest ($(du -sh "$dest" | cut -f1))"

# Remove all but the $KEEP most recent backups
count=$(find "$BACKUP_DIR" -maxdepth 1 -name "cultivate-backup-*.db" | wc -l)
if [ "$count" -gt "$KEEP" ]; then
  find "$BACKUP_DIR" -maxdepth 1 -name "cultivate-backup-*.db" \
    | sort \
    | head -n $(( count - KEEP )) \
    | xargs rm -f
  echo "[backup] Pruned to $KEEP most recent backups"
fi
