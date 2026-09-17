// Pure CRM scoring helpers — no DB access, so they are cheap to unit test.
//
// Two related ideas:
//  - lifecycle stage: recency-only bucket (NEW / ACTIVE / AT_RISK / CHURNED). It can be
//    expressed as a Prisma filter, so the profile directory can filter by it.
//  - health score: 0–100 with human-readable reasons, shown on the 360° profile. It uses
//    more signals (trend, cancellations, incidents, rating) than the lifecycle stage.

export type CrmRole = 'CUSTOMER' | 'VENDOR' | 'RIDER';
export type LifecycleStage = 'NEW' | 'ACTIVE' | 'AT_RISK' | 'CHURNED';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the last order/delivery that still count as ACTIVE, and as AT_RISK. */
export const LIFECYCLE_WINDOWS: Record<CrmRole, { activeDays: number; atRiskDays: number }> = {
  CUSTOMER: { activeDays: 21, atRiskDays: 60 },
  VENDOR:   { activeDays: 7,  atRiskDays: 30 },
  RIDER:    { activeDays: 7,  atRiskDays: 30 },
};

export const daysBetween = (from: Date, to: Date): number =>
  Math.floor((to.getTime() - from.getTime()) / DAY_MS);

export const lifecycleStage = (role: CrmRole, lastOrderAt: Date | null, now = new Date()): LifecycleStage => {
  if (!lastOrderAt) return 'NEW';
  const { activeDays, atRiskDays } = LIFECYCLE_WINDOWS[role];
  const days = daysBetween(lastOrderAt, now);
  if (days <= activeDays) return 'ACTIVE';
  if (days <= atRiskDays) return 'AT_RISK';
  return 'CHURNED';
};

/** Start dates (inclusive) of the ACTIVE and AT_RISK windows, for building DB filters. */
export const lifecycleCutoffs = (role: CrmRole, now = new Date()) => {
  const { activeDays, atRiskDays } = LIFECYCLE_WINDOWS[role];
  return {
    activeSince: new Date(now.getTime() - activeDays * DAY_MS),
    atRiskSince: new Date(now.getTime() - atRiskDays * DAY_MS),
  };
};

export interface HealthResult {
  score: number;
  stage: LifecycleStage;
  reasons: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const recencyScore = (stage: LifecycleStage): number =>
  ({ NEW: 50, ACTIVE: 100, AT_RISK: 45, CHURNED: 10 })[stage];

export interface CustomerHealthInput {
  lastOrderAt: Date | null;
  completedOrders: number;
  cancelledOrders: number;
  ticketsLast30?: number;
}

export const customerHealth = (input: CustomerHealthInput, now = new Date()): HealthResult => {
  const stage = lifecycleStage('CUSTOMER', input.lastOrderAt, now);
  const reasons: string[] = [];
  let score = recencyScore(stage) * 0.6;

  // Frequency: 10+ completed orders earns the full 30 points.
  score += Math.min(input.completedOrders, 10) * 3;
  if (input.completedOrders >= 10) reasons.push('Loyal: 10+ completed orders');

  const total = input.completedOrders + input.cancelledOrders;
  const cancelRate = total > 0 ? input.cancelledOrders / total : 0;
  if (total >= 3 && cancelRate > 0.25) {
    score -= 20;
    reasons.push(`High cancellation rate (${Math.round(cancelRate * 100)}%)`);
  } else {
    score += 10;
  }

  if ((input.ticketsLast30 ?? 0) >= 2) {
    score -= 10;
    reasons.push(`${input.ticketsLast30} support tickets in the last 30 days`);
  }

  if (stage === 'NEW') reasons.push('No orders yet');
  if (stage === 'AT_RISK' && input.lastOrderAt) reasons.push(`No order in ${daysBetween(input.lastOrderAt, now)} days`);
  if (stage === 'CHURNED' && input.lastOrderAt) reasons.push(`Churned: last order ${daysBetween(input.lastOrderAt, now)} days ago`);

  return { score: clamp(score), stage, reasons };
};

export interface VendorHealthInput {
  lastOrderAt: Date | null;
  ordersLast30: number;
  ordersPrev30: number;
  cancelledLast30: number;
  incidentsLast30: number;
  rating: number;
  totalRatings: number;
}

export const vendorHealth = (input: VendorHealthInput, now = new Date()): HealthResult => {
  const stage = lifecycleStage('VENDOR', input.lastOrderAt, now);
  const reasons: string[] = [];
  let score = recencyScore(stage) * 0.4;

  // Trend: flat or growing volume earns the full 25; a >50% drop earns nothing.
  if (input.ordersPrev30 > 0) {
    const change = (input.ordersLast30 - input.ordersPrev30) / input.ordersPrev30;
    if (change <= -0.5) reasons.push(`Orders down ${Math.round(-change * 100)}% vs previous 30 days`);
    score += change >= 0 ? 25 : change <= -0.5 ? 0 : 12;
  } else {
    score += input.ordersLast30 > 0 ? 25 : 10;
  }

  const handled = input.ordersLast30;
  const cancelRate = handled > 0 ? input.cancelledLast30 / handled : 0;
  if (handled >= 5 && cancelRate > 0.15) {
    reasons.push(`Cancellation rate ${Math.round(cancelRate * 100)}% in last 30 days`);
  } else {
    score += 15;
  }

  if (input.incidentsLast30 >= 3) {
    score -= 15;
    reasons.push(`${input.incidentsLast30} incidents in last 30 days`);
  }

  if (input.totalRatings >= 5) {
    score += input.rating >= 4 ? 20 : input.rating >= 3.5 ? 10 : 0;
    if (input.rating < 3.5) reasons.push(`Low rating (${input.rating.toFixed(1)})`);
  } else {
    score += 10;
  }

  if (stage === 'NEW') reasons.push('No orders yet');
  if (stage === 'CHURNED') reasons.push('No orders in 30+ days');

  return { score: clamp(score), stage, reasons };
};

export interface RiderHealthInput {
  lastDeliveryAt: Date | null;
  deliveriesLast30: number;
  rating: number;
  totalRatings: number;
}

export const riderHealth = (input: RiderHealthInput, now = new Date()): HealthResult => {
  const stage = lifecycleStage('RIDER', input.lastDeliveryAt, now);
  const reasons: string[] = [];
  let score = recencyScore(stage) * 0.5;

  // 60+ deliveries a month (~2/day) earns the full 30 points.
  score += Math.min(input.deliveriesLast30, 60) * 0.5;

  if (input.totalRatings >= 5) {
    score += input.rating >= 4 ? 20 : input.rating >= 3.5 ? 10 : 0;
    if (input.rating < 3.5) reasons.push(`Low rating (${input.rating.toFixed(1)})`);
  } else {
    score += 10;
  }

  if (stage === 'NEW') reasons.push('No deliveries yet');
  if (stage === 'AT_RISK') reasons.push('No delivery in over a week');
  if (stage === 'CHURNED') reasons.push('No deliveries in 30+ days');

  return { score: clamp(score), stage, reasons };
};
