#!/usr/bin/env bash
# Encrypted, off-site PostgreSQL backup (NDPA register G19). See backend/docs/backups.md for setup.
#
#   0 2 * * *  /opt/gobuyme/backend/scripts/backup-encrypted.sh >> /var/log/gobuyme-backup.log 2>&1
#
# What it does:  pg_dump (custom format) -> encrypt with age (public key only on the server) -> upload with rclone
#                -> delete copies older than the retention window, locally and remotely.
# The PRIVATE key is never on this server: without it the backups cannot be read, even if the bucket leaks.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT (age public key, starts with age1...) must be set}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE must be set, e.g. gobuyme-backups:gobuyme-db}"

WORK_DIR="${BACKUP_DIR:-/var/backups/gobuyme}"
DAILY_KEEP_DAYS="${DAILY_KEEP_DAYS:-7}"
WEEKLY_KEEP_DAYS="${WEEKLY_KEEP_DAYS:-28}"
MONTHLY_KEEP_DAYS="${MONTHLY_KEEP_DAYS:-90}"   # nothing is kept longer than this: it caps how long erased people persist
STAMP="$(date -u +%Y-%m-%d_%H-%M-%S)"
DOW="$(date -u +%u)"   # 7 = Sunday
DOM="$(date -u +%d)"

mkdir -p "$WORK_DIR"
umask 077
OUT="$WORK_DIR/gobuyme_${STAMP}.dump.age"

echo "[backup] $(date -u +%FT%TZ) starting"
pg_dump --format=custom --no-owner "$DATABASE_URL" | age -r "$AGE_RECIPIENT" -o "$OUT"
SIZE="$(stat -c%s "$OUT")"
if [ "$SIZE" -lt 1024 ]; then echo "[backup] ERROR: dump is suspiciously small ($SIZE bytes)"; rm -f "$OUT"; exit 1; fi

# Daily copy always; a weekly (Sunday) and monthly (1st) copy go in their own folders so retention can differ.
rclone copyto "$OUT" "$RCLONE_REMOTE/daily/$(basename "$OUT")"
[ "$DOW" = "7" ] && rclone copyto "$OUT" "$RCLONE_REMOTE/weekly/$(basename "$OUT")"
[ "$DOM" = "01" ] && rclone copyto "$OUT" "$RCLONE_REMOTE/monthly/$(basename "$OUT")"
echo "[backup] uploaded $(basename "$OUT") ($SIZE bytes)"

# Retention: remote and local.
rclone delete "$RCLONE_REMOTE/daily"   --min-age "${DAILY_KEEP_DAYS}d"   || true
rclone delete "$RCLONE_REMOTE/weekly"  --min-age "${WEEKLY_KEEP_DAYS}d"  || true
rclone delete "$RCLONE_REMOTE/monthly" --min-age "${MONTHLY_KEEP_DAYS}d" || true
find "$WORK_DIR" -name 'gobuyme_*.dump.age' -mtime +2 -delete

# Healthcheck ping (optional): alerts you if a night is missed.
[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null || true
echo "[backup] done"
