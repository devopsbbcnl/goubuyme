// SMOIS phase 3 rules with no database: response-time targets on a business-hours clock, inbox status moves,
// campaign results maths, reputation alerts, asset expiry and competitor summaries.
import type { SmoisCampaignStatus, SmoisConversationStatus, SmoisInboxPriority } from '@prisma/client';

// ── Business hours (Lagos is UTC+1 all year) ────────────────────────────────

export interface BusinessHours { startHour: number; endHour: number; days: number[] }
export const DEFAULT_HOURS: BusinessHours = { startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] };

const OFFSET = 3_600_000;
const MIN = 60_000;
const DAY = 86_400_000;
const local = (d: Date) => new Date(d.getTime() + OFFSET);          // read the UTC fields as Lagos wall time
const fromLocal = (d: Date) => new Date(d.getTime() - OFFSET);
const localDayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const isBusinessDay = (l: Date, h: BusinessHours) => h.days.includes(l.getUTCDay());
const openMs = (l: Date, h: BusinessHours) => localDayStart(l) + h.startHour * 3_600_000;
const closeMs = (l: Date, h: BusinessHours) => localDayStart(l) + h.endHour * 3_600_000;
const usable = (h: BusinessHours) => h.days.length > 0 && h.endHour > h.startHour;

/** Is this instant inside business hours? */
export const isBusinessMoment = (d: Date, h: BusinessHours = DEFAULT_HOURS): boolean => {
  if (!usable(h)) return true;
  const l = local(d);
  return isBusinessDay(l, h) && l.getTime() >= openMs(l, h) && l.getTime() < closeMs(l, h);
};

/** The next moment (at or after `d`) the business is open. */
export const nextOpening = (d: Date, h: BusinessHours = DEFAULT_HOURS): Date => {
  if (!usable(h)) return d;
  let l = local(d);
  for (let i = 0; i < 14; i++) {
    if (isBusinessDay(l, h)) {
      if (l.getTime() < openMs(l, h)) return fromLocal(new Date(openMs(l, h)));
      if (l.getTime() < closeMs(l, h)) return fromLocal(l);
    }
    l = new Date(localDayStart(l) + DAY);
  }
  return d;
};

/** `from` plus N minutes counted only while the business is open. */
export const addBusinessMinutes = (from: Date, minutes: number, h: BusinessHours = DEFAULT_HOURS): Date => {
  if (!usable(h)) return new Date(from.getTime() + minutes * MIN);
  let cursor = nextOpening(from, h);
  let remaining = minutes;
  for (let i = 0; i < 400; i++) {
    const l = local(cursor);
    const available = Math.max(0, (closeMs(l, h) - l.getTime()) / MIN);
    if (remaining <= available) return new Date(cursor.getTime() + remaining * MIN);
    remaining -= available;
    cursor = nextOpening(fromLocal(new Date(closeMs(l, h))), h);
  }
  return cursor;
};

/** Minutes between two instants that fall inside business hours. */
export const businessMinutesBetween = (a: Date, b: Date, h: BusinessHours = DEFAULT_HOURS): number => {
  if (b <= a) return 0;
  if (!usable(h)) return Math.round((b.getTime() - a.getTime()) / MIN);
  let total = 0;
  let l = local(a);
  const end = local(b).getTime();
  for (let i = 0; i < 400 && l.getTime() < end; i++) {
    if (isBusinessDay(l, h)) {
      const from = Math.max(l.getTime(), openMs(l, h));
      const to = Math.min(end, closeMs(l, h));
      if (to > from) total += (to - from) / MIN;
    }
    l = new Date(localDayStart(l) + DAY);
  }
  return Math.round(total);
};

// ── Response targets ────────────────────────────────────────────────────────

export interface SlaConfig { high: number; standard: number; general: number; hours: BusinessHours }

/** High and standard enquiries are counted on the business clock; general comments get a plain 24 hours. */
export const slaDueAt = (receivedAt: Date, priority: SmoisInboxPriority, c: SlaConfig): Date => {
  if (priority === 'GENERAL') return new Date(receivedAt.getTime() + c.general * MIN);
  return addBusinessMinutes(receivedAt, priority === 'HIGH' ? c.high : c.standard, c.hours);
};

/** How long a reply took, on the same clock the target uses. */
export const responseMinutes = (receivedAt: Date, respondedAt: Date, priority: SmoisInboxPriority, c: SlaConfig): number =>
  priority === 'GENERAL' ? Math.max(0, Math.round((respondedAt.getTime() - receivedAt.getTime()) / MIN)) : businessMinutesBetween(receivedAt, respondedAt, c.hours);

export type SlaState = 'MET' | 'BREACHED' | 'DUE_SOON' | 'ON_TRACK' | 'NOT_APPLICABLE';

export const slaState = (
  c: { slaDueAt: Date | null; firstResponseAt: Date | null; status: SmoisConversationStatus },
  now: Date,
): SlaState => {
  if (!c.slaDueAt) return 'NOT_APPLICABLE';
  if (c.firstResponseAt) return c.firstResponseAt <= c.slaDueAt ? 'MET' : 'BREACHED';
  // Closed without ever answering (spam, duplicates): not counted for or against anyone.
  if (c.status === 'RESOLVED' || c.status === 'CLOSED') return 'NOT_APPLICABLE';
  if (now > c.slaDueAt) return 'BREACHED';
  return c.slaDueAt.getTime() - now.getTime() <= 30 * MIN ? 'DUE_SOON' : 'ON_TRACK';
};

// ── Inbox statuses ──────────────────────────────────────────────────────────

type CS = SmoisConversationStatus;
const MOVES: Record<CS, CS[]> = {
  NEW: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  ASSIGNED: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  WAITING_FOR_CUSTOMER: ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  ESCALATED: ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: ['OPEN'],
};
export const canMoveConversation = (from: CS, to: CS) => MOVES[from]?.includes(to) ?? false;
export const OPEN_STATUSES: CS[] = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED'];
export const ESCALATION_TYPES = ['SERIOUS_COMPLAINT', 'LEGAL', 'SECURITY', 'PRODUCT_ISSUE', 'MEDIA_ENQUIRY', 'PARTNERSHIP', 'SENSITIVE_CUSTOMER'] as const;

/**
 * Duplicate-reply guard (PRD 14.5): if a colleague logged a reply very recently, say so before a second
 * one goes out. Returns that colleague's id, or null when it is safe.
 */
export const recentReplyBy = (messages: { direction: string; authorId: string | null; occurredAt: Date }[], actorId: string, now: Date, windowMinutes = 10): string | null => {
  const cutoff = now.getTime() - windowMinutes * MIN;
  const hit = messages.find((m) => m.direction === 'OUTBOUND' && m.authorId && m.authorId !== actorId && m.occurredAt.getTime() >= cutoff);
  return hit?.authorId ?? null;
};

// ── Reputation alert ────────────────────────────────────────────────────────

/** A spike is at least `minCount` negative mentions in the last day AND at least twice the recent daily average. */
export const negativeSpike = (last24h: number, previous7Days: number, minCount = 3) => {
  const avgDaily = previous7Days / 7;
  const threshold = Math.max(minCount, Math.ceil(avgDaily * 2));
  return { spike: last24h >= threshold, threshold, avgDaily: Math.round(avgDaily * 100) / 100 };
};

// ── Campaigns ───────────────────────────────────────────────────────────────

const CAMPAIGN_MOVES: Record<SmoisCampaignStatus, SmoisCampaignStatus[]> = {
  PLANNING: ['BRIEFING', 'CANCELLED'],
  BRIEFING: ['PLANNING', 'PREPARATION', 'CANCELLED'],
  PREPARATION: ['BRIEFING', 'APPROVAL', 'CANCELLED'],
  APPROVAL: ['PREPARATION', 'ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};
export const canMoveCampaign = (from: SmoisCampaignStatus, to: SmoisCampaignStatus) => CAMPAIGN_MOVES[from]?.includes(to) ?? false;

export interface ResultRow { channel: string; reach: number | null; impressions: number | null; engagement: number | null; clicks: number | null; leads: number | null; conversions: number | null; spend: number | null; revenue: number | null }

const sum = (xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b <= 0 ? null : r2(a / b));

export interface ChannelTotals {
  entries: number; reach: number | null; impressions: number | null; engagement: number | null; clicks: number | null; leads: number | null; conversions: number | null;
  spend: number | null; revenue: number | null;
  costPerClick: number | null; costPerLead: number | null; costPerResult: number | null; costPerResultBasis: string | null; returnOnAdSpend: number | null;
}

const channelTotals = (rows: ResultRow[]): ChannelTotals => {
  const spend = sum(rows.map((r) => r.spend)); const leads = sum(rows.map((r) => r.leads)); const conversions = sum(rows.map((r) => r.conversions));
  const clicks = sum(rows.map((r) => r.clicks)); const revenue = sum(rows.map((r) => r.revenue));
  const basis = conversions && conversions > 0 ? 'conversion' : leads && leads > 0 ? 'lead' : null;
  return {
    entries: rows.length, reach: sum(rows.map((r) => r.reach)), impressions: sum(rows.map((r) => r.impressions)), engagement: sum(rows.map((r) => r.engagement)),
    clicks, leads, conversions, spend, revenue,
    costPerClick: div(spend, clicks), costPerLead: div(spend, leads),
    costPerResult: basis === 'conversion' ? div(spend, conversions) : basis === 'lead' ? div(spend, leads) : null, costPerResultBasis: basis,
    returnOnAdSpend: div(revenue, spend),
  };
};

/** Paid and organic stay separate (PRD 20.5). Budget is compared with spend; nothing is blended. */
export const campaignTotals = (rows: ResultRow[], budget: number | null) => {
  const paid = channelTotals(rows.filter((r) => r.channel === 'PAID'));
  const organic = channelTotals(rows.filter((r) => r.channel === 'ORGANIC'));
  const spent = paid.spend ?? 0;
  return {
    paid, organic,
    budget: { planned: budget, spent: paid.spend, remaining: budget === null ? null : r2(budget - spent), usedPct: budget && budget > 0 ? r2((spent / budget) * 100) : null, overBudget: budget !== null && spent > budget },
  };
};

// ── Media library ───────────────────────────────────────────────────────────

export type ExpiryState = 'NONE' | 'OK' | 'EXPIRING_SOON' | 'EXPIRED';
export const assetExpiry = (expiresAt: Date | null, now: Date, soonDays = 14): ExpiryState => {
  if (!expiresAt) return 'NONE';
  if (expiresAt <= now) return 'EXPIRED';
  return expiresAt.getTime() - now.getTime() <= soonDays * DAY ? 'EXPIRING_SOON' : 'OK';
};

// ── Competitors ─────────────────────────────────────────────────────────────

export interface CompSnap { date: string; followers: number | null; postsLast7Days: number | null; avgEngagement: number | null }

/** Growth over the period uses the first and last follower observations inside it; needs two. */
export const competitorSummary = (snaps: CompSnap[], from: string, to: string) => {
  const inRange = snaps.filter((s) => s.date >= from && s.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const withF = inRange.filter((s) => s.followers !== null);
  const first = withF[0]; const last = withF[withF.length - 1];
  const growth = first && last && last.date > first.date ? (last.followers as number) - (first.followers as number) : null;
  const growthPct = growth !== null && (first.followers as number) > 0 ? r2((growth / (first.followers as number)) * 100) : null;
  const freq = inRange.map((s) => s.postsLast7Days).filter((v): v is number => v !== null);
  const eng = inRange.map((s) => s.avgEngagement).filter((v): v is number => v !== null);
  return {
    observations: inRange.length,
    followers: last?.followers ?? null,
    growth, growthPct,
    postsPerWeek: freq.length ? r2(freq.reduce((a, b) => a + b, 0) / freq.length) : null,
    avgEngagement: eng.length ? r2(eng.reduce((a, b) => a + b, 0) / eng.length) : null,
    note: growth === null ? 'Need two follower observations in the period to show growth.' : null,
  };
};
