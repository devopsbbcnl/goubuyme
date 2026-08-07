#!/usr/bin/env bash
# One-time (and re-runnable) OSRM data prep for Nigeria.
#
# Downloads the Nigeria OSM extract and runs OSRM's three preprocessing steps
# (extract -> partition -> customize) via the official osrm-backend image.
# The output lands in geo/data/ and is what docker-compose.geo.yml's `osrm`
# service serves via osrm-routed. Re-run this whenever you want to refresh
# the road data from a newer extract (Geofabrik publishes daily).
#
# Usage: bash geo/setup-osrm.sh
set -euo pipefail

cd "$(dirname "$0")"

PBF_URL="https://download.geofabrik.de/africa/nigeria-latest.osm.pbf"
PBF_FILE="nigeria-latest.osm.pbf"
OSRM_BASE="nigeria-latest.osrm"
IMAGE="ghcr.io/project-osrm/osrm-backend"

mkdir -p data

if [ ! -f "data/${PBF_FILE}" ]; then
  echo "==> Downloading Nigeria extract from Geofabrik..."
  curl -L --fail -o "data/${PBF_FILE}" "${PBF_URL}"
else
  echo "==> data/${PBF_FILE} already present, skipping download (delete it to re-fetch)."
fi

echo "==> osrm-extract (car profile)..."
docker run --rm -t -v "$(pwd)/data:/data" "${IMAGE}" \
  osrm-extract -p /opt/car.lua "/data/${PBF_FILE}"

echo "==> osrm-partition..."
docker run --rm -t -v "$(pwd)/data:/data" "${IMAGE}" \
  osrm-partition "/data/${OSRM_BASE}"

echo "==> osrm-customize..."
docker run --rm -t -v "$(pwd)/data:/data" "${IMAGE}" \
  osrm-customize "/data/${OSRM_BASE}"

echo "==> Done. Start the routing + geocoding services with:"
echo "    docker compose -f docker-compose.geo.yml up -d"
