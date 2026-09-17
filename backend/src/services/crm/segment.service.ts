// Segment rule engine. Admins build audiences from a small whitelist of fields; rules are
// validated here and compiled to a Prisma `where` — client input never reaches SQL directly.
import { CommissionTier, OrderStatus, Prisma, VendorCategory } from '@prisma/client';
import prisma from '../../config/db';
import { CrmRole, LifecycleStage } from './health.service';
import { lifecycleWhere } from './profile.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_CONDITIONS = 12;

export type Op = 'withinDays' | 'olderThanDays' | 'in' | 'has' | 'notHas' | 'is' | 'gte' | 'lte';

export interface Condition { field: string; op: Op; value: unknown }
export interface SegmentRules { match: 'all' | 'any'; conditions: Condition[] }

type ValueKind = 'days' | 'number' | 'strings' | 'string' | 'boolean';

interface FieldDef {
  label: string;
  roles: CrmRole[];
  ops: Op[];
  kind: ValueKind;
  /** Allowed values for `strings` / `string` kinds (case-sensitive enums). */
  options?: readonly string[];
}

const ALL: CrmRole[] = ['CUSTOMER', 'VENDOR', 'RIDER'];
const STAGES: LifecycleStage[] = ['NEW', 'ACTIVE', 'AT_RISK', 'CHURNED'];

export const SEGMENT_FIELDS: Record<string, FieldDef> = {
  signupDays:     { label: 'Signed up', roles: ALL, ops: ['withinDays', 'olderThanDays'], kind: 'days' },
  lastOrderDays:  { label: 'Last order / delivery', roles: ALL, ops: ['withinDays', 'olderThanDays'], kind: 'days' },
  orderCount:     { label: 'Completed orders / deliveries', roles: ALL, ops: ['gte', 'lte'], kind: 'number' },
  stage:          { label: 'Lifecycle stage', roles: ALL, ops: ['in'], kind: 'strings', options: STAGES },
  city:           { label: 'City', roles: ALL, ops: ['in'], kind: 'strings' },
  tag:            { label: 'Tag', roles: ALL, ops: ['has', 'notHas'], kind: 'string' },
  emailVerified:  { label: 'Email verified', roles: ALL, ops: ['is'], kind: 'boolean' },
  hasPushDevice:  { label: 'Has the app with push enabled', roles: ALL, ops: ['is'], kind: 'boolean' },
  totalSpent:     { label: 'Lifetime spend (₦)', roles: ['CUSTOMER'], ops: ['gte', 'lte'], kind: 'number' },
  storeCredit:    { label: 'Store credit balance (₦)', roles: ['CUSTOMER'], ops: ['gte', 'lte'], kind: 'number' },
  vendorCategory: { label: 'Vendor category', roles: ['VENDOR'], ops: ['in'], kind: 'strings', options: Object.values(VendorCategory) },
  vendorTier:     { label: 'Commission plan', roles: ['VENDOR'], ops: ['is'], kind: 'string', options: Object.values(CommissionTier) },
  approvalStatus: { label: 'Approval status', roles: ['VENDOR', 'RIDER'], ops: ['is'], kind: 'string', options: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] },
  riderOnline:    { label: 'Rider online now', roles: ['RIDER'], ops: ['is'], kind: 'boolean' },
};

export class SegmentRuleError extends Error {}

/** Validates untrusted rules for a role and returns a normalized copy. Throws SegmentRuleError. */
export const validateRules = (role: CrmRole, raw: unknown): SegmentRules => {
  if (!raw || typeof raw !== 'object') throw new SegmentRuleError('Rules are required.');
  const { match, conditions } = raw as { match?: unknown; conditions?: unknown };
  if (match !== 'all' && match !== 'any') throw new SegmentRuleError('Match must be "all" or "any".');
  if (!Array.isArray(conditions)) throw new SegmentRuleError('Conditions must be a list.');
  if (conditions.length > MAX_CONDITIONS) throw new SegmentRuleError(`Use at most ${MAX_CONDITIONS} conditions.`);

  const normalized = conditions.map((c, i): Condition => {
    const where = `Condition ${i + 1}`;
    if (!c || typeof c !== 'object') throw new SegmentRuleError(`${where} is invalid.`);
    const { field, op, value } = c as { field?: unknown; op?: unknown; value?: unknown };
    const def = typeof field === 'string' ? SEGMENT_FIELDS[field] : undefined;
    if (!def) throw new SegmentRuleError(`${where}: unknown field.`);
    if (!def.roles.includes(role)) throw new SegmentRuleError(`${where}: "${def.label}" doesn't apply to this audience.`);
    if (!def.ops.includes(op as Op)) throw new SegmentRuleError(`${where}: invalid operator for "${def.label}".`);

    switch (def.kind) {
      case 'days':
      case 'number': {
        const n = Number(value);
        const max = def.kind === 'days' ? 3650 : 1e9;
        if (!Number.isFinite(n) || n < 0 || n > max || (def.kind === 'days' && !Number.isInteger(n))) {
          throw new SegmentRuleError(`${where}: "${def.label}" needs a number between 0 and ${max}.`);
        }
        return { field: field as string, op: op as Op, value: n };
      }
      case 'boolean':
        if (typeof value !== 'boolean') throw new SegmentRuleError(`${where}: "${def.label}" must be yes or no.`);
        return { field: field as string, op: op as Op, value };
      case 'string': {
        if (typeof value !== 'string' || !value.trim()) throw new SegmentRuleError(`${where}: choose a value for "${def.label}".`);
        if (def.options && !def.options.includes(value)) throw new SegmentRuleError(`${where}: invalid value for "${def.label}".`);
        return { field: field as string, op: op as Op, value: value.trim() };
      }
      case 'strings': {
        const list = Array.isArray(value) ? value : [];
        const clean = [...new Set(list.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))];
        if (clean.length === 0 || clean.length > 50) throw new SegmentRuleError(`${where}: choose 1–50 values for "${def.label}".`);
        if (def.options && clean.some(v => !def.options!.includes(v))) throw new SegmentRuleError(`${where}: invalid value for "${def.label}".`);
        return { field: field as string, op: op as Op, value: clean };
      }
    }
  });

  return { match, conditions: normalized };
};

/** Order-aggregate lookups the compiler needs; injected so compilation is testable without a DB. */
export interface AggregateLookup {
  /** Role-profile ids (customer/vendor/rider id) whose completed order count is > or >= n. */
  profileIdsByOrderCount(role: CrmRole, cmp: 'gt' | 'gte', n: number): Promise<string[]>;
  /** Customer ids whose delivered-order spend is > or >= n. */
  customerIdsBySpend(cmp: 'gt' | 'gte', n: number): Promise<string[]>;
}

/** Order-count and spend conditions count delivered orders only. */
const completedOrder: Prisma.OrderWhereInput = { status: OrderStatus.DELIVERED };

const activityOrder = (role: CrmRole, since?: Date): Prisma.OrderWhereInput => ({
  status: role === 'RIDER' ? OrderStatus.DELIVERED : { not: OrderStatus.CANCELLED },
  ...(since ? { createdAt: { gte: since } } : {}),
});

const ordersOf = (role: CrmRole, filter: Prisma.OrderListRelationFilter): Prisma.UserWhereInput => {
  if (role === 'CUSTOMER') return { customer: { orders: filter } };
  if (role === 'VENDOR') return { vendor: { orders: filter } };
  return { rider: { deliveries: filter } };
};

const profileIdIn = (role: CrmRole, ids: string[], negate: boolean): Prisma.UserWhereInput => {
  const idFilter = negate ? { id: { notIn: ids } } : { id: { in: ids } };
  if (role === 'CUSTOMER') return { customer: idFilter };
  if (role === 'VENDOR') return { vendor: idFilter };
  return { rider: idFilter };
};

const cityWhere = (role: CrmRole, cities: string[]): Prisma.UserWhereInput => {
  const anyCity = cities.map(c => ({ city: { equals: c, mode: 'insensitive' as const } }));
  if (role === 'CUSTOMER') return { customer: { addresses: { some: { OR: anyCity } } } };
  if (role === 'VENDOR') return { vendor: { OR: anyCity } };
  return { rider: { OR: anyCity } };
};

const compileCondition = async (
  role: CrmRole, c: Condition, lookup: AggregateLookup, now: Date,
): Promise<Prisma.UserWhereInput> => {
  const days = (n: number) => new Date(now.getTime() - n * DAY_MS);

  switch (c.field) {
    case 'signupDays':
      return c.op === 'withinDays'
        ? { createdAt: { gte: days(c.value as number) } }
        : { createdAt: { lt: days(c.value as number) } };

    case 'lastOrderDays': {
      const since = days(c.value as number);
      return c.op === 'withinDays'
        ? ordersOf(role, { some: activityOrder(role, since) })
        : { AND: [ordersOf(role, { some: activityOrder(role) }), ordersOf(role, { none: activityOrder(role, since) })] };
    }

    case 'orderCount': {
      const n = c.value as number;
      if (c.op === 'gte') {
        if (n <= 0) return {};
        return profileIdIn(role, await lookup.profileIdsByOrderCount(role, 'gte', n), false);
      }
      return profileIdIn(role, await lookup.profileIdsByOrderCount(role, 'gt', n), true);
    }

    case 'totalSpent': {
      const n = c.value as number;
      if (c.op === 'gte') {
        if (n <= 0) return {};
        return { customer: { id: { in: await lookup.customerIdsBySpend('gte', n) } } };
      }
      return { customer: { id: { notIn: await lookup.customerIdsBySpend('gt', n) } } };
    }

    case 'storeCredit':
      return { storeCreditBalance: c.op === 'gte' ? { gte: c.value as number } : { lte: c.value as number } };

    case 'stage':
      return { OR: (c.value as LifecycleStage[]).map(s => lifecycleWhere(role, s, now)) };

    case 'city':
      return cityWhere(role, c.value as string[]);

    case 'tag':
      return c.op === 'has'
        ? { crmTags: { some: { tagId: c.value as string } } }
        : { crmTags: { none: { tagId: c.value as string } } };

    case 'emailVerified':
      return { isEmailVerified: c.value as boolean };

    case 'hasPushDevice':
      return c.value ? { pushToken: { not: null } } : { pushToken: null };

    case 'vendorCategory':
      return { vendor: { category: { in: c.value as VendorCategory[] } } };

    case 'vendorTier':
      return { vendor: { commissionTier: c.value as CommissionTier } };

    case 'approvalStatus':
      return role === 'VENDOR'
        ? { vendor: { approvalStatus: c.value as never } }
        : { rider: { approvalStatus: c.value as never } };

    case 'riderOnline':
      return { rider: { isOnline: c.value as boolean } };

    default:
      throw new SegmentRuleError(`Unknown field "${c.field}".`);
  }
};

/** Everyone a campaign could ever reach for a role: live, active, non-admin accounts. */
export const audienceBase = (role: CrmRole): Prisma.UserWhereInput => ({ role, deletedAt: null, isActive: true });

export const compileSegment = async (
  role: CrmRole,
  rules: SegmentRules,
  lookup: AggregateLookup = prismaLookup,
  now = new Date(),
): Promise<Prisma.UserWhereInput> => {
  const parts = await Promise.all(rules.conditions.map(c => compileCondition(role, c, lookup, now)));
  const base = audienceBase(role);
  if (parts.length === 0) return base;
  return { AND: [base, rules.match === 'all' ? { AND: parts } : { OR: parts }] };
};

// ─── DB-backed aggregate lookup ──────────────────────────────────────────────

export const prismaLookup: AggregateLookup = {
  async profileIdsByOrderCount(role, cmp, n) {
    const having = { id: { _count: { [cmp]: n } } };
    if (role === 'CUSTOMER') {
      const rows = await prisma.order.groupBy({ by: ['customerId'], where: completedOrder, having });
      return rows.map(r => r.customerId);
    }
    if (role === 'VENDOR') {
      const rows = await prisma.order.groupBy({ by: ['vendorId'], where: completedOrder, having });
      return rows.map(r => r.vendorId);
    }
    const rows = await prisma.order.groupBy({ by: ['riderId'], where: { ...completedOrder, riderId: { not: null } }, having });
    return rows.flatMap(r => (r.riderId ? [r.riderId] : []));
  },
  async customerIdsBySpend(cmp, n) {
    const rows = await prisma.order.groupBy({
      by: ['customerId'],
      where: { status: OrderStatus.DELIVERED },
      having: { totalAmount: { _sum: { [cmp]: n } } },
    });
    return rows.map(r => r.customerId);
  },
};

// ─── Preview ─────────────────────────────────────────────────────────────────

export const previewAudience = async (role: CrmRole, rules: SegmentRules) => {
  const where = await compileSegment(role, rules);
  const reachable: Prisma.UserWhereInput = { AND: [where, { marketingOptIn: true }] };
  const [matched, optedIn, withPhone, withPush, sample] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: reachable }),
    prisma.user.count({ where: { AND: [reachable, { phone: { not: null } }] } }),
    prisma.user.count({ where: { AND: [reachable, { pushToken: { not: null } }] } }),
    prisma.user.findMany({
      where: reachable, take: 20, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, vendor: { select: { businessName: true } } },
    }),
  ]);
  return {
    matched,
    optedIn,
    reach: { PUSH: optedIn, EMAIL: optedIn, SMS: withPhone },
    withPushDevice: withPush,
    sample: sample.map(u => ({ id: u.id, name: u.vendor?.businessName ?? u.name, email: u.email })),
  };
};
