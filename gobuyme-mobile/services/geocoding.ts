import api from './api';

// forwardGeocode()/reverseGeocode() go through the backend (/geocode/search, /geocode/reverse),
// which proxies Nominatim (OpenStreetMap). Nominatim's usage policy requires a descriptive
// User-Agent and rate-limits by client — routing through the backend keeps that identity and
// rate-limit handling in one place instead of duplicating it in the app.
export let lastGeocodeStatus: string | null = null;

export interface GeocodeSuggestion {
  id: string;
  placeName: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Geocode a typed address + city + state directly to coordinates, without requiring the
// user to pick a suggestion — mirrors the web app's /profile/addresses flow (GET /geocode),
// which confirms lat/lng in the background from what the user typed instead of forcing a
// dropdown selection or GPS as the only path to a savable address.
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await api.get('/geocode', { params: { address, city, state } });
    const lat = data?.data?.lat;
    const lng = data?.data?.lng;
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  } catch {
    return null;
  }
}

// Geocode an address to coordinates via the backend (proxies Nominatim/OpenStreetMap)
export async function forwardGeocode(query: string): Promise<GeocodeSuggestion[]> {
  lastGeocodeStatus = null;
  if (query.trim().length < 3) return [];
  try {
    const { data } = await api.get('/geocode/search', { params: { address: query.trim() } });
    const suggestions = data?.data;
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      lastGeocodeStatus = 'ZERO_RESULTS';
      return [];
    }
    return suggestions;
  } catch (err: any) {
    console.warn('[Geocoding] forwardGeocode error:', err);
    lastGeocodeStatus = err?.response?.data?.message ?? 'REQUEST_FAILED';
    return [];
  }
}

// Reverse geocode coordinates to address via the backend (proxies Nominatim/OpenStreetMap)
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  try {
    const { data } = await api.get('/geocode/reverse', { params: { lat, lng } });
    return data?.data ?? null;
  } catch (err) {
    console.warn('[Geocoding] reverseGeocode error:', err);
    return null;
  }
}

// Calculate distance between two coordinates using Haversine formula (in km)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Route distance for the client-side checkout preview. This is a straight-line (Haversine)
// estimate, not the authoritative fee — the backend recalculates the real route distance via
// OSRM and that server-side figure is what actually gets charged (see pricing.service.ts).
export async function calculateRouteDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<number> {
  return calculateDistance(lat1, lng1, lat2, lng2);
}

// Calculate delivery fee based on distance
export function calculateDeliveryFee(
  distanceKm: number,
  baseFee: number = 1500,
  includedKm: number = 2,
  perKmRate: number = 100,
  maxFee: number = 999999,
): number {
  const extraKm = Math.max(0, distanceKm - includedKm);
  const fee = baseFee + Math.round(extraKm * perKmRate);
  return Math.min(fee, maxFee);
}
