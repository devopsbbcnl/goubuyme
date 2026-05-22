const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

function hasValidKey(): boolean {
  return Boolean(MAPBOX_ACCESS_TOKEN) && MAPBOX_ACCESS_TOKEN !== 'your_mapbox_access_token';
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

export async function forwardGeocode(query: string): Promise<GeocodeSuggestion[]> {
  if (!hasValidKey() || query.trim().length < 3) return [];
  try {
    const url = `${GEOCODING_BASE}/${encodeURIComponent(query.trim())}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=NG&language=en&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any) => {
      const [lng, lat] = f.center;
      const ctx: any[] = f.context ?? [];
      const city = ctx.find((c: any) => c.id?.startsWith('place.'))?.text ?? '';
      const state = ctx.find((c: any) => c.id?.startsWith('region.'))?.text ?? '';
      return {
        id: f.id,
        placeName: f.place_name,
        address: f.text ?? f.place_name,
        city,
        state,
        lat,
        lng,
      };
    });
  } catch {
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string; city: string; state: string } | null> {
  if (!hasValidKey()) return null;
  try {
    const url = `${GEOCODING_BASE}/${lng},${lat}.json?access_token=${MAPBOX_ACCESS_TOKEN}&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const ctx: any[] = f.context ?? [];
    const city = ctx.find((c: any) => c.id?.startsWith('place.'))?.text ?? '';
    const state = ctx.find((c: any) => c.id?.startsWith('region.'))?.text ?? '';
    return { address: f.place_name ?? '', city, state };
  } catch {
    return null;
  }
}
