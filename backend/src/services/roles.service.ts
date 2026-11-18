import { ApprovalStatus, Prisma, Role } from '@prisma/client';
import prisma from '../config/db';
import { RIDER_APPROVAL_SELECT, effectiveRiderApproval } from './fleet.service';

/**
 * Multi-role accounts. One User can act as a customer, a vendor and a rider.
 *
 * Roles are derived from the profile tables (Customer / Vendor / Rider), so approval status
 * lives in one place. `User.role` stays as the account's primary role (what it signed up as);
 * the access token's `role` claim is the *active* role, which is what every route guard reads.
 * Staff roles (admins, SMOIS, logistics companies) are single-role and cannot switch.
 */

export const SWITCHABLE_ROLES: Role[] = [Role.CUSTOMER, Role.VENDOR, Role.RIDER];

export type RoleState = 'ACTIVE_ELIGIBLE' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'NOT_REGISTERED';

export interface RoleStatus {
  role: Role;
  /** NOT_REGISTERED = no profile yet; otherwise the profile's approval status. */
  status: 'NOT_REGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | string;
  /** True when the user may switch into this role right now. */
  canSwitch: boolean;
}

export const isSwitchableAccount = (primary: Role): boolean => SWITCHABLE_ROLES.includes(primary);

/** Every role the account holds, with its standing. Customer is always available. */
export const getRoleStatuses = async (userId: string, primary: Role): Promise<RoleStatus[]> => {
  if (!isSwitchableAccount(primary)) {
    return [{ role: primary, status: 'APPROVED', canSwitch: false }];
  }

  const [vendor, rider] = await Promise.all([
    prisma.vendor.findFirst({
      where: { OR: [{ userId, parentVendorId: null }, { managerUserId: userId }] },
      select: { approvalStatus: true },
    }),
    prisma.rider.findUnique({ where: { userId }, select: RIDER_APPROVAL_SELECT }),
  ]);

  const vendorStatus = vendor?.approvalStatus ?? 'NOT_REGISTERED';
  const riderStatus = rider ? effectiveRiderApproval(rider) : 'NOT_REGISTERED';

  // A pending vendor/rider still gets its dashboard (approval-gate removal), gated server-side,
  // so switching is allowed for anything that is registered and not rejected/suspended.
  const usable = (s: string) => s !== 'NOT_REGISTERED' && s !== 'REJECTED' && s !== 'SUSPENDED';

  return [
    { role: Role.CUSTOMER, status: 'APPROVED', canSwitch: true },
    { role: Role.VENDOR, status: vendorStatus, canSwitch: usable(vendorStatus) },
    { role: Role.RIDER, status: riderStatus, canSwitch: usable(riderStatus) },
  ];
};

/** Can this user act as `role` right now? Primary role is always allowed. */
export const canActAs = async (userId: string, primary: Role, role: Role): Promise<boolean> => {
  if (role === primary) return true;
  if (!isSwitchableAccount(primary) || !SWITCHABLE_ROLES.includes(role)) return false;
  const statuses = await getRoleStatuses(userId, primary);
  return statuses.find((s) => s.role === role)?.canSwitch ?? false;
};

/**
 * Does this user still hold a live role besides `deleting`? Used so an admin deleting one role
 * doesn't wipe the whole account. Live = a non-rejected, non-suspended vendor or rider profile,
 * or a customer profile with order history. An empty customer row (created lazily when a
 * vendor/rider switches to customer mode) does not count.
 */
export const holdsOtherLiveRole = async (
  tx: Prisma.TransactionClient,
  userId: string,
  deleting: 'CUSTOMER' | 'VENDOR' | 'RIDER',
): Promise<boolean> => {
  const live = { notIn: ['SUSPENDED', 'REJECTED'] as ApprovalStatus[] };
  if (deleting !== 'VENDOR') {
    if (await tx.vendor.findFirst({ where: { userId, parentVendorId: null, approvalStatus: live }, select: { id: true } })) return true;
  }
  if (deleting !== 'RIDER') {
    if (await tx.rider.findFirst({ where: { userId, approvalStatus: live }, select: { id: true } })) return true;
  }
  if (deleting !== 'CUSTOMER') {
    const customer = await tx.customer.findUnique({ where: { userId }, select: { id: true } });
    if (customer && (await tx.order.count({ where: { customerId: customer.id } })) > 0) return true;
  }
  return false;
};

/**
 * A "real" customer: signed up as one, or has placed an order. A vendor/rider who only switched to
 * customer mode gets an empty Customer row, which must not show up as a customer in admin lists
 * or inflate customer analytics.
 */
export const REAL_CUSTOMER: Prisma.CustomerWhereInput = {
  OR: [{ user: { role: Role.CUSTOMER } }, { orders: { some: {} } }],
};

/** Select these on a User to describe the roles it holds besides the one being viewed. */
export const OTHER_ROLES_SELECT = {
  role: true,
  customer: { select: { id: true, _count: { select: { orders: true } } } },
  rider: { select: { approvalStatus: true } },
  vendors: { where: { parentVendorId: null }, select: { approvalStatus: true }, take: 1 },
} satisfies Prisma.UserSelect;

type OtherRolesUser = {
  role: Role;
  customer: { _count: { orders: number } } | null;
  rider: { approvalStatus: string } | null;
  vendors: { approvalStatus: string }[];
};

/** The account's other roles (never the one being viewed), with their approval standing. */
export const summarizeOtherRoles = (
  user: OtherRolesUser,
  viewing: 'CUSTOMER' | 'VENDOR' | 'RIDER',
): { role: 'CUSTOMER' | 'VENDOR' | 'RIDER'; status: string }[] => {
  const out: { role: 'CUSTOMER' | 'VENDOR' | 'RIDER'; status: string }[] = [];
  if (viewing !== 'CUSTOMER' && user.customer && (user.role === Role.CUSTOMER || user.customer._count.orders > 0)) {
    out.push({ role: 'CUSTOMER', status: 'ACTIVE' });
  }
  if (viewing !== 'VENDOR' && user.vendors[0]) out.push({ role: 'VENDOR', status: user.vendors[0].approvalStatus });
  if (viewing !== 'RIDER' && user.rider) out.push({ role: 'RIDER', status: user.rider.approvalStatus });
  return out;
};

/**
 * The role a sign-in should open: the one the person last used, if they still qualify for it,
 * otherwise the account's primary role. Never throws; any doubt falls back to the primary role.
 */
export const resolveLoginRole = async (user: { id: string; role: Role; lastActiveRole: Role | null }): Promise<Role> => {
  const last = user.lastActiveRole;
  if (!last || last === user.role) return user.role;
  try {
    return (await canActAs(user.id, user.role, last)) ? last : user.role;
  } catch {
    return user.role;
  }
};

/** Make sure a Customer profile exists so non-customer accounts can order. */
export const ensureCustomerProfile = async (userId: string): Promise<void> => {
  await prisma.customer.upsert({ where: { userId }, update: {}, create: { userId } });
};
