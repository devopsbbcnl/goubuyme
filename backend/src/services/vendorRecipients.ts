import prisma from '../config/db';

export interface VendorContact {
  userId: string;
  phone: string | null;
  email: string | null;
  /** True for a branch manager's own login, false for the owner. */
  isManager: boolean;
}

interface Person {
  id: string;
  phone: string | null;
  email: string | null;
  isActive?: boolean;
}

interface VendorForContacts {
  notifyOwnerOfOrders: boolean;
  user: Person;
  manager: Person | null;
}

/**
 * Who hears about a location's orders. Pure so the rules can be tested without a database.
 *
 * - A location with no manager (every main business, and branches the owner runs themselves)
 *   notifies the owner.
 * - A branch with an active manager notifies the manager, on the manager's own devices. The owner
 *   is added as well unless they switched `notifyOwnerOfOrders` off for that branch.
 * - A branch whose manager login was disabled falls back to the owner, so orders are never left
 *   with nobody to see them.
 */
export function pickVendorContacts(vendor: VendorForContacts): VendorContact[] {
  const owner: VendorContact = {
    userId: vendor.user.id, phone: vendor.user.phone, email: vendor.user.email, isManager: false,
  };
  const manager = vendor.manager && vendor.manager.isActive !== false
    ? { userId: vendor.manager.id, phone: vendor.manager.phone, email: vendor.manager.email, isManager: true }
    : null;

  if (!manager) return [owner];
  return vendor.notifyOwnerOfOrders ? [manager, owner] : [manager];
}

/** Loads a location and returns the people to notify about its orders. */
export async function vendorOrderContacts(vendorId: string): Promise<VendorContact[]> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      notifyOwnerOfOrders: true,
      user: { select: { id: true, phone: true, email: true } },
      manager: { select: { id: true, phone: true, email: true, isActive: true } },
    },
  });
  if (!vendor) return [];
  return pickVendorContacts(vendor);
}
