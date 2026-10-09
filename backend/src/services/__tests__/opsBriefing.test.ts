jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../telegram.service', () => ({ sendTelegramAlert: jest.fn() }));

import { lagosDayRange, lagosYesterday } from '../opsBriefing.service';
import { OpsMetrics, deriveFlags, renderBriefingHtml, rulesSummary, statusFromFlags } from '../opsBriefingFormat';

function metrics(overrides: { [K in keyof OpsMetrics]?: Partial<OpsMetrics[K]> } = {}): OpsMetrics {
  const base: OpsMetrics = {
    day: '2026-10-08',
    generatedAt: '2026-10-09T06:00:00.000Z',
    orders: {
      placed: 6, delivered: 5, cancelled: 1, gmv: 42_500, avgDeliveryMinutes: 38,
      cancelReasons: [{ reason: 'no_response_timeout', count: 1 }], paymentFailures: 0,
      vendorNoResponseCancels: 0, worstVendors: [], adminInterventions: 0, latePaymentsCredited: 0,
      sevenDayAvg: { placed: 4, delivered: 3.5, gmv: 30_000 },
    },
    live: { readyNoRider: [], stuckPreparing: [], stuckInDelivery: [], ridersOnline: 3, vendorsOpen: 5 },
    growth: { signups: { customers: 4, vendors: 1, riders: 0 }, pendingVendors: 0, pendingRiders: 0, oldestPendingDays: null, pendingDocuments: 0 },
    support: { opened: 1, openNow: 1, overdueNow: 0, breachedYesterday: 0 },
    reliability: { critical: 0, high: 0, unresolvedCritical: 0 },
    money: { creditIssued: 0, creditByReason: [], payoutBatch: null },
  };
  for (const key of Object.keys(overrides) as Array<keyof OpsMetrics>) {
    Object.assign(base[key] as object, overrides[key]);
  }
  return base;
}

describe('Lagos day boundaries', () => {
  it('maps a Lagos calendar day to 23:00 UTC → 23:00 UTC', () => {
    const { start, end } = lagosDayRange('2026-10-08');
    expect(start.toISOString()).toBe('2026-10-07T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-08T23:00:00.000Z');
  });

  it('computes "yesterday" in Lagos time, not UTC', () => {
    // 23:30 UTC on Oct 8 is already 00:30 on Oct 9 in Lagos → yesterday is Oct 8.
    expect(lagosYesterday(new Date('2026-10-08T23:30:00Z'))).toBe('2026-10-08');
    // 06:00 UTC on Oct 9 (the 7am Lagos run) → yesterday is Oct 8.
    expect(lagosYesterday(new Date('2026-10-09T06:00:00Z'))).toBe('2026-10-08');
  });
});

describe('deriveFlags', () => {
  it('is quiet on a healthy day', () => {
    expect(deriveFlags(metrics())).toEqual([]);
    expect(statusFromFlags([])).toBe('GREEN');
  });

  it('raises RED for orders waiting with no rider and names them', () => {
    const flags = deriveFlags(metrics({ live: { readyNoRider: [{ orderNumber: 'GBM-1', minutes: 22 }] } }));
    expect(flags).toEqual([expect.objectContaining({ level: 'RED', code: 'READY_NO_RIDER' })]);
    expect(flags[0].message).toContain('#GBM-1 (22m)');
    expect(statusFromFlags(flags)).toBe('RED');
  });

  it('shows stuck ages in readable units', () => {
    const [flag] = deriveFlags(metrics({ live: { stuckPreparing: [{ orderNumber: 'GBM-2', minutes: 80_743 }, { orderNumber: 'GBM-3', minutes: 300 }] } }));
    expect(flag.message).toContain('#GBM-2 (56d), #GBM-3 (5h)');
  });

  it('summarises long stuck lists instead of listing every order', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ orderNumber: `GBM-${i}`, minutes: 100 }));
    const [flag] = deriveFlags(metrics({ live: { stuckInDelivery: many } }));
    expect(flag.message).toContain('+2 more');
  });

  it('only flags the cancellation rate once there are enough orders to mean something', () => {
    expect(deriveFlags(metrics({ orders: { delivered: 1, cancelled: 1 } })).map((f) => f.code)).not.toContain('HIGH_CANCELLATIONS');
    expect(deriveFlags(metrics({ orders: { delivered: 6, cancelled: 3 } })).map((f) => f.code)).toContain('HIGH_CANCELLATIONS');
  });

  it('flags an approval backlog only once it is at least two days old', () => {
    expect(deriveFlags(metrics({ growth: { pendingRiders: 2, oldestPendingDays: 1 } }))).toEqual([]);
    expect(deriveFlags(metrics({ growth: { pendingRiders: 2, oldestPendingDays: 3 } })).map((f) => f.code)).toEqual(['APPROVAL_BACKLOG']);
  });

  it('flags a failed payout batch, unresolved critical errors and no riders online', () => {
    const codes = deriveFlags(metrics({
      money: { payoutBatch: { status: 'FAILED', failureReason: 'insufficient balance' } },
      reliability: { unresolvedCritical: 2 },
      live: { ridersOnline: 0 },
    })).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['PAYOUT_FAILED', 'CRITICAL_ERRORS', 'NO_RIDERS_ONLINE']));
  });
});

describe('renderBriefingHtml', () => {
  it('renders numbers from the metrics and escapes narrative text', () => {
    const html = renderBriefingHtml(metrics(), {
      status: 'AMBER',
      headline: 'Busy day <b>injected</b> & fine',
      concerns: ['Vendor "A&B <Foods>" missed 2 orders'],
      actions: ['Call A&B'],
      highlights: [],
    }, { analyzedBy: 'llm' });

    expect(html).toContain('GoBuyMe daily ops — Thu 8 Oct');
    expect(html).toContain('6 placed');
    expect(html).toContain('₦42,500');
    expect(html).toContain('Busy day &lt;b&gt;injected&lt;/b&gt; &amp; fine');
    expect(html).toContain('A&amp;B &lt;Foods&gt;');
    expect(html).not.toContain('<Foods>');
    expect(html).not.toContain('Going well'); // empty sections are omitted
  });

  it('stays within Telegram\'s 4096-character limit even with long model output', () => {
    const long = 'x'.repeat(1000);
    const html = renderBriefingHtml(metrics(), {
      status: 'RED', headline: long, concerns: [long, long, long, long], actions: [long, long, long, long], highlights: [long, long, long, long],
    }, { analyzedBy: 'llm' });
    expect(html.length).toBeLessThanOrEqual(4096);
  });

  it('produces a usable rules-only briefing when the LLM is unavailable', () => {
    const m = metrics({ live: { readyNoRider: [{ orderNumber: 'GBM-9', minutes: 30 }] } });
    const summary = rulesSummary(m, deriveFlags(m));
    expect(summary.status).toBe('RED');
    expect(summary.concerns[0]).toContain('GBM-9');
    expect(renderBriefingHtml(m, summary, { analyzedBy: 'rules' })).toContain('Rule-based summary');
  });

  it('says plainly when there were no orders', () => {
    expect(rulesSummary(metrics({ orders: { placed: 0, delivered: 0, cancelled: 0, gmv: 0 } }), []).headline).toBe('No orders yesterday.');
  });
});
