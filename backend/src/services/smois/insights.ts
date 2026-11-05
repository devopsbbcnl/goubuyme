// SMOIS database-backed calculations used by analytics, targets, performance and reports.
// Everything here counts recorded SMOIS data; nothing is estimated.
import { Prisma, SmoisTarget } from '@prisma/client';
import prisma from '../../config/db';
import {
  PostReading, RankedPost, ScoreInputs, Snap, Summary, TargetProgress, daysBetweenInclusive, parseYmd, pctChange, postEngagement,
  postEngagementRate, previousPeriod, scorecard, summarize, targetProgress, ymd,
} from './analytics';
import { TASK_DONE } from './workflow';
import { SlaConfig, responseMinutes } from './community';
import { RATE_METRICS } from './analytics';

const LOOKBACK_DAYS = 400;
const DAY = 86_400_000;

// ── Snapshots ───────────────────────────────────────────────────────────────

export const loadSnaps = async (accountIds: string[], to: string): Promise<Map<string, Snap[]>> => {
  const out = new Map<string, Snap[]>(accountIds.map((id) => [id, []]));
  if (!accountIds.length) return out;
  const rows = await prisma.smoisMetricSnapshot.findMany({
    where: { accountId: { in: accountIds }, snapshotDate: { lte: parseYmd(to), gte: new Date(parseYmd(to).getTime() - LOOKBACK_DAYS * DAY) } },
    orderBy: { snapshotDate: 'asc' },
  });
  for (const r of rows) {
    out.get(r.accountId)!.push({
      date: ymd(r.snapshotDate), followers: r.followers, reach: r.reach, impressions: r.impressions, engagement: r.engagement,
      profileVisits: r.profileVisits, videoViews: r.videoViews, websiteClicks: r.websiteClicks,
    });
  }
  return out;
};

export interface AccountSummary {
  accountId: string; name: string; platform: string;
  current: Summary; previous: Summary;
  delta: { followersPct: number | null; reachPct: number | null; impressionsPct: number | null; engagementPct: number | null };
}

export const accountSummaries = async (
  accounts: { id: string; name: string; platform: string }[], from: string, to: string, asOf: string,
): Promise<AccountSummary[]> => {
  const prev = previousPeriod(from, to);
  const snaps = await loadSnaps(accounts.map((a) => a.id), to);
  return accounts.map((a) => {
    const s = snaps.get(a.id) ?? [];
    const current = summarize(s, from, to, asOf);
    const previous = summarize(s.filter((x) => x.date <= prev.to), prev.from, prev.to, prev.to);
    return {
      accountId: a.id, name: a.name, platform: a.platform, current, previous,
      delta: {
        followersPct: pctChange(current.closing?.value ?? null, previous.closing?.value ?? null),
        reachPct: pctChange(current.totals.reach, previous.totals.reach),
        impressionsPct: pctChange(current.totals.impressions, previous.totals.impressions),
        engagementPct: pctChange(current.totals.engagement, previous.totals.engagement),
      },
    };
  });
};

const sumNullable = (xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };

/** Add accounts together. A figure is null only if no account recorded it. */
export const rollup = (list: AccountSummary[]) => {
  const growthRows = list.filter((a) => a.current.netGrowth !== null);
  const opening = sumNullable(growthRows.map((a) => a.current.opening?.value ?? null));
  const netGrowth = sumNullable(growthRows.map((a) => a.current.netGrowth));
  const actions = list.reduce((a, x) => a + x.current.engagementBasis.actions, 0);
  const reach = list.reduce((a, x) => a + x.current.engagementBasis.reach, 0);
  return {
    followers: sumNullable(list.map((a) => a.current.closing?.value ?? null)),
    netGrowth,
    growthPct: netGrowth !== null && opening ? Math.round((netGrowth / opening) * 10000) / 100 : null,
    reach: sumNullable(list.map((a) => a.current.totals.reach)),
    impressions: sumNullable(list.map((a) => a.current.totals.impressions)),
    engagement: sumNullable(list.map((a) => a.current.totals.engagement)),
    profileVisits: sumNullable(list.map((a) => a.current.totals.profileVisits)),
    videoViews: sumNullable(list.map((a) => a.current.totals.videoViews)),
    websiteClicks: sumNullable(list.map((a) => a.current.totals.websiteClicks)),
    engagementRateReach: reach > 0 ? Math.round((actions / reach) * 10000) / 100 : null,
    accounts: list.length,
    accountsWithData: list.filter((a) => a.current.daysWithData > 0).length,
    coverage: list.length ? Math.round((list.reduce((a, x) => a + x.current.coverage, 0) / list.length) * 100) / 100 : 0,
  };
};

/** Followers over time for the chart: each account's last known reading carried forward (days before its first reading are skipped). */
export const followerSeries = async (accountIds: string[], from: string, to: string): Promise<{ date: string; followers: number | null }[]> => {
  const days = daysBetweenInclusive(from, to);
  if (!accountIds.length || days > 400) return [];
  const snaps = await loadSnaps(accountIds, to);
  const out: { date: string; followers: number | null }[] = [];
  for (let n = 0; n < days; n++) {
    const d = ymd(new Date(parseYmd(from).getTime() + n * DAY));
    let total = 0; let any = false;
    for (const list of snaps.values()) {
      const last = [...list].reverse().find((s) => s.followers !== null && s.date <= d);
      if (last) { total += last.followers as number; any = true; }
    }
    out.push({ date: d, followers: any ? total : null });
  }
  return out;
};

// ── Posts ───────────────────────────────────────────────────────────────────

export const rankedPosts = async (accountIds: string[], from: Date, to: Date): Promise<RankedPost[]> => {
  if (!accountIds.length) return [];
  const rows = await prisma.smoisVariant.findMany({
    where: { status: 'PUBLISHED', accountId: { in: accountIds }, publishedAt: { gte: from, lte: to } },
    select: {
      id: true, contentId: true, publishedAt: true, publishedUrl: true,
      account: { select: { name: true, platform: true } },
      content: { select: { title: true, format: true, category: { select: { name: true } } } },
      postMetrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
  });
  return rows.map((r) => {
    const m = r.postMetrics[0] as PostReading | undefined;
    return {
      variantId: r.id, contentId: r.contentId, title: r.content.title, account: r.account.name, platform: r.account.platform,
      category: r.content.category?.name ?? null, format: r.content.format, publishedAt: r.publishedAt?.toISOString() ?? null, url: r.publishedUrl,
      reach: m?.reach ?? null, engagement: m ? postEngagement(m) : null, engagementRate: m ? postEngagementRate(m) : null,
    };
  });
};

// ── People ──────────────────────────────────────────────────────────────────

/** Response-target settings, in the shape the community rules expect. */
export const loadSlaConfig = async (): Promise<SlaConfig> => {
  const s = await prisma.smoisSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  return { high: s.slaHighMinutes, standard: s.slaStandardMinutes, general: s.slaGeneralMinutes, hours: { startHour: s.businessStartHour, endHour: s.businessEndHour, days: s.businessDays } };
};

export interface MemberStats {
  tasks: { assigned: number; eligible: number; completed: number; onTime: number; overdue: number; open: number };
  content: { created: number; submitted: number; approved: number; rejected: number; revisionRequests: number; published: number };
  reviews: { reviewed: number; approved: number };
  reports: { due: number; submitted: number };
  community: { responded: number; withinTarget: number };
  inputs: ScoreInputs;
}

/** Whole weeks (Mon-Sun) that ended inside [from, to]: how many weekly reports a manager owes. */
export const weeksIn = (from: Date, to: Date, now = new Date()): number => {
  const end = to < now ? to : now;
  return Math.max(0, Math.floor((end.getTime() - from.getTime()) / (7 * DAY)));
};

export const memberStats = async (memberId: string, userId: string, from: Date, to: Date, now = new Date()): Promise<MemberStats> => {
  const inRange = { gte: from, lte: to };
  const [assigned, doneTasks, overdueOpen, open, created, submitted, approvedV, publishedV, reviews, weeklyReports, responses] = await Promise.all([
    prisma.smoisTask.count({ where: { assigneeId: memberId, createdAt: inRange } }),
    prisma.smoisTask.findMany({ where: { assigneeId: memberId, status: 'COMPLETED', completedAt: inRange }, select: { completedAt: true, deadline: true } }),
    prisma.smoisTask.count({ where: { assigneeId: memberId, status: { notIn: TASK_DONE }, deadline: { lt: now } } }),
    prisma.smoisTask.count({ where: { assigneeId: memberId, status: { notIn: TASK_DONE } } }),
    prisma.smoisVariant.count({ where: { creatorId: userId, createdAt: inRange, status: { notIn: ['CANCELLED'] } } }),
    prisma.smoisVariant.count({ where: { submittedById: userId, submittedAt: inRange } }),
    prisma.smoisVariant.count({ where: { creatorId: userId, approvedAt: inRange } }),
    prisma.smoisVariant.count({ where: { creatorId: userId, status: 'PUBLISHED', publishedAt: inRange } }),
    prisma.smoisReview.findMany({ where: { createdAt: inRange, emergencyBypass: false, variant: { creatorId: userId } }, select: { decision: true } }),
    prisma.smoisReport.count({ where: { authorId: userId, type: 'WEEKLY_MANAGER', periodStart: inRange, status: { in: ['SUBMITTED', 'APPROVED'] } } }),
    prisma.smoisConversation.findMany({ where: { firstResponderId: userId, firstResponseAt: inRange }, select: { firstResponseAt: true, slaDueAt: true } }),
  ]);
  // Eligible = assigned work that is finished, or open and already past its deadline (cancelled work is excluded).
  const eligible = doneTasks.length + overdueOpen;
  const onTime = doneTasks.filter((t) => !t.deadline || (t.completedAt && t.completedAt <= t.deadline)).length;
  const approvedReviews = reviews.filter((r) => r.decision === 'APPROVED').length;
  const due = weeksIn(from, to, now);
  const stats = {
    tasks: { assigned, eligible, completed: doneTasks.length, onTime, overdue: overdueOpen, open },
    content: { created, submitted, approved: approvedV, rejected: reviews.filter((r) => r.decision === 'REJECTED').length, revisionRequests: reviews.filter((r) => r.decision === 'REVISION_REQUESTED').length, published: publishedV },
    reviews: { reviewed: reviews.length, approved: approvedReviews },
    reports: { due, submitted: Math.min(due, weeklyReports) },
    community: { responded: responses.length, withinTarget: responses.filter((r) => r.slaDueAt && r.firstResponseAt && r.firstResponseAt <= r.slaDueAt).length },
  };
  return { ...stats, inputs: { tasks: stats.tasks, content: stats.content, reviews: stats.reviews, reports: stats.reports, community: stats.community.responded ? stats.community : undefined, targetPercents: [] } };
};

export const memberScorecard = async (memberId: string, userId: string, from: Date, to: Date, now = new Date()) => {
  const stats = await memberStats(memberId, userId, from, to, now);
  const targets = await prisma.smoisTarget.findMany({ where: { scope: 'EMPLOYEE', memberId, isActive: true, startsAt: { lte: to }, endsAt: { gte: from } } });
  const progress = await Promise.all(targets.map((t) => targetActual(t, now)));
  const targetPercents = progress.map((p) => p.percent).filter((p): p is number => p !== null);
  return { stats, targets: targets.map((t, i) => ({ ...t, progress: progress[i] })), scorecard: scorecard({ ...stats.inputs, targetPercents }) };
};

// ── Targets ─────────────────────────────────────────────────────────────────

export const targetActual = async (t: SmoisTarget, now = new Date()): Promise<TargetProgress & { note?: string }> => {
  const from = ymd(t.startsAt); const to = ymd(t.endsAt);
  const asOf = ymd(now) < to ? ymd(now) : to;
  const progress = (actual: number | null, note?: string) => ({ ...targetProgress(actual, t.targetValue, t.startsAt, t.endsAt, now, t.metric === 'AVG_FIRST_RESPONSE_MINUTES', (RATE_METRICS as readonly string[]).includes(t.metric)), note });

  const accountWhere: Prisma.SmoisAccountWhereInput = { archivedAt: null, ...(t.scope === 'ACCOUNT' && t.accountId ? { id: t.accountId } : {}), ...(t.scope === 'PLATFORM' && t.platform ? { platform: t.platform } : {}) };
  const member = t.memberId ? await prisma.smoisMember.findUnique({ where: { id: t.memberId }, select: { id: true, userId: true } }) : null;
  const inRange = { gte: t.startsAt, lte: t.endsAt };

  switch (t.metric) {
    case 'FOLLOWER_GROWTH': case 'ENGAGEMENT_RATE': case 'REACH': case 'IMPRESSIONS': case 'VIDEO_VIEWS': case 'WEBSITE_CLICKS': {
      const accounts = await prisma.smoisAccount.findMany({ where: accountWhere, select: { id: true, name: true, platform: true } });
      const sums = rollup(await accountSummaries(accounts, from, to, asOf));
      const v = { FOLLOWER_GROWTH: sums.netGrowth, ENGAGEMENT_RATE: sums.engagementRateReach, REACH: sums.reach, IMPRESSIONS: sums.impressions, VIDEO_VIEWS: sums.videoViews, WEBSITE_CLICKS: sums.websiteClicks }[t.metric] ?? null;
      return progress(v, v === null ? 'No readings recorded for this period yet.' : undefined);
    }
    case 'POSTS_PUBLISHED': {
      const n = await prisma.smoisVariant.count({ where: { status: 'PUBLISHED', publishedAt: inRange, ...(t.scope === 'ACCOUNT' && t.accountId ? { accountId: t.accountId } : {}), ...(t.scope === 'PLATFORM' && t.platform ? { account: { platform: t.platform } } : {}), ...(member ? { creatorId: member.userId } : {}) } });
      return progress(n);
    }
    case 'TASK_COMPLETION': case 'ON_TIME_TASKS': {
      const base: Prisma.SmoisTaskWhereInput = { ...(member ? { assigneeId: member.id } : {}), deadline: inRange, status: { not: 'CANCELLED' } };
      const tasks = await prisma.smoisTask.findMany({ where: base, select: { status: true, completedAt: true, deadline: true } });
      const done = tasks.filter((x) => x.status === 'COMPLETED');
      if (t.metric === 'TASK_COMPLETION') return progress(tasks.length ? Math.round((done.length / tasks.length) * 10000) / 100 : null, tasks.length ? undefined : 'No tasks with deadlines in this period.');
      const onTime = done.filter((x) => x.completedAt && x.deadline && x.completedAt <= x.deadline).length;
      return progress(done.length ? Math.round((onTime / done.length) * 10000) / 100 : null, done.length ? undefined : 'No completed tasks in this period yet.');
    }
    case 'APPROVAL_RATE': {
      const reviews = await prisma.smoisReview.findMany({ where: { createdAt: inRange, emergencyBypass: false, ...(member ? { variant: { creatorId: member.userId } } : {}) }, select: { decision: true } });
      return progress(reviews.length ? Math.round((reviews.filter((r) => r.decision === 'APPROVED').length / reviews.length) * 10000) / 100 : null, reviews.length ? undefined : 'Nothing reviewed in this period yet.');
    }
    case 'REPORT_COMPLIANCE': {
      const due = weeksIn(t.startsAt, t.endsAt, now);
      if (!due) return progress(null, 'No full weeks have passed yet.');
      const submitted = await prisma.smoisReport.count({ where: { type: 'WEEKLY_MANAGER', periodStart: inRange, status: { in: ['SUBMITTED', 'APPROVED'] }, ...(member ? { authorId: member.userId } : {}) } });
      const expected = member ? due : due * Math.max(1, await prisma.smoisMember.count({ where: { isActive: true, role: 'MANAGER' } }));
      return progress(Math.round((Math.min(submitted, expected) / expected) * 10000) / 100);
    }
    case 'RESPONSE_COMPLIANCE': {
      const rows = await prisma.smoisConversation.findMany({ where: { firstResponseAt: inRange, ...(member ? { firstResponderId: member.userId } : {}) }, select: { firstResponseAt: true, slaDueAt: true } });
      const met = rows.filter((r) => r.slaDueAt && r.firstResponseAt && r.firstResponseAt <= r.slaDueAt).length;
      return progress(rows.length ? Math.round((met / rows.length) * 10000) / 100 : null, rows.length ? undefined : 'No first responses logged in this period yet.');
    }
    case 'AVG_FIRST_RESPONSE_MINUTES': {
      const cfg = await loadSlaConfig();
      const rows = await prisma.smoisConversation.findMany({ where: { receivedAt: inRange, firstResponseAt: { not: null }, ...(t.scope === 'ACCOUNT' && t.accountId ? { accountId: t.accountId } : {}), ...(t.scope === 'PLATFORM' && t.platform ? { account: { platform: t.platform } } : {}) }, select: { receivedAt: true, firstResponseAt: true, priority: true } });
      const mins = rows.map((r) => responseMinutes(r.receivedAt, r.firstResponseAt as Date, r.priority, cfg));
      return progress(mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null, mins.length ? 'Lower is better.' : 'No answered conversations in this period yet.');
    }
    default:
      return progress(null, 'Unknown metric.');
  }
};

export { topAndBottom, groupPerformance } from './analytics';
export type { RankedPost } from './analytics';
