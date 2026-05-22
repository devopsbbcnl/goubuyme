const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface GeocodeSuggestion {
  id: string;
  placeName: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Geocode an address to coordinates using Nominatim (OpenStreetMap)
export async function forwardGeocode(query: string): Promise<GeocodeSuggestion[]> {
  if (query.trim().length < 3) return [];
  try {
    const url = `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(query.trim())}&addressdetails=1&limit=5&countrycodes=ng`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoBuyMe/1.0 (gobuyme@example.com)',
      },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json ?? []).map((f: any) => ({
      id: f.place_id.toString(),
      placeName: f.display_name,
      address: f.display_name.split(',')[0].trim(),
      city: f.address?.city || f.address?.town || f.address?.village || '',
      state: f.address?.state || '',
      lat: parseFloat(f.lat),
      lng: parseFloat(f.lon),
    }));
  } catch {
    return [];
  }
}

// Reverse geocode coordinates to address using Nominatim
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GoBuyMe/1.0 (gobuyme@example.com)',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    return {
      address: json.display_name.split(',')[0].trim(),
      city: json.address?.city || json.address?.town || json.address?.village || '',
      state: json.address?.state || '',
    };
  } catch {
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

// Calculate delivery fee based on distance
export function calculateDeliveryFee(
  distanceKm: number,
  baseFee: number = 500,
  perKmRate: number = 100,
  maxFee: number = 2000,
): number {
  const fee = baseFee + (distanceKm * perKmRate);
  return Math.min(fee, maxFee);
}
