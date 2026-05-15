const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

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

export interface DeliveryPricing {
  deliveryBaseFee: number;
  deliveryPerKmRate: number;
  deliveryMaxFee: number;
}

export const calcDeliveryFee = (distanceKm: number, pricing?: Partial<DeliveryPricing>): number => {
  const base = pricing?.deliveryBaseFee ?? parseFloat(process.env.DELIVERY_BASE_FEE || '500');
  const perKm = pricing?.deliveryPerKmRate ?? parseFloat(process.env.DELIVERY_PER_KM_RATE || '100');
  const max = pricing?.deliveryMaxFee ?? parseFloat(process.env.DELIVERY_MAX_FEE || '3000');
  return Math.min(Math.ceil(base + distanceKm * perKm), max);
};

export const estimateDeliveryMinutes = (distanceKm: number): number =>
  Math.ceil(10 + distanceKm * 5);
