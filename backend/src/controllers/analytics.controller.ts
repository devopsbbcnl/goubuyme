import { Request, Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { ApprovalStatus, OnboardingEventType, Prisma } from '@prisma/client';

/**
 * Onboarding analytics — derived entirely from existing data (no event stream).
 *
 * Funnel finish-lines differ per role:
 *   Customer: registered -> email verified -> placed first order
 *   Vendor:   registered -> email verified -> profile set up -> documents submitted -> approved
 *   Rider:    registered -> email verified -> documents submitted -> approved
 *
 * "Stuck" = sitting at a stage without advancing, and signed up longer than
 * `staleHours` ago (so we don't nag people who are still mid-flow).
 */

type FunnelRole = 'CUSTOMER' | 'VENDOR' | 'RIDER';

const windowFilter = (days?: number): { createdAt?: { gte: Date } } => {
  if (!days || Number.isNaN(days) || days <= 0) return {};
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { createdAt: { gte: since } };
};

const staleBefore = (staleHours: number): Date =>
  new Date(Date.now() - staleHours * 60 * 60 * 1000);

interface Stage {
  key: string;
  label: string;
  count: number;
}

const buildStages = (raw: Array<{ key: string; label: string; count: number }>): Array<
  Stage & { dropOffFromPrev: number; pctOfTop: number }
> => {
  const top = raw[0]?.count ?? 0;
  return raw.map((s, i) => {
    const prev = i === 0 ? s.count : raw[i - 1].count;
    return {
      ...s,
      dropOffFromPrev: Math.max(0, prev - s.count),
      pctOfTop: top > 0 ? Math.round((s.count / top) * 1000) / 10 : 0,
    };
  });
};

// GET /admin/analytics/funnel?role=VENDOR&days=30
export const getOnboardingFunnel = catchAsync(async (req: Request, res: Response) => {
  const role = ((req.query.role as string) || 'VENDOR').toUpperCase() as FunnelRole;
  const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
  const w = windowFilter(days);

  let raw: Array<{ key: string; label: string; count: number }>;

  if (role === 'CUSTOMER') {
    const [registered, verified, activated] = await Promise.all([
      prisma.customer.count({ where: { ...w } }),
      prisma.customer.count({ where: { ...w, user: { isEmailVerified: true } } }),
      prisma.customer.count({ where: { ...w, orders: { some: {} } } }),
    ]);
    raw = [
      { key: 'registered', label: 'Registered', count: registered },
      { key: 'verified', label: 'Email verified', count: verified },
      { key: 'activated', label: 'Placed first order', count: activated },
    ];
  } else if (role === 'RIDER') {
    const [registered, verified, docsSubmitted, approved] = await Promise.all([
      prisma.rider.count({ where: { ...w } }),
      prisma.rider.count({ where: { ...w, user: { isEmailVerified: true } } }),
      prisma.rider.count({ where: { ...w, document: { isNot: null } } }),
      prisma.rider.count({ where: { ...w, approvalStatus: ApprovalStatus.APPROVED } }),
    ]);
    raw = [
      { key: 'registered', label: 'Registered', count: registered },
      { key: 'verified', label: 'Email verified', count: verified },
      { key: 'docs', label: 'Documents submitted', count: docsSubmitted },
      { key: 'approved', label: 'Approved', count: approved },
    ];
  } else {
    // VENDOR
    const [registered, verified, profileSetup, docsSubmitted, approved] = await Promise.all([
      prisma.vendor.count({ where: { ...w } }),
      prisma.vendor.count({ where: { ...w, user: { isEmailVerified: true } } }),
      prisma.vendor.count({
        where: { ...w, user: { isEmailVerified: true }, logo: { not: null }, coverImage: { not: null } },
      }),
      prisma.vendor.count({ where: { ...w, document: { isNot: null } } }),
      prisma.vendor.count({ where: { ...w, approvalStatus: ApprovalStatus.APPROVED } }),
    ]);
    raw = [
      { key: 'registered', label: 'Registered', count: registered },
      { key: 'verified', label: 'Email verified', count: verified },
      { key: 'profile', label: 'Profile set up', count: profileSetup },
      { key: 'docs', label: 'Documents submitted', count: docsSubmitted },
      { key: 'approved', label: 'Approved', count: approved },
    ];
  }

  return apiResponse.success(res, 'Onboarding funnel fetched.', {
    role,
    windowDays: days ?? null,
    stages: buildStages(raw),
    generatedAt: new Date().toISOString(),
  });
});

/**
 * Where-clause for users stuck at a given stage. Returns a Prisma where object
 * for the role's model (vendor/rider/customer), including the staleness cutoff.
 */
function stuckWhere(role: FunnelRole, stage: string, cutoff: Date): Record<string, unknown> {
  const stale = { createdAt: { lte: cutoff } };

  if (role === 'VENDOR') {
    switch (stage) {
      case 'unverified':
        return { ...stale, user: { isEmailVerified: false } };
      case 'no_profile':
        return { ...stale, user: { isEmailVerified: true }, OR: [{ logo: null }, { coverImage: null }] };
      case 'no_docs':
        return {
          ...stale,
          user: { isEmailVerified: true },
          logo: { not: null },
          coverImage: { not: null },
          document: { is: null },
        };
      case 'pending_approval':
        return { ...stale, document: { isNot: null }, approvalStatus: ApprovalStatus.PENDING };
      default:
        return stale;
    }
  }

  if (role === 'RIDER') {
    switch (stage) {
      case 'unverified':
        return { ...stale, user: { isEmailVerified: false } };
      case 'no_docs':
        return { ...stale, user: { isEmailVerified: true }, document: { is: null } };
      case 'pending_approval':
        return { ...stale, document: { isNot: null }, approvalStatus: ApprovalStatus.PENDING };
      default:
        return stale;
    }
  }

  // CUSTOMER
  switch (stage) {
    case 'unverified':
      return { ...stale, user: { isEmailVerified: false } };
    case 'no_order':
      return { ...stale, user: { isEmailVerified: true }, orders: { none: {} } };
    default:
      return stale;
  }
}

// GET /admin/analytics/stuck-users?role=VENDOR&stage=unverified&staleHours=24&page=1&limit=50
export const getStuckUsers = catchAsync(async (req: Request, res: Response) => {
  const role = ((req.query.role as string) || 'VENDOR').toUpperCase() as FunnelRole;
  const stage = (req.query.stage as string) || 'unverified';
  const staleHours = req.query.staleHours ? Math.max(0, parseInt(req.query.staleHours as string, 10)) : 24;
  const pageNum = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const limitNum = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '50', 10)));

  const cutoff = staleBefore(staleHours);
  const where = stuckWhere(role, stage, cutoff) as Prisma.VendorWhereInput &
    Prisma.RiderWhereInput &
    Prisma.CustomerWhereInput;

  const userSelect = { select: { name: true, email: true, phone: true } } as const;
  const baseArgs = {
    where,
    orderBy: { createdAt: 'asc' as const }, // oldest / most-stuck first
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
  };

  let rows: Array<{ id: string; createdAt: Date; user: { name: string; email: string; phone: string | null } }>;
  let total: number;

  if (role === 'RIDER') {
    [rows, total] = await Promise.all([
      prisma.rider.findMany({ ...baseArgs, select: { id: true, createdAt: true, user: userSelect } }),
      prisma.rider.count({ where }),
    ]);
  } else if (role === 'CUSTOMER') {
    [rows, total] = await Promise.all([
      prisma.customer.findMany({ ...baseArgs, select: { id: true, createdAt: true, user: userSelect } }),
      prisma.customer.count({ where }),
    ]);
  } else {
    [rows, total] = await Promise.all([
      prisma.vendor.findMany({ ...baseArgs, select: { id: true, createdAt: true, user: userSelect } }),
      prisma.vendor.count({ where }),
    ]);
  }

  const now = Date.now();
  const data = rows.map((r) => ({
    id: r.id,
    name: r.user.name,
    email: r.user.email,
    phone: r.user.phone,
    role,
    stuckStage: stage,
    registeredAt: r.createdAt,
    hoursSinceSignup: Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000),
  }));

  return apiResponse.paginated(res, 'Stuck users fetched.', data, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// ── Event-based funnel (from the OnboardingEvent stream) ────────────────────────

const EVENT_ORDER: Record<FunnelRole, OnboardingEventType[]> = {
  VENDOR: ['SIGNED_UP', 'EMAIL_VERIFIED', 'VENDOR_PROFILE_COMPLETED', 'DOCUMENTS_SUBMITTED', 'APPROVED'],
  RIDER: ['SIGNED_UP', 'EMAIL_VERIFIED', 'DOCUMENTS_SUBMITTED', 'APPROVED'],
  CUSTOMER: ['SIGNED_UP', 'EMAIL_VERIFIED', 'FIRST_ORDER'],
};

const EVENT_LABELS: Record<OnboardingEventType, string> = {
  SIGNED_UP: 'Signed up',
  EMAIL_VERIFIED: 'Email verified',
  VENDOR_PROFILE_COMPLETED: 'Profile completed',
  DOCUMENTS_SUBMITTED: 'Documents submitted',
  APPROVED: 'Approved',
  FIRST_ORDER: 'Placed first order',
};

const median = (arr: number[]): number | null => {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// GET /admin/analytics/event-funnel?role=VENDOR&days=30
// Cohort = users who SIGNED_UP within the window; tracks how far each progressed
// and the real median time from signup to each step.
export const getOnboardingEventFunnel = catchAsync(async (req: Request, res: Response) => {
  const role = ((req.query.role as string) || 'VENDOR').toUpperCase() as FunnelRole;
  const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
  const since = days && days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;
  const order = EVENT_ORDER[role];

  const signups = await prisma.onboardingEvent.findMany({
    where: { role, event: 'SIGNED_UP', ...(since ? { createdAt: { gte: since } } : {}) },
    select: { userId: true, createdAt: true },
  });
  const signupAt = new Map(signups.map(s => [s.userId, s.createdAt]));
  const cohortIds = [...signupAt.keys()];

  const events = cohortIds.length
    ? await prisma.onboardingEvent.findMany({
        where: { userId: { in: cohortIds }, event: { in: order } },
        select: { userId: true, event: true, createdAt: true },
      })
    : [];

  const buckets = new Map<OnboardingEventType, { count: number; deltas: number[] }>(
    order.map(ev => [ev, { count: 0, deltas: [] }]),
  );
  for (const e of events) {
    const b = buckets.get(e.event);
    if (!b) continue;
    b.count += 1;
    const start = signupAt.get(e.userId);
    if (start && e.event !== 'SIGNED_UP') {
      b.deltas.push((e.createdAt.getTime() - start.getTime()) / 3_600_000);
    }
  }

  const top = buckets.get('SIGNED_UP')?.count ?? 0;
  const stages = order.map((ev, i) => {
    const b = buckets.get(ev)!;
    const prev = i === 0 ? b.count : buckets.get(order[i - 1])!.count;
    const med = ev === 'SIGNED_UP' ? 0 : median(b.deltas);
    return {
      key: ev,
      label: EVENT_LABELS[ev],
      count: b.count,
      dropOffFromPrev: Math.max(0, prev - b.count),
      pctOfTop: top > 0 ? Math.round((b.count / top) * 1000) / 10 : 0,
      medianHoursFromSignup: med === null ? null : Math.round(med * 10) / 10,
    };
  });

  return apiResponse.success(res, 'Onboarding event funnel fetched.', {
    role,
    windowDays: days ?? null,
    cohortSize: top,
    stages,
    generatedAt: new Date().toISOString(),
  });
});
