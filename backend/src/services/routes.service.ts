import axios from 'axios';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

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
 * Calculate real road distance using Google Maps Routes API
 * This provides accurate driving distance instead of straight-line Haversine distance
 */
export async function calculateRouteDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  options?: RouteOptions,
): Promise<RouteDistance | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('[Routes] GOOGLE_MAPS_API_KEY not set');
      return null;
    }

    const url = `${GOOGLE_MAPS_BASE_URL}/directions/json`;
    const params: any = {
      origin: `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      key: apiKey,
      mode: 'driving',
      units: 'metric',
    };

    if (options?.avoidTolls) params.avoid = 'tolls';
    if (options?.avoidHighways) params.avoid = params.avoid ? `${params.avoid}|highways` : 'highways';
    if (options?.departureTime) params.departure_time = Math.floor(options.departureTime.getTime() / 1000);

    const response = await axios.get(url, { params, timeout: 10000 });
    const data = response.data;

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      console.warn('[Routes] Google Maps API returned no routes:', data.status);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    if (!leg) {
      console.warn('[Routes] No legs in route');
      return null;
    }

    const distanceKm = leg.distance.value / 1000; // Convert meters to km
    const durationMinutes = leg.duration.value / 60; // Convert seconds to minutes

    return {
      distanceKm: Math.round(distanceKm * 100) / 100, // Round to 2 decimal places
      durationMinutes: Math.ceil(durationMinutes),
      polyline: route.overview_polyline?.points,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Routes] calculateRouteDistance failed:', message);
    return null;
  }
}

/**
 * Calculate distance matrix for multiple origins and destinations
 * Useful for batch calculations and optimization
 */
export async function calculateDistanceMatrix(
  origins: Array<{ lat: number; lng: number }>,
  destinations: Array<{ lat: number; lng: number }>,
): Promise<number[][] | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('[Routes] GOOGLE_MAPS_API_KEY not set');
      return null;
    }

    const originString = origins.map(o => `${o.lat},${o.lng}`).join('|');
    const destString = destinations.map(d => `${d.lat},${d.lng}`).join('|');

    const url = `${GOOGLE_MAPS_BASE_URL}/distancematrix/json`;
    const params = {
      origins: originString,
      destinations: destString,
      key: apiKey,
      mode: 'driving',
      units: 'metric',
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    const data = response.data;

    if (data.status !== 'OK') {
      console.warn('[Routes] Distance Matrix API returned error:', data.status);
      return null;
    }

    const matrix: number[][] = [];
    for (const row of data.rows) {
      const distances: number[] = [];
      for (const element of row.elements) {
        if (element.status === 'OK') {
          distances.push(element.distance.value / 1000); // Convert to km
        } else {
          distances.push(-1); // Indicate error
        }
      }
      matrix.push(distances);
    }

    return matrix;
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Routes] calculateDistanceMatrix failed:', message);
    return null;
  }
}
