// SMOIS shared inbox and contacts. Staff log what arrived on a platform account (there is no platform feed yet),
// work it together, and the system tracks who answered, how fast, and whether the response target was met.
import { Prisma, SmoisConversationStatus, SmoisConversationType, SmoisInboxPriority, SmoisPlatform } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import {
  ESCALATION_TYPES, OPEN_STATUSES, SlaConfig, canMoveConversation, recentReplyBy, responseMinutes, slaDueAt, slaState,
} from '../../services/smois/community';
import { SmoisRequest } from '../../middleware/smois.middleware';
import { loadSlaConfig } from '../../services/smois/insights';
import {
  access, date, fail, handle, httpUrl, isAssignedToAccount, managementUserIds, nameMap, notifyMany, oneOf, readPeriod, reqStr, str, strList, visibleAccountIds,
} from './common';

const TYPES: SmoisConversationType[] = ['DIRECT_MESSAGE', 'COMMENT', 'MENTION', 'REPLY', 'STORY_INTERACTION', 'ENQUIRY', 'REVIEW'];
const PRIORITIES: SmoisInboxPriority[] = ['HIGH', 'STANDARD', 'GENERAL'];
const STATUSES: SmoisConversationStatus[] = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED'];
const PLATFORMS: SmoisPlatform[] = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER'];
const CONTACT_CATEGORIES = ['PROSPECT', 'EXISTING_CUSTOMER', 'POTENTIAL_CUSTOMER', 'PARTNER', 'INFLUENCER', 'MEDIA', 'JOB_APPLICANT', 'SUPPORT_CASE', 'OTHER'] as const;
const DEFAULT_PRIORITY: Record<SmoisConversationType, SmoisInboxPriority> = { DIRECT_MESSAGE: 'STANDARD', ENQUIRY: 'STANDARD', REVIEW: 'STANDARD', COMMENT: 'GENERAL', MENTION: 'GENERAL', REPLY: 'GENERAL', STORY_INTERACTION: 'GENERAL' };

export const slaConfig = loadSlaConfig;

const convSelect = {
  id: true, number: true, accountId: true, type: true, subject: true, externalUrl: true, status: true, priority: true, tags: true,
  assignedMemberId: true, receivedAt: true, slaDueAt: true, firstResponseAt: true, firstResponderId: true, resolvedAt: true,
  escalationType: true, escalatedAt: true, escalationNote: true, lastActivityAt: true, loggedById: true,
  account: { select: { id: true, name: true, platform: true } },
  contact: { select: { id: true, displayName: true, username: true, category: true, anonymizedAt: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.SmoisConversationSelect;

const memberNames = async (ids: (string | null)[]) => {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  const m = uniq.length ? await prisma.smoisMember.findMany({ where: { id: { in: uniq } }, select: { id: true, user: { select: { name: true } } } }) : [];
  return new Map(m.map((x) => [x.id, x.user.name]));
};

const decorate = async <T extends { assignedMemberId: string | null; firstResponderId: string | null; slaDueAt: Date | null; firstResponseAt: Date | null; status: SmoisConversationStatus; receivedAt: Date; priority: SmoisInboxPriority }>(rows: T[], cfg: SlaConfig) => {
  const [mNames, uNames] = await Promise.all([memberNames(rows.map((r) => r.assignedMemberId)), nameMap(rows.map((r) => r.firstResponderId))]);
  const now = new Date();
  return rows.map((r) => ({
    ...r, sla: slaState(r, now), assigneeName: r.assignedMemberId ? mNames.get(r.assignedMemberId) ?? null : null,
    firstResponderName: r.firstResponderId ? uNames.get(r.firstResponderId) ?? null : null,
    firstResponseMinutes: r.firstResponseAt ? responseMinutes(r.receivedAt, r.firstResponseAt, r.priority, cfg) : null,
  }));
};

/** The conversation, if this person is allowed to see its account. */
const loadConversation = async (req: SmoisRequest, id: string) => {
  const c = await prisma.smoisConversation.findUnique({ where: { id }, select: { ...convSelect, messages: { orderBy: { occurredAt: 'asc' } } } });
  if (!c) return fail(404, 'Conversation not found.');
  const visible = await visibleAccountIds(access(req));
  if (!visible.some((a) => a.id === c.accountId)) fail(403, 'You cannot see that account\'s inbox.');
  return c;
};

// ── Conversations ───────────────────────────────────────────────────────────

// GET /inbox?view=queue|mine|unassigned|escalated|overdue|resolved|all&accountId&type&priority&q&page
export const listInbox = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const view = q.view ?? 'queue';
  const page = Math.max(1, Number(q.page) || 1);
  const take = 30;
  const visible = await visibleAccountIds(a, { accountId: q.accountId });
  const cfg = await slaConfig();
  const now = new Date();
  const and: Prisma.SmoisConversationWhereInput[] = [{ accountId: { in: visible.map((x) => x.id) } }];
  switch (view) {
    case 'mine': and.push({ assignedMemberId: a.memberId ?? '__none__', status: { in: OPEN_STATUSES } }); break;
    case 'unassigned': and.push({ assignedMemberId: null, status: { in: OPEN_STATUSES } }); break;
    case 'escalated': and.push({ status: 'ESCALATED' }); break;
    case 'overdue': and.push({ status: { in: OPEN_STATUSES }, firstResponseAt: null, slaDueAt: { lt: now } }); break;
    case 'resolved': and.push({ status: { in: ['RESOLVED', 'CLOSED'] } }); break;
    case 'all': break;
    default: and.push({ status: { in: OPEN_STATUSES } });
  }
  if (q.type) and.push({ type: oneOf(q.type, TYPES, 'Type') });
  if (q.priority) and.push({ priority: oneOf(q.priority, PRIORITIES, 'Priority') });
  if (q.status) and.push({ status: oneOf(q.status, STATUSES, 'Status') });
  if (q.q) and.push({ OR: [{ subject: { contains: q.q, mode: 'insensitive' } }, { messages: { some: { body: { contains: q.q, mode: 'insensitive' } } } }, { contact: { displayName: { contains: q.q, mode: 'insensitive' } } }] });
  const where: Prisma.SmoisConversationWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.smoisConversation.findMany({ where, select: convSelect, orderBy: view === 'resolved' ? { lastActivityAt: 'desc' } : [{ priority: 'asc' }, { slaDueAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }], skip: (page - 1) * take, take }),
    prisma.smoisConversation.count({ where }),
  ]);
  return apiResponse.success(res, 'Inbox.', { items: await decorate(rows, cfg), pagination: { page, total, pages: Math.ceil(total / take) } });
});

// GET /inbox/summary?period=month: workload now, and response performance over the period
export const inboxSummary = handle(async (req, res) => {
  const a = access(req);
  const p = readPeriod(req.query as Record<string, string>);
  const visible = (await visibleAccountIds(a)).map((x) => x.id);
  const cfg = await slaConfig();
  const now = new Date();
  const base: Prisma.SmoisConversationWhereInput = { accountId: { in: visible } };
  const open = { ...base, status: { in: OPEN_STATUSES } };
  const [newCount, openCount, unassigned, escalated, breachedOpen, dueSoon, mine, received, resolved, answeredRows, openComplaints] = await Promise.all([
    prisma.smoisConversation.count({ where: { ...base, status: 'NEW' } }),
    prisma.smoisConversation.count({ where: open }),
    prisma.smoisConversation.count({ where: { ...open, assignedMemberId: null } }),
    prisma.smoisConversation.count({ where: { ...base, status: 'ESCALATED' } }),
    prisma.smoisConversation.count({ where: { ...open, firstResponseAt: null, slaDueAt: { lt: now } } }),
    prisma.smoisConversation.count({ where: { ...open, firstResponseAt: null, slaDueAt: { gte: now, lte: new Date(now.getTime() + 30 * 60_000) } } }),
    prisma.smoisConversation.count({ where: { ...open, assignedMemberId: a.memberId ?? '__none__' } }),
    prisma.smoisConversation.count({ where: { ...base, receivedAt: { gte: p.from, lte: p.to } } }),
    prisma.smoisConversation.count({ where: { ...base, resolvedAt: { gte: p.from, lte: p.to } } }),
    prisma.smoisConversation.findMany({ where: { ...base, receivedAt: { gte: p.from, lte: p.to }, firstResponseAt: { not: null } }, select: { receivedAt: true, firstResponseAt: true, slaDueAt: true, priority: true, status: true } }),
    prisma.smoisConversation.count({ where: { ...open, escalationType: { in: ['SERIOUS_COMPLAINT', 'SENSITIVE_CUSTOMER'] } } }),
  ]);
  const mins = answeredRows.map((r) => responseMinutes(r.receivedAt, r.firstResponseAt as Date, r.priority, cfg));
  const met = answeredRows.filter((r) => slaState(r, now) === 'MET').length;
  const unansweredInPeriod = await prisma.smoisConversation.count({ where: { ...base, receivedAt: { gte: p.from, lte: p.to }, firstResponseAt: null, status: { in: OPEN_STATUSES } } });
  return apiResponse.success(res, 'Inbox summary.', {
    period: { key: p.key, label: p.label, from: p.from, to: p.to },
    now: { new: newCount, open: openCount, unassigned, escalated, overdue: breachedOpen, dueSoon, mine, openComplaints },
    period_: {
      received, resolved, answered: answeredRows.length, unanswered: unansweredInPeriod,
      avgFirstResponseMinutes: mins.length ? Math.round(mins.reduce((x, y) => x + y, 0) / mins.length) : null,
      withinTargetPct: answeredRows.length ? Math.round((met / answeredRows.length) * 100) : null,
    },
    targets: { highMinutes: cfg.high, standardMinutes: cfg.standard, generalMinutes: cfg.general, hours: cfg.hours },
    note: 'Counted from conversations staff logged. Anything not logged here is not counted.',
  });
});

// POST /inbox { accountId, type, subject?, body, receivedAt?, priority?, externalUrl?, tags?, contact?: { id? | displayName, username, ... } }
export const logConversation = handle(async (req, res) => {
  const a = access(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const accountId = reqStr(b.accountId, 'Account', 60);
  const visible = await visibleAccountIds(a, { accountId });
  if (!visible.length) fail(403, 'You cannot log to that account.');
  const type = b.type ? oneOf(b.type, TYPES, 'Type') : 'DIRECT_MESSAGE';
  const priority = b.priority ? oneOf(b.priority, PRIORITIES, 'Priority') : DEFAULT_PRIORITY[type];
  const body = reqStr(b.body, 'What the person wrote', 5000);
  const receivedAt = date(b.receivedAt, 'Received time') ?? new Date();
  if (receivedAt.getTime() > Date.now() + 5 * 60_000) fail(400, 'Received time cannot be in the future.');
  const cfg = await slaConfig();

  const created = await prisma.$transaction(async (tx) => {
    let contactId: string | null = null;
    const c = b.contact as Record<string, unknown> | undefined;
    if (c?.id) {
      const found = await tx.smoisContact.findUnique({ where: { id: String(c.id) }, select: { id: true } });
      if (!found) fail(400, 'Unknown contact.');
      contactId = String(c.id);
    } else if (c && (c.displayName || c.username)) {
      const platform = visible[0].platform as SmoisPlatform;
      const username = str(c.username, 120)?.replace(/^@/, '') ?? null;
      const existing = username ? await tx.smoisContact.findFirst({ where: { platform, username: { equals: username, mode: 'insensitive' }, anonymizedAt: null }, select: { id: true } }) : null;
      contactId = existing?.id ?? (await tx.smoisContact.create({ data: { displayName: str(c.displayName, 120) ?? username ?? 'Unknown', username, platform, profileUrl: httpUrl(c.profileUrl, 'Profile link'), createdById: a.userId }, select: { id: true } })).id;
    }
    const conv = await tx.smoisConversation.create({
      data: {
        accountId, contactId, type, priority, subject: str(b.subject, 160), externalUrl: httpUrl(b.externalUrl, 'Link'), tags: strList(b.tags, 10, 40),
        receivedAt, slaDueAt: slaDueAt(receivedAt, priority, cfg), loggedById: a.userId,
        messages: { create: { direction: 'INBOUND', body, occurredAt: receivedAt } },
      },
      select: { id: true, number: true },
    });
    await smoisAudit(req, { action: 'CONVERSATION_LOGGED', entity: 'SmoisConversation', entityId: conv.id, after: { account: visible[0].name, type, priority } }, tx);
    return conv;
  });
  if (priority === 'HIGH') await notifyMany(await managementUserIds(), { title: 'High-priority enquiry', body: `${visible[0].name}: ${body.slice(0, 120)}`, data: { link: `/smois/inbox?open=${created.id}` } }, a.userId);
  return apiResponse.success(res, 'Logged.', created, 201);
});

// GET /inbox/:id
export const getConversation = handle(async (req, res) => {
  const c = await loadConversation(req, req.params.id);
  const cfg = await slaConfig();
  const authors = await nameMap(c.messages.map((m) => m.authorId));
  const [dec] = await decorate([c], cfg);
  return apiResponse.success(res, 'Conversation.', {
    ...dec,
    messages: c.messages.map((m) => ({ ...m, authorName: m.authorId ? authors.get(m.authorId) ?? null : null })),
  });
});

// PATCH /inbox/:id { priority?, subject?, tags?, contactId? }
export const updateConversation = handle(async (req, res) => {
  const c = await loadConversation(req, req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisConversationUncheckedUpdateInput = {};
  if ('subject' in b) data.subject = str(b.subject, 160);
  if ('tags' in b) data.tags = strList(b.tags, 10, 40);
  if ('contactId' in b) data.contactId = b.contactId ? String(b.contactId) : null;
  if ('priority' in b) {
    const priority = oneOf(b.priority, PRIORITIES, 'Priority');
    data.priority = priority;
    // The target restarts from when it arrived, but only while it is still unanswered.
    if (!c.firstResponseAt) data.slaDueAt = slaDueAt(c.receivedAt, priority, await slaConfig());
  }
  const u = await prisma.smoisConversation.update({ where: { id: c.id }, data, select: { id: true, priority: true, slaDueAt: true } });
  await smoisAudit(req, { action: 'CONVERSATION_UPDATED', entity: 'SmoisConversation', entityId: c.id, before: { priority: c.priority }, after: { priority: u.priority } });
  return apiResponse.success(res, 'Updated.', u);
});

// POST /inbox/:id/assign { memberId | null }
export const assignConversation = handle(async (req, res) => {
  const c = await loadConversation(req, req.params.id);
  const memberId = req.body?.memberId ? String(req.body.memberId) : null;
  let userId: string | null = null;
  if (memberId) {
    const m = await prisma.smoisMember.findUnique({ where: { id: memberId }, select: { isActive: true, role: true, userId: true } });
    if (!m || !m.isActive || (m.role !== 'MANAGER' && m.role !== 'MANAGEMENT')) fail(400, 'Choose an active manager.');
    // A manager can only work accounts they are assigned to, so a conversation cannot be handed to someone who could not open it.
    if (m!.role === 'MANAGER' && !(await isAssignedToAccount(memberId, c.accountId))) fail(400, 'That manager is not assigned to this account.');
    userId = m!.userId;
  }
  const status: SmoisConversationStatus = memberId && (c.status === 'NEW' || c.status === 'OPEN') ? 'ASSIGNED' : !memberId && c.status === 'ASSIGNED' ? 'OPEN' : c.status;
  await prisma.$transaction(async (tx) => {
    await tx.smoisConversation.update({ where: { id: c.id }, data: { assignedMemberId: memberId, status, lastActivityAt: new Date() } });
    await smoisAudit(req, { action: 'CONVERSATION_ASSIGNED', entity: 'SmoisConversation', entityId: c.id, before: { assignedMemberId: c.assignedMemberId }, after: { assignedMemberId: memberId } }, tx);
  });
  await notifyMany([userId], { title: 'Conversation assigned to you', body: `#${c.number} on ${c.account.name}${c.subject ? `: ${c.subject}` : ''}`, data: { link: `/smois/inbox?open=${c.id}` } }, access(req).userId);
  return apiResponse.success(res, memberId ? 'Assigned.' : 'Unassigned.');
});

// POST /inbox/:id/messages { direction: OUTBOUND | NOTE | INBOUND, body, occurredAt?, waiting?, force? }
export const addMessage = handle(async (req, res) => {
  const a = access(req);
  const c = await loadConversation(req, req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const direction = oneOf(b.direction, ['OUTBOUND', 'NOTE', 'INBOUND'] as const, 'Message type');
  const body = reqStr(b.body, 'Message', 5000);
  const occurredAt = date(b.occurredAt, 'Time') ?? new Date();
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) fail(400, 'Time cannot be in the future.');
  const now = new Date();
  const cfg = await slaConfig();

  if (direction === 'OUTBOUND') {
    if (c.status === 'CLOSED') fail(409, 'This conversation is closed. Reopen it first.');
    const other = recentReplyBy(c.messages, a.userId, now);
    if (other && !b.force) {
      const who = (await nameMap([other])).get(other);
      return apiResponse.error(res, `${who ?? 'A colleague'} replied to this a few minutes ago. Check the thread, then send again with "reply anyway" if it is still needed.`, 409);
    }
  }

  const data: Prisma.SmoisConversationUncheckedUpdateInput = { lastActivityAt: now };
  if (direction === 'OUTBOUND') {
    if (!c.firstResponseAt) { data.firstResponseAt = occurredAt; data.firstResponderId = a.userId; }
    if (!c.assignedMemberId && a.memberId) data.assignedMemberId = a.memberId;
    if (b.waiting) data.status = 'WAITING_FOR_CUSTOMER';
    else if (['NEW', 'OPEN', 'ASSIGNED', 'WAITING_FOR_CUSTOMER'].includes(c.status)) data.status = 'IN_PROGRESS';
  } else if (direction === 'INBOUND' && ['WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(c.status)) {
    data.status = 'OPEN'; data.resolvedAt = null;
  }
  await prisma.$transaction(async (tx) => {
    await tx.smoisMessage.create({ data: { conversationId: c.id, direction, body, authorId: direction === 'INBOUND' ? null : a.userId, occurredAt } });
    await tx.smoisConversation.update({ where: { id: c.id }, data });
    await smoisAudit(req, { action: direction === 'OUTBOUND' ? 'REPLY_SENT' : direction === 'NOTE' ? 'NOTE_ADDED' : 'CUSTOMER_FOLLOW_UP', entity: 'SmoisConversation', entityId: c.id, meta: { first: direction === 'OUTBOUND' && !c.firstResponseAt, account: c.account.name } }, tx);
  });
  if (direction === 'INBOUND' && c.assignedMemberId) {
    const m = await prisma.smoisMember.findUnique({ where: { id: c.assignedMemberId }, select: { userId: true } });
    await notifyMany([m?.userId], { title: 'Customer replied', body: `#${c.number} on ${c.account.name}`, data: { link: `/smois/inbox?open=${c.id}` }, email: false });
  }
  const first = direction === 'OUTBOUND' && !c.firstResponseAt;
  return apiResponse.success(res, first ? `First response recorded (${responseMinutes(c.receivedAt, occurredAt, c.priority, cfg)} min).` : 'Added.', null, 201);
});

// POST /inbox/:id/status { status, note? }
export const setStatus = handle(async (req, res) => {
  const a = access(req);
  const c = await loadConversation(req, req.params.id);
  const to = oneOf(req.body?.status, STATUSES, 'Status');
  if (!canMoveConversation(c.status, to)) fail(409, `Cannot move from ${c.status.replace(/_/g, ' ').toLowerCase()} to ${to.replace(/_/g, ' ').toLowerCase()}.`);
  const note = str(req.body?.note, 500);
  const resolving = to === 'RESOLVED' || to === 'CLOSED';
  await prisma.$transaction(async (tx) => {
    await tx.smoisConversation.update({ where: { id: c.id }, data: { status: to, lastActivityAt: new Date(), resolvedAt: resolving ? c.resolvedAt ?? new Date() : null, ...(to === 'OPEN' ? { escalationType: null, escalatedAt: null, escalationNote: null } : {}) } });
    if (note) await tx.smoisMessage.create({ data: { conversationId: c.id, direction: 'NOTE', body: note, authorId: a.userId, occurredAt: new Date() } });
    await smoisAudit(req, { action: resolving ? 'CONVERSATION_RESOLVED' : 'CONVERSATION_STATUS_CHANGED', entity: 'SmoisConversation', entityId: c.id, before: { status: c.status }, after: { status: to }, meta: { note } }, tx);
  });
  return apiResponse.success(res, 'Updated.');
});

// POST /inbox/:id/escalate { type, note }
export const escalate = handle(async (req, res) => {
  const a = access(req);
  const c = await loadConversation(req, req.params.id);
  if (c.status === 'RESOLVED' || c.status === 'CLOSED') fail(409, 'Reopen it before escalating.');
  const type = oneOf(req.body?.type, ESCALATION_TYPES, 'Escalation type');
  const note = reqStr(req.body?.note, 'Why it is being escalated', 500);
  await prisma.$transaction(async (tx) => {
    await tx.smoisConversation.update({ where: { id: c.id }, data: { status: 'ESCALATED', escalationType: type, escalatedAt: new Date(), escalationNote: note, lastActivityAt: new Date() } });
    await tx.smoisMessage.create({ data: { conversationId: c.id, direction: 'NOTE', body: `Escalated (${type.replace(/_/g, ' ').toLowerCase()}): ${note}`, authorId: a.userId, occurredAt: new Date() } });
    await smoisAudit(req, { action: 'CONVERSATION_ESCALATED', entity: 'SmoisConversation', entityId: c.id, after: { type }, meta: { note } }, tx);
  });
  await notifyMany(await managementUserIds(), { title: 'Escalation: ' + type.replace(/_/g, ' ').toLowerCase(), body: `#${c.number} on ${c.account.name}. ${note}`, data: { link: `/smois/inbox?open=${c.id}` } }, a.userId);
  return apiResponse.success(res, 'Escalated. Management has been told.');
});

// ── Saved replies ───────────────────────────────────────────────────────────

export const listSavedReplies = handle(async (_req, res) => apiResponse.success(res, 'Saved replies.', await prisma.smoisSavedReply.findMany({ where: { isActive: true }, orderBy: { title: 'asc' } })));

export const createSavedReply = handle(async (req, res) => {
  const r = await prisma.smoisSavedReply.create({ data: { title: reqStr(req.body?.title, 'Title', 80), body: reqStr(req.body?.body, 'Reply', 2000), createdById: access(req).userId } });
  await smoisAudit(req, { action: 'SAVED_REPLY_CREATED', entity: 'SmoisConversation', entityId: r.id, after: { title: r.title } });
  return apiResponse.success(res, 'Saved reply added.', r, 201);
});

export const deleteSavedReply = handle(async (req, res) => {
  const r = await prisma.smoisSavedReply.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(404, 'Not found.');
  await prisma.smoisSavedReply.update({ where: { id: r.id }, data: { isActive: false } });
  return apiResponse.success(res, 'Removed.');
});

// ── Contacts ────────────────────────────────────────────────────────────────

const contactSelect = {
  id: true, displayName: true, username: true, platform: true, profileUrl: true, email: true, phone: true, location: true, category: true,
  assignedToId: true, tags: true, notes: true, consentNote: true, consentAt: true, anonymizedAt: true, createdAt: true,
  _count: { select: { conversations: true } },
} satisfies Prisma.SmoisContactSelect;

// GET /contacts?q&category&platform&page
export const listContacts = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, Number(q.page) || 1);
  const take = 30;
  const where: Prisma.SmoisContactWhereInput = {
    anonymizedAt: null,
    ...(q.category ? { category: oneOf(q.category, CONTACT_CATEGORIES, 'Category') } : {}),
    ...(q.platform ? { platform: oneOf(q.platform, PLATFORMS, 'Platform') } : {}),
    ...(q.q ? { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { username: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.smoisContact.findMany({ where, select: contactSelect, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.smoisContact.count({ where }),
  ]);
  return apiResponse.success(res, 'Contacts.', { items: rows, pagination: { page, total, pages: Math.ceil(total / take) } });
});

const parseContact = (b: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.SmoisContactUncheckedUpdateInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('displayName')) data.displayName = reqStr(b.displayName, 'Name', 120);
  if (has('username')) data.username = str(b.username, 120)?.replace(/^@/, '') ?? null;
  if (has('platform')) data.platform = b.platform ? oneOf(b.platform, PLATFORMS, 'Platform') : null;
  if (has('profileUrl')) data.profileUrl = httpUrl(b.profileUrl, 'Profile link');
  if (has('email')) { const e = str(b.email, 200); if (e && !/^\S+@\S+\.\S+$/.test(e)) fail(400, 'Enter a valid email.'); data.email = e; }
  if (has('phone')) data.phone = str(b.phone, 40);
  if (has('location')) data.location = str(b.location, 120);
  if (has('category')) data.category = oneOf(b.category, CONTACT_CATEGORIES, 'Category');
  if (has('tags')) data.tags = strList(b.tags, 10, 40);
  if (has('notes')) data.notes = str(b.notes, 2000);
  if (has('assignedToId')) data.assignedToId = b.assignedToId ? String(b.assignedToId) : null;
  if (has('consentNote')) { data.consentNote = str(b.consentNote, 300); data.consentAt = data.consentNote ? new Date() : null; }
  return data;
};

/** Email and phone are only kept when the person chose to share them, and how they agreed is written down. */
const requireConsent = (email: unknown, phone: unknown, consentNote: unknown) => {
  if ((email || phone) && !str(consentNote, 300)) fail(400, 'Say how this person agreed to share their email or phone (for example: "asked us to call back in a DM"). Contact details are only kept with their consent.');
};

// POST /contacts
export const createContact = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  requireConsent(b.email, b.phone, b.consentNote);
  const data = parseContact(b, false) as Prisma.SmoisContactUncheckedCreateInput;
  const c = await prisma.smoisContact.create({ data: { ...data, createdById: access(req).userId }, select: contactSelect });
  await smoisAudit(req, { action: 'CONTACT_CREATED', entity: 'SmoisConversation', entityId: c.id, after: { name: c.displayName, category: c.category } });
  return apiResponse.success(res, 'Contact added.', c, 201);
});

// PATCH /contacts/:id
export const updateContact = handle(async (req, res) => {
  const c = await prisma.smoisContact.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Contact not found.');
  if (c.anonymizedAt) fail(409, 'This contact was anonymised and cannot be edited.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  requireConsent('email' in b ? b.email : c.email, 'phone' in b ? b.phone : c.phone, 'consentNote' in b ? b.consentNote : c.consentNote);
  const u = await prisma.smoisContact.update({ where: { id: c.id }, data: parseContact(b, true), select: contactSelect });
  await smoisAudit(req, { action: 'CONTACT_UPDATED', entity: 'SmoisConversation', entityId: c.id, before: { category: c.category, assignedToId: c.assignedToId }, after: { category: u.category, assignedToId: u.assignedToId } });
  return apiResponse.success(res, 'Saved.', u);
});

// GET /contacts/:id: profile plus a chronological interaction timeline
export const getContact = handle(async (req, res) => {
  const c = await prisma.smoisContact.findUnique({ where: { id: req.params.id }, select: contactSelect });
  if (!c) return fail(404, 'Contact not found.');
  const visible = (await visibleAccountIds(access(req))).map((x) => x.id);
  const convs = await prisma.smoisConversation.findMany({ where: { contactId: c.id, accountId: { in: visible } }, select: { ...convSelect, messages: { orderBy: { occurredAt: 'asc' }, select: { direction: true, body: true, occurredAt: true } } }, orderBy: { receivedAt: 'asc' } });
  const timeline = convs.flatMap((v) => v.messages.map((m) => ({ conversationId: v.id, number: v.number, account: v.account.name, type: v.type, direction: m.direction, body: m.body, at: m.occurredAt }))).filter((m) => m.direction !== 'NOTE').sort((x, y) => x.at.getTime() - y.at.getTime());
  return apiResponse.success(res, 'Contact.', { ...c, conversations: convs.map(({ messages: _m, ...rest }) => rest), timeline });
});

// POST /contacts/:id/anonymize { redactMessages? }: data protection request (access, correction, deletion)
export const anonymizeContact = handle(async (req, res) => {
  const c = await prisma.smoisContact.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Contact not found.');
  if (c.anonymizedAt) fail(409, 'Already anonymised.');
  const redact = !!req.body?.redactMessages;
  await prisma.$transaction(async (tx) => {
    await tx.smoisContact.update({ where: { id: c.id }, data: { displayName: 'Anonymised contact', username: null, profileUrl: null, email: null, phone: null, location: null, notes: null, consentNote: null, tags: [], assignedToId: null, anonymizedAt: new Date() } });
    if (redact) await tx.smoisMessage.updateMany({ where: { direction: 'INBOUND', conversation: { contactId: c.id } }, data: { body: '[removed at the person\'s request]' } });
    await smoisAudit(req, { action: 'CONTACT_ANONYMIZED', entity: 'SmoisConversation', entityId: c.id, meta: { redactMessages: redact, reason: str(req.body?.reason, 300) } }, tx);
  });
  return apiResponse.success(res, 'Personal details removed. Conversation counts and response times are kept.');
});
