// Lead finder: where businesses come from. Google Places Text Search (New) in production; a
// clearly labelled stub for local development only, so the flow can be exercised without a key.
import axios from 'axios';

export interface Place {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  businessStatus: string | null;
  /** Null when the provider says nothing either way. */
  offersDelivery: boolean | null;
}

export interface PlaceSearchResult {
  places: Place[];
  /** Billable requests made. */
  calls: number;
}

export class PlacesError extends Error {}

const PAGE_SIZE = 20;
export const MAX_RESULTS = 60; // Text Search returns at most 3 pages of 20.

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.location', 'places.types',
  'places.primaryType', 'places.rating', 'places.userRatingCount', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.businessStatus', 'places.delivery', 'nextPageToken',
].join(',');

const usesStub = () => process.env.NODE_ENV !== 'production' && process.env.PROSPECTING_PLACES_PROVIDER === 'stub';

export const placesProvider = (): 'google' | 'stub' | null =>
  usesStub() ? 'stub' : process.env.GOOGLE_PLACES_API_KEY ? 'google' : null;

interface GoogleComponent { longText?: string; types?: string[] }
interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  delivery?: boolean;
}

const component = (cs: GoogleComponent[] | undefined, ...types: string[]) => {
  for (const t of types) {
    const hit = cs?.find((c) => c.types?.includes(t))?.longText;
    if (hit) return hit;
  }
  return null;
};

/** Pure: Google's place shape → ours. Missing values stay null. */
export const fromGoogle = (g: GooglePlace): Place => ({
  placeId: g.id,
  name: g.displayName?.text?.trim() || 'Unnamed business',
  address: g.formattedAddress ?? null,
  city: component(g.addressComponents, 'locality', 'administrative_area_level_2', 'administrative_area_level_1'),
  area: component(g.addressComponents, 'sublocality_level_1', 'sublocality', 'neighborhood'),
  lat: g.location?.latitude ?? null,
  lng: g.location?.longitude ?? null,
  types: g.types ?? [],
  primaryType: g.primaryType ?? null,
  rating: typeof g.rating === 'number' ? g.rating : null,
  reviewCount: typeof g.userRatingCount === 'number' ? g.userRatingCount : null,
  phone: g.internationalPhoneNumber ?? g.nationalPhoneNumber ?? null,
  website: g.websiteUri ?? null,
  mapsUrl: g.googleMapsUri ?? null,
  businessStatus: g.businessStatus ?? null,
  offersDelivery: typeof g.delivery === 'boolean' ? g.delivery : null,
});

const searchGoogle = async (query: string, maxResults: number): Promise<PlaceSearchResult> => {
  const places: Place[] = [];
  let calls = 0;
  let pageToken: string | undefined;
  while (places.length < maxResults) {
    calls++;
    let data: { places?: GooglePlace[]; nextPageToken?: string };
    try {
      ({ data } = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        { textQuery: query, regionCode: 'NG', languageCode: 'en', pageSize: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) },
        { timeout: 20_000, headers: { 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!, 'X-Goog-FieldMask': FIELD_MASK } },
      ));
    } catch (err) {
      const detail = axios.isAxiosError(err) ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? err.message : (err as Error).message;
      // Keep what earlier pages returned; only a failed first page fails the run.
      if (places.length) break;
      throw new PlacesError(`Google Places request failed: ${detail}`);
    }
    places.push(...(data.places ?? []).map(fromGoogle));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { places: places.slice(0, maxResults), calls };
};

/** Development only. Every name says TEST so a stub record can never be mistaken for a real business. */
const searchStub = async (query: string, maxResults: number): Promise<PlaceSearchResult> => {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const base = (i: number, o: Partial<Place>): Place => ({
    placeId: `stub-${slug}-${i}`, name: `TEST Business ${i}`, address: '1 Test Road, Port Harcourt', city: 'Port Harcourt', area: 'GRA Phase 2',
    lat: 4.8156, lng: 7.0498, types: ['restaurant'], primaryType: 'restaurant', rating: null, reviewCount: null, phone: null, website: null,
    mapsUrl: null, businessStatus: 'OPERATIONAL', offersDelivery: null, ...o,
  });
  const places = [
    base(1, { name: 'TEST Mama Put Kitchen', rating: 4.6, reviewCount: 320, phone: '+234 803 000 0001', offersDelivery: true }),
    base(2, { name: 'TEST Corner Pharmacy', types: ['pharmacy'], primaryType: 'pharmacy', rating: 4.1, reviewCount: 48, phone: '0803 000 0002' }),
    base(3, { name: 'TEST Sweet Crumbs Bakery', types: ['bakery'], primaryType: 'bakery', rating: 3.2, reviewCount: 4, website: 'https://instagram.com/test_sweet_crumbs' }),
    base(4, { name: 'TEST No Details Store', types: ['store'], primaryType: 'store' }),
    base(5, { name: 'TEST Closed Grill', rating: 4.8, reviewCount: 900, phone: '+234 803 000 0005', businessStatus: 'CLOSED_PERMANENTLY' }),
  ];
  return { places: places.slice(0, maxResults), calls: 1 };
};

export const searchPlaces = async (query: string, maxResults: number): Promise<PlaceSearchResult> => {
  const provider = placesProvider();
  if (!provider) throw new PlacesError('The lead finder needs GOOGLE_PLACES_API_KEY to be set on the backend.');
  const limit = Math.min(MAX_RESULTS, Math.max(1, maxResults));
  return provider === 'stub' ? searchStub(query, limit) : searchGoogle(query, limit);
};

/** Requests a search of this size can cost, for checking the daily cap before starting. */
export const maxCallsFor = (maxResults: number) => Math.ceil(Math.min(MAX_RESULTS, Math.max(1, maxResults)) / PAGE_SIZE);
