import { calculateRouteDistance } from './routes.service';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Haversine distance calculation (straight-line distance)
 * Kept as fallback when Google Maps API fails
 */
export const haversineDistance = (
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Calculate distance using Google Maps Routes API (real road distance)
 * Falls back to Haversine if API fails
 */
export async function getDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ distanceKm: number; durationMinutes: number }> {
  // Try Google Maps Routes API first
  const routeResult = await calculateRouteDistance(originLat, originLng, destLat, destLng);
  if (routeResult) {
    return {
      distanceKm: routeResult.distanceKm,
      durationMinutes: routeResult.durationMinutes,
    };
  }

  // Fallback to Haversine distance
  console.warn('[Distance] Using Haversine distance as fallback');
  const haversineKm = haversineDistance(originLat, originLng, destLat, destLng);
  return {
    distanceKm: Math.round(haversineKm * 100) / 100,
    durationMinutes: Math.ceil(10 + haversineKm * 5),
  };
}

export interface DeliveryPricing {
  deliveryBaseFee: number;
  deliveryPerKmRate: number;
  deliveryMaxFee: number;
}

/**
 * Legacy delivery fee calculation (simple distance-based)
 * This will be replaced by the new pricing engine
 */
export const calcDeliveryFee = (distanceKm: number, pricing?: Partial<DeliveryPricing>): number => {
  const base = pricing?.deliveryBaseFee ?? parseFloat(process.env.DELIVERY_BASE_FEE || '1500');
  const perKm = pricing?.deliveryPerKmRate ?? parseFloat(process.env.DELIVERY_PER_KM_RATE || '100');
  const max = pricing?.deliveryMaxFee ?? parseFloat(process.env.DELIVERY_MAX_FEE || '999999');
  return Math.min(Math.ceil(base + distanceKm * perKm), max);
};

export const estimateDeliveryMinutes = (distanceKm: number): number =>
  Math.ceil(10 + distanceKm * 5);
