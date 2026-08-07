import axios from 'axios';

// OSRM (Open Source Routing Machine) is the routing provider. Defaults to the public
// demo server (router.project-osrm.org), which is fine for development but is rate-limited
// and not for production use per OSRM's usage policy. Point OSRM_BASE_URL at a self-hosted
// instance for production — no application code changes needed.
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

export interface RouteDistance {
  distanceKm: number;
  durationMinutes: number;
  polyline?: string;
}

export interface RouteOptions {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  departureTime?: Date;
}

/**
 * Calculate real road distance using OSRM's driving profile.
 * RouteOptions.avoidTolls/avoidHighways/departureTime are accepted for interface
 * compatibility but not supported by OSRM's public routing API and are ignored.
 */
export async function calculateRouteDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  _options?: RouteOptions,
): Promise<RouteDistance | null> {
  try {
    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
    const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}`;

    const response = await axios.get(url, {
      params: { overview: 'full', geometries: 'polyline', alternatives: false, steps: false },
      timeout: 10000,
    });
    const data = response.data;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('[Routes] OSRM returned no routes:', data.code);
      return null;
    }

    const route = data.routes[0];
    const distanceKm = route.distance / 1000; // meters -> km
    const durationMinutes = route.duration / 60; // seconds -> minutes

    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes: Math.ceil(durationMinutes),
      polyline: route.geometry,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Routes] calculateRouteDistance failed:', message);
    return null;
  }
}

/**
 * Calculate a distance matrix for multiple origins and destinations using OSRM's table service.
 */
export async function calculateDistanceMatrix(
  origins: Array<{ lat: number; lng: number }>,
  destinations: Array<{ lat: number; lng: number }>,
): Promise<number[][] | null> {
  try {
    const allPoints = [...origins, ...destinations];
    const coordinates = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
    const sources = origins.map((_, i) => i).join(';');
    const destIndices = destinations.map((_, i) => origins.length + i).join(';');

    const url = `${OSRM_BASE_URL}/table/v1/driving/${coordinates}`;
    const response = await axios.get(url, {
      params: { sources, destinations: destIndices, annotations: 'distance' },
      timeout: 10000,
    });
    const data = response.data;

    if (data.code !== 'Ok' || !data.distances) {
      console.warn('[Routes] OSRM table service returned error:', data.code);
      return null;
    }

    // distances are in meters — convert to km
    return (data.distances as number[][]).map(row =>
      row.map(d => (typeof d === 'number' ? d / 1000 : -1)),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Routes] calculateDistanceMatrix failed:', message);
    return null;
  }
}
