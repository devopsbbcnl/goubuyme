import { bestPostingTimes, detectAnomaly, forecastFollowers, growthOutlook, linearFit } from '../predict';
import { extractNumbers, factNumbers, verifyNumbers } from '../aiGuard';
import { WorkflowMetrics, workflowFindings } from '../improve';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);

describe('linearFit', () => {
  it('recovers a straight line', () => {
    const f = linearFit([0, 1, 2, 3, 4].map((x) => ({ x, y: 10 + 3 * x })))!;
    expect(f.slope).toBeCloseTo(3);
    expect(f.intercept).toBeCloseTo(10);
    expect(f.r2).toBeCloseTo(1);
  });
  it('refuses fewer than three distinct points', () => {
    expect(linearFit([{ x: 0, y: 1 }, { x: 1, y: 2 }])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])).toBeNull();
  });
});

describe('forecastFollowers', () => {
  const steady = Array.from({ length: 12 }, (_, i) => ({ date: day(i * 3), value: 1000 + i * 30 })); // +10/day over 33 days
  it('projects the trend and labels it an estimate', () => {
    const f = forecastFollowers(steady, day(43));
    expect(f.ok).toBe(true);
    if (f.ok) {
      expect(f.label).toBe('ESTIMATE');
      expect(f.perDay).toBe(10);
      expect(f.projected).toBe(1430);     // 1000 + 43 * 10
      expect(f.low).toBeLessThanOrEqual(f.projected);
      expect(f.high).toBeGreaterThanOrEqual(f.projected);
      expect(f.confidence).toBe('HIGH');
      expect(f.basis.readings).toBe(12);
      expect(f.note).toMatch(/Estimate/);
    }
  });
  it('widens the band for a noisy series and lowers the confidence', () => {
    const noisy = steady.map((r, i) => ({ ...r, value: r.value + (i % 2 ? 90 : -90) }));
    const a = forecastFollowers(steady, day(43)); const b = forecastFollowers(noisy, day(43));
    if (a.ok && b.ok) { expect(b.high - b.low).toBeGreaterThan(a.high - a.low); expect(b.confidence).not.toBe('HIGH'); }
  });
  it('refuses to guess with too little data', () => {
    expect(forecastFollowers([], day(5))).toMatchObject({ ok: false });
    const few = forecastFollowers(steady.slice(0, 4), day(20));
    expect(few.ok).toBe(false);
    if (!few.ok) expect(few.reason).toMatch(/at least 6 readings over 14 days/);
    const short = forecastFollowers(Array.from({ length: 7 }, (_, i) => ({ date: day(i), value: 100 + i })), day(10));
    expect(short.ok).toBe(false);
  });
  it('refuses past and far-future dates', () => {
    expect(forecastFollowers(steady, day(10)).ok).toBe(false);
    const far = forecastFollowers(steady, day(33 + 120));
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toMatch(/90 days/);
  });
});

describe('growthOutlook', () => {
  const f = forecastFollowers(Array.from({ length: 12 }, (_, i) => ({ date: day(i * 3), value: 1000 + i * 30 })), day(43));
  it('compares the whole band with the target', () => {
    expect(growthOutlook(f, 1000, 300)?.outlook).toBe('LIKELY');
    expect(growthOutlook(f, 1000, 900)?.outlook).toBe('UNLIKELY');
    expect(growthOutlook(f, 1000, 430)).toMatchObject({ projectedGrowth: 430 });
  });
  it('says nothing when there is no forecast', () => {
    expect(growthOutlook({ ok: false, reason: 'x' }, 1000, 100)).toBeNull();
  });
});

describe('bestPostingTimes', () => {
  // Lagos = UTC+1. 2026-11-02 is a Monday.
  const at = (d: number, h: number) => new Date(Date.UTC(2026, 10, d, h - 1, 0, 0));
  const posts = [
    ...[2, 9, 16].map((d) => ({ at: at(d, 9), rate: 6 })),      // Mondays 9:00 -> morning, high
    ...[3, 10, 17].map((d) => ({ at: at(d, 21), rate: 2 })),    // Tuesdays 21:00 -> evening, low
    ...[4, 11, 18, 25].map((d) => ({ at: at(d, 13), rate: 4 })), // Wednesdays 13:00 -> midday
    { at: at(5, 8), rate: null },                                // no result recorded: ignored
  ];
  it('finds the strongest day and time band, in Lagos time', () => {
    const r = bestPostingTimes(posts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.best).toEqual({ day: 'Monday', band: 'Morning (6–11)' });
      expect(r.sample).toBe(10);
      expect(r.note).toMatch(/not what causes/);
    }
  });
  it('refuses a small sample, and leaves thin buckets out', () => {
    expect(bestPostingTimes(posts.slice(0, 4)).ok).toBe(false);
    const r = bestPostingTimes([...posts, ...[1, 2, 3].map(() => ({ at: at(6, 14), rate: 9 }))]);
    if (r.ok) expect(r.byWeekday.every((d) => d.posts >= 2)).toBe(true);
  });
});

describe('detectAnomaly', () => {
  const calm = [100, 102, 98, 101, 99, 103, 97, 100];
  it('flags a sharp rise or fall against the recent pattern', () => {
    expect(detectAnomaly([...calm, 180])).toMatchObject({ flagged: true, direction: 'UP' });
    expect(detectAnomaly([...calm, 30])).toMatchObject({ flagged: true, direction: 'DOWN' });
  });
  it('ignores normal variation', () => {
    expect(detectAnomaly([...calm, 104]).flagged).toBe(false);
  });
  it('needs enough history and some variation', () => {
    expect(detectAnomaly([100, 100, 100, 500]).flagged).toBe(false);
    expect(detectAnomaly([100, 100, 100, 100, 100, 100, 100, 100, 500]).flagged).toBe(false); // zero spread: cannot judge
  });
  it('needs a big enough swing, not just a big z-score', () => {
    expect(detectAnomaly([1000, 1001, 999, 1000, 1002, 998, 1000, 1001, 1020]).flagged).toBe(false);
  });
});

describe('verifyNumbers', () => {
  const facts = { period: { from: '2026-11-01', to: '2026-11-30' }, followers: 4700, growthPct: 4.25, reach: 1650, accounts: [{ name: 'IG', followers: 4700 }], note: 'Net growth was 230 followers' };
  it('accepts numbers that are in the data, however they are written', () => {
    expect(verifyNumbers('Followers reached 4,700, up 4.25% (230 gained). Reach was 1,650.', facts)).toMatchObject({ unverified: [] });
    expect(verifyNumbers('About 4.3% growth', facts).unverified).toEqual([]);     // rounded to the precision stated
    expect(verifyNumbers('Roughly 4.7k followers', facts).unverified).toEqual([]);
    expect(verifyNumbers('₦30,000 spent', { spend: 30000 }).unverified).toEqual([]);
  });
  it('flags figures the model made up', () => {
    const r = verifyNumbers('Followers hit 5,200 and reach was 1,650.', facts);
    expect(r.unverified).toEqual(['5,200']);
    expect(verifyNumbers('Growth was 9.9%', facts).unverified).toEqual(['9.9%']);
  });
  it('does not treat dates, years, times or list markers as claims', () => {
    const r = verifyNumbers('1. In 2026, between 2026-11-01 and 2026-11-30 at 10:30 am, followers were 4,700.\n2) Next steps', facts);
    expect(r.unverified).toEqual([]);
    expect(r.checked).toBe(1);
  });
  it('treats a derived figure as unverified, so the reader checks it', () => {
    expect(verifyNumbers('That is 470 more than before', facts).unverified).toEqual(['470']);
  });
  it('collects numbers from nested data and numeric text', () => {
    expect(factNumbers({ a: [{ b: 3 }], c: 'saw 12 posts' }).sort((x, y) => x - y)).toEqual([3, 12]);
    expect(extractNumbers('1,250 and 1.2k')[1].value).toBe(1200);
  });
});

describe('workflowFindings', () => {
  const healthy: WorkflowMetrics = {
    approvals: { reviewed: 10, avgHours: 6, queueNow: 1, oldestHours: 3, revisionRatePct: 10, rejectRatePct: 0 },
    publishing: { published: 20, failed: 0 }, tasks: { open: 5, overdue: 0, completed: 20, completedLate: 1 },
    inbox: { answered: 30, missedTarget: 2, byBand: [{ band: 'Morning', received: 10, missed: 0 }] },
    coverage: { accounts: 3, withoutAssignee: 0, assignedButQuiet: [], staleReadings: 0 }, assets: { expiringSoon: 0, expired: 0 }, windowDays: 30,
  };
  it('says nothing when things are healthy', () => {
    expect(workflowFindings(healthy)).toEqual([]);
  });
  it('flags slow approvals with the numbers behind it', () => {
    const f = workflowFindings({ ...healthy, approvals: { ...healthy.approvals, avgHours: 55, queueNow: 4, oldestHours: 90 } });
    expect(f[0]).toMatchObject({ key: 'approvals-slow', severity: 'HIGH' });
    expect(f[0].evidence).toMatch(/55 hours.*10 reviews.*4 waiting.*90 hours/);
    expect(f[0].suggestion.length).toBeGreaterThan(10);
  });
  it('flags several problems at once, most serious first', () => {
    const f = workflowFindings({
      ...healthy,
      publishing: { published: 6, failed: 3 }, tasks: { open: 8, overdue: 5, completed: 20, completedLate: 12 },
      inbox: { answered: 20, missedTarget: 12, byBand: [{ band: 'Night (23–6)', received: 8, missed: 6 }] },
      coverage: { accounts: 4, withoutAssignee: 1, assignedButQuiet: [{ name: 'GoBuyMe on X', days: 12 }], staleReadings: 2 }, assets: { expiringSoon: 1, expired: 1 },
    });
    const keys = f.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['publish-failures', 'tasks-overdue', 'tasks-late', 'inbox-slow', 'inbox-hours', 'accounts-unassigned', 'readings-stale', 'assets-expiry']));
    expect(f[0].severity).toBe('HIGH');
    const order = f.map((x) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[x.severity]);
    expect([...order].sort()).toEqual(order);
  });
  it('does not draw conclusions from a handful of items', () => {
    const f = workflowFindings({ ...healthy, approvals: { reviewed: 2, avgHours: 80, queueNow: 1, oldestHours: 2, revisionRatePct: 100, rejectRatePct: 0 }, inbox: { answered: 3, missedTarget: 3, byBand: [{ band: 'Night', received: 3, missed: 3 }] } });
    expect(f).toEqual([]);
  });
});
