import { OrderStatus } from '@prisma/client';

// Pure decision rules for admin/agent order actions. Kept free of DB and service imports so
// they can be unit-tested directly and reused by the future ops agents without side effects.

/** Statuses an admin may cancel from. DELIVERED and CANCELLED are terminal. */
export const ADMIN_CANCELLABLE: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
];

export const canAdminCancel = (status: OrderStatus): boolean => ADMIN_CANCELLABLE.includes(status);

/** Statuses in which an order counts as a rider's current delivery. */
export const ACTIVE_DELIVERY_STATUSES: OrderStatus[] = [
  OrderStatus.READY,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
];

/** A rider can only be (re)assigned while the food is waiting at the vendor. */
export const canAssignRider = (status: OrderStatus): boolean => status === OrderStatus.READY;

/** Per-order goodwill ceiling for OPERATIONS_ADMIN; SUPER_ADMIN is bounded by the order total. */
export const GOODWILL_CREDIT_CAP = Number(process.env.GOODWILL_CREDIT_CAP) > 0
  ? Number(process.env.GOODWILL_CREDIT_CAP)
  : 2000;

/**
 * Returns an error message if this goodwill credit isn't allowed, or null if it is.
 * `alreadyIssued` is goodwill previously issued on the same order (refunds don't count).
 */
export function checkGoodwillCredit(input: {
  amount: number;
  alreadyIssued: number;
  orderTotal: number;
  isSuperAdmin: boolean;
  cap?: number;
}): string | null {
  const { amount, alreadyIssued, orderTotal, isSuperAdmin } = input;
  const cap = input.cap ?? GOODWILL_CREDIT_CAP;

  if (!Number.isFinite(amount) || amount <= 0) return 'Credit amount must be greater than zero.';
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return 'Credit amount can have at most 2 decimal places.';

  const limit = isSuperAdmin ? orderTotal : Math.min(cap, orderTotal);
  const remaining = Math.max(0, limit - alreadyIssued);
  if (amount > remaining) {
    return remaining === 0
      ? `The goodwill limit for this order (₦${limit.toLocaleString()}) has already been used.`
      : `You can issue at most ₦${remaining.toLocaleString()} more on this order.`;
  }
  return null;
}

export interface CandidateRider {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Orders riders nearest-first to the vendor. Riders without a known location go last
 * (they're still assignable — an admin may know where they are).
 */
export function rankRidersByDistance<T extends CandidateRider>(
  riders: T[],
  vendor: { latitude: number | null; longitude: number | null },
  distanceFn: (lat1: number, lng1: number, lat2: number, lng2: number) => number,
): Array<T & { distanceKm: number | null }> {
  return riders
    .map((r) => ({
      ...r,
      distanceKm:
        r.latitude != null && r.longitude != null && vendor.latitude != null && vendor.longitude != null
          ? Math.round(distanceFn(vendor.latitude, vendor.longitude, r.latitude, r.longitude) * 10) / 10
          : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}
