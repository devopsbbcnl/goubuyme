// Vendor/rider acquisition pipeline. Staff routes under /api/v1/admin/crm; inbound under /api/v1/leads.
import crypto from 'crypto';
import { Request, Response } from 'express';
import { LeadActivityType, LeadSource, LeadStage, LeadType, Prisma, VendorCategory } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import {
  LEAD_SOURCES, LEAD_STAGES, LeadError, OPEN_STAGES, findDuplicateLead, normalizeEmail, parseLeadImport,
  phoneKey, pipelineSummary, stageChangeData,
} from '../../services/crm/lead.service';

const LEAD_TYPES: LeadType[] = ['VENDOR', 'RIDER'];
const MANUAL_ACTIVITY_TYPES: LeadActivityType[] = ['NOTE', 'CALL', 'VISIT', 'EMAIL', 'WHATSAPP'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] as const;

const guard = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof LeadError) return apiResponse.error(res, err.message, err.status);
      throw err;
    }
  });

const str = (v: unknown, max: number) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** Validates editable lead fields. `partial` allows omitting fields on update. */
const parseLeadFields = async (body: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.LeadUncheckedUpdateInput = {};
  const has = (k: string) => k in body;

  if (!partial || has('type')) {
    if (!LEAD_TYPES.includes(body.type as LeadType)) throw new LeadError('Type must be VENDOR or RIDER.');
    data.type = body.type as LeadType;
  }
  if (!partial || has('name')) {
    const name = str(body.name, 120);
    if (!name) throw new LeadError('Name is required.');
    data.name = name;
  }
  if (has('contactName')) data.contactName = str(body.contactName, 120);
  if (has('phone')) {
    const phone = str(body.phone, 30);
    if (phone && !phoneKey(phone)) throw new LeadError('Enter a valid phone number.');
    data.phone = phone;
    data.phoneKey = phoneKey(phone);
  }
  if (has('email')) {
    const email = str(body.email, 160);
    if (email && !normalizeEmail(email)) throw new LeadError('Enter a valid email.');
    data.email = email ? normalizeEmail(email) : null;
  }
  if (has('city')) data.city = str(body.city, 80);
  if (has('area')) data.area = str(body.area, 80);
  if (has('category')) {
    const c = body.category ? String(body.category) : null;
    if (c && !(Object.values(VendorCategory) as string[]).includes(c)) throw new LeadError('Invalid category.');
    data.category = c as VendorCategory | null;
  }
  if (has('source') || !partial) {
    const s = (body.source ?? 'OTHER') as LeadSource;
    if (!LEAD_SOURCES.includes(s)) throw new LeadError('Invalid source.');
    data.source = s;
  }
  if (has('estimatedMonthlyGmv')) {
    const n = body.estimatedMonthlyGmv === null || body.estimatedMonthlyGmv === '' ? null : Number(body.estimatedMonthlyGmv);
    if (n !== null && (!Number.isFinite(n) || n < 0)) throw new LeadError('Estimated GMV must be a positive number.');
    data.estimatedMonthlyGmv = n;
  }
  if (has('ownerId')) {
    const ownerId = body.ownerId ? String(body.ownerId) : null;
    if (ownerId) {
      const owner = await prisma.user.findFirst({ where: { id: ownerId, role: { in: [...ADMIN_ROLES] }, isActive: true } });
      if (!owner) throw new LeadError('Owner must be an active admin.');
    }
    data.ownerId = ownerId;
  }
  return data;
};

const leadListSelect = {
  id: true, type: true, name: true, contactName: true, phone: true, email: true, city: true, area: true, category: true,
  source: true, stage: true, lostReason: true, estimatedMonthlyGmv: true, stageChangedAt: true, createdAt: true,
  convertedUserId: true,
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: { where: { status: 'OPEN' } } } },
} satisfies Prisma.LeadSelect;

// GET /leads?type=&stage=&ownerId=&search=&includeClosed=
export const listLeads = catchAsync(async (req: Request, res: Response) => {
  const { type, stage, ownerId, search, includeClosed } = req.query as Record<string, string>;
  const and: Prisma.LeadWhereInput[] = [];
  if (LEAD_TYPES.includes(type as LeadType)) and.push({ type: type as LeadType });
  if (LEAD_STAGES.includes(stage as LeadStage)) and.push({ stage: stage as LeadStage });
  else if (includeClosed !== 'true' && !search?.trim()) {
    // Board view: open leads plus anything closed in the last 30 days. Searches cover everything.
    const recent = new Date(Date.now() - 30 * 86_400_000);
    and.push({ OR: [{ stage: { in: OPEN_STAGES } }, { stageChangedAt: { gte: recent } }] });
  }
  if (ownerId === 'unassigned') and.push({ ownerId: null });
  else if (ownerId) and.push({ ownerId });
  if (search?.trim()) {
    const q = search.trim();
    const key = phoneKey(q);
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        ...(key ? [{ phoneKey: key }] : []),
      ],
    });
  }
  const leads = await prisma.lead.findMany({ where: { AND: and }, select: leadListSelect, orderBy: { stageChangedAt: 'desc' }, take: 500 });
  return apiResponse.success(res, 'Leads fetched.', leads.map(({ _count, ...l }) => ({ ...l, openTasks: _count.tasks })));
});

// GET /leads/summary?type=&days=
export const leadSummary = catchAsync(async (req: Request, res: Response) => {
  const type = LEAD_TYPES.includes(req.query.type as LeadType) ? (req.query.type as LeadType) : undefined;
  const days = Math.min(365, Math.max(7, parseInt(String(req.query.days ?? '90')) || 90));
  return apiResponse.success(res, 'Summary fetched.', await pipelineSummary(type, days));
});

// POST /leads
export const createLead = guard(async (req, res) => {
  const data = await parseLeadFields(req.body ?? {}, false);
  const duplicate = await findDuplicateLead(data.type as LeadType, data.phone as string | null, data.email as string | null);
  if (duplicate && req.body?.allowDuplicate !== true) {
    return apiResponse.error(res, `A lead with this phone or email already exists: ${duplicate.name} (${duplicate.stage.toLowerCase()}).`, 409);
  }
  const lead = await prisma.lead.create({
    data: { ...(data as Prisma.LeadUncheckedCreateInput), ownerId: (data.ownerId as string | undefined) ?? req.user!.userId },
  });
  const note = str(req.body?.note, 2000);
  await prisma.leadActivity.create({
    data: { leadId: lead.id, authorId: req.user!.userId, type: 'NOTE', body: note ?? 'Lead created' },
  });
  return apiResponse.success(res, 'Lead added.', lead, 201);
});

// GET /leads/:id
export const getLead = catchAsync(async (req: Request, res: Response) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, name: true } },
      convertedUser: {
        select: {
          id: true, name: true, email: true, role: true, createdAt: true,
          vendor: { select: { businessName: true, approvalStatus: true } },
          rider: { select: { approvalStatus: true } },
        },
      },
      activities: { orderBy: { createdAt: 'desc' }, take: 100, include: { author: { select: { id: true, name: true } } } },
      tasks: {
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        select: { id: true, title: true, status: true, dueAt: true, priority: true, assignee: { select: { id: true, name: true } } },
      },
    },
  });
  if (!lead) return apiResponse.error(res, 'Lead not found.', 404);
  return apiResponse.success(res, 'Lead fetched.', lead);
});

// PATCH /leads/:id  — fields and/or { stage, lostReason }
export const updateLead = guard(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return apiResponse.error(res, 'Lead not found.', 404);

  const data = await parseLeadFields(req.body ?? {}, true);
  const staffId = req.user!.userId;
  const stage = req.body?.stage as LeadStage | undefined;
  const now = new Date();

  if (stage !== undefined && stage !== lead.stage) {
    if (!LEAD_STAGES.includes(stage)) return apiResponse.error(res, 'Invalid stage.', 400);
    const lostReason = str(req.body?.lostReason, 200);
    if (stage === 'LOST' && !lostReason) return apiResponse.error(res, 'Say why this lead was lost.', 400);
    Object.assign(data, stageChangeData(stage, now, lostReason));
  }

  const updated = await prisma.lead.update({ where: { id: lead.id }, data, select: leadListSelect });
  if (stage !== undefined && stage !== lead.stage) {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id, authorId: staffId, type: 'STAGE_CHANGE',
        body: `${lead.stage.toLowerCase()} → ${stage.toLowerCase()}${stage === 'LOST' ? `: ${str(req.body?.lostReason, 200)}` : ''}`,
        meta: { from: lead.stage, to: stage },
      },
    });
  }
  const { _count, ...rest } = updated;
  return apiResponse.success(res, 'Lead updated.', { ...rest, openTasks: _count.tasks });
});

// DELETE /leads/:id  — SUPER_ADMIN
export const deleteLead = catchAsync(async (req: AuthRequest, res: Response) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return apiResponse.error(res, 'Lead not found.', 404);
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_LEAD_DELETED', entity: 'Lead', entityId: lead.id, meta: { name: lead.name } },
  });
  return apiResponse.success(res, 'Lead deleted.', { id: lead.id });
});

// POST /leads/:id/activities  { type, body }
export const addLeadActivity = guard(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!lead) return apiResponse.error(res, 'Lead not found.', 404);
  const type = req.body?.type as LeadActivityType;
  if (!MANUAL_ACTIVITY_TYPES.includes(type)) return apiResponse.error(res, 'Invalid activity type.', 400);
  const body = str(req.body?.body, 2000);
  if (!body) return apiResponse.error(res, 'Add a short note about what happened.', 400);

  const activity = await prisma.leadActivity.create({
    data: { leadId: lead.id, authorId: req.user!.userId, type, body },
    include: { author: { select: { id: true, name: true } } },
  });
  // Logging an outreach on a brand-new lead means it has been contacted.
  if (type !== 'NOTE') {
    await prisma.lead.updateMany({ where: { id: lead.id, stage: 'NEW' }, data: stageChangeData('CONTACTED') });
  }
  return apiResponse.success(res, 'Activity logged.', activity, 201);
});

// POST /leads/:id/link  { userId }  — manually attach the signed-up account
export const linkLeadAccount = guard(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return apiResponse.error(res, 'Lead not found.', 404);
  const user = await prisma.user.findFirst({
    where: { id: String(req.body?.userId ?? ''), role: lead.type, deletedAt: null },
    include: { vendor: { select: { approvalStatus: true } }, rider: { select: { approvalStatus: true } } },
  });
  if (!user) return apiResponse.error(res, `Choose an existing ${lead.type.toLowerCase()} account.`, 400);
  const taken = await prisma.lead.findUnique({ where: { convertedUserId: user.id } });
  if (taken && taken.id !== lead.id) return apiResponse.error(res, `That account is already linked to "${taken.name}".`, 409);

  const approved = (user.vendor?.approvalStatus ?? user.rider?.approvalStatus) === 'APPROVED';
  const nextStage: LeadStage = approved ? 'LIVE' : 'ONBOARDING';
  await prisma.lead.update({
    where: { id: lead.id },
    data: { convertedUserId: user.id, ...(lead.stage !== nextStage ? stageChangeData(nextStage) : {}) },
  });
  await prisma.leadActivity.create({
    data: { leadId: lead.id, authorId: req.user!.userId, type: 'CONVERTED', body: `Linked to account ${user.email}`, meta: { userId: user.id, stage: nextStage } },
  });
  return apiResponse.success(res, 'Account linked.', { stage: nextStage });
});

// POST /leads/import  { type, source?, ownerId?, csv }
export const importLeads = guard(async (req, res) => {
  const type = req.body?.type as LeadType;
  if (!LEAD_TYPES.includes(type)) return apiResponse.error(res, 'Type must be VENDOR or RIDER.', 400);
  const csv = String(req.body?.csv ?? '');
  if (csv.length > 1_000_000) return apiResponse.error(res, 'File is too large (max 1 MB).', 400);
  const source = (LEAD_SOURCES.includes(req.body?.source) ? req.body.source : 'IMPORT') as LeadSource;
  const ownerId = req.body?.ownerId ? String(req.body.ownerId) : req.user!.userId;

  const { valid, errors } = parseLeadImport(csv, type);
  let created = 0;
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const row of valid) {
    const dedupeKey = phoneKey(row.phone) ?? row.email ?? '';
    if (dedupeKey && seen.has(dedupeKey)) { duplicates.push(row.name); continue; }
    if (dedupeKey) seen.add(dedupeKey);
    if (await findDuplicateLead(type, row.phone, row.email)) { duplicates.push(row.name); continue; }
    const lead = await prisma.lead.create({
      data: {
        type, source, ownerId, name: row.name, contactName: row.contactName, phone: row.phone, phoneKey: phoneKey(row.phone),
        email: row.email, city: row.city, area: row.area, category: row.category,
      },
    });
    await prisma.leadActivity.create({
      data: { leadId: lead.id, authorId: req.user!.userId, type: 'NOTE', body: row.notes ? `Imported: ${row.notes}` : 'Imported from CSV' },
    });
    created++;
  }
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_LEADS_IMPORTED', entity: 'Lead', entityId: req.user!.userId, meta: { type, created, duplicates: duplicates.length, errors: errors.length } },
  });
  return apiResponse.success(res, `Imported ${created} leads.`, { created, duplicates, errors });
});

// ─── Inbound (website forms) ─────────────────────────────────────────────────

const secretMatches = (given: string | undefined) => {
  const expected = process.env.LEADS_INBOUND_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// POST /api/v1/leads/inbound  (header x-leads-secret)  { type, name, contactName?, phone?, email?, city?, message?, form? }
export const inboundLead = catchAsync(async (req: Request, res: Response) => {
  if (!secretMatches(req.header('x-leads-secret') ?? undefined)) return apiResponse.error(res, 'Forbidden.', 403);

  const type = (req.body?.type === 'RIDER' ? 'RIDER' : 'VENDOR') as LeadType;
  const name = str(req.body?.name, 120);
  const phone = str(req.body?.phone, 30);
  const email = str(req.body?.email, 160);
  if (!name) return apiResponse.error(res, 'Name is required.', 400);
  if (!phoneKey(phone) && !normalizeEmail(email)) return apiResponse.error(res, 'A phone number or email is required.', 400);

  const message = str(req.body?.message, 2000);
  const form = str(req.body?.form, 40) ?? 'website';
  const existing = await findDuplicateLead(type, phone, email);
  if (existing) {
    await prisma.leadActivity.create({
      data: { leadId: existing.id, type: 'NOTE', body: `Enquired again via ${form}${message ? `: ${message}` : ''}` },
    });
    return apiResponse.success(res, 'Lead updated.', { id: existing.id, duplicate: true });
  }

  const lead = await prisma.lead.create({
    data: {
      type, name, source: 'INBOUND_WEB', contactName: str(req.body?.contactName, 120),
      phone: phoneKey(phone) ? phone : null, phoneKey: phoneKey(phone), email: normalizeEmail(email), city: str(req.body?.city, 80),
    },
  });
  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: 'NOTE', body: `Submitted the ${form} form${message ? `: ${message}` : ''}` },
  });
  return apiResponse.success(res, 'Lead created.', { id: lead.id, duplicate: false }, 201);
});
