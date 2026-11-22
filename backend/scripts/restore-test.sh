#!/usr/bin/env bash
# Monthly restore test (NDPA register G19): proves a backup can really be read and loaded. Run it from a
# machine that holds the age PRIVATE key, never from the production server.
#
#   AGE_IDENTITY=~/keys/gobuyme-backup.key RCLONE_REMOTE=gobuyme-backups:gobuyme-db ./restore-test.sh
#
# It downloads the newest daily backup, decrypts it, restores into a throwaway database, counts key tables,
# and drops the database. Log the result (date, size, duration, pass/fail) in the compliance register.
set -euo pipefail

: "${AGE_IDENTITY:?path to the age private key file}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE must be set}"
SCRATCH_DB="${SCRATCH_DB:-gobuyme_restore_test}"
PGURL="${PGURL:-postgresql://postgres@localhost:5432}"   # server that may create the scratch database
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
START="$(date +%s)"

LATEST="$(rclone lsf "$RCLONE_REMOTE/daily" | sort | tail -n1)"
[ -n "$LATEST" ] || { echo "FAIL: no backups found"; exit 1; }
rclone copyto "$RCLONE_REMOTE/daily/$LATEST" "$TMP/$LATEST"
age -d -i "$AGE_IDENTITY" -o "$TMP/db.dump" "$TMP/$LATEST"

psql "$PGURL/postgres" -c "DROP DATABASE IF EXISTS $SCRATCH_DB;" -c "CREATE DATABASE $SCRATCH_DB;"
pg_restore --no-owner -d "$PGURL/$SCRATCH_DB" "$TMP/db.dump"

for t in users orders vendors riders; do
  printf '%-10s %s\n' "$t" "$(psql "$PGURL/$SCRATCH_DB" -tAc "SELECT count(*) FROM $t;")"
done
psql "$PGURL/postgres" -c "DROP DATABASE $SCRATCH_DB;"

echo "PASS: restored $LATEST ($(stat -c%s "$TMP/$LATEST") bytes) in $(( $(date +%s) - START ))s"
echo "REMINDER: re-apply the erasure ledger (people deleted since this backup) before using a restored database."
