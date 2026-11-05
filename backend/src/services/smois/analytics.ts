// SMOIS analytics rules with no database: growth, coverage, engagement rates, target status and the
// staff scorecard. Every function says "not available" instead of guessing (PRD 17.6, 40.5).

// ── Metric dictionary (PRD 16.4: platform-specific, labelled, versioned) ────

export const METRIC_VERSION = 'v1';

export interface MetricDef { key: string; label: string; kind: 'total' | 'daily' | 'rate' | 'count'; definition: string }

export const METRIC_DICTIONARY: MetricDef[] = [
  { key: 'followers', label: 'Followers / subscribers', kind: 'total', definition: 'Audience size on the snapshot date, as the platform shows it. A running total, not a daily figure.' },
  { key: 'reach', label: 'Reach', kind: 'daily', definition: 'Unique accounts that saw content on that day. Platforms count this differently: values are only comparable within one platform.' },
  { key: 'impressions', label: 'Impressions', kind: 'daily', definition: 'Times content was shown that day, including repeat views by the same account.' },
  { key: 'engagement', label: 'Engagement actions', kind: 'daily', definition: 'Likes + comments + shares + saves + replies recorded for that day. Link clicks and video views are counted separately.' },
  { key: 'profileVisits', label: 'Profile visits', kind: 'daily', definition: 'Visits to the account profile or page that day.' },
  { key: 'videoViews', label: 'Video views', kind: 'daily', definition: 'Video plays that day, using each platform\'s own view threshold.' },
  { key: 'websiteClicks', label: 'Website clicks', kind: 'daily', definition: 'Clicks from the account to the company website that day.' },
  { key: 'netGrowth', label: 'Net follower growth', kind: 'count', definition: 'Ending followers minus starting followers for the period.' },
  { key: 'growthPct', label: 'Follower growth %', kind: 'rate', definition: '(Net follower growth ÷ starting followers) × 100.' },
  { key: 'engagementRateReach', label: 'Engagement rate by reach', kind: 'rate', definition: '(Engagement actions ÷ reach) × 100, over days where both were recorded.' },
  { key: 'engagementRateFollowers', label: 'Engagement rate by followers', kind: 'rate', definition: '(Engagement actions ÷ followers at the end of the period) × 100.' },
  { key: 'taskCompletion', label: 'Task completion rate', kind: 'rate', definition: '(Completed eligible tasks ÷ total eligible tasks) × 100. Cancelled tasks are not eligible.' },
  { key: 'onTime', label: 'On-time task completion', kind: 'rate', definition: '(Tasks completed by their deadline ÷ eligible completed tasks) × 100.' },
  { key: 'approvalRate', label: 'Approval rate', kind: 'rate', definition: '(Approved submissions ÷ reviewed submissions) × 100. A request for changes counts as not approved.' },
];

// ── Dates ───────────────────────────────────────────────────────────────────

/** YYYY-MM-DD from a Date stored as a date-only column (UTC midnight). */
export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const parseYmd = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
const DAY = 86_400_000;
export const daysBetweenInclusive = (from: string, to: string): number =>
  Math.max(0, Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / DAY) + 1);

// ── Snapshot summary ────────────────────────────────────────────────────────

export interface Snap {
  date: string;
  followers: number | null; reach: number | null; impressions: number | null; engagement: number | null;
  profileVisits: number | null; videoViews: number | null; websiteClicks: number | null;
}

type Totals = { reach: number | null; impressions: number | null; engagement: number | null; profileVisits: number | null; videoViews: number | null; websiteClicks: number | null };
const TOTAL_KEYS: (keyof Totals)[] = ['reach', 'impressions', 'engagement', 'profileVisits', 'videoViews', 'websiteClicks'];

export interface Summary {
  opening: { value: number; date: string; isBaseline: boolean } | null;
  closing: { value: number; date: string } | null;
  netGrowth: number | null;
  growthPct: number | null;
  totals: Totals;
  engagementRateReach: number | null;
  engagementRateFollowers: number | null;
  /** The numerator and denominator behind engagementRateReach, so accounts can be rolled up honestly. */
  engagementBasis: { actions: number; reach: number };
  daysWithData: number;
  daysExpected: number;
  coverage: number;
  complete: boolean;
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Summarise one account (or a set of snapshots already merged per day) over [from, to].
 * `asOf` stops coverage counting days that haven't happened yet.
 */
export const summarize = (snaps: Snap[], from: string, to: string, asOf: string = to): Summary => {
  const sorted = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  const inPeriod = sorted.filter((s) => s.date >= from && s.date <= to);
  const notes: string[] = [];

  // Audience: opening = latest reading on/before the start; otherwise the first reading inside the period (a baseline).
  const withFollowers = sorted.filter((s) => s.followers !== null && s.date <= to);
  const before = withFollowers.filter((s) => s.date <= from);
  let opening: Summary['opening'] = null;
  if (before.length) { const s = before[before.length - 1]; opening = { value: s.followers as number, date: s.date, isBaseline: false }; }
  else { const s = withFollowers.find((x) => x.date >= from); if (s) opening = { value: s.followers as number, date: s.date, isBaseline: true }; }
  const closingSnap = withFollowers.length ? withFollowers[withFollowers.length - 1] : null;
  const closing = closingSnap && opening && closingSnap.date >= opening.date ? { value: closingSnap.followers as number, date: closingSnap.date } : null;

  let netGrowth: number | null = null;
  let growthPct: number | null = null;
  if (opening && closing && closing.date > opening.date) {
    netGrowth = closing.value - opening.value;
    growthPct = opening.value > 0 ? round2((netGrowth / opening.value) * 100) : null;
    if (opening.isBaseline) notes.push(`Tracking started ${opening.date}; growth is measured from that first reading.`);
  } else if (opening && closing) {
    notes.push('Only one follower reading in range, so growth cannot be calculated yet.');
  } else {
    notes.push('No follower readings recorded for this period.');
  }

  const totals = Object.fromEntries(TOTAL_KEYS.map((k) => {
    const vals = inPeriod.map((s) => s[k]).filter((v): v is number => v !== null);
    return [k, vals.length ? vals.reduce((a, b) => a + b, 0) : null];
  })) as Totals;

  // Engagement rate only over days where both numbers exist, so a missing day can't skew it.
  const both = inPeriod.filter((s) => s.engagement !== null && s.reach !== null && (s.reach as number) > 0);
  const engBoth = both.reduce((a, s) => a + (s.engagement as number), 0);
  const reachBoth = both.reduce((a, s) => a + (s.reach as number), 0);
  const engagementRateReach = both.length && reachBoth > 0 ? round2((engBoth / reachBoth) * 100) : null;
  const engagementRateFollowers = totals.engagement !== null && closing && closing.value > 0 ? round2((totals.engagement / closing.value) * 100) : null;

  const effectiveTo = asOf < to ? asOf : to;
  const daysExpected = effectiveTo >= from ? daysBetweenInclusive(from, effectiveTo) : 0;
  const daysWithData = new Set(inPeriod.filter((s) => s.date <= effectiveTo).map((s) => s.date)).size;
  const coverage = daysExpected ? round2(Math.min(1, daysWithData / daysExpected)) : 0;
  const complete = daysExpected > 0 && daysWithData >= daysExpected;
  if (!complete && daysExpected > 0) notes.push(`Data recorded for ${daysWithData} of ${daysExpected} days, so totals are partial.`);

  return { opening, closing, netGrowth, growthPct, totals, engagementRateReach, engagementRateFollowers, engagementBasis: { actions: engBoth, reach: reachBoth }, daysWithData, daysExpected, coverage, complete, notes };
};

export const pctChange = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0 ? null : round2(((cur - prev) / Math.abs(prev)) * 100);

/** The period of equal length immediately before [from, to]. */
export const previousPeriod = (from: string, to: string): { from: string; to: string } => {
  const len = daysBetweenInclusive(from, to);
  const prevTo = new Date(parseYmd(from).getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (len - 1) * DAY);
  return { from: ymd(prevFrom), to: ymd(prevTo) };
};

// ── Post engagement ─────────────────────────────────────────────────────────

export interface PostReading { reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null; videoViews: number | null }

/** Engagement actions for a post: likes + comments + shares + saves. Null when none of them were recorded. */
export const postEngagement = (m: PostReading): number | null => {
  const parts = [m.likes, m.comments, m.shares, m.saves].filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
};
export const postEngagementRate = (m: PostReading): number | null => {
  const e = postEngagement(m);
  return e !== null && m.reach !== null && m.reach > 0 ? round2((e / m.reach) * 100) : null;
};

// ── Targets ─────────────────────────────────────────────────────────────────

export type TargetStatus = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'EXCEEDED' | 'MISSED';

export interface TargetProgress { actual: number | null; percent: number | null; remaining: number | null; status: TargetStatus }

/**
 * Not started before the start date; Exceeded at 110%+, Achieved at 100%+; once the period is over
 * anything short is Missed. While running, you're On track if you've done at least 90% of the share of the
 * target that elapsed time implies, otherwise At risk. No data counts as 0 once the period has started.
 */
export const targetProgress = (actual: number | null, target: number, startsAt: Date, endsAt: Date, now: Date, lowerIsBetter = false, rate = false): TargetProgress => {
  if (now < startsAt) return { actual, percent: null, remaining: target, status: 'NOT_STARTED' };
  const a = actual ?? 0;
  const percent = target > 0 ? round2((lowerIsBetter ? (a === 0 ? 0 : target / a) : a / target) * 100) : null;
  const remaining = lowerIsBetter ? null : Math.max(0, round2(target - a));
  const p = percent ?? 0;
  if (p >= 110) return { actual, percent, remaining, status: 'EXCEEDED' };
  if (p >= 100) return { actual, percent, remaining, status: 'ACHIEVED' };
  if (now > endsAt) return { actual, percent, remaining, status: 'MISSED' };
  // A rate or an average is already a ratio of finished work, so it is judged against the target itself, not against elapsed time.
  if (rate || lowerIsBetter) return { actual, percent, remaining, status: p >= 90 ? 'ON_TRACK' : 'AT_RISK' };
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - startsAt.getTime()) / (endsAt.getTime() - startsAt.getTime() || 1)));
  return { actual, percent, remaining, status: p >= elapsed * 100 * 0.9 ? 'ON_TRACK' : 'AT_RISK' };
};

/** Metrics a person can be held to: only ones their own work determines (PRD 18.5, 19.4). */
export const EMPLOYEE_METRICS = ['POSTS_PUBLISHED', 'TASK_COMPLETION', 'ON_TIME_TASKS', 'APPROVAL_RATE', 'REPORT_COMPLIANCE', 'RESPONSE_COMPLIANCE'] as const;
/** Measures that are ratios or averages rather than running totals. */
export const RATE_METRICS = ['ENGAGEMENT_RATE', 'TASK_COMPLETION', 'ON_TIME_TASKS', 'APPROVAL_RATE', 'REPORT_COMPLIANCE', 'RESPONSE_COMPLIANCE', 'AVG_FIRST_RESPONSE_MINUTES'] as const;
export const ALL_TARGET_METRICS = [
  'FOLLOWER_GROWTH', 'ENGAGEMENT_RATE', 'REACH', 'IMPRESSIONS', 'VIDEO_VIEWS', 'WEBSITE_CLICKS',
  'POSTS_PUBLISHED', 'TASK_COMPLETION', 'ON_TIME_TASKS', 'APPROVAL_RATE', 'REPORT_COMPLIANCE', 'RESPONSE_COMPLIANCE', 'AVG_FIRST_RESPONSE_MINUTES',
] as const;
export const TARGET_UNIT: Record<string, string> = {
  FOLLOWER_GROWTH: 'followers', ENGAGEMENT_RATE: '%', REACH: '', IMPRESSIONS: '', VIDEO_VIEWS: '', WEBSITE_CLICKS: '',
  POSTS_PUBLISHED: 'posts', TASK_COMPLETION: '%', ON_TIME_TASKS: '%', APPROVAL_RATE: '%', REPORT_COMPLIANCE: '%', RESPONSE_COMPLIANCE: '%', AVG_FIRST_RESPONSE_MINUTES: 'min',
};

// ── Staff scorecard ─────────────────────────────────────────────────────────

export interface ScoreInputs {
  tasks: { eligible: number; completed: number; onTime: number };
  content: { created: number; submitted: number; approved: number; published: number };
  reviews: { reviewed: number; approved: number };
  reports: { due: number; submitted: number };
  /** First responses by this person, and how many met the response target. Omitted when the inbox has no data. */
  community?: { responded: number; withinTarget: number };
  targetPercents: number[];
}

export interface ScoreCategory { key: string; label: string; weight: number; score: number | null; detail: string }
export interface Scorecard { categories: ScoreCategory[]; overall: number | null; scoredWeight: number }

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
const avg = (xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const cap = (n: number | null) => (n === null ? null : Math.max(0, Math.min(100, round2(n))));

/**
 * The PRD's starting model (19.3). Categories with nothing to measure are left unscored and the overall is
 * the weighted average of the rest, with `scoredWeight` showing how much of the model it covers.
 */
export const scorecard = (i: ScoreInputs): Scorecard => {
  const completion = pct(i.tasks.completed, i.tasks.eligible);
  const onTime = pct(i.tasks.onTime, i.tasks.completed);
  const production = avg([pct(i.content.submitted, i.content.created), pct(i.content.published, i.content.approved)]);
  const quality = pct(i.reviews.approved, i.reviews.reviewed);
  const reporting = pct(i.reports.submitted, i.reports.due);
  const objectives = avg(i.targetPercents.map((p) => Math.min(100, p)));
  const community = i.community ? pct(i.community.withinTarget, i.community.responded) : null;

  const categories: ScoreCategory[] = [
    { key: 'tasks', label: 'Task execution and deadlines', weight: 20, score: cap(avg([completion, onTime])), detail: i.tasks.eligible ? `${i.tasks.completed}/${i.tasks.eligible} tasks completed, ${i.tasks.onTime} on time` : 'No tasks in this period' },
    { key: 'production', label: 'Content production and consistency', weight: 20, score: cap(production), detail: i.content.created ? `${i.content.submitted}/${i.content.created} submitted, ${i.content.published}/${i.content.approved} approved items published` : 'No content in this period' },
    { key: 'quality', label: 'Content quality and approval', weight: 15, score: cap(quality), detail: i.reviews.reviewed ? `${i.reviews.approved}/${i.reviews.reviewed} reviews approved` : 'Nothing reviewed in this period' },
    { key: 'community', label: 'Community engagement', weight: 15, score: cap(community), detail: i.community && i.community.responded ? `${i.community.withinTarget}/${i.community.responded} first responses within the response target` : 'No inbox responses logged in this period' },
    { key: 'reporting', label: 'Reporting and documentation', weight: 10, score: cap(reporting), detail: i.reports.due ? `${i.reports.submitted}/${i.reports.due} weekly reports submitted` : 'No reports due in this period' },
    { key: 'objectives', label: 'Assigned objectives and campaign execution', weight: 20, score: cap(objectives), detail: i.targetPercents.length ? `${i.targetPercents.length} assigned target(s); campaigns are not tracked yet` : 'No targets assigned' },
  ];
  const scored = categories.filter((c) => c.score !== null);
  const scoredWeight = scored.reduce((a, c) => a + c.weight, 0);
  const overall = scoredWeight ? round2(scored.reduce((a, c) => a + (c.score as number) * c.weight, 0) / scoredWeight) : null;
  return { categories, overall, scoredWeight };
};

// ── Post rankings ───────────────────────────────────────────────────────────

export interface RankedPost {
  variantId: string; contentId: string; title: string; account: string; platform: string; category: string | null; format: string;
  publishedAt: string | null; url: string | null; reach: number | null; engagement: number | null; engagementRate: number | null;
}

/** Best and worst by engagement rate (falling back to raw engagement); posts with no readings are left out of both lists. */
export const topAndBottom = (posts: RankedPost[], n = 5) => {
  const measured = posts.filter((p) => p.engagementRate !== null || p.engagement !== null);
  const key = (p: RankedPost) => (p.engagementRate !== null ? p.engagementRate : -1) * 1_000_000 + (p.engagement ?? 0);
  const sorted = [...measured].sort((a, b) => key(b) - key(a));
  const top = sorted.slice(0, n);
  // The lowest list only holds posts that did not make the best list, so a small set is never shown twice.
  const bottom = sorted.slice(n).slice(-n).reverse();
  return { top, bottom, measured: measured.length, unmeasured: posts.length - measured.length };
};

/** Average engagement rate per group (category or format), only counting posts that have one. */
export const groupPerformance = (posts: RankedPost[], by: 'category' | 'format') => {
  const groups = new Map<string, { posts: number; measured: number; rates: number[] }>();
  for (const p of posts) {
    const k = (p[by] ?? 'Uncategorised') as string;
    const g = groups.get(k) ?? { posts: 0, measured: 0, rates: [] };
    g.posts++;
    if (p.engagementRate !== null) { g.measured++; g.rates.push(p.engagementRate); }
    groups.set(k, g);
  }
  return [...groups.entries()].map(([name, g]) => ({ name, posts: g.posts, measured: g.measured, avgEngagementRate: g.rates.length ? Math.round((g.rates.reduce((a, b) => a + b, 0) / g.rates.length) * 100) / 100 : null }))
    .sort((a, b) => (b.avgEngagementRate ?? -1) - (a.avgEngagementRate ?? -1));
};

