#!/usr/bin/env bash
# GoBuyMe — production reset & deploy
#
# WARNING: This wipes ALL production data (users, vendors, orders, payouts —
# everything), reapplies every migration to an empty database, and re-seeds
# only the 3 admin staff accounts. A pg_dump backup is taken first.
#
# Run from anywhere on the server:  bash backend/scripts/prod-reset.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # → backend/

if [ ! -f .env ]; then
  echo "ERROR: backend/.env not found — run this on the production server." >&2
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")

# pg_dump rejects Prisma's ?schema= URI parameter — strip it, keep any other params
PG_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&/\1/; s/[?&]schema=[^&]*$//')

echo "==> 1/7 Backing up current database"
BACKUP="db-backup-$(date +%Y%m%d-%H%M%S).sql"
pg_dump "$PG_URL" > "$BACKUP"
echo "    Saved backend/$BACKUP — keep this until you are sure the reset is good."

echo "==> 2/7 Pulling latest code"
git pull

echo "==> 3/7 Installing dependencies"
npm ci

echo "==> 4/7 Resetting database (ALL DATA WILL BE LOST)"
npx prisma migrate reset --force --skip-seed

echo "==> 5/7 Seeding admin staff accounts"
npm run prisma:seed

echo "==> 6/7 Building"
npx prisma generate
npm run build

echo "==> 7/7 Restarting API"
pm2 restart gobuyme-api

# Note: images live on Cloudinary, not on this server. The repo-root uploads/
# folder is unused by the backend — delete it manually if you want it gone.

echo ""
echo "Done. Next steps:"
echo "  1. Log into the admin panel with the seeded SUPER_ADMIN account."
echo "  2. Set commission tier rates under Settings → Commission Tiers."
echo "  3. Review delivery pricing in Settings (defaults were restored)."
