import {
  Snap, daysBetweenInclusive, pctChange, postEngagement, postEngagementRate, previousPeriod, scorecard, summarize, targetProgress,
} from '../analytics';

const snap = (date: string, o: Partial<Snap> = {}): Snap => ({ date, followers: null, reach: null, impressions: null, engagement: null, profileVisits: null, videoViews: null, websiteClicks: null, ...o });

describe('summarize (growth and coverage)', () => {
  it('measures net growth and percentage from the reading before the period to the last reading in it', () => {
    const s = summarize([snap('2026-10-31', { followers: 1000 }), snap('2026-11-15', { followers: 1100 }), snap('2026-11-30', { followers: 1250 })], '2026-11-01', '2026-11-30');
    expect(s.opening).toEqual({ value: 1000, date: '2026-10-31', isBaseline: false });
    expect(s.closing).toEqual({ value: 1250, date: '2026-11-30' });
    expect(s.netGrowth).toBe(250);
    expect(s.growthPct).toBe(25);
  });

  it('uses the first reading inside the period as a labelled baseline when nothing came before', () => {
    const s = summarize([snap('2026-11-05', { followers: 500 }), snap('2026-11-20', { followers: 550 })], '2026-11-01', '2026-11-30');
    expect(s.opening?.isBaseline).toBe(true);
    expect(s.netGrowth).toBe(50);
    expect(s.notes.join(' ')).toMatch(/Tracking started 2026-11-05/);
  });

  it('refuses to invent growth from a single reading or from no readings', () => {
    const one = summarize([snap('2026-11-10', { followers: 500 })], '2026-11-01', '2026-11-30');
    expect(one.netGrowth).toBeNull();
    expect(one.growthPct).toBeNull();
    const none = summarize([], '2026-11-01', '2026-11-30');
    expect(none.opening).toBeNull();
    expect(none.netGrowth).toBeNull();
    expect(none.totals.reach).toBeNull();
  });

  it('handles a falling audience and a zero starting audience', () => {
    expect(summarize([snap('2026-10-31', { followers: 200 }), snap('2026-11-30', { followers: 150 })], '2026-11-01', '2026-11-30').growthPct).toBe(-25);
    expect(summarize([snap('2026-10-31', { followers: 0 }), snap('2026-11-30', { followers: 150 })], '2026-11-01', '2026-11-30').growthPct).toBeNull();
  });

  it('sums daily figures only from days in the period and keeps "not recorded" as null, not zero', () => {
    const s = summarize([
      snap('2026-10-30', { reach: 999 }),
      snap('2026-11-01', { reach: 100, impressions: 300 }),
      snap('2026-11-02', { reach: 50 }),
    ], '2026-11-01', '2026-11-03', '2026-11-03');
    expect(s.totals.reach).toBe(150);
    expect(s.totals.impressions).toBe(300);
    expect(s.totals.videoViews).toBeNull();
  });

  it('reports coverage up to today and flags partial data', () => {
    const s = summarize([snap('2026-11-01', { reach: 10 }), snap('2026-11-02', { reach: 10 })], '2026-11-01', '2026-11-30', '2026-11-04');
    expect(s.daysExpected).toBe(4);
    expect(s.daysWithData).toBe(2);
    expect(s.coverage).toBe(0.5);
    expect(s.complete).toBe(false);
    expect(s.notes.join(' ')).toMatch(/2 of 4 days/);
    const full = summarize([snap('2026-11-01', { reach: 1 }), snap('2026-11-02', { reach: 1 })], '2026-11-01', '2026-11-02');
    expect(full.complete).toBe(true);
  });

  it('computes engagement rate by reach only over days that have both numbers', () => {
    const s = summarize([
      snap('2026-11-01', { reach: 1000, engagement: 50 }),
      snap('2026-11-02', { reach: 1000 }),            // no engagement recorded: must not dilute the rate
      snap('2026-11-03', { engagement: 40 }),          // no reach recorded: must not inflate it
    ], '2026-11-01', '2026-11-03');
    expect(s.engagementRateReach).toBe(5);
  });

  it('computes engagement rate by followers from the closing follower count', () => {
    const s = summarize([snap('2026-10-31', { followers: 1000 }), snap('2026-11-02', { followers: 2000, engagement: 100 })], '2026-11-01', '2026-11-02');
    expect(s.engagementRateFollowers).toBe(5);
  });
});

describe('period helpers', () => {
  it('counts inclusive days and finds the equal-length previous period', () => {
    expect(daysBetweenInclusive('2026-11-01', '2026-11-30')).toBe(30);
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(previousPeriod('2026-11-02', '2026-11-08')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });
  it('pctChange is null whenever it would be meaningless', () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
  });
});

describe('post engagement', () => {
  const m = { reach: 1000, impressions: 1500, likes: 40, comments: 5, shares: 3, saves: 2, clicks: 9, videoViews: null };
  it('adds likes, comments, shares and saves, and leaves clicks out', () => {
    expect(postEngagement(m)).toBe(50);
    expect(postEngagementRate(m)).toBe(5);
  });
  it('is null when nothing was recorded, and rate needs reach', () => {
    const blank = { reach: null, impressions: null, likes: null, comments: null, shares: null, saves: null, clicks: 3, videoViews: null };
    expect(postEngagement(blank)).toBeNull();
    expect(postEngagementRate({ ...m, reach: null })).toBeNull();
    expect(postEngagementRate({ ...m, reach: 0 })).toBeNull();
  });
});

describe('targetProgress', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const end = new Date('2026-11-30T23:59:59Z');
  it('is not started before the start date', () => {
    expect(targetProgress(0, 100, start, end, new Date('2026-10-20T00:00:00Z')).status).toBe('NOT_STARTED');
  });
  it('reports achieved and exceeded', () => {
    expect(targetProgress(100, 100, start, end, new Date('2026-11-10T00:00:00Z')).status).toBe('ACHIEVED');
    expect(targetProgress(115, 100, start, end, new Date('2026-11-10T00:00:00Z')).status).toBe('EXCEEDED');
  });
  it('is on track or at risk while running, depending on elapsed time', () => {
    const mid = new Date('2026-11-15T12:00:00Z'); // about half way
    expect(targetProgress(50, 100, start, end, mid).status).toBe('ON_TRACK');
    expect(targetProgress(20, 100, start, end, mid).status).toBe('AT_RISK');
  });
  it('is missed once the period is over and short, and treats no data as zero', () => {
    expect(targetProgress(80, 100, start, end, new Date('2026-12-02T00:00:00Z')).status).toBe('MISSED');
    expect(targetProgress(null, 100, start, end, new Date('2026-12-02T00:00:00Z')).status).toBe('MISSED');
    expect(targetProgress(null, 100, start, end, new Date('2026-11-10T00:00:00Z')).percent).toBe(0);
  });
  it('shows what is left', () => {
    expect(targetProgress(30, 100, start, end, new Date('2026-11-10T00:00:00Z')).remaining).toBe(70);
  });
});

describe('scorecard', () => {
  const base = {
    tasks: { eligible: 10, completed: 8, onTime: 6 },
    content: { created: 10, submitted: 9, approved: 6, published: 6 },
    reviews: { reviewed: 8, approved: 6 },
    reports: { due: 4, submitted: 4 },
    targetPercents: [80, 130],
  };
  it('scores each measurable category and weights them', () => {
    const c = scorecard(base);
    const by = Object.fromEntries(c.categories.map((x) => [x.key, x.score]));
    expect(by.tasks).toBe(77.5);        // avg(80, 75)
    expect(by.production).toBe(95);     // avg(90, 100)
    expect(by.quality).toBe(75);
    expect(by.reporting).toBe(100);
    expect(by.objectives).toBe(90);     // avg(80, min(100,130))
    expect(by.community).toBeNull();    // inbox not built, so it is never scored
    expect(c.scoredWeight).toBe(85);
    expect(c.overall).toBeCloseTo((77.5 * 20 + 95 * 20 + 75 * 15 + 100 * 10 + 90 * 20) / 85, 1);
  });
  it('leaves unmeasurable categories out instead of scoring them zero', () => {
    const c = scorecard({ tasks: { eligible: 0, completed: 0, onTime: 0 }, content: { created: 0, submitted: 0, approved: 0, published: 0 }, reviews: { reviewed: 0, approved: 0 }, reports: { due: 0, submitted: 0 }, targetPercents: [] });
    expect(c.overall).toBeNull();
    expect(c.scoredWeight).toBe(0);
    expect(c.categories.every((x) => x.score === null)).toBe(true);
  });
  it('does not let one over-achieved target hide a weak one', () => {
    const c = scorecard({ ...base, targetPercents: [20, 500] });
    expect(c.categories.find((x) => x.key === 'objectives')?.score).toBe(60);
  });
});

describe('post rankings', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { topAndBottom, groupPerformance } = require('../analytics');
  const post = (n: number, rate: number | null, eng: number | null = rate === null ? null : rate * 10, extra: Record<string, unknown> = {}) => ({
    variantId: `v${n}`, contentId: `c${n}`, title: `Post ${n}`, account: 'A', platform: 'X', category: 'Promo', format: 'TEXT', publishedAt: null, url: null, reach: 1000, engagement: eng, engagementRate: rate, ...extra,
  });

  it('never shows the same post in the best and lowest lists', () => {
    const posts = [1, 2, 3, 4, 5, 6, 7].map((n) => post(n, n));
    const r = topAndBottom(posts);
    expect(r.top.map((p: { variantId: string }) => p.variantId)).toEqual(['v7', 'v6', 'v5', 'v4', 'v3']);
    expect(r.bottom.map((p: { variantId: string }) => p.variantId)).toEqual(['v1', 'v2']);
    const overlap = r.top.filter((t: { variantId: string }) => r.bottom.some((b: { variantId: string }) => b.variantId === t.variantId));
    expect(overlap).toEqual([]);
  });
  it('shows no lowest list when there are five or fewer measured posts', () => {
    expect(topAndBottom([1, 2, 3].map((n) => post(n, n))).bottom).toEqual([]);
  });
  it('leaves posts with no readings out of both lists and counts them', () => {
    const r = topAndBottom([post(1, 5), post(2, null, null), post(3, null, null)]);
    expect(r.top).toHaveLength(1);
    expect(r.measured).toBe(1);
    expect(r.unmeasured).toBe(2);
  });
  it('falls back to raw engagement when reach was not recorded', () => {
    const r = topAndBottom([post(1, null, 40), post(2, null, 90)]);
    expect(r.top[0].variantId).toBe('v2');
  });
  it('averages engagement rate per group over measured posts only', () => {
    const g = groupPerformance([post(1, 4, 40, { category: 'Promo' }), post(2, 6, 60, { category: 'Promo' }), post(3, null, null, { category: 'Promo' }), post(4, 2, 20, { category: null })], 'category');
    const promo = g.find((x: { name: string }) => x.name === 'Promo');
    expect(promo).toMatchObject({ posts: 3, measured: 2, avgEngagementRate: 5 });
    expect(g.find((x: { name: string }) => x.name === 'Uncategorised')).toMatchObject({ posts: 1, avgEngagementRate: 2 });
  });
});

describe('phase 3 additions', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const end = new Date('2026-11-30T23:59:59Z');
  const mid = new Date('2026-11-15T12:00:00Z');

  it('judges a rate against the target itself, not against elapsed time', () => {
    // 85% against a 90% target is within reach whatever the date; 50% is not
    expect(targetProgress(85, 90, start, end, mid, false, true).status).toBe('ON_TRACK');
    expect(targetProgress(50, 90, start, end, mid, false, true).status).toBe('AT_RISK');
    expect(targetProgress(95, 90, start, end, mid, false, true).status).toBe('ACHIEVED');
  });

  it('treats response time as lower-is-better', () => {
    // target 30 min, actual 20 min -> 150% -> exceeded
    expect(targetProgress(20, 30, start, end, mid, true, true)).toMatchObject({ percent: 150, status: 'EXCEEDED' });
    expect(targetProgress(60, 30, start, end, mid, true, true).status).toBe('AT_RISK');
    expect(targetProgress(60, 30, start, end, new Date('2026-12-05T00:00:00Z'), true, true).status).toBe('MISSED');
  });

  const base = { tasks: { eligible: 0, completed: 0, onTime: 0 }, content: { created: 0, submitted: 0, approved: 0, published: 0 }, reviews: { reviewed: 0, approved: 0 }, reports: { due: 0, submitted: 0 }, targetPercents: [] as number[] };
  it('scores community engagement from first responses within target once there are any', () => {
    const c = scorecard({ ...base, community: { responded: 10, withinTarget: 9 } });
    expect(c.categories.find((x) => x.key === 'community')).toMatchObject({ score: 90, weight: 15 });
    expect(c.scoredWeight).toBe(15);
    expect(c.overall).toBe(90);
  });
  it('leaves community unscored when nothing was answered', () => {
    expect(scorecard(base).categories.find((x) => x.key === 'community')?.score).toBeNull();
    expect(scorecard({ ...base, community: { responded: 0, withinTarget: 0 } }).categories.find((x) => x.key === 'community')?.score).toBeNull();
  });
});
