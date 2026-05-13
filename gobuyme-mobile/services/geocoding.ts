const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const GEOCODING_BASE = 'https://api.maptiler.com/geocoding';

function hasValidKey(): boolean {
  return Boolean(MAPTILER_KEY) && MAPTILER_KEY !== 'get_free_key_at_maptiler_com';
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
    const url = `${GEOCODING_BASE}/${encodeURIComponent(query.trim())}.json?key=${MAPTILER_KEY}&country=ng&language=en&limit=5`;
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
    const url = `${GEOCODING_BASE}/${lng},${lat}.json?key=${MAPTILER_KEY}&language=en`;
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
