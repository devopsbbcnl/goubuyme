/**
 * The backend has more order statuses than the vendor screens draw. A card order becomes CONFIRMED
 * the moment it is paid (that is what a vendor first sees as a "New Order"), and a rider on the road
 * is IN_TRANSIT. Fold both onto the statuses the vendor screens know so a lookup never comes back
 * undefined (that crashed the Orders tab with "Cannot read property 'bg' of undefined").
 */
export function normalizeVendorOrderStatus(status: string): string {
  if (status === 'CONFIRMED') return 'PENDING';
  if (status === 'IN_TRANSIT') return 'PICKED_UP';
  return status;
}
