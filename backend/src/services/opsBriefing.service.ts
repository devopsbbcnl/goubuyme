import Anthropic from '@anthropic-ai/sdk';
import { OrderActorType, OrderEventType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { sendTelegramAlert } from './telegram.service';
import {
  BriefingSummary,
  OpsFlag,
  OpsMetrics,
  StuckOrder,
  deriveFlags,
  renderBriefingHtml,
  rulesSummary,
  statusFromFlags,
} from './opsBriefingFormat';

// Daily ops briefing agent. Every morning it gathers yesterday's numbers plus what's stuck right
// now, flags problems with fixed rules, asks Claude to turn that into a short briefing with
// concrete actions, and posts it to the super-admin Telegram chat. Read-only: it never changes
// orders, users or money. Without ANTHROPIC_API_KEY it still sends the rule-based version.

const LAGOS_UTC_OFFSET_HOURS = 1; // Africa/Lagos is UTC+1 all year (no DST)
const DAY_MS = 86_400_000;

const LLM_ENABLED = () =>
  process.env.OPS_BRIEFING_LLM_ENABLED !== 'false' && Boolean(process.env.ANTHROPIC_API_KEY);
const LLM_MODEL = () => process.env.OPS_BRIEFING_LLM_MODEL || 'claude-opus-5-5';

/** UTC instants bounding a Lagos calendar day. */
export function lagosDayRange(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - LAGOS_UTC_OFFSET_HOURS * 3_600_000);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Yesterday's date in Lagos, YYYY-MM-DD. */
export function lagosYesterday(now = new Date()): string {
  const lagosNow = new Date(now.getTime() + LAGOS_UTC_OFFSET_HOURS * 3_600_000);
  return new Date(lagosNow.getTime() - DAY_MS).toISOString().slice(0, 10);
}

// Orders that changed status inside the window. Orders older than the order-events migration have
// no statusChangedAt, so fall back to updatedAt for them.
const changedIn = (start: Date, end: Date): Prisma.OrderWhereInput => ({
  OR: [
    { statusChangedAt: { gte: start, lt: end } },
    { statusChangedAt: null, updatedAt: { gte: start, lt: end } },
  ],
});

async function stuckOrders(where: Prisma.OrderWhereInput, olderThanMinutes: number, now: Date): Promise<StuckOrder[]> {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000);
  const rows = await prisma.order.findMany({
    where: {
      ...where,
      OR: [{ statusChangedAt: { lt: cutoff } }, { statusChangedAt: null, updatedAt: { lt: cutoff } }],
    },
    select: { orderNumber: true, statusChangedAt: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  });
  return rows.map((r) => ({
    orderNumber: r.orderNumber,
    minutes: Math.round((now.getTime() - (r.statusChangedAt ?? r.updatedAt).getTime()) / 60_000),
  }));
}

export async function collectOpsMetrics(day: string, now = new Date()): Promise<OpsMetrics> {
  const { start, end } = lagosDayRange(day);
  const weekStart = new Date(start.getTime() - 7 * DAY_MS);
  const inDay = { gte: start, lt: end };

  const [
    placed, deliveredRows, cancelledRows, paymentFailures, incidents, adminEvents, lateCredits,
    weekPlaced, weekDelivered,
    readyNoRider, stuckPreparing, stuckInDelivery, ridersOnline, vendorsOpen,
    signups, pendingVendors, pendingRiders, oldestVendor, oldestRider, pendingVendorDocs, pendingRiderDocs,
    ticketsOpened, ticketsOpen, ticketsOverdue, ticketsBreached,
    errorsBySeverity, unresolvedCritical,
    credits, payoutBatch,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: inDay } }),
    prisma.order.findMany({
      where: { status: OrderStatus.DELIVERED, ...changedIn(start, end) },
      select: { totalAmount: true, createdAt: true, statusChangedAt: true, updatedAt: true },
      take: 5000,
    }),
    prisma.order.findMany({ where: { status: OrderStatus.CANCELLED, ...changedIn(start, end) }, select: { cancelReason: true }, take: 5000 }),
    prisma.order.count({ where: { paymentStatus: PaymentStatus.FAILED, ...changedIn(start, end) } }),
    prisma.vendorIncident.findMany({
      where: { incidentType: 'no_response_timeout', createdAt: inDay },
      select: { vendorId: true },
    }),
    prisma.orderEvent.count({ where: { actorType: OrderActorType.ADMIN, createdAt: inDay } }),
    prisma.orderEvent.count({
      where: { type: OrderEventType.CREDIT_ISSUED, actorType: OrderActorType.SYSTEM, createdAt: inDay },
    }),
    prisma.order.count({ where: { createdAt: { gte: weekStart, lt: start } } }),
    prisma.order.aggregate({
      where: {
        status: OrderStatus.DELIVERED,
        OR: [
          { statusChangedAt: { gte: weekStart, lt: start } },
          { statusChangedAt: null, updatedAt: { gte: weekStart, lt: start } },
        ],
      },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    stuckOrders({ status: OrderStatus.READY, riderId: null }, 15, now),
    stuckOrders({ status: OrderStatus.PREPARING }, 60, now),
    stuckOrders({ status: { in: [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT] } }, 90, now),
    prisma.rider.count({ where: { isOnline: true } }),
    prisma.vendor.count({ where: { isOpen: true, approvalStatus: 'APPROVED' } }),
    prisma.user.groupBy({ by: ['role'], where: { createdAt: inDay }, _count: { _all: true } }),
    prisma.vendor.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.rider.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.vendor.findFirst({ where: { approvalStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.rider.findFirst({ where: { approvalStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.vendorDocument.count({ where: { status: 'PENDING' } }),
    prisma.riderDocument.count({ where: { status: 'PENDING' } }),
    prisma.ticket.count({ where: { createdAt: inDay } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER'] } } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now } } }),
    prisma.ticket.count({ where: { slaBreachedAt: inDay } }),
    prisma.errorLog.groupBy({ by: ['severity'], where: { createdAt: inDay }, _count: { _all: true } }),
    prisma.errorLog.count({ where: { severity: 'CRITICAL', resolved: false } }),
    prisma.creditTransaction.groupBy({ by: ['reason'], where: { type: 'CREDIT', createdAt: inDay }, _sum: { amount: true } }),
    prisma.payoutBatch.findFirst({ where: { createdAt: inDay }, orderBy: { createdAt: 'desc' }, select: { status: true, failureReason: true } }),
  ]);

  const gmv = deliveredRows.reduce((s, o) => s + o.totalAmount, 0);
  const durations = deliveredRows
    .filter((o) => o.statusChangedAt)
    .map((o) => (o.statusChangedAt!.getTime() - o.createdAt.getTime()) / 60_000)
    .filter((min) => min > 0 && min < 24 * 60);
  const avgDeliveryMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const reasonCounts = new Map<string, number>();
  for (const o of cancelledRows) {
    const r = o.cancelReason?.trim() || 'unspecified';
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }

  const incidentCounts = new Map<string, number>();
  for (const i of incidents) incidentCounts.set(i.vendorId, (incidentCounts.get(i.vendorId) ?? 0) + 1);
  const worstIds = [...incidentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const worstNames = worstIds.length
    ? await prisma.vendor.findMany({ where: { id: { in: worstIds.map(([id]) => id) } }, select: { id: true, businessName: true } })
    : [];
  const nameOf = new Map(worstNames.map((v) => [v.id, v.businessName]));

  const signupCount = (role: string) => signups.find((s) => s.role === role)?._count._all ?? 0;
  const oldest = [oldestVendor?.createdAt, oldestRider?.createdAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
  const severityCount = (sev: string) => errorsBySeverity.find((e) => e.severity === sev)?._count._all ?? 0;
  const creditByReason = credits
    .map((c) => ({ reason: c.reason, amount: c._sum.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    day,
    generatedAt: now.toISOString(),
    orders: {
      placed,
      delivered: deliveredRows.length,
      cancelled: cancelledRows.length,
      gmv,
      avgDeliveryMinutes,
      cancelReasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
      paymentFailures,
      vendorNoResponseCancels: incidents.length,
      worstVendors: worstIds.map(([id, n]) => ({ name: nameOf.get(id) ?? 'Unknown vendor', noResponseCancels: n })),
      adminInterventions: adminEvents,
      latePaymentsCredited: lateCredits,
      sevenDayAvg: {
        placed: weekPlaced / 7,
        delivered: weekDelivered._count._all / 7,
        gmv: (weekDelivered._sum.totalAmount ?? 0) / 7,
      },
    },
    live: { readyNoRider, stuckPreparing, stuckInDelivery, ridersOnline, vendorsOpen },
    growth: {
      signups: { customers: signupCount('CUSTOMER'), vendors: signupCount('VENDOR'), riders: signupCount('RIDER') },
      pendingVendors,
      pendingRiders,
      oldestPendingDays: oldest ? Math.floor((now.getTime() - oldest.getTime()) / DAY_MS) : null,
      pendingDocuments: pendingVendorDocs + pendingRiderDocs,
    },
    support: { opened: ticketsOpened, openNow: ticketsOpen, overdueNow: ticketsOverdue, breachedYesterday: ticketsBreached },
    reliability: { critical: severityCount('CRITICAL'), high: severityCount('HIGH'), unresolvedCritical },
    money: {
      creditIssued: creditByReason.reduce((s, c) => s + c.amount, 0),
      creditByReason,
      payoutBatch: payoutBatch ? { status: payoutBatch.status, failureReason: payoutBatch.failureReason } : null,
    },
  };
}

// ─── LLM narrative ───────────────────────────────────────────────────────────────

let anthropic: Anthropic | null = null;
const getAnthropic = (): Anthropic => {
  if (!anthropic) anthropic = new Anthropic({ timeout: 120_000, maxRetries: 2 });
  return anthropic;
};

const SYSTEM_PROMPT = `You are the operations manager for GoBuyMe, a food and goods delivery app in Nigeria (customers order from vendors; riders deliver). Each morning you brief the founder on yesterday's operations and on what needs attention right now.

You receive yesterday's metrics as JSON (money in naira, times in minutes, "live" = the state at the moment of writing) and a list of rule-based flags. The company is in early launch, so volumes are small and a single failed order matters.

Write for a busy founder reading on a phone:
- headline: one sentence capturing the day. If nothing happened, say so plainly.
- status: RED if anything needs action within the hour (orders stuck now, money at risk, unresolved critical errors), AMBER if something needs attention today, GREEN otherwise. Never rate below the most severe flag.
- concerns: the problems, most urgent first. Cover every flag. Name order numbers and vendors from the data.
- actions: concrete steps for today that a person can take in the admin panel (e.g. "Assign a rider to #GBM-…", "Call <vendor> about missed orders", "Review the 3 pending rider documents"). No vague advice.
- highlights: genuinely good news only; leave empty rather than padding.

Rules: use only facts present in the data; never invent or estimate numbers; compare with the 7-day average only when it is non-zero; plain text only, no markdown or HTML; each item one or two short sentences; at most 4 items per list.`;

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'headline', 'concerns', 'actions', 'highlights'],
  properties: {
    status: { type: 'string', enum: ['GREEN', 'AMBER', 'RED'] },
    headline: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    highlights: { type: 'array', items: { type: 'string' } },
  },
} as const;

const RANK: Record<BriefingSummary['status'], number> = { GREEN: 0, AMBER: 1, RED: 2 };

export async function summarizeWithLLM(metrics: OpsMetrics, flags: OpsFlag[]): Promise<BriefingSummary | null> {
  try {
    const res = await getAnthropic().beta.messages.create({
      model: LLM_MODEL(),
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Metrics:\n${JSON.stringify(metrics, null, 2)}\n\nRule-based flags:\n${JSON.stringify(flags, null, 2)}`,
      }],
    });

    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      logger.warn('opsBriefing: LLM did not complete', { stopReason: res.stop_reason });
      return null;
    }
    const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as BriefingSummary;

    // The rules are the floor: the model may raise the status but never hide a flagged problem.
    const floor = statusFromFlags(flags);
    const status = RANK[parsed.status] >= RANK[floor] ? parsed.status : floor;
    const clean = (items: unknown) =>
      (Array.isArray(items) ? items : []).filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, 4);
    return {
      status,
      headline: String(parsed.headline ?? '').trim() || rulesSummary(metrics, flags).headline,
      concerns: clean(parsed.concerns),
      actions: clean(parsed.actions),
      highlights: clean(parsed.highlights),
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      logger.error('opsBriefing: Claude API error', { status: err.status, message: err.message });
    } else {
      logger.error('opsBriefing: LLM summary failed', { error: (err as Error).message });
    }
    return null;
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────────

export interface BriefingResult {
  day: string;
  analyzedBy: 'llm' | 'rules';
  html: string;
  sent: boolean;
  skipped?: 'already_sent';
}

/**
 * Builds (or rebuilds, with `force`) the briefing for `day` and optionally sends it to Telegram.
 * Without `force`, a day that was already sent is skipped, so restarts and multiple server
 * instances don't double-post.
 */
export async function runOpsBriefing(opts: { day?: string; send: boolean; force?: boolean } = { send: true }): Promise<BriefingResult> {
  const day = opts.day ?? lagosYesterday();
  const existing = await prisma.opsBriefing.findUnique({ where: { day } });
  if (existing?.sentAt && !opts.force) {
    return { day, analyzedBy: existing.analyzedBy as 'llm' | 'rules', html: existing.html, sent: false, skipped: 'already_sent' };
  }

  const metrics = await collectOpsMetrics(day);
  const flags = deriveFlags(metrics);
  const llmSummary = LLM_ENABLED() ? await summarizeWithLLM(metrics, flags) : null;
  const summary = llmSummary ?? rulesSummary(metrics, flags);
  const analyzedBy = llmSummary ? 'llm' : 'rules';
  const html = renderBriefingHtml(metrics, summary, { analyzedBy });

  const data = {
    metrics: metrics as unknown as Prisma.InputJsonValue,
    flags: flags as unknown as Prisma.InputJsonValue,
    summary: summary as unknown as Prisma.InputJsonValue,
    analyzedBy,
    model: llmSummary ? LLM_MODEL() : null,
    html,
  };
  await prisma.opsBriefing.upsert({ where: { day }, create: { day, ...data }, update: { ...data, sendError: null } });

  if (!opts.send) return { day, analyzedBy, html, sent: false };

  // Claim the send so only one instance posts; forced re-sends bypass the claim.
  const claimed = await prisma.opsBriefing.updateMany({
    where: { day, ...(opts.force ? {} : { sentAt: null }) },
    data: { sentAt: new Date() },
  });
  if (claimed.count === 0) return { day, analyzedBy, html, sent: false, skipped: 'already_sent' };

  const chatId = process.env.TELEGRAM_BRIEFING_CHAT_ID || undefined;
  const sent = await sendTelegramAlert(html, { chatId });
  if (!sent) {
    await prisma.opsBriefing.update({
      where: { day },
      data: { sentAt: null, sendError: 'Telegram send failed or Telegram is not configured — see error logs.' },
    });
  }
  logger.info(`Ops briefing for ${day}: ${analyzedBy}, ${sent ? 'sent' : 'not sent'}`);
  return { day, analyzedBy, html, sent };
}

export const runScheduledOpsBriefing = () =>
  runOpsBriefing({ send: true }).catch((err) => recordError('ops-briefing', 'Daily ops briefing failed', err));
