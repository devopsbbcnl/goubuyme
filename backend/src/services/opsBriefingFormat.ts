// Pure parts of the daily ops briefing: the metrics shape, rule-based flags, and the Telegram
// HTML renderer. No DB/LLM imports, so this is unit-tested directly. Every number shown in the
// briefing is rendered here from the metrics — the LLM only contributes the narrative lines.

export interface StuckOrder {
  orderNumber: string;
  minutes: number;
}

export interface OpsMetrics {
  day: string; // YYYY-MM-DD (Lagos)
  generatedAt: string; // ISO
  orders: {
    placed: number;
    delivered: number;
    cancelled: number;
    gmv: number; // ₦, delivered orders
    avgDeliveryMinutes: number | null; // placed → delivered
    cancelReasons: Array<{ reason: string; count: number }>;
    paymentFailures: number;
    vendorNoResponseCancels: number;
    worstVendors: Array<{ name: string; noResponseCancels: number }>;
    adminInterventions: number;
    latePaymentsCredited: number;
    sevenDayAvg: { placed: number; delivered: number; gmv: number };
  };
  live: {
    readyNoRider: StuckOrder[]; // READY, no rider, > 15 min
    stuckPreparing: StuckOrder[]; // PREPARING > 60 min
    stuckInDelivery: StuckOrder[]; // PICKED_UP / IN_TRANSIT > 90 min
    ridersOnline: number;
    vendorsOpen: number;
  };
  growth: {
    signups: { customers: number; vendors: number; riders: number };
    pendingVendors: number;
    pendingRiders: number;
    oldestPendingDays: number | null;
    pendingDocuments: number;
  };
  support: {
    opened: number;
    openNow: number;
    overdueNow: number;
    breachedYesterday: number;
  };
  reliability: {
    critical: number;
    high: number;
    unresolvedCritical: number;
  };
  money: {
    creditIssued: number;
    creditByReason: Array<{ reason: string; amount: number }>;
    payoutBatch: { status: string; failureReason: string | null } | null;
  };
}

export type FlagLevel = 'RED' | 'AMBER';

export interface OpsFlag {
  level: FlagLevel;
  code: string;
  message: string;
}

export interface BriefingSummary {
  status: 'GREEN' | 'AMBER' | 'RED';
  headline: string;
  highlights: string[];
  concerns: string[];
  actions: string[];
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
export const formatAge = (minutes: number): string =>
  minutes < 120 ? `${minutes}m` : minutes < 48 * 60 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;

const list = (orders: StuckOrder[]) =>
  orders.slice(0, 3).map((o) => `#${o.orderNumber} (${formatAge(o.minutes)})`).join(', ') + (orders.length > 3 ? ` +${orders.length - 3} more` : '');

/** Rule-based problems that need a human. Runs with or without an LLM. */
export function deriveFlags(m: OpsMetrics): OpsFlag[] {
  const flags: OpsFlag[] = [];
  const { orders, live, growth, support, reliability, money } = m;

  if (live.readyNoRider.length) {
    flags.push({ level: 'RED', code: 'READY_NO_RIDER', message: `${live.readyNoRider.length} order(s) ready with no rider: ${list(live.readyNoRider)}` });
  }
  if (live.stuckInDelivery.length) {
    flags.push({ level: 'RED', code: 'STUCK_IN_DELIVERY', message: `${live.stuckInDelivery.length} order(s) out for delivery over 90 min: ${list(live.stuckInDelivery)}` });
  }
  if (live.stuckPreparing.length) {
    flags.push({ level: 'AMBER', code: 'STUCK_PREPARING', message: `${live.stuckPreparing.length} order(s) preparing over 60 min: ${list(live.stuckPreparing)}` });
  }
  if (reliability.unresolvedCritical > 0) {
    flags.push({ level: 'RED', code: 'CRITICAL_ERRORS', message: `${reliability.unresolvedCritical} unresolved critical error(s) in the error log` });
  }
  if (money.payoutBatch?.status === 'FAILED') {
    flags.push({ level: 'RED', code: 'PAYOUT_FAILED', message: `Payout batch failed${money.payoutBatch.failureReason ? `: ${money.payoutBatch.failureReason}` : ''}` });
  }
  if (support.overdueNow > 0) {
    flags.push({ level: 'AMBER', code: 'TICKETS_OVERDUE', message: `${support.overdueNow} support ticket(s) past their SLA` });
  }
  const finished = orders.delivered + orders.cancelled;
  if (finished >= 5 && orders.cancelled / finished > 0.2) {
    flags.push({ level: 'AMBER', code: 'HIGH_CANCELLATIONS', message: `${Math.round((orders.cancelled / finished) * 100)}% of finished orders were cancelled (${orders.cancelled}/${finished})` });
  }
  if (orders.vendorNoResponseCancels > 0) {
    flags.push({ level: 'AMBER', code: 'VENDOR_NO_RESPONSE', message: `${orders.vendorNoResponseCancels} order(s) auto-cancelled because the vendor didn't respond` });
  }
  if ((growth.pendingVendors + growth.pendingRiders) > 0 && (growth.oldestPendingDays ?? 0) >= 2) {
    flags.push({ level: 'AMBER', code: 'APPROVAL_BACKLOG', message: `${growth.pendingVendors} vendor(s) and ${growth.pendingRiders} rider(s) awaiting approval; oldest ${growth.oldestPendingDays} days` });
  }
  if (live.ridersOnline === 0 && (orders.placed > 0 || live.readyNoRider.length > 0)) {
    flags.push({ level: 'AMBER', code: 'NO_RIDERS_ONLINE', message: 'No riders are online right now' });
  }
  return flags;
}

export function statusFromFlags(flags: OpsFlag[]): BriefingSummary['status'] {
  if (flags.some((f) => f.level === 'RED')) return 'RED';
  if (flags.length) return 'AMBER';
  return 'GREEN';
}

/** Deterministic summary used when the LLM is unavailable, disabled, or refuses. */
export function rulesSummary(m: OpsMetrics, flags: OpsFlag[]): BriefingSummary {
  const status = statusFromFlags(flags);
  const quiet = m.orders.placed === 0;
  return {
    status,
    headline: quiet
      ? 'No orders yesterday.'
      : `${m.orders.placed} order(s) placed, ${m.orders.delivered} delivered, ${naira(m.orders.gmv)} GMV.`,
    highlights: [],
    concerns: flags.map((f) => f.message),
    actions: [],
  };
}

export const escapeHtml = (raw: string): string =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STATUS_ICON: Record<BriefingSummary['status'], string> = { GREEN: '🟢', AMBER: '🟠', RED: '🔴' };
const TELEGRAM_LIMIT = 4096;
const ITEM_LIMIT = 240;

const vsAvg = (value: number, avg: number, fmt: (n: number) => string = String) =>
  avg > 0 ? ` <i>(7-day avg ${fmt(Math.round(avg * 10) / 10)})</i>` : '';

function numbersBlock(m: OpsMetrics): string[] {
  const o = m.orders;
  const lines = [
    `<b>Orders</b>: ${o.placed} placed${vsAvg(o.placed, o.sevenDayAvg.placed)} · ${o.delivered} delivered · ${o.cancelled} cancelled`,
    `<b>GMV</b>: ${naira(o.gmv)}${vsAvg(o.gmv, o.sevenDayAvg.gmv, naira)}${o.avgDeliveryMinutes != null ? ` · avg ${o.avgDeliveryMinutes} min to deliver` : ''}`,
  ];
  if (o.paymentFailures || o.latePaymentsCredited) {
    lines.push(`<b>Payments</b>: ${o.paymentFailures} failed/abandoned${o.latePaymentsCredited ? ` · ${o.latePaymentsCredited} late payment(s) credited` : ''}`);
  }
  const stuck = m.live.readyNoRider.length + m.live.stuckPreparing.length + m.live.stuckInDelivery.length;
  lines.push(`<b>Right now</b>: ${m.live.ridersOnline} rider(s) online · ${m.live.vendorsOpen} vendor(s) open · ${stuck} stuck order(s)`);
  const g = m.growth;
  lines.push(`<b>Signups</b>: ${g.signups.customers} customers · ${g.signups.vendors} vendors · ${g.signups.riders} riders`);
  lines.push(`<b>Approvals</b>: ${g.pendingVendors} vendors · ${g.pendingRiders} riders pending · ${g.pendingDocuments} documents to review`);
  const s = m.support;
  lines.push(`<b>Support</b>: ${s.opened} new ticket(s) · ${s.openNow} open · ${s.overdueNow} overdue`);
  if (m.reliability.critical || m.reliability.high || m.reliability.unresolvedCritical) {
    lines.push(`<b>Errors</b>: ${m.reliability.critical} critical · ${m.reliability.high} high · ${m.reliability.unresolvedCritical} critical unresolved`);
  }
  if (m.money.creditIssued > 0) lines.push(`<b>Store credit issued</b>: ${naira(m.money.creditIssued)}`);
  if (m.money.payoutBatch) lines.push(`<b>Payout batch</b>: ${m.money.payoutBatch.status.toLowerCase()}`);
  return lines;
}

const formatDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const section = (title: string, items: string[]) =>
  items.length ? [``, `<b>${title}</b>`, ...items.map((i) => `• ${escapeHtml(i.slice(0, ITEM_LIMIT))}`)] : [];

/** Telegram HTML (parse_mode HTML). All narrative text is escaped; only our own tags remain. */
export function renderBriefingHtml(m: OpsMetrics, summary: BriefingSummary, opts: { analyzedBy: 'llm' | 'rules' }): string {
  const header = [
    `📊 <b>GoBuyMe daily ops — ${formatDay(m.day)}</b>`,
    `${STATUS_ICON[summary.status]} ${escapeHtml(summary.headline.slice(0, ITEM_LIMIT))}`,
    '',
    ...numbersBlock(m),
  ];
  const footer = ['', `<i>${opts.analyzedBy === 'llm' ? 'Written by the GoBuyMe ops agent' : 'Rule-based summary (AI narrative unavailable)'} · numbers from the live database</i>`];

  const full = [
    ...header,
    ...section('Needs attention', summary.concerns),
    ...section('Do today', summary.actions),
    ...section('Going well', summary.highlights),
    ...footer,
  ].join('\n');
  if (full.length <= TELEGRAM_LIMIT) return full;

  // Over Telegram's limit: drop the least important section, then trim to the essentials.
  const trimmed = [...header, ...section('Needs attention', summary.concerns), ...section('Do today', summary.actions), ...footer].join('\n');
  if (trimmed.length <= TELEGRAM_LIMIT) return trimmed;
  // Header (~1k chars) + 3 capped items always fits; never slice mid-string, it could cut a tag.
  return [...header, ...section('Needs attention', summary.concerns.slice(0, 3)), ...footer].join('\n');
}
