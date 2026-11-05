// SMOIS predictive insights and anomaly detection. All of it is plain arithmetic on manually recorded readings,
// every result is labelled an ESTIMATE, and each one refuses to answer when there is too little data.
import { daysBetweenInclusive, parseYmd } from './analytics';

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Linear trend ────────────────────────────────────────────────────────────

export interface Fit { slope: number; intercept: number; r2: number; residualSd: number; n: number }

/** Ordinary least squares. Needs at least three distinct x values. */
export const linearFit = (pts: { x: number; y: number }[]): Fit | null => {
  const n = pts.length;
  if (n < 3 || new Set(pts.map((p) => p.x)).size < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const sxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = pts.reduce((a, p) => a + (p.y - my) ** 2, 0);
  const ssRes = pts.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0);
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, residualSd: Math.sqrt(ssRes / Math.max(1, n - 2)), n };
};

// ── Follower forecast ───────────────────────────────────────────────────────

export const MIN_READINGS = 6;
export const MIN_SPAN_DAYS = 14;
export const MAX_HORIZON_DAYS = 90;
const WINDOW_DAYS = 60;

export interface Reading { date: string; value: number }

export type Forecast =
  | { ok: false; reason: string }
  | {
      ok: true; label: 'ESTIMATE'; targetDate: string; projected: number; low: number; high: number; perDay: number;
      confidence: 'LOW' | 'MEDIUM' | 'HIGH'; basis: { readings: number; from: string; to: string; spanDays: number; r2: number }; note: string;
    };

/**
 * Straight-line projection of follower count from the last 60 days of readings. The band widens with the horizon
 * and with how noisy the readings are. It is a trend, not a prediction of what will happen.
 */
export const forecastFollowers = (all: Reading[], targetDate: string): Forecast => {
  const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return { ok: false, reason: 'No follower readings recorded yet.' };
  const lastDate = sorted[sorted.length - 1].date;
  const windowStart = new Date(parseYmd(lastDate).getTime() - WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const pts = sorted.filter((r) => r.date >= windowStart);
  const spanDays = daysBetweenInclusive(pts[0].date, lastDate);
  if (pts.length < MIN_READINGS || spanDays < MIN_SPAN_DAYS) {
    return { ok: false, reason: `Needs at least ${MIN_READINGS} readings over ${MIN_SPAN_DAYS} days to draw a trend (there are ${pts.length} over ${spanDays} days).` };
  }
  const horizon = Math.round((parseYmd(targetDate).getTime() - parseYmd(lastDate).getTime()) / DAY);
  if (horizon < 1) return { ok: false, reason: 'Choose a date after the latest reading.' };
  if (horizon > MAX_HORIZON_DAYS) return { ok: false, reason: `Forecasts stop at ${MAX_HORIZON_DAYS} days ahead; a trend this thin says nothing about later.` };

  const base = parseYmd(pts[0].date).getTime();
  const fit = linearFit(pts.map((r) => ({ x: (parseYmd(r.date).getTime() - base) / DAY, y: r.value })));
  if (!fit) return { ok: false, reason: 'The readings are too uneven to fit a trend.' };
  const x = (parseYmd(targetDate).getTime() - base) / DAY;
  const projected = fit.intercept + fit.slope * x;
  // Even a perfectly straight run of readings does not make the future certain, so the band never shrinks below 0.5% of the projection.
  const half = Math.max(1.96 * fit.residualSd * (1 + horizon / Math.max(1, spanDays)), Math.abs(projected) * 0.005);
  const confidence = fit.r2 >= 0.9 && pts.length >= 10 ? 'HIGH' : fit.r2 >= 0.7 ? 'MEDIUM' : 'LOW';
  return {
    ok: true, label: 'ESTIMATE', targetDate,
    projected: Math.round(projected), low: Math.round(projected - half), high: Math.round(projected + half), perDay: round1(fit.slope),
    confidence, basis: { readings: pts.length, from: pts[0].date, to: lastDate, spanDays, r2: Math.round(fit.r2 * 100) / 100 },
    note: `Estimate from the straight-line trend of ${pts.length} manually recorded readings. It assumes the recent pace continues; a campaign, a viral post or a missed reading would change it.`,
  };
};

export type Outlook = 'LIKELY' | 'POSSIBLE' | 'UNLIKELY';

/** Will a follower-growth target be reached? Compares the whole estimate band with the goal, not just the middle. */
export const growthOutlook = (forecast: Forecast, openingFollowers: number, targetGrowth: number): { outlook: Outlook; projectedGrowth: number } | null => {
  if (!forecast.ok) return null;
  const low = forecast.low - openingFollowers; const high = forecast.high - openingFollowers;
  const projectedGrowth = forecast.projected - openingFollowers;
  return { outlook: low >= targetGrowth ? 'LIKELY' : high < targetGrowth ? 'UNLIKELY' : 'POSSIBLE', projectedGrowth };
};

// ── Best times to post ──────────────────────────────────────────────────────

export interface PostSample { at: Date; rate: number | null }

const LAGOS_OFFSET = 3_600_000;
const BANDS: { key: string; label: string; from: number; to: number }[] = [
  { key: 'morning', label: 'Morning (6–11)', from: 6, to: 11 },
  { key: 'midday', label: 'Midday (11–15)', from: 11, to: 15 },
  { key: 'afternoon', label: 'Afternoon (15–19)', from: 15, to: 19 },
  { key: 'evening', label: 'Evening (19–23)', from: 19, to: 23 },
  { key: 'night', label: 'Night (23–6)', from: 23, to: 30 },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MIN_POSTS_FOR_TIMING = 10;
const MIN_PER_BUCKET = 2;

const bandOf = (hour: number) => BANDS.find((b) => (hour >= b.from && hour < b.to) || (b.key === 'night' && hour < 6))!;

export type PostingTimes =
  | { ok: false; reason: string }
  | { ok: true; label: 'ESTIMATE'; sample: number; byWeekday: { day: string; posts: number; avgRate: number }[]; byBand: { band: string; posts: number; avgRate: number }[]; best: { day: string | null; band: string | null }; note: string };

export const bestPostingTimes = (posts: PostSample[]): PostingTimes => {
  const measured = posts.filter((p): p is { at: Date; rate: number } => p.rate !== null);
  if (measured.length < MIN_POSTS_FOR_TIMING) return { ok: false, reason: `Needs at least ${MIN_POSTS_FOR_TIMING} published posts with recorded results to compare times (there are ${measured.length}).` };
  const day = new Map<string, number[]>(); const band = new Map<string, number[]>();
  for (const p of measured) {
    const l = new Date(p.at.getTime() + LAGOS_OFFSET);
    const d = WEEKDAYS[l.getUTCDay()]; const b = bandOf(l.getUTCHours()).label;
    day.set(d, [...(day.get(d) ?? []), p.rate]); band.set(b, [...(band.get(b) ?? []), p.rate]);
  }
  const summarize = (m: Map<string, number[]>) => [...m.entries()].filter(([, v]) => v.length >= MIN_PER_BUCKET)
    .map(([k, v]) => ({ k, posts: v.length, avgRate: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 })).sort((a, b) => b.avgRate - a.avgRate);
  const d = summarize(day); const b = summarize(band);
  return {
    ok: true, label: 'ESTIMATE', sample: measured.length,
    byWeekday: d.map((x) => ({ day: x.k, posts: x.posts, avgRate: x.avgRate })), byBand: b.map((x) => ({ band: x.k, posts: x.posts, avgRate: x.avgRate })),
    best: { day: d[0]?.k ?? null, band: b[0]?.k ?? null },
    note: `Compares the engagement rate of ${measured.length} posts by when they went out. Days or time bands with fewer than ${MIN_PER_BUCKET} posts are left out. This shows what happened, not what causes results: content and topic matter too.`,
  };
};

// ── Unusual performance ─────────────────────────────────────────────────────

export interface Anomaly { flagged: boolean; direction: 'UP' | 'DOWN' | null; z: number; mean: number; last: number; pctChange: number | null; reason: string }

/**
 * Is the latest value far outside the recent pattern? Needs seven earlier values, a z-score of 2.5 and a swing of at
 * least a quarter, so a steady number with a tiny wobble doesn't raise an alarm.
 */
export const detectAnomaly = (series: number[]): Anomaly => {
  const none = (reason: string): Anomaly => ({ flagged: false, direction: null, z: 0, mean: 0, last: series[series.length - 1] ?? 0, pctChange: null, reason });
  if (series.length < 8) return none('Needs at least 7 earlier readings to know what is normal.');
  const last = series[series.length - 1];
  const prior = series.slice(-15, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length);
  if (sd === 0 || mean === 0) return { ...none('The earlier readings do not vary enough to judge.'), mean };
  const z = (last - mean) / sd;
  const pct = ((last - mean) / Math.abs(mean)) * 100;
  const flagged = Math.abs(z) >= 2.5 && Math.abs(pct) >= 25;
  return { flagged, direction: flagged ? (z > 0 ? 'UP' : 'DOWN') : null, z: Math.round(z * 100) / 100, mean: Math.round(mean * 100) / 100, last, pctChange: Math.round(pct * 10) / 10, reason: flagged ? `${Math.abs(Math.round(pct))}% ${z > 0 ? 'above' : 'below'} the recent average` : 'Within the normal range.' };
};

/** Which part of the day (Lagos hour 0-23) an hour falls in. Shared by posting-time and inbox-hour analysis. */
export const bandLabelOf = (hour: number): string => bandOf(hour).label;
