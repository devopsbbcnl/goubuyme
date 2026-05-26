import axios from 'axios';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

export interface VendorCoordinates {
  lat: number;
  lng: number;
}

export interface VendorCoordinatesWithQuery extends VendorCoordinates {
  query: string;
}

async function queryGoogleMaps(query: string): Promise<VendorCoordinates | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('[Geocode] GOOGLE_MAPS_API_KEY not set');
      return null;
    }

    const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/geocode/json`, {
      params: {
        address: query,
        components: 'country:NG',
        key: apiKey,
      },
      timeout: 10000,
    });

    const results = response.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
      console.warn('[Geocode] Google Maps returned no results for query:', query);
      return null;
    }

    const result = results[0];
    const location = result.geometry?.location;
    if (!location) {
      console.warn('[Geocode] No geometry in Google Maps result');
      return null;
    }

    const lat = parseFloat(location.lat);
    const lng = parseFloat(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('[Geocode] Invalid coordinates from Google Maps:', location);
      return null;
    }

    return { lat, lng };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] queryGoogleMaps failed for query:', query, message);
    return null;
  }
}

export async function forwardGeocodeVendorAddress(
  address: string,
  city?: string | null,
  state?: string | null,
): Promise<VendorCoordinatesWithQuery | null> {
  const addressTrim = address?.trim();
  const cityTrim = city?.trim();
  const stateTrim = state?.trim();

  const candidates = [
    [addressTrim, cityTrim, stateTrim],
    [addressTrim, cityTrim],
    [cityTrim, stateTrim],
    [addressTrim],
  ]
    .map(parts => parts.filter(Boolean).join(', '))
    .filter(Boolean);

  const seen = new Set<string>();
  for (const query of candidates) {
    if (seen.has(query)) continue;
    seen.add(query);
    const coords = await queryGoogleMaps(query);
    if (coords) return { ...coords, query };
  }

  return null;
}
