#!/usr/bin/env bash
# Transfers the self-hosted geo stack (OSRM's preprocessed routing graph +
# the Nigeria .osm.pbf) to the VPS, so it doesn't have to do OSRM's
# preprocessing itself.
#
# WHY the split: osrm-extract (one of the three OSRM preprocessing steps) peaked at
# ~9.3GB RAM when run locally for the Nigeria extract — more than an 8GB VPS has, full
# stop. So OSRM's preprocessing must happen on a bigger machine (this one) and only the
# *output* (nigeria-latest.osrm.*) goes to the VPS, where osrm-routed just serves it
# (~2.4GB RAM). Nominatim's import, by contrast, peaked at ~6.6GB here and is safe to run
# ON the VPS itself — so we send the .osm.pbf and let Nominatim import it there directly,
# rather than trying to transfer a Postgres data directory (fragile across versions/arch).
#
# Prerequisites:
#   - geo/data/nigeria-latest.osm.pbf and geo/data/nigeria-latest.osrm.* must already
#     exist locally (run geo/setup-osrm.sh first if they don't).
#   - SSH key auth already set up to the VPS (this script does not handle passwords).
#
# Usage:
#   VPS_HOST=203.0.113.10 VPS_USER=root bash geo/deploy-to-vps.sh
#
# Config (env vars, all except VPS_HOST have defaults):
#   VPS_HOST   (required) — VPS hostname or IP
#   VPS_USER   (default: root)
#   VPS_PORT   (default: 22)
#   VPS_PATH   (default: ~/gobuyme6-geo) — remote directory to deploy into
#   SSH_KEY    (optional) — path to a specific private key, e.g. ~/.ssh/id_ed25519
set -euo pipefail

cd "$(dirname "$0")/.."

VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
VPS_PATH="${VPS_PATH:-~/gobuyme6-geo}"

if [ -z "${VPS_HOST:-}" ]; then
  echo "Error: VPS_HOST is required." >&2
  echo "Usage: VPS_HOST=<ip-or-host> [VPS_USER=root] [VPS_PORT=22] [VPS_PATH=~/gobuyme6-geo] [SSH_KEY=~/.ssh/id_ed25519] bash geo/deploy-to-vps.sh" >&2
  exit 1
fi

SSH_OPTS=(-p "$VPS_PORT")
SCP_OPTS=(-P "$VPS_PORT")
if [ -n "${SSH_KEY:-}" ]; then
  SSH_OPTS+=(-i "$SSH_KEY")
  SCP_OPTS+=(-i "$SSH_KEY")
fi

PBF="geo/data/nigeria-latest.osm.pbf"
OSRM_FILES=(geo/data/nigeria-latest.osrm*)

if [ ! -f "$PBF" ]; then
  echo "Error: $PBF not found. Run 'bash geo/setup-osrm.sh' first." >&2
  exit 1
fi
if [ ! -e "${OSRM_FILES[0]}" ]; then
  echo "Error: no geo/data/nigeria-latest.osrm* files found. Run 'bash geo/setup-osrm.sh' first." >&2
  exit 1
fi

echo "==> Creating remote directory structure at ${VPS_USER}@${VPS_HOST}:${VPS_PATH} ..."
ssh "${SSH_OPTS[@]}" "${VPS_USER}@${VPS_HOST}" "mkdir -p ${VPS_PATH}/geo/data"

echo "==> Copying docker-compose.geo.yml ..."
scp "${SCP_OPTS[@]}" docker-compose.geo.yml "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

if command -v rsync >/dev/null 2>&1; then
  echo "==> Copying geo data with rsync (resumable — safe to re-run if interrupted) ..."
  RSYNC_SSH="ssh -p ${VPS_PORT}"
  [ -n "${SSH_KEY:-}" ] && RSYNC_SSH="ssh -p ${VPS_PORT} -i ${SSH_KEY}"
  rsync -avz --partial --progress -e "$RSYNC_SSH" \
    "$PBF" "${OSRM_FILES[@]}" \
    "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/geo/data/"
else
  echo "==> rsync not found, falling back to scp (no resume — re-run from scratch if interrupted) ..."
  scp "${SCP_OPTS[@]}" "$PBF" "${OSRM_FILES[@]}" "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/geo/data/"
fi

echo ""
echo "==> Done. Total transferred: $(du -ch "$PBF" "${OSRM_FILES[@]}" | tail -1 | cut -f1)"
echo ""
echo "Next steps on the VPS:"
echo "  ssh ${VPS_USER}@${VPS_HOST}"
echo "  cd ${VPS_PATH}"
echo "  docker compose -f docker-compose.geo.yml up -d osrm       # serves immediately, data already preprocessed"
echo "  docker compose -f docker-compose.geo.yml up -d nominatim  # imports the .pbf itself, takes ~15-30 min — watch with:"
echo "  docker compose -f docker-compose.geo.yml logs -f nominatim"
echo ""
echo "Then point the backend's .env at them:"
echo "  NOMINATIM_BASE_URL=http://localhost:8082"
echo "  OSRM_BASE_URL=http://localhost:5001"
