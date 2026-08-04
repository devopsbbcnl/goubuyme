import api from './api';

const GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';

// forwardGeocode()/reverseGeocode() go through the backend (/geocode/search, /geocode/reverse)
// rather than calling Google directly. Google API keys restricted by HTTP referrer (as ours is,
// since gobuyme-web also needs it) reject requests with no referer — which is every mobile
// request — with REQUEST_DENIED. Routing through the backend uses a server-side key that's
// restricted by IP instead, which mobile devices satisfy fine.
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

// Geocode an address to coordinates via the backend (proxies Google Maps Geocoding API)
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

// Reverse geocode coordinates to address via the backend (proxies Google Maps Geocoding API)
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

// Calculate route distance using Google Maps Distance Matrix API. Falls back to straight-line distance if API fails.
export async function calculateRouteDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<number> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('[Geocoding] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY not set, using Haversine fallback');
      return calculateDistance(lat1, lng1, lat2, lng2);
    }

    const origin = `${lat1},${lng1}`;
    const destination = `${lat2},${lng2}`;
    const url = `${GOOGLE_MAPS_BASE_URL}/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=driving&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Google Maps Distance Matrix request failed: ${res.status}`);
    }

    const json = await res.json();
    
    if (json.status !== 'OK' || !Array.isArray(json.rows) || json.rows.length === 0) {
      throw new Error(`Google Maps Distance Matrix returned status: ${json.status}`);
    }

    const elements = json.rows[0].elements;
    if (!Array.isArray(elements) || elements.length === 0 || !elements[0].distance) {
      throw new Error('No distance data in Google Maps response');
    }

    const distanceMeters = elements[0].distance.value;
    if (typeof distanceMeters !== 'number' || Number.isNaN(distanceMeters)) {
      throw new Error('Invalid distance value from Google Maps');
    }

    const distanceKm = distanceMeters / 1000;
    console.log('[Geocoding] calculateRouteDistance:', { origin, destination, distanceKm });
    return Math.max(0, distanceKm);
  } catch (err) {
    console.warn('[Geocoding] calculateRouteDistance error, falling back to Haversine:', err);
    return calculateDistance(lat1, lng1, lat2, lng2);
  }
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
