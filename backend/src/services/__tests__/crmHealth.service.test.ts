// CRM lifecycle stages and health scores are pure functions of order history, so the
// directory filter (lifecycleWhere) and the profile badge must agree on the same windows.

jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));

import {
  customerHealth, lifecycleCutoffs, lifecycleStage, riderHealth, vendorHealth,
} from '../crm/health.service';
import { lifecycleWhere } from '../crm/profile.service';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

describe('lifecycleStage', () => {
  it('is NEW with no orders', () => {
    expect(lifecycleStage('CUSTOMER', null, NOW)).toBe('NEW');
  });

  it('uses 21/60-day windows for customers', () => {
    expect(lifecycleStage('CUSTOMER', daysAgo(21), NOW)).toBe('ACTIVE');
    expect(lifecycleStage('CUSTOMER', daysAgo(22), NOW)).toBe('AT_RISK');
    expect(lifecycleStage('CUSTOMER', daysAgo(60), NOW)).toBe('AT_RISK');
    expect(lifecycleStage('CUSTOMER', daysAgo(61), NOW)).toBe('CHURNED');
  });

  it('uses tighter 7/30-day windows for vendors and riders', () => {
    expect(lifecycleStage('VENDOR', daysAgo(7), NOW)).toBe('ACTIVE');
    expect(lifecycleStage('VENDOR', daysAgo(8), NOW)).toBe('AT_RISK');
    expect(lifecycleStage('RIDER', daysAgo(31), NOW)).toBe('CHURNED');
  });
});

describe('lifecycleWhere', () => {
  it('builds AT_RISK as "some order in the at-risk window, none in the active window"', () => {
    const { activeSince, atRiskSince } = lifecycleCutoffs('CUSTOMER', NOW);
    expect(lifecycleWhere('CUSTOMER', 'AT_RISK', NOW)).toEqual({
      AND: [
        { role: 'CUSTOMER', customer: { orders: { some: { status: { not: 'CANCELLED' }, createdAt: { gte: atRiskSince } } } } },
        { role: 'CUSTOMER', customer: { orders: { none: { status: { not: 'CANCELLED' }, createdAt: { gte: activeSince } } } } },
      ],
    });
  });

  it('counts only delivered orders for riders', () => {
    expect(lifecycleWhere('RIDER', 'NEW', NOW)).toEqual({
      role: 'RIDER', rider: { deliveries: { none: { status: 'DELIVERED' } } },
    });
  });
});

describe('customerHealth', () => {
  it('scores a loyal recent customer highly', () => {
    const h = customerHealth({ lastOrderAt: daysAgo(2), completedOrders: 12, cancelledOrders: 0 }, NOW);
    expect(h.stage).toBe('ACTIVE');
    expect(h.score).toBe(100);
    expect(h.reasons).toContain('Loyal: 10+ completed orders');
  });

  it('penalises churn and heavy cancellations', () => {
    const h = customerHealth({ lastOrderAt: daysAgo(90), completedOrders: 2, cancelledOrders: 3 }, NOW);
    expect(h.stage).toBe('CHURNED');
    expect(h.score).toBe(0);
    expect(h.reasons).toEqual(expect.arrayContaining([
      'High cancellation rate (60%)',
      'Churned: last order 90 days ago',
    ]));
  });
});

describe('vendorHealth', () => {
  it('flags a sharp order drop, cancellations, incidents and a low rating', () => {
    const h = vendorHealth({
      lastOrderAt: daysAgo(1), ordersLast30: 10, ordersPrev30: 40, cancelledLast30: 3,
      incidentsLast30: 4, rating: 3.1, totalRatings: 20,
    }, NOW);
    expect(h.stage).toBe('ACTIVE');
    expect(h.score).toBe(25);
    expect(h.reasons).toHaveLength(4);
  });

  it('keeps a steady, well-rated vendor at 100', () => {
    const h = vendorHealth({
      lastOrderAt: daysAgo(0), ordersLast30: 50, ordersPrev30: 45, cancelledLast30: 1,
      incidentsLast30: 0, rating: 4.6, totalRatings: 80,
    }, NOW);
    expect(h.score).toBe(100);
    expect(h.reasons).toEqual([]);
  });
});

describe('riderHealth', () => {
  it('caps volume credit at 60 deliveries', () => {
    const busy = riderHealth({ lastDeliveryAt: daysAgo(0), deliveriesLast30: 200, rating: 4.8, totalRatings: 50 }, NOW);
    expect(busy.score).toBe(100);
  });

  it('marks an idle rider as churned', () => {
    const idle = riderHealth({ lastDeliveryAt: daysAgo(45), deliveriesLast30: 0, rating: 0, totalRatings: 0 }, NOW);
    expect(idle.stage).toBe('CHURNED');
    expect(idle.reasons).toContain('No deliveries in 30+ days');
  });
});
