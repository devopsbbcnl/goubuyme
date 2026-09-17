import { OrderStatus, Prisma } from '@prisma/client';
import prisma from '../../config/db';
import {
  CrmRole, LifecycleStage, customerHealth, lifecycleCutoffs, lifecycleStage, riderHealth, vendorHealth,
} from './health.service';

export const CRM_ROLES: CrmRole[] = ['CUSTOMER', 'VENDOR', 'RIDER'];
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Directory ────────────────────────────────────────────────────────────────

/** Orders that count toward "recent activity" for each role. */
const activityOrderFilter = (role: CrmRole, since?: Date): Prisma.OrderWhereInput => ({
  status: role === 'RIDER' ? OrderStatus.DELIVERED : { not: OrderStatus.CANCELLED },
  ...(since ? { createdAt: { gte: since } } : {}),
});

/** Wraps an order-list filter in the right relation path for a role. */
const ordersRelation = (role: CrmRole, filter: Prisma.OrderListRelationFilter): Prisma.UserWhereInput => {
  if (role === 'CUSTOMER') return { role, customer: { orders: filter } };
  if (role === 'VENDOR') return { role, vendor: { orders: filter } };
  return { role, rider: { deliveries: filter } };
};

/** Prisma filter equivalent of lifecycleStage(), so the directory can filter by stage. */
export const lifecycleWhere = (role: CrmRole, stage: LifecycleStage, now = new Date()): Prisma.UserWhereInput => {
  const { activeSince, atRiskSince } = lifecycleCutoffs(role, now);
  const any = activityOrderFilter(role);
  switch (stage) {
    case 'NEW':
      return ordersRelation(role, { none: any });
    case 'ACTIVE':
      return ordersRelation(role, { some: activityOrderFilter(role, activeSince) });
    case 'AT_RISK':
      return {
        AND: [
          ordersRelation(role, { some: activityOrderFilter(role, atRiskSince) }),
          ordersRelation(role, { none: activityOrderFilter(role, activeSince) }),
        ],
      };
    case 'CHURNED':
      return {
        AND: [
          ordersRelation(role, { some: any }),
          ordersRelation(role, { none: activityOrderFilter(role, atRiskSince) }),
        ],
      };
  }
};

export interface DirectoryQuery {
  role?: CrmRole;
  search?: string;
  tagId?: string;
  stage?: LifecycleStage;
  isActive?: boolean;
  page: number;
  limit: number;
}

export const listProfiles = async (q: DirectoryQuery) => {
  const roles = q.role ? [q.role] : CRM_ROLES;
  const and: Prisma.UserWhereInput[] = [{ deletedAt: null, role: { in: roles } }];

  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search, mode: 'insensitive' } },
        { vendor: { businessName: { contains: q.search, mode: 'insensitive' } } },
      ],
    });
  }
  if (q.tagId) and.push({ crmTags: { some: { tagId: q.tagId } } });
  if (q.isActive !== undefined) and.push({ isActive: q.isActive });
  if (q.stage) {
    const stage = q.stage;
    and.push({ OR: roles.map(r => lifecycleWhere(r, stage)) });
  }

  const where: Prisma.UserWhereInput = { AND: and };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, role: true, avatar: true,
        isActive: true, createdAt: true,
        customer: { select: { id: true } },
        vendor: { select: { id: true, businessName: true, approvalStatus: true } },
        rider: { select: { id: true, approvalStatus: true } },
        crmTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.user.count({ where }),
  ]);

  // Last activity + order counts for just this page, one grouped query per role.
  const customerIds = users.flatMap(u => (u.customer ? [u.customer.id] : []));
  const vendorIds = users.flatMap(u => (u.vendor ? [u.vendor.id] : []));
  const riderIds = users.flatMap(u => (u.rider ? [u.rider.id] : []));

  const [byCustomer, byVendor, byRider] = await Promise.all([
    customerIds.length
      ? prisma.order.groupBy({
          by: ['customerId'], where: { customerId: { in: customerIds }, ...activityOrderFilter('CUSTOMER') },
          _max: { createdAt: true }, _count: { _all: true },
        })
      : [],
    vendorIds.length
      ? prisma.order.groupBy({
          by: ['vendorId'], where: { vendorId: { in: vendorIds }, ...activityOrderFilter('VENDOR') },
          _max: { createdAt: true }, _count: { _all: true },
        })
      : [],
    riderIds.length
      ? prisma.order.groupBy({
          by: ['riderId'], where: { riderId: { in: riderIds }, ...activityOrderFilter('RIDER') },
          _max: { createdAt: true }, _count: { _all: true },
        })
      : [],
  ]);

  const stats = new Map<string, { last: Date | null; count: number }>();
  byCustomer.forEach(r => stats.set(r.customerId, { last: r._max.createdAt, count: r._count._all }));
  byVendor.forEach(r => stats.set(r.vendorId, { last: r._max.createdAt, count: r._count._all }));
  byRider.forEach(r => r.riderId && stats.set(r.riderId, { last: r._max.createdAt, count: r._count._all }));

  const data = users.map(u => {
    const role = u.role as CrmRole;
    const profileId = u.customer?.id ?? u.vendor?.id ?? u.rider?.id ?? null;
    const s = (profileId && stats.get(profileId)) || { last: null, count: 0 };
    return {
      id: u.id,
      name: u.name,
      displayName: u.vendor?.businessName ?? u.name,
      email: u.email,
      phone: u.phone,
      role,
      avatar: u.avatar,
      isActive: u.isActive,
      approvalStatus: u.vendor?.approvalStatus ?? u.rider?.approvalStatus ?? null,
      createdAt: u.createdAt,
      orderCount: s.count,
      lastActivityAt: s.last,
      stage: lifecycleStage(role, s.last),
      tags: u.crmTags.map(t => t.tag),
    };
  });

  return { data, total };
};

// ─── 360° profile ─────────────────────────────────────────────────────────────

const recentOrderSelect = {
  id: true, orderNumber: true, status: true, totalAmount: true, paymentStatus: true, createdAt: true,
  vendor: { select: { businessName: true } },
  customer: { select: { user: { select: { name: true } } } },
} satisfies Prisma.OrderSelect;

type RecentOrder = Prisma.OrderGetPayload<{ select: typeof recentOrderSelect }>;

const shapeOrder = (o: RecentOrder) => ({
  id: o.id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
  totalAmount: o.totalAmount, createdAt: o.createdAt,
  vendorName: o.vendor.businessName, customerName: o.customer.user.name,
});

const customerSection = async (customerId: string) => {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const [statusCounts, delivered, last, topVendors, addresses, recent] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], where: { customerId }, _count: { _all: true } }),
    prisma.order.aggregate({
      where: { customerId, status: OrderStatus.DELIVERED },
      _sum: { totalAmount: true }, _avg: { totalAmount: true }, _count: { _all: true },
    }),
    prisma.order.findFirst({
      where: { customerId, status: { not: OrderStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    }),
    prisma.order.groupBy({
      by: ['vendorId'], where: { customerId, status: OrderStatus.DELIVERED },
      _count: { _all: true }, orderBy: { _count: { vendorId: 'desc' } }, take: 3,
    }),
    prisma.address.findMany({
      where: { customerId }, orderBy: { isDefault: 'desc' },
      select: { id: true, label: true, address: true, city: true, state: true, isDefault: true },
    }),
    prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 10, select: recentOrderSelect }),
  ]);

  const vendorNames = await prisma.vendor.findMany({
    where: { id: { in: topVendors.map(v => v.vendorId) } }, select: { id: true, businessName: true },
  });
  const nameById = new Map(vendorNames.map(v => [v.id, v.businessName]));
  const countFor = (s: OrderStatus) => statusCounts.find(c => c.status === s)?._count._all ?? 0;
  const totalOrders = statusCounts.reduce((sum, c) => sum + c._count._all, 0);

  return {
    since30,
    lastOrderAt: last?.createdAt ?? null,
    completedOrders: delivered._count._all,
    cancelledOrders: countFor(OrderStatus.CANCELLED),
    data: {
      totalOrders,
      completedOrders: delivered._count._all,
      cancelledOrders: countFor(OrderStatus.CANCELLED),
      lifetimeValue: delivered._sum.totalAmount ?? 0,
      averageOrderValue: Math.round(delivered._avg.totalAmount ?? 0),
      lastOrderAt: last?.createdAt ?? null,
      favoriteVendors: topVendors.map(v => ({
        vendorId: v.vendorId, name: nameById.get(v.vendorId) ?? 'Unknown', orders: v._count._all,
      })),
      addresses,
      recentOrders: recent.map(shapeOrder),
    },
  };
};

const vendorSection = async (vendorId: string) => {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS);
  const since60 = new Date(now - 60 * DAY_MS);

  const [vendor, gmv, last30, prev30, cancelled30, incidents30, last, payouts, recent] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      select: {
        id: true, businessName: true, slug: true, logo: true, category: true, city: true, state: true,
        approvalStatus: true, commissionTier: true, verificationBadge: true, isOpen: true,
        rating: true, totalRatings: true, isFeatured: true, createdAt: true,
        document: { select: { status: true } },
        licenses: { select: { id: true, status: true } },
        planChanges: {
          orderBy: { createdAt: 'desc' }, take: 5,
          select: { id: true, fromTier: true, toTier: true, createdAt: true },
        },
      },
    }),
    prisma.order.aggregate({ where: { vendorId, status: OrderStatus.DELIVERED }, _sum: { subtotal: true }, _count: { _all: true } }),
    prisma.order.count({ where: { vendorId, createdAt: { gte: since30 } } }),
    prisma.order.count({ where: { vendorId, createdAt: { gte: since60, lt: since30 } } }),
    prisma.order.count({ where: { vendorId, createdAt: { gte: since30 }, status: OrderStatus.CANCELLED } }),
    prisma.vendorIncident.count({ where: { vendorId, createdAt: { gte: since30 } } }),
    prisma.order.findFirst({
      where: { vendorId, status: { not: OrderStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    }),
    prisma.vendorPayout.groupBy({ by: ['payoutStatus'], where: { vendorId }, _sum: { netAmount: true } }),
    prisma.order.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, take: 10, select: recentOrderSelect }),
  ]);

  return {
    healthInput: {
      lastOrderAt: last?.createdAt ?? null,
      ordersLast30: last30,
      ordersPrev30: prev30,
      cancelledLast30: cancelled30,
      incidentsLast30: incidents30,
      rating: vendor.rating,
      totalRatings: vendor.totalRatings,
    },
    data: {
      ...vendor,
      grossMerchandiseValue: gmv._sum.subtotal ?? 0,
      completedOrders: gmv._count._all,
      ordersLast30: last30,
      ordersPrev30: prev30,
      cancelledLast30: cancelled30,
      incidentsLast30: incidents30,
      lastOrderAt: last?.createdAt ?? null,
      payouts: Object.fromEntries(payouts.map(p => [p.payoutStatus, p._sum.netAmount ?? 0])),
      recentOrders: recent.map(shapeOrder),
    },
  };
};

const riderSection = async (riderId: string) => {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const [rider, deliveredTotal, delivered30, last, earnings, recent] = await Promise.all([
    prisma.rider.findUniqueOrThrow({
      where: { id: riderId },
      select: {
        id: true, vehicleType: true, plateNumber: true, isOnline: true, isAvailable: true,
        approvalStatus: true, rating: true, totalRatings: true, city: true, state: true, createdAt: true,
        document: { select: { status: true } },
      },
    }),
    prisma.order.count({ where: { riderId, status: OrderStatus.DELIVERED } }),
    prisma.order.count({ where: { riderId, status: OrderStatus.DELIVERED, createdAt: { gte: since30 } } }),
    prisma.order.findFirst({
      where: { riderId, status: OrderStatus.DELIVERED }, orderBy: { createdAt: 'desc' }, select: { createdAt: true },
    }),
    prisma.earning.groupBy({ by: ['payoutStatus'], where: { riderId }, _sum: { netAmount: true } }),
    prisma.order.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' }, take: 10, select: recentOrderSelect }),
  ]);

  return {
    healthInput: {
      lastDeliveryAt: last?.createdAt ?? null,
      deliveriesLast30: delivered30,
      rating: rider.rating,
      totalRatings: rider.totalRatings,
    },
    data: {
      ...rider,
      totalDeliveries: deliveredTotal,
      deliveriesLast30: delivered30,
      lastDeliveryAt: last?.createdAt ?? null,
      earnings: Object.fromEntries(earnings.map(e => [e.payoutStatus, e._sum.netAmount ?? 0])),
      recentDeliveries: recent.map(shapeOrder),
    },
  };
};

export class ProfileNotFoundError extends Error {}

/** Loads a CRM subject (customer / vendor / rider). Admin accounts are never CRM subjects. */
export const findCrmSubject = async (userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, role: { in: CRM_ROLES } },
    select: {
      id: true, name: true, email: true, phone: true, role: true, avatar: true, isActive: true,
      isEmailVerified: true, isPhoneVerified: true, mfaEnabled: true, createdAt: true,
      referralCode: true, freeDeliveryCredits: true, storeCreditBalance: true, pushToken: true,
      referredBy: { select: { id: true, name: true } },
      _count: { select: { referrals: true } },
      customer: { select: { id: true } },
      vendor: { select: { id: true } },
      rider: { select: { id: true } },
    },
  });
  if (!user) throw new ProfileNotFoundError('Profile not found.');
  return user;
};

export const getProfile = async (userId: string) => {
  const user = await findCrmSubject(userId);
  const role = user.role as CrmRole;

  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const [tags, notes, credits, tickets, ticketsLast30] = await Promise.all([
    prisma.crmUserTag.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
      select: { tag: { select: { id: true, name: true, color: true } } },
    }),
    prisma.crmNote.findMany({
      where: { subjectUserId: userId }, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, body: true, pinned: true, createdAt: true, updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    }),
    prisma.creditTransaction.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, type: true, amount: true, balanceAfter: true, reason: true, orderId: true, createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { requesterId: userId }, orderBy: { createdAt: 'desc' }, take: 20,
      select: {
        id: true, number: true, subject: true, category: true, priority: true, status: true,
        createdAt: true, lastMessageAt: true, csatScore: true, order: { select: { orderNumber: true } },
      },
    }),
    prisma.ticket.count({ where: { requesterId: userId, createdAt: { gte: since30 } } }),
  ]);

  let health;
  let roleData: Record<string, unknown> = {};

  if (role === 'CUSTOMER' && user.customer) {
    const c = await customerSection(user.customer.id);
    health = customerHealth({
      lastOrderAt: c.lastOrderAt, completedOrders: c.completedOrders, cancelledOrders: c.cancelledOrders, ticketsLast30,
    });
    roleData = { customer: c.data };
  } else if (role === 'VENDOR' && user.vendor) {
    const v = await vendorSection(user.vendor.id);
    health = vendorHealth(v.healthInput);
    roleData = { vendor: v.data };
  } else if (role === 'RIDER' && user.rider) {
    const r = await riderSection(user.rider.id);
    health = riderHealth(r.healthInput);
    roleData = { rider: r.data };
  } else {
    // Signed up but never finished creating the role record.
    health = { score: 0, stage: 'NEW' as const, reasons: ['Profile setup not completed'] };
  }

  const { pushToken, _count, customer, vendor, rider, ...identity } = user;
  return {
    ...identity,
    hasPushToken: !!pushToken,
    referralsCount: _count.referrals,
    profileIds: { customerId: customer?.id ?? null, vendorId: vendor?.id ?? null, riderId: rider?.id ?? null },
    health,
    tags: tags.map(t => t.tag),
    notes,
    creditTransactions: credits,
    tickets,
    ticketsLast30,
    ...roleData,
  };
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineItem {
  id: string;
  at: Date;
  kind: 'crm' | 'audit' | 'onboarding' | 'order' | 'credit' | 'chat' | 'ticket';
  title: string;
  detail?: string;
  actor?: string | null;
  meta?: unknown;
}

export const getTimeline = async (userId: string, limit: number): Promise<TimelineItem[]> => {
  const user = await findCrmSubject(userId);
  const entityIds = [user.id, user.customer?.id, user.vendor?.id, user.rider?.id].filter((x): x is string => !!x);
  const orderWhere: Prisma.OrderWhereInput = {
    OR: [
      ...(user.customer ? [{ customerId: user.customer.id }] : []),
      ...(user.vendor ? [{ vendorId: user.vendor.id }] : []),
      ...(user.rider ? [{ riderId: user.rider.id }] : []),
    ],
  };
  const hasOrders = (orderWhere.OR ?? []).length > 0;

  const [activities, audits, onboarding, orders, credits, chats, tickets] = await Promise.all([
    prisma.crmActivity.findMany({
      where: { subjectUserId: userId }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, type: true, title: true, meta: true, createdAt: true, actor: { select: { name: true } } },
    }),
    // CRM actions already appear via crmActivity, so skip their mirrored audit rows.
    prisma.auditLog.findMany({
      where: { entityId: { in: entityIds }, NOT: { action: { startsWith: 'CRM_' } } },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, action: true, entity: true, meta: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.onboardingEvent.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, event: true, createdAt: true },
    }),
    hasOrders
      ? prisma.order.findMany({
          where: orderWhere, orderBy: { createdAt: 'desc' }, take: limit,
          select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true, vendor: { select: { businessName: true } } },
        })
      : [],
    prisma.creditTransaction.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, type: true, amount: true, reason: true, createdAt: true },
    }),
    user.customer || user.rider
      ? prisma.conversation.findMany({
          where: user.customer ? { customerId: user.customer.id } : { riderId: user.rider!.id },
          orderBy: { createdAt: 'desc' }, take: limit,
          select: { id: true, createdAt: true, order: { select: { orderNumber: true } }, _count: { select: { messages: true } } },
        })
      : [],
    prisma.ticket.findMany({
      where: { requesterId: userId }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, number: true, subject: true, status: true, csatScore: true, createdAt: true },
    }),
  ]);

  const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

  const items: TimelineItem[] = [
    ...activities.map(a => ({
      id: `crm:${a.id}`, at: a.createdAt, kind: 'crm' as const, title: a.title, actor: a.actor?.name ?? null, meta: a.meta,
    })),
    ...audits.map(a => ({
      id: `audit:${a.id}`, at: a.createdAt, kind: 'audit' as const,
      title: humanize(a.action), detail: a.entity, actor: a.user.name, meta: a.meta,
    })),
    ...onboarding.map(e => ({
      id: `onb:${e.id}`, at: e.createdAt, kind: 'onboarding' as const, title: humanize(e.event),
    })),
    ...orders.map(o => ({
      id: `order:${o.id}`, at: o.createdAt, kind: 'order' as const,
      title: `Order #${o.orderNumber}`,
      detail: `${o.vendor.businessName} · ₦${o.totalAmount.toLocaleString()} · ${humanize(o.status)}`,
      meta: { orderId: o.id, status: o.status },
    })),
    ...credits.map(c => ({
      id: `credit:${c.id}`, at: c.createdAt, kind: 'credit' as const,
      title: `${c.type === 'CREDIT' ? 'Store credit added' : 'Store credit used'}: ₦${c.amount.toLocaleString()}`,
      detail: c.reason,
    })),
    ...chats.map(c => ({
      id: `chat:${c.id}`, at: c.createdAt, kind: 'chat' as const,
      title: `Rider chat on order #${c.order.orderNumber}`, detail: `${c._count.messages} messages`,
    })),
    ...tickets.map(t => ({
      id: `ticket:${t.id}`, at: t.createdAt, kind: 'ticket' as const,
      title: `Support ticket #${t.number}: ${t.subject}`,
      detail: `${humanize(t.status)}${t.csatScore ? ` · rated ${t.csatScore}/5` : ''}`,
      meta: { ticketId: t.id },
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
};
