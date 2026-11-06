import {
  DEFAULT_HOURS, SlaConfig, addBusinessMinutes, assetExpiry, businessMinutesBetween, campaignTotals, canMoveCampaign, canMoveConversation,
  competitorSummary, isBusinessMoment, negativeSpike, nextOpening, recentReplyBy, responseMinutes, slaDueAt, slaState,
} from '../community';

// Lagos is UTC+1. These helpers build instants from Lagos wall-clock time.
const L = (iso: string) => new Date(`${iso}+01:00`);
const cfg: SlaConfig = { high: 30, standard: 120, general: 1440, hours: DEFAULT_HOURS };

describe('business hours', () => {
  // 2026-11-05 is a Thursday.
  it('knows when the business is open', () => {
    expect(isBusinessMoment(L('2026-11-05T10:00:00'))).toBe(true);
    expect(isBusinessMoment(L('2026-11-05T07:59:00'))).toBe(false);
    expect(isBusinessMoment(L('2026-11-05T18:00:00'))).toBe(false);
    expect(isBusinessMoment(L('2026-11-07T10:00:00'))).toBe(false); // Saturday
  });

  it('moves to the next opening when closed', () => {
    expect(nextOpening(L('2026-11-05T06:00:00')).toISOString()).toBe(L('2026-11-05T08:00:00').toISOString());
    expect(nextOpening(L('2026-11-05T19:00:00')).toISOString()).toBe(L('2026-11-06T08:00:00').toISOString());
    expect(nextOpening(L('2026-11-06T19:00:00')).toISOString()).toBe(L('2026-11-09T08:00:00').toISOString()); // Fri evening -> Monday
    expect(nextOpening(L('2026-11-05T10:00:00')).toISOString()).toBe(L('2026-11-05T10:00:00').toISOString());
  });

  it('adds minutes on the business clock', () => {
    expect(addBusinessMinutes(L('2026-11-05T10:00:00'), 30).toISOString()).toBe(L('2026-11-05T10:30:00').toISOString());
    // 17:45 + 30 min: 15 left today, 15 tomorrow morning
    expect(addBusinessMinutes(L('2026-11-05T17:45:00'), 30).toISOString()).toBe(L('2026-11-06T08:15:00').toISOString());
    // Friday 17:30 + 2h -> Monday 09:30
    expect(addBusinessMinutes(L('2026-11-06T17:30:00'), 120).toISOString()).toBe(L('2026-11-09T09:30:00').toISOString());
    // Received on Saturday: the clock starts Monday at 08:00
    expect(addBusinessMinutes(L('2026-11-07T12:00:00'), 30).toISOString()).toBe(L('2026-11-09T08:30:00').toISOString());
  });

  it('counts only business minutes between two instants', () => {
    expect(businessMinutesBetween(L('2026-11-05T10:00:00'), L('2026-11-05T11:30:00'))).toBe(90);
    expect(businessMinutesBetween(L('2026-11-05T17:00:00'), L('2026-11-06T09:00:00'))).toBe(120); // 1h + 1h
    expect(businessMinutesBetween(L('2026-11-06T17:00:00'), L('2026-11-09T09:00:00'))).toBe(120); // over the weekend
    expect(businessMinutesBetween(L('2026-11-07T10:00:00'), L('2026-11-08T10:00:00'))).toBe(0);
    expect(businessMinutesBetween(L('2026-11-05T11:00:00'), L('2026-11-05T10:00:00'))).toBe(0);
  });

  it('falls back to wall-clock time when no business hours are configured', () => {
    const none = { startHour: 8, endHour: 18, days: [] as number[] };
    expect(addBusinessMinutes(L('2026-11-07T12:00:00'), 30, none).toISOString()).toBe(L('2026-11-07T12:30:00').toISOString());
  });
});

describe('response targets', () => {
  it('high and standard use the business clock; general comments use plain 24 hours', () => {
    expect(slaDueAt(L('2026-11-05T17:50:00'), 'HIGH', cfg).toISOString()).toBe(L('2026-11-06T08:20:00').toISOString());
    expect(slaDueAt(L('2026-11-05T10:00:00'), 'STANDARD', cfg).toISOString()).toBe(L('2026-11-05T12:00:00').toISOString());
    expect(slaDueAt(L('2026-11-07T10:00:00'), 'GENERAL', cfg).toISOString()).toBe(L('2026-11-08T10:00:00').toISOString());
  });

  it('measures response time on the same clock, so a night-time message is not penalised', () => {
    // received 17:50 Thursday, answered 08:10 Friday: 10 + 10 business minutes
    expect(responseMinutes(L('2026-11-05T17:50:00'), L('2026-11-06T08:10:00'), 'HIGH', cfg)).toBe(20);
    expect(responseMinutes(L('2026-11-05T17:50:00'), L('2026-11-06T08:10:00'), 'GENERAL', cfg)).toBe(860);
  });

  const due = L('2026-11-05T12:00:00');
  it('reports met, breached, due soon and on track', () => {
    const base = { slaDueAt: due, firstResponseAt: null as Date | null, status: 'OPEN' as const };
    expect(slaState({ ...base, firstResponseAt: L('2026-11-05T11:00:00') }, due)).toBe('MET');
    expect(slaState({ ...base, firstResponseAt: L('2026-11-05T12:30:00') }, due)).toBe('BREACHED');
    expect(slaState(base, L('2026-11-05T12:30:00'))).toBe('BREACHED');
    expect(slaState(base, L('2026-11-05T11:45:00'))).toBe('DUE_SOON');
    expect(slaState(base, L('2026-11-05T09:00:00'))).toBe('ON_TRACK');
  });
  it('does not count unanswered conversations that were closed as spam, nor ones with no target', () => {
    expect(slaState({ slaDueAt: due, firstResponseAt: null, status: 'CLOSED' }, L('2026-11-06T09:00:00'))).toBe('NOT_APPLICABLE');
    expect(slaState({ slaDueAt: null, firstResponseAt: null, status: 'OPEN' }, new Date())).toBe('NOT_APPLICABLE');
  });
});

describe('inbox rules', () => {
  it('allows sensible status moves only', () => {
    expect(canMoveConversation('NEW', 'ASSIGNED')).toBe(true);
    expect(canMoveConversation('WAITING_FOR_CUSTOMER', 'OPEN')).toBe(true);
    expect(canMoveConversation('RESOLVED', 'OPEN')).toBe(true);
    expect(canMoveConversation('RESOLVED', 'IN_PROGRESS')).toBe(false);
    expect(canMoveConversation('CLOSED', 'RESOLVED')).toBe(false);
    expect(canMoveConversation('ESCALATED', 'OPEN')).toBe(false);
  });

  it('warns when a colleague replied in the last ten minutes, but not for your own or old replies', () => {
    const now = L('2026-11-05T10:00:00');
    const msgs = [{ direction: 'OUTBOUND', authorId: 'bola', occurredAt: L('2026-11-05T09:55:00') }];
    expect(recentReplyBy(msgs, 'ada', now)).toBe('bola');
    expect(recentReplyBy(msgs, 'bola', now)).toBeNull();
    expect(recentReplyBy([{ direction: 'OUTBOUND', authorId: 'bola', occurredAt: L('2026-11-05T09:30:00') }], 'ada', now)).toBeNull();
    expect(recentReplyBy([{ direction: 'NOTE', authorId: 'bola', occurredAt: L('2026-11-05T09:59:00') }], 'ada', now)).toBeNull();
  });
});

describe('reputation alert', () => {
  it('needs at least three negative mentions and double the recent average', () => {
    expect(negativeSpike(2, 0).spike).toBe(false);
    expect(negativeSpike(3, 0).spike).toBe(true);
  });
  it('scales the bar with the usual volume', () => {
    expect(negativeSpike(5, 14)).toMatchObject({ threshold: 4, spike: true });
    expect(negativeSpike(5, 28)).toMatchObject({ threshold: 8, spike: false });
  });
});

describe('campaign results', () => {
  const row = (channel: string, o: Partial<Parameters<typeof campaignTotals>[0][number]> = {}) => ({ channel, reach: null, impressions: null, engagement: null, clicks: null, leads: null, conversions: null, spend: null, revenue: null, ...o });
  it('keeps paid and organic apart and never blends them', () => {
    const t = campaignTotals([row('PAID', { reach: 1000, spend: 50000 }), row('PAID', { reach: 500, spend: 25000 }), row('ORGANIC', { reach: 300 })], 100000);
    expect(t.paid.reach).toBe(1500);
    expect(t.organic.reach).toBe(300);
    expect(t.organic.spend).toBeNull();
  });
  it('derives cost per lead, per result and return only when the denominators exist', () => {
    const t = campaignTotals([row('PAID', { spend: 30000, leads: 60, clicks: 300, conversions: 10, revenue: 90000 })], 50000);
    expect(t.paid.costPerLead).toBe(500);
    expect(t.paid.costPerClick).toBe(100);
    expect(t.paid.costPerResult).toBe(3000);
    expect(t.paid.costPerResultBasis).toBe('conversion');
    expect(t.paid.returnOnAdSpend).toBe(3);
    const none = campaignTotals([row('PAID', { spend: 30000 })], null);
    expect(none.paid.costPerLead).toBeNull();
    expect(none.paid.costPerResult).toBeNull();
    expect(none.paid.returnOnAdSpend).toBeNull();
  });
  it('falls back to leads for cost per result when there are no conversions', () => {
    const t = campaignTotals([row('PAID', { spend: 1000, leads: 4 })], null);
    expect(t.paid.costPerResult).toBe(250);
    expect(t.paid.costPerResultBasis).toBe('lead');
  });
  it('compares spend with budget and flags overspend', () => {
    expect(campaignTotals([row('PAID', { spend: 40000 })], 100000).budget).toMatchObject({ planned: 100000, spent: 40000, remaining: 60000, usedPct: 40, overBudget: false });
    expect(campaignTotals([row('PAID', { spend: 120000 })], 100000).budget).toMatchObject({ remaining: -20000, overBudget: true });
    expect(campaignTotals([], 100000).budget).toMatchObject({ spent: null, usedPct: 0, overBudget: false });
  });
  it('walks the campaign lifecycle in order', () => {
    expect(canMoveCampaign('PLANNING', 'BRIEFING')).toBe(true);
    expect(canMoveCampaign('PLANNING', 'ACTIVE')).toBe(false);
    expect(canMoveCampaign('APPROVAL', 'ACTIVE')).toBe(true);
    expect(canMoveCampaign('ACTIVE', 'PAUSED')).toBe(true);
    expect(canMoveCampaign('COMPLETED', 'ACTIVE')).toBe(false);
    expect(canMoveCampaign('ARCHIVED', 'PLANNING')).toBe(false);
  });
});

describe('assets and competitors', () => {
  const now = new Date('2026-11-05T00:00:00Z');
  it('classifies asset expiry', () => {
    expect(assetExpiry(null, now)).toBe('NONE');
    expect(assetExpiry(new Date('2026-11-04T00:00:00Z'), now)).toBe('EXPIRED');
    expect(assetExpiry(new Date('2026-11-12T00:00:00Z'), now)).toBe('EXPIRING_SOON');
    expect(assetExpiry(new Date('2027-02-01T00:00:00Z'), now)).toBe('OK');
  });
  it('summarises competitor growth only from two observations', () => {
    const snaps = [{ date: '2026-11-01', followers: 1000, postsLast7Days: 5, avgEngagement: 2 }, { date: '2026-11-20', followers: 1100, postsLast7Days: 9, avgEngagement: 4 }];
    expect(competitorSummary(snaps, '2026-11-01', '2026-11-30')).toMatchObject({ growth: 100, growthPct: 10, postsPerWeek: 7, avgEngagement: 3, followers: 1100 });
    const one = competitorSummary(snaps.slice(0, 1), '2026-11-01', '2026-11-30');
    expect(one.growth).toBeNull();
    expect(one.note).toMatch(/two follower observations/);
    expect(competitorSummary(snaps, '2026-12-01', '2026-12-31').observations).toBe(0);
  });
});
