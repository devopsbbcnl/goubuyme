// SMOIS tasks: assignment, evidence, review, history and recurring rules.
import { Prisma, SmoisRecurrence, SmoisTaskPriority, SmoisTaskStatus, SmoisTaskType } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { SmoisRequest } from '../../middleware/smois.middleware';
import { TASK_DONE, can, isOverdue, taskMoveAllowed } from '../../services/smois/workflow';
import { access, date, fail, handle, httpUrl, nameMap, notifyMany, oneOf, reqStr, str } from './common';

const TYPES = Object.values(SmoisTaskType) as SmoisTaskType[];
const PRIORITIES = Object.values(SmoisTaskPriority) as SmoisTaskPriority[];
const STATUSES = Object.values(SmoisTaskStatus) as SmoisTaskStatus[];
const EVIDENCE_KINDS = ['POST_URL', 'GRAPHIC', 'REPORT', 'SCREENSHOT', 'VIDEO', 'DOCUMENT', 'INTERACTION', 'OTHER'] as const;

const listSelect = {
  id: true, number: true, title: true, type: true, priority: true, status: true, deadline: true, startsAt: true,
  completedAt: true, createdAt: true, createdById: true, ruleId: true, expectedDeliverable: true,
  assignee: { select: { id: true, userId: true, user: { select: { name: true } } } },
  account: { select: { id: true, name: true, platform: true } },
  _count: { select: { evidence: true, comments: true } },
} satisfies Prisma.SmoisTaskSelect;

const decorate = async <T extends { createdById: string; status: SmoisTaskStatus; deadline: Date | null }>(rows: T[]) => {
  const names = await nameMap(rows.map((r) => r.createdById));
  const now = new Date();
  return rows.map((r) => ({ ...r, createdByName: names.get(r.createdById) ?? null, overdue: isOverdue(r, now) }));
};

// GET /tasks?view=mine|all|review|overdue|done&assigneeId&status&type&accountId&q
export const listTasks = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const view = q.view ?? 'mine';
  const now = new Date();
  const seeAll = can(a, 'viewAll');
  if (view !== 'mine' && !seeAll) fail(403, 'You can only see your own tasks.');

  const and: Prisma.SmoisTaskWhereInput[] = [];
  const mineClause: Prisma.SmoisTaskWhereInput = a.memberId ? { OR: [{ assigneeId: a.memberId }, { supporters: { some: { memberId: a.memberId } } }] } : { id: '__none__' };
  switch (view) {
    case 'mine': and.push(mineClause, { status: { notIn: TASK_DONE } }); break;
    case 'review': and.push({ status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }); break;
    case 'overdue': and.push({ status: { notIn: TASK_DONE }, deadline: { lt: now } }); break;
    case 'done': and.push({ status: { in: TASK_DONE } }); break;
    default: break; // all
  }
  if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
  if (q.status) and.push({ status: oneOf(q.status, STATUSES, 'Status') });
  if (q.type) and.push({ type: oneOf(q.type, TYPES, 'Type') });
  if (q.accountId) and.push({ accountId: q.accountId });
  if (q.q) and.push({ title: { contains: q.q, mode: 'insensitive' } });

  const rows = await prisma.smoisTask.findMany({
    where: { AND: and }, select: listSelect, take: 300,
    orderBy: view === 'done' ? { completedAt: 'desc' } : [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  });
  const base: Prisma.SmoisTaskWhereInput = seeAll ? {} : mineClause;
  const [pending, overdue, review] = await Promise.all([
    prisma.smoisTask.count({ where: { ...base, status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'REVISION_REQUIRED'] } } }),
    prisma.smoisTask.count({ where: { ...base, status: { notIn: TASK_DONE }, deadline: { lt: now } } }),
    seeAll ? prisma.smoisTask.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }) : 0,
  ]);
  return apiResponse.success(res, 'Tasks.', { tasks: await decorate(rows), counts: { pending, overdue, review } });
});

const resolveAssignee = async (id: unknown) => {
  if (!id) return null;
  const m = await prisma.smoisMember.findUnique({ where: { id: String(id) }, select: { id: true, userId: true, isActive: true, role: true } });
  if (!m || !m.isActive) return fail(400, 'Assign tasks to an active team member.');
  if (m.role === 'VIEWER' || m.role === 'REVIEWER') fail(400, 'Viewers and reviewers do not receive tasks.');
  return m;
};

// POST /tasks
export const createTask = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const a = access(req);
  const assignee = await resolveAssignee(b.assigneeId);
  const supporterIds = Array.isArray(b.supporterIds) ? [...new Set((b.supporterIds as unknown[]).map(String))].filter((x) => x !== assignee?.id).slice(0, 20) : [];
  const supporters = supporterIds.length ? await prisma.smoisMember.findMany({ where: { id: { in: supporterIds }, isActive: true }, select: { id: true, userId: true } }) : [];
  const startsAt = date(b.startsAt, 'Start date');
  const deadline = date(b.deadline, 'Deadline');
  if (startsAt && deadline && deadline < startsAt) fail(400, 'Deadline is before the start date.');
  if (b.accountId && !(await prisma.smoisAccount.findUnique({ where: { id: String(b.accountId) }, select: { id: true } }))) fail(400, 'Unknown account.');

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.smoisTask.create({
      data: {
        title: reqStr(b.title, 'Title', 160), description: str(b.description, 3000),
        type: b.type ? oneOf(b.type, TYPES, 'Type') : 'GENERAL', priority: b.priority ? oneOf(b.priority, PRIORITIES, 'Priority') : 'NORMAL',
        assigneeId: assignee?.id ?? null, createdById: a.userId, accountId: b.accountId ? String(b.accountId) : null,
        startsAt, deadline, expectedDeliverable: str(b.expectedDeliverable, 500), completionCriteria: str(b.completionCriteria, 1000),
        supporters: { create: supporters.map((s) => ({ memberId: s.id })) },
        history: { create: { toStatus: 'PENDING', changedById: a.userId, note: 'Created' } },
      },
      select: { id: true, number: true, title: true },
    });
    await smoisAudit(req, { action: 'TASK_CREATED', entity: 'SmoisTask', entityId: t.id, after: { title: t.title, assigneeId: assignee?.id ?? null, deadline } }, tx);
    if (assignee) await smoisAudit(req, { action: 'TASK_ASSIGNED', entity: 'SmoisTask', entityId: t.id, after: { assigneeUserId: assignee.userId } }, tx);
    return t;
  });
  await notifyMany([assignee?.userId, ...supporters.map((s) => s.userId)], { title: 'New task', body: `${task.title}${deadline ? ` · due ${deadline.toLocaleDateString('en-NG')}` : ''}`, data: { link: `/smois/tasks?open=${task.id}` } }, a.userId);
  return apiResponse.success(res, 'Task created.', task, 201);
});

const loadTask = async (id: string) => {
  const t = await prisma.smoisTask.findUnique({ where: { id }, include: { assignee: { select: { id: true, userId: true } }, supporters: { select: { memberId: true, member: { select: { userId: true } } } } } });
  if (!t) return fail(404, 'Task not found.');
  return t;
};

const involved = (req: SmoisRequest, t: Awaited<ReturnType<typeof loadTask>>) => {
  const a = access(req);
  if (can(a, 'manageTasks')) return true;
  return !!a.memberId && (t.assigneeId === a.memberId || t.supporters.some((s) => s.memberId === a.memberId));
};

// GET /tasks/:id
export const getTask = handle(async (req, res) => {
  const t = await loadTask(req.params.id);
  const a = access(req);
  if (!involved(req, t) && !can(a, 'viewAll')) fail(403, 'This task is not yours.');
  const full = await prisma.smoisTask.findUnique({
    where: { id: t.id },
    include: {
      assignee: { select: { id: true, userId: true, user: { select: { name: true } } } },
      account: { select: { id: true, name: true, platform: true } },
      supporters: { select: { member: { select: { id: true, userId: true, user: { select: { name: true } } } } } },
      evidence: { orderBy: { createdAt: 'asc' } }, comments: { orderBy: { createdAt: 'asc' } }, history: { orderBy: { createdAt: 'asc' } },
      rule: { select: { id: true, title: true, recurrence: true } },
    },
  });
  if (!full) return fail(404, 'Task not found.');
  const names = await nameMap([full.createdById, ...full.evidence.map((e) => e.addedById), ...full.comments.map((c) => c.authorId), ...full.history.map((h) => h.changedById)]);
  const n = (id: string | null) => (id ? names.get(id) ?? null : null);
  const isAssignee = !!a.memberId && full.assigneeId === a.memberId;
  const manage = can(a, 'manageTasks');
  return apiResponse.success(res, 'Task.', {
    ...full, createdByName: n(full.createdById), overdue: isOverdue(full, new Date()),
    evidence: full.evidence.map((e) => ({ ...e, addedByName: n(e.addedById) })),
    comments: full.comments.map((c) => ({ ...c, authorName: n(c.authorId) })),
    history: full.history.map((h) => ({ ...h, changedByName: n(h.changedById) })),
    nextStatuses: STATUSES.filter((s) => (manage && taskMoveAllowed(full.status, s, 'manager')) || ((isAssignee || (full.createdById === a.userId && isAssignee)) && taskMoveAllowed(full.status, s, 'assignee'))),
    canEdit: manage, canEvidence: involved(req, t),
  });
});

// PATCH /tasks/:id (management)
export const updateTask = handle(async (req, res) => {
  const t = await loadTask(req.params.id);
  if (TASK_DONE.includes(t.status)) fail(409, 'Completed or cancelled tasks cannot be edited.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const a = access(req);
  const data: Prisma.SmoisTaskUncheckedUpdateInput = {};
  if ('title' in b) data.title = reqStr(b.title, 'Title', 160);
  if ('description' in b) data.description = str(b.description, 3000);
  if ('type' in b) data.type = oneOf(b.type, TYPES, 'Type');
  if ('priority' in b) data.priority = oneOf(b.priority, PRIORITIES, 'Priority');
  if ('deadline' in b) { data.deadline = date(b.deadline, 'Deadline'); data.reminderSentAt = null; data.overdueNotifiedAt = null; }
  if ('startsAt' in b) data.startsAt = date(b.startsAt, 'Start date');
  if ('expectedDeliverable' in b) data.expectedDeliverable = str(b.expectedDeliverable, 500);
  if ('completionCriteria' in b) data.completionCriteria = str(b.completionCriteria, 1000);
  if ('accountId' in b) data.accountId = b.accountId ? String(b.accountId) : null;
  let newAssignee: Awaited<ReturnType<typeof resolveAssignee>> = null;
  if ('assigneeId' in b && (b.assigneeId || null) !== t.assigneeId) {
    newAssignee = await resolveAssignee(b.assigneeId);
    data.assigneeId = newAssignee?.id ?? null;
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.smoisTask.update({ where: { id: t.id }, data, select: { id: true, title: true, deadline: true, assigneeId: true } });
    await smoisAudit(req, { action: newAssignee !== null || 'assigneeId' in data ? 'TASK_REASSIGNED' : 'TASK_UPDATED', entity: 'SmoisTask', entityId: t.id, before: { title: t.title, deadline: t.deadline, assigneeId: t.assigneeId }, after: { title: u.title, deadline: u.deadline, assigneeId: u.assigneeId } }, tx);
    return u;
  });
  if (newAssignee) await notifyMany([newAssignee.userId], { title: 'Task assigned to you', body: updated.title, data: { link: `/smois/tasks?open=${t.id}` } }, a.userId);
  return apiResponse.success(res, 'Task updated.', updated);
});

// POST /tasks/:id/status { status, note? }
export const setTaskStatus = handle(async (req, res) => {
  const t = await loadTask(req.params.id);
  const a = access(req);
  const to = oneOf(req.body?.status, STATUSES, 'Status');
  const note = str(req.body?.note, 500);
  const manage = can(a, 'manageTasks');
  const isAssignee = !!a.memberId && t.assigneeId === a.memberId;
  const selfSet = isAssignee && t.createdById === a.userId; // a task you set yourself needs no sign-off
  const ok = (manage && taskMoveAllowed(t.status, to, 'manager')) || (isAssignee && taskMoveAllowed(t.status, to, 'assignee')) ||
    (selfSet && ['IN_PROGRESS', 'SUBMITTED', 'ACCEPTED'].includes(t.status) && to === 'COMPLETED');
  if (!ok) return fail(409, `That change is not allowed from ${t.status.replace(/_/g, ' ').toLowerCase()}.`);

  if (to === 'SUBMITTED' && !(await prisma.smoisTaskEvidence.count({ where: { taskId: t.id } }))) fail(400, 'Attach completion evidence (a link, file or note) before submitting.');
  if (to === 'REVISION_REQUIRED' && !note) fail(400, 'Say what needs to change.');
  const done = to === 'COMPLETED';
  await prisma.$transaction(async (tx) => {
    await tx.smoisTask.update({ where: { id: t.id }, data: { status: to, completedAt: done ? new Date() : null } });
    await tx.smoisTaskHistory.create({ data: { taskId: t.id, fromStatus: t.status, toStatus: to, changedById: a.userId, note } });
    await smoisAudit(req, {
      action: done ? 'TASK_COMPLETED' : to === 'REVISION_REQUIRED' ? 'TASK_REJECTED' : to === 'ACCEPTED' ? 'TASK_ACCEPTED' : 'TASK_UPDATED',
      entity: 'SmoisTask', entityId: t.id, before: { status: t.status }, after: { status: to }, meta: { note },
    }, tx);
  });
  if (to === 'SUBMITTED') {
    const mgmt = await prisma.smoisMember.findMany({ where: { isActive: true, role: 'MANAGEMENT' }, select: { userId: true } });
    const supers = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } });
    await notifyMany([t.createdById, ...mgmt.map((m) => m.userId), ...supers.map((s) => s.id)], { title: 'Task submitted for review', body: t.title, data: { link: `/smois/tasks?open=${t.id}` } }, a.userId);
  } else if (!isAssignee) {
    await notifyMany([t.assignee?.userId], { title: `Task ${to.replace(/_/g, ' ').toLowerCase()}`, body: `${t.title}${note ? `: ${note}` : ''}`, data: { link: `/smois/tasks?open=${t.id}` } }, a.userId);
  }
  return apiResponse.success(res, 'Task updated.');
});

// POST /tasks/:id/evidence { kind, url?, note? }
export const addEvidence = handle(async (req, res) => {
  const t = await loadTask(req.params.id);
  if (!involved(req, t)) fail(403, 'This task is not yours.');
  if (TASK_DONE.includes(t.status)) fail(409, 'This task is closed.');
  const url = httpUrl(req.body?.url, 'Link');
  const note = str(req.body?.note, 1000);
  if (!url && !note) fail(400, 'Add a link or a note.');
  const e = await prisma.smoisTaskEvidence.create({ data: { taskId: t.id, kind: oneOf(req.body?.kind ?? 'OTHER', EVIDENCE_KINDS, 'Evidence type'), url, note, addedById: access(req).userId } });
  await smoisAudit(req, { action: 'TASK_UPDATED', entity: 'SmoisTask', entityId: t.id, meta: { evidence: e.kind } });
  return apiResponse.success(res, 'Evidence added.', e, 201);
});

// POST /tasks/:id/comments { body }
export const commentOnTask = handle(async (req, res) => {
  const t = await loadTask(req.params.id);
  const a = access(req);
  if (!involved(req, t) && !can(a, 'viewAll')) fail(403, 'This task is not yours.');
  const c = await prisma.smoisTaskComment.create({ data: { taskId: t.id, authorId: a.userId, body: reqStr(req.body?.body, 'Comment', 2000) } });
  await notifyMany([t.createdById, t.assignee?.userId, ...t.supporters.map((s) => s.member.userId)], { title: 'Task comment', body: `${t.title}: ${c.body.slice(0, 120)}`, data: { link: `/smois/tasks?open=${t.id}` }, email: false }, a.userId);
  return apiResponse.success(res, 'Comment added.', c, 201);
});

// ── Recurring rules ──────────────────────────────────────────────────────────

const RECURRENCES: readonly SmoisRecurrence[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

// GET /recurring
export const listRules = handle(async (_req, res) => {
  const rules = await prisma.smoisRecurringRule.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });
  const members = await prisma.smoisMember.findMany({ where: { id: { in: rules.map((r) => r.assigneeId).filter(Boolean) as string[] } }, select: { id: true, user: { select: { name: true } } } });
  const byId = new Map(members.map((m) => [m.id, m.user.name]));
  return apiResponse.success(res, 'Recurring tasks.', rules.map((r) => ({ ...r, assigneeName: r.assigneeId ? byId.get(r.assigneeId) ?? null : null })));
});

const parseRule = (b: Record<string, unknown>) => {
  const recurrence = oneOf(b.recurrence, RECURRENCES, 'Repeat');
  const dayOfWeek = recurrence === 'WEEKLY' ? Number(b.dayOfWeek ?? 1) : null;
  const dayOfMonth = recurrence === 'MONTHLY' ? Number(b.dayOfMonth ?? 1) : null;
  if (dayOfWeek !== null && !(Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6)) fail(400, 'Choose a weekday.');
  if (dayOfMonth !== null && !(Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 28)) fail(400, 'Day of month must be 1–28.');
  const dueAfterHours = Number(b.dueAfterHours ?? 24);
  if (!Number.isInteger(dueAfterHours) || dueAfterHours < 1 || dueAfterHours > 24 * 31) fail(400, 'Due time must be between 1 hour and 31 days.');
  return { recurrence, dayOfWeek, dayOfMonth, dueAfterHours };
};

// POST /recurring
export const createRule = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const assignee = await resolveAssignee(b.assigneeId);
  const rule = await prisma.smoisRecurringRule.create({
    data: {
      title: reqStr(b.title, 'Title', 160), description: str(b.description, 3000),
      type: b.type ? oneOf(b.type, TYPES, 'Type') : 'GENERAL', priority: b.priority ? oneOf(b.priority, PRIORITIES, 'Priority') : 'NORMAL',
      assigneeId: assignee?.id ?? null, accountId: b.accountId ? String(b.accountId) : null,
      expectedDeliverable: str(b.expectedDeliverable, 500), createdById: access(req).userId, ...parseRule(b),
    },
  });
  await smoisAudit(req, { action: 'TASK_RULE_CREATED', entity: 'SmoisTask', entityId: rule.id, after: { title: rule.title, recurrence: rule.recurrence } });
  return apiResponse.success(res, 'Recurring task created. The first one appears on its next due day.', rule, 201);
});

// PATCH /recurring/:id { isActive?, title?, assigneeId?, ... }
export const updateRule = handle(async (req, res) => {
  const r = await prisma.smoisRecurringRule.findUnique({ where: { id: req.params.id } });
  if (!r) return fail(404, 'Rule not found.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisRecurringRuleUncheckedUpdateInput = {};
  if ('title' in b) data.title = reqStr(b.title, 'Title', 160);
  if ('description' in b) data.description = str(b.description, 3000);
  if ('isActive' in b) data.isActive = !!b.isActive;
  if ('assigneeId' in b) data.assigneeId = (await resolveAssignee(b.assigneeId))?.id ?? null;
  if ('recurrence' in b || 'dayOfWeek' in b || 'dayOfMonth' in b || 'dueAfterHours' in b) Object.assign(data, parseRule({ ...r, ...b }));
  const u = await prisma.smoisRecurringRule.update({ where: { id: r.id }, data });
  await smoisAudit(req, { action: 'TASK_RULE_UPDATED', entity: 'SmoisTask', entityId: r.id, before: { isActive: r.isActive, title: r.title }, after: { isActive: u.isActive, title: u.title } });
  return apiResponse.success(res, 'Updated.', u);
});
