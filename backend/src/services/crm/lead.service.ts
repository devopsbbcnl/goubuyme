// Vendor/rider acquisition pipeline: matching leads to accounts that sign up, stage
// bookkeeping, CSV import parsing and funnel reporting.
import { LeadSource, LeadStage, LeadType, Prisma, VendorCategory } from '@prisma/client';
import prisma from '../../config/db';
import { recordError } from '../../utils/recordError';

export const LEAD_STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'INTERESTED', 'ONBOARDING', 'LIVE', 'LOST'];
export const OPEN_STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'INTERESTED', 'ONBOARDING'];
export const LEAD_SOURCES: LeadSource[] = ['FIELD', 'REFERRAL', 'INBOUND_WEB', 'SOCIAL', 'IMPORT', 'OTHER'];
export const MAX_IMPORT_ROWS = 1000;

export class LeadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Last 10 digits of a Nigerian number, so 0803…, +234803… and 234803… all match. */
export const phoneKey = (phone?: string | null): string | null => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
};

export const normalizeEmail = (email?: string | null): string | null => {
  const e = (email ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

/** Fields to write when a lead moves stage (timestamps used for funnel reporting). */
export const stageChangeData = (to: LeadStage, now = new Date(), lostReason?: string | null): Prisma.LeadUncheckedUpdateInput => ({
  stage: to,
  stageChangedAt: now,
  liveAt: to === 'LIVE' ? now : null,
  lostAt: to === 'LOST' ? now : null,
  lostReason: to === 'LOST' ? (lostReason ?? null) : null,
});

// ─── Account linking ─────────────────────────────────────────────────────────

const ROLE_TO_TYPE: Record<string, LeadType | undefined> = { VENDOR: 'VENDOR', RIDER: 'RIDER' };

/**
 * Links a newly created vendor/rider account to a matching open lead (by phone, then email)
 * and moves it to ONBOARDING. Fire-and-forget: never throws.
 */
export const linkLeadForUser = async (userId: string): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, phone: true, email: true } });
    const type = user && ROLE_TO_TYPE[user.role];
    if (!user || !type) return;

    const key = phoneKey(user.phone);
    const email = normalizeEmail(user.email);
    const or: Prisma.LeadWhereInput[] = [];
    if (key) or.push({ phoneKey: key });
    if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
    if (or.length === 0) return;

    const lead = await prisma.lead.findFirst({
      where: { type, convertedUserId: null, stage: { in: OPEN_STAGES }, OR: or },
      orderBy: { createdAt: 'desc' },
    });
    if (!lead) return;

    const now = new Date();
    const claimed = await prisma.lead.updateMany({
      where: { id: lead.id, convertedUserId: null },
      data: { convertedUserId: user.id, stage: 'ONBOARDING', stageChangedAt: now },
    });
    if (claimed.count === 0) return;
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id, type: 'CONVERTED', body: 'Signed up for a GoBuyMe account',
        meta: { userId: user.id, fromStage: lead.stage, matchedBy: key && lead.phoneKey === key ? 'phone' : 'email' },
      },
    });
  } catch (err) {
    recordError('crm-leads', 'linkLeadForUser failed', err, { userId });
  }
};

/** Moves the lead linked to an approved account to LIVE. Fire-and-forget: never throws. */
export const markLeadLiveForUser = async (userId: string): Promise<void> => {
  try {
    const lead = await prisma.lead.findUnique({ where: { convertedUserId: userId } });
    if (!lead || lead.stage === 'LIVE') return;
    await prisma.lead.update({ where: { id: lead.id }, data: stageChangeData('LIVE') });
    await prisma.leadActivity.create({
      data: { leadId: lead.id, type: 'STAGE_CHANGE', body: 'Account approved — now live', meta: { from: lead.stage, to: 'LIVE' } },
    });
  } catch (err) {
    recordError('crm-leads', 'markLeadLiveForUser failed', err, { userId });
  }
};

// ─── CSV import ──────────────────────────────────────────────────────────────

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
};

export interface ImportRow {
  name: string; contactName: string | null; phone: string | null; email: string | null;
  city: string | null; area: string | null; category: VendorCategory | null; notes: string | null;
}

const HEADER_ALIASES: Record<string, keyof ImportRow> = {
  name: 'name', business: 'name', businessname: 'name', 'business name': 'name',
  contact: 'contactName', contactname: 'contactName', 'contact name': 'contactName', owner: 'contactName',
  phone: 'phone', 'phone number': 'phone', mobile: 'phone',
  email: 'email', city: 'city', area: 'area', category: 'category', notes: 'notes', note: 'notes',
};

/** Parses an import CSV (header row required). Returns valid rows plus per-line errors. */
export const parseLeadImport = (csv: string, type: LeadType) => {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new LeadError('Add a header row and at least one lead.');
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new LeadError(`Import at most ${MAX_IMPORT_ROWS} leads at a time.`);

  const columns = rows[0].map(h => HEADER_ALIASES[h.trim().toLowerCase()]);
  if (!columns.includes('name')) throw new LeadError('The CSV needs a "name" column.');

  const valid: ImportRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const get = (key: keyof ImportRow) => {
      const i = columns.indexOf(key);
      const v = i >= 0 ? (cells[i] ?? '').trim() : '';
      return v || null;
    };
    const name = get('name');
    if (!name) return errors.push({ line, message: 'Missing name' });
    const rawCategory = get('category')?.toUpperCase().replace(/\s+/g, '_') ?? null;
    const category = rawCategory && (Object.values(VendorCategory) as string[]).includes(rawCategory) ? rawCategory as VendorCategory : null;
    if (type === 'VENDOR' && rawCategory && !category) return errors.push({ line, message: `Unknown category "${get('category')}"` });
    const email = get('email');
    if (email && !normalizeEmail(email)) return errors.push({ line, message: `Invalid email "${email}"` });
    const phone = get('phone');
    if (phone && !phoneKey(phone)) return errors.push({ line, message: `Invalid phone "${phone}"` });
    valid.push({
      name: name.slice(0, 120), contactName: get('contactName'), phone, email: email ? normalizeEmail(email) : null,
      city: get('city'), area: get('area'), category: type === 'VENDOR' ? category : null, notes: get('notes'),
    });
  });
  return { valid, errors };
};

/** Finds an existing open lead with the same phone or email, to avoid duplicates. */
export const findDuplicateLead = (type: LeadType, phone?: string | null, email?: string | null) => {
  const or: Prisma.LeadWhereInput[] = [];
  const key = phoneKey(phone);
  const mail = normalizeEmail(email);
  if (key) or.push({ phoneKey: key });
  if (mail) or.push({ email: { equals: mail, mode: 'insensitive' } });
  if (or.length === 0) return Promise.resolve(null);
  return prisma.lead.findFirst({ where: { type, stage: { not: 'LOST' }, OR: or } });
};

// ─── Reporting ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export const pipelineSummary = async (type: LeadType | undefined, days = 90, now = new Date()) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  const typeWhere: Prisma.LeadWhereInput = type ? { type } : {};

  const [byStage, created, wentLive, lost, liveRows, openAges, byOwner] = await Promise.all([
    prisma.lead.groupBy({ by: ['stage'], where: typeWhere, _count: { _all: true } }),
    prisma.lead.count({ where: { ...typeWhere, createdAt: { gte: since } } }),
    prisma.lead.count({ where: { ...typeWhere, liveAt: { gte: since } } }),
    prisma.lead.groupBy({ by: ['lostReason'], where: { ...typeWhere, lostAt: { gte: since } }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { ...typeWhere, liveAt: { gte: since } }, select: { createdAt: true, liveAt: true } }),
    prisma.lead.findMany({ where: { ...typeWhere, stage: { in: OPEN_STAGES } }, select: { stage: true, stageChangedAt: true } }),
    prisma.lead.groupBy({ by: ['ownerId'], where: { ...typeWhere, liveAt: { gte: since } }, _count: { _all: true } }),
  ]);

  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const daysInStage: Partial<Record<LeadStage, number | null>> = {};
  for (const stage of OPEN_STAGES) {
    daysInStage[stage] = avg(openAges.filter(l => l.stage === stage).map(l => (now.getTime() - l.stageChangedAt.getTime()) / DAY_MS));
  }
  const owners = await prisma.user.findMany({
    where: { id: { in: byOwner.flatMap(o => (o.ownerId ? [o.ownerId] : [])) } }, select: { id: true, name: true },
  });

  return {
    periodDays: days,
    stages: Object.fromEntries(LEAD_STAGES.map(s => [s, byStage.find(b => b.stage === s)?._count._all ?? 0])),
    createdInPeriod: created,
    liveInPeriod: wentLive,
    conversionRate: created ? Math.round((wentLive / created) * 1000) / 10 : 0,
    avgDaysToLive: avg(liveRows.map(l => (l.liveAt!.getTime() - l.createdAt.getTime()) / DAY_MS)),
    avgDaysInStage: daysInStage,
    lostReasons: lost.map(l => ({ reason: l.lostReason ?? 'No reason given', count: l._count._all })).sort((a, b) => b.count - a.count),
    liveByOwner: byOwner.map(o => ({ ownerId: o.ownerId, name: owners.find(u => u.id === o.ownerId)?.name ?? 'Unassigned', count: o._count._all }))
      .sort((a, b) => b.count - a.count),
  };
};
