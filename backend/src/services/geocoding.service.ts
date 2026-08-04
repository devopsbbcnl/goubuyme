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

export interface GeocodeSuggestion {
  id: string;
  placeName: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

function extractCityState(addressComponents: any[]): { city: string; state: string } {
  let city = '';
  let state = '';
  for (const comp of addressComponents || []) {
    if (comp.types.includes('locality')) city = comp.long_name;
    if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
  }
  return { city, state };
}

// Address autocomplete/search — mirrors the shape the mobile app previously got by
// calling Google directly. Kept server-side so the Google key never ships in the app bundle.
export async function searchAddressSuggestions(query: string): Promise<GeocodeSuggestion[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[Geocode] GOOGLE_MAPS_API_KEY not set');
    return [];
  }

  const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/geocode/json`, {
    params: { address: query, components: 'country:NG', key: apiKey },
    timeout: 10000,
  });

  const results = response.data?.results;
  if (response.data?.status !== 'OK' || !Array.isArray(results)) {
    return [];
  }

  return results.slice(0, 5).map((result: any) => {
    const { formatted_address, address_components, geometry } = result;
    const { city, state } = extractCityState(address_components);
    return {
      id: `${geometry?.location?.lat}_${geometry?.location?.lng}`,
      placeName: formatted_address,
      address: (address_components?.[0]?.long_name || formatted_address || '').trim(),
      city,
      state,
      lat: geometry?.location?.lat ?? 0,
      lng: geometry?.location?.lng ?? 0,
    };
  });
}

export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[Geocode] GOOGLE_MAPS_API_KEY not set');
    return null;
  }

  const response = await axios.get(`${GOOGLE_MAPS_BASE_URL}/geocode/json`, {
    params: { latlng: `${lat},${lng}`, key: apiKey },
    timeout: 10000,
  });

  const results = response.data?.results;
  if (response.data?.status !== 'OK' || !Array.isArray(results) || results.length === 0) {
    return null;
  }

  const { formatted_address, address_components } = results[0];
  const { city, state } = extractCityState(address_components);
  return {
    address: (address_components?.[0]?.long_name || formatted_address || '').trim(),
    city,
    state,
  };
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
