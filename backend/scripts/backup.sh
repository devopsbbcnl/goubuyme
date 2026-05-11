#!/bin/bash
# Daily PostgreSQL backup — runs via cron: 0 2 * * * /path/to/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gobuyme}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILE="$BACKUP_DIR/gobuyme_db_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting pg_dump at $DATE"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "[backup] Saved to $FILE"

# Remove backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Cleaned up backups older than ${RETENTION_DAYS} days"
