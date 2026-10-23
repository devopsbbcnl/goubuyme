import axios from 'axios';

// Nominatim (OpenStreetMap) is the primary geocoding provider — no API key required,
// just a descriptive User-Agent per their usage policy (https://operations.osmfoundation.org/policies/nominatim/).
// Base URL is configurable so this can point at a self-hosted Nominatim instance later
// without any application-code changes.
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || 'GoBuyMe/1.0 (support@gobuyme.shop)';
const MAPTILER_BASE_URL = 'https://api.maptiler.com/geocoding';

const nominatimHeaders = { 'User-Agent': NOMINATIM_USER_AGENT };

// Nominatim's public instance allows at most 1 request/second. Calls are chained through
// this promise so concurrent users (and the multi-candidate fallback below) can't burst.
const NOMINATIM_MIN_GAP_MS = 1100;
let nominatimQueue: Promise<unknown> = Promise.resolve();

function throttleNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(fn, fn);
  nominatimQueue = run.then(
    () => new Promise((resolve) => setTimeout(resolve, NOMINATIM_MIN_GAP_MS)),
    () => new Promise((resolve) => setTimeout(resolve, NOMINATIM_MIN_GAP_MS)),
  );
  return run;
}

// In-memory result cache, keyed by provider + normalized query. Hits skip the network
// entirely; misses are cached briefly so a retry loop doesn't re-hit Nominatim/MapTiler
// for an address neither can resolve.
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;
const geocodeCache = new Map<string, { value: VendorCoordinates | null; expires: number }>();

function cacheKey(provider: string, query: string): string {
  return `${provider}:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function cacheGet(key: string): { value: VendorCoordinates | null } | undefined {
  const entry = geocodeCache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    geocodeCache.delete(key);
    return undefined;
  }
  return { value: entry.value };
}

function cacheSet(key: string, value: VendorCoordinates | null): void {
  if (geocodeCache.size >= CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) geocodeCache.delete(oldest);
  }
  geocodeCache.set(key, { value, expires: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS) });
}

export interface VendorCoordinates {
  lat: number;
  lng: number;
}

export interface VendorCoordinatesWithQuery extends VendorCoordinates {
  query: string;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  state?: string;
  road?: string;
  neighbourhood?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

function extractCityStateFromNominatim(address?: NominatimAddress): { city: string; state: string } {
  const city = address?.city || address?.town || address?.village || address?.suburb || '';
  const state = address?.state || '';
  return { city, state };
}

async function queryNominatim(query: string): Promise<VendorCoordinates | null> {
  const key = cacheKey('nominatim', query);
  const cached = cacheGet(key);
  if (cached) return cached.value;

  try {
    const response = await throttleNominatim(() =>
      axios.get(`${NOMINATIM_BASE_URL}/search`, {
        params: { q: query, format: 'json', countrycodes: 'ng', limit: 1 },
        headers: nominatimHeaders,
        timeout: 10000,
      }),
    );

    const results = response.data as NominatimResult[];
    if (!Array.isArray(results) || results.length === 0) {
      // Expected for informal NG addresses — stdout, not the pm2 error log.
      console.info('[Geocode] Nominatim returned no results for query:', query);
      cacheSet(key, null);
      return null;
    }

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('[Geocode] Invalid coordinates from Nominatim:', results[0]);
      return null;
    }

    const coords = { lat, lng };
    cacheSet(key, coords);
    return coords;
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] queryNominatim failed for query:', query, message);
    return null;
  }
}

// MapTiler fallback — used whenever Nominatim rejects the request or can't resolve the
// query (rate limited, informal NG addresses). Reuses the same MapTiler account already
// paid for the mobile maps.
async function queryMapTiler(query: string): Promise<VendorCoordinates | null> {
  const key = cacheKey('maptiler', query);
  const cached = cacheGet(key);
  if (cached) return cached.value;

  try {
    const apiKey = process.env.MAPTILER_API_KEY;
    if (!apiKey) {
      console.warn('[Geocode] MAPTILER_API_KEY not set — skipping MapTiler fallback for query:', query);
      return null;
    }

    const response = await axios.get(`${MAPTILER_BASE_URL}/${encodeURIComponent(query)}.json`, {
      params: { key: apiKey, country: 'ng', limit: 1 },
      timeout: 10000,
    });

    const feature = response.data?.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      cacheSet(key, null);
      return null;
    }

    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const result = { lat, lng };
    cacheSet(key, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] queryMapTiler failed for query:', query, message);
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

async function searchAddressSuggestionsNominatim(query: string): Promise<GeocodeSuggestion[]> {
  try {
    const response = await throttleNominatim(() =>
      axios.get(`${NOMINATIM_BASE_URL}/search`, {
        params: { q: query, format: 'json', countrycodes: 'ng', limit: 5, addressdetails: 1 },
        headers: nominatimHeaders,
        timeout: 10000,
      }),
    );

    const results = response.data as NominatimResult[];
    if (!Array.isArray(results)) return [];

    return results.map((result) => {
      const { city, state } = extractCityStateFromNominatim(result.address);
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      return {
        id: `${lat}_${lng}`,
        placeName: result.display_name,
        address: (result.address?.road || result.display_name || '').trim(),
        city,
        state,
        lat,
        lng,
      };
    }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] searchAddressSuggestionsNominatim failed for query:', query, message);
    return [];
  }
}

async function searchAddressSuggestionsMapTiler(query: string): Promise<GeocodeSuggestion[]> {
  try {
    const apiKey = process.env.MAPTILER_API_KEY;
    if (!apiKey) {
      console.warn('[Geocode] MAPTILER_API_KEY not set — skipping MapTiler fallback for query:', query);
      return [];
    }

    const response = await axios.get(`${MAPTILER_BASE_URL}/${encodeURIComponent(query)}.json`, {
      params: { key: apiKey, country: 'ng', limit: 5 },
      timeout: 10000,
    });

    const features = response.data?.features;
    if (!Array.isArray(features)) return [];

    return features.map((feature: any) => {
      const [lng, lat] = feature.geometry?.coordinates ?? [0, 0];
      const context: any[] = feature.context ?? [];
      const city = context.find((c: any) => c.id?.startsWith('place'))?.text ?? '';
      const state = context.find((c: any) => c.id?.startsWith('region'))?.text ?? '';
      return {
        id: `${lat}_${lng}`,
        placeName: feature.place_name ?? feature.text ?? '',
        address: feature.text ?? feature.place_name ?? '',
        city,
        state,
        lat, lng,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] searchAddressSuggestionsMapTiler failed for query:', query, message);
    return [];
  }
}

// Address autocomplete/search — mirrors the shape the mobile app previously got by
// calling Google directly. Kept server-side so provider credentials never ship in the
// app bundle. Nominatim (OpenStreetMap) is primary; falls back to MapTiler (already
// used for the mobile maps) if Nominatim is rate-limited or resolves nothing.
export async function searchAddressSuggestions(query: string): Promise<GeocodeSuggestion[]> {
  const nominatimResults = await searchAddressSuggestionsNominatim(query);
  if (nominatimResults.length > 0) return nominatimResults;

  return searchAddressSuggestionsMapTiler(query);
}

async function reverseGeocodeMapTiler(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  try {
    const apiKey = process.env.MAPTILER_API_KEY;
    if (!apiKey) {
      console.warn('[Geocode] MAPTILER_API_KEY not set — skipping MapTiler reverse-geocode fallback for', lat, lng);
      return null;
    }

    const response = await axios.get(`${MAPTILER_BASE_URL}/${lng},${lat}.json`, {
      params: { key: apiKey },
      timeout: 10000,
    });

    const feature = response.data?.features?.[0];
    if (!feature) return null;

    const context: any[] = feature.context ?? [];
    const city = context.find((c: any) => c.id?.startsWith('place'))?.text ?? '';
    const state = context.find((c: any) => c.id?.startsWith('region'))?.text ?? '';
    return {
      address: feature.text ?? feature.place_name ?? '',
      city,
      state,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] reverseGeocodeMapTiler failed:', message);
    return null;
  }
}

// Nominatim (OpenStreetMap) is primary; falls back to MapTiler (already used for the
// mobile maps) if Nominatim is rate-limited or resolves nothing.
export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  try {
    const response = await throttleNominatim(() =>
      axios.get(`${NOMINATIM_BASE_URL}/reverse`, {
        params: { lat, lon: lng, format: 'json', addressdetails: 1 },
        headers: nominatimHeaders,
        timeout: 10000,
      }),
    );

    const result = response.data as NominatimResult | undefined;
    if (result && !(result as any).error) {
      const { city, state } = extractCityStateFromNominatim(result.address);
      return {
        address: (result.address?.road || result.display_name || '').trim(),
        city,
        state,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.warn('[Geocode] Nominatim reverse geocode failed:', message);
  }

  return reverseGeocodeMapTiler(lat, lng);
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
    const coords = await queryNominatim(query);
    if (coords) return { ...coords, query };
  }

  // Nominatim found nothing for any candidate — try MapTiler before giving up.
  for (const query of seen) {
    const coords = await queryMapTiler(query);
    if (coords) return { ...coords, query };
  }

  return null;
}
