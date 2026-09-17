// Staff tasks. Mounted under /api/v1/admin/crm.
import { Response } from 'express';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';

const PRIORITIES: TaskPriority[] = ['LOW', 'NORMAL', 'HIGH'];
const STATUSES: TaskStatus[] = ['OPEN', 'DONE', 'CANCELLED'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] as const;
const isOps = (role: string) => role === 'SUPER_ADMIN' || role === 'OPERATIONS_ADMIN';

export const taskSelect = {
  id: true, title: true, description: true, dueAt: true, priority: true, status: true, completedAt: true, createdAt: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  relatedUser: { select: { id: true, name: true, role: true, vendor: { select: { businessName: true } } } },
  lead: { select: { id: true, name: true, type: true } },
  ticket: { select: { id: true, number: true, subject: true } },
} satisfies Prisma.CrmTaskSelect;

// GET /tasks?view=mine|team|unassigned|overdue|done&relatedUserId=&leadId=&ticketId=
export const listTasks = catchAsync(async (req: AuthRequest, res: Response) => {
  const { view = 'mine', relatedUserId, leadId, ticketId } = req.query as Record<string, string>;
  const now = new Date();
  const and: Prisma.CrmTaskWhereInput[] = [];

  // Tasks attached to a record show everything for that record regardless of view.
  const scoped = relatedUserId || leadId || ticketId;
  if (relatedUserId) and.push({ relatedUserId });
  if (leadId) and.push({ leadId });
  if (ticketId) and.push({ ticketId });

  if (!scoped) {
    switch (view) {
      case 'team': and.push({ status: 'OPEN' }); break;
      case 'unassigned': and.push({ status: 'OPEN', assigneeId: null }); break;
      case 'overdue': and.push({ status: 'OPEN', dueAt: { lt: now } }); break;
      case 'done': and.push({ status: { in: ['DONE', 'CANCELLED'] } }); break;
      default: and.push({ status: 'OPEN', assigneeId: req.user!.userId });
    }
  }

  const tasks = await prisma.crmTask.findMany({
    where: { AND: and },
    select: taskSelect,
    orderBy: view === 'done' ? [{ completedAt: 'desc' }] : [{ status: 'asc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 300,
  });

  const counts = await Promise.all([
    prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: req.user!.userId } }),
    prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: req.user!.userId, dueAt: { lt: now } } }),
    prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: null } }),
    prisma.crmTask.count({ where: { status: 'OPEN', dueAt: { lt: now } } }),
  ]);
  return apiResponse.success(res, 'Tasks fetched.', {
    tasks,
    counts: { mine: counts[0], mineOverdue: counts[1], unassigned: counts[2], overdue: counts[3] },
  });
});

const parseTask = async (body: Record<string, unknown>, partial: boolean, actor: { userId: string; role: string }) => {
  const data: Prisma.CrmTaskUncheckedUpdateInput = {};
  const has = (k: string) => k in body;

  if (!partial || has('title')) {
    const title = String(body.title ?? '').trim();
    if (!title || title.length > 160) throw new Error('Title must be 1–160 characters.');
    data.title = title;
  }
  if (has('description')) data.description = body.description ? String(body.description).slice(0, 2000) : null;
  if (has('dueAt')) {
    if (body.dueAt === null || body.dueAt === '') data.dueAt = null;
    else {
      const d = new Date(String(body.dueAt));
      if (Number.isNaN(d.getTime())) throw new Error('Invalid due date.');
      data.dueAt = d;
      data.reminderSentAt = null;
    }
  }
  if (has('priority')) {
    if (!PRIORITIES.includes(body.priority as TaskPriority)) throw new Error('Invalid priority.');
    data.priority = body.priority as TaskPriority;
  }
  if (has('assigneeId') || !partial) {
    const assigneeId = has('assigneeId') ? (body.assigneeId ? String(body.assigneeId) : null) : actor.userId;
    // Support agents can take work on or leave it for the team; assigning others is ops work.
    if (!isOps(actor.role) && assigneeId && assigneeId !== actor.userId) throw new Error('FORBIDDEN:You can only assign tasks to yourself.');
    if (assigneeId) {
      const agent = await prisma.user.findFirst({ where: { id: assigneeId, role: { in: [...ADMIN_ROLES] }, isActive: true } });
      if (!agent) throw new Error('Assignee must be an active admin.');
    }
    data.assigneeId = assigneeId;
  }
  if (!partial) {
    const relatedUserId = body.relatedUserId ? String(body.relatedUserId) : null;
    const leadId = body.leadId ? String(body.leadId) : null;
    const ticketId = body.ticketId ? String(body.ticketId) : null;
    if (relatedUserId && !(await prisma.user.findUnique({ where: { id: relatedUserId }, select: { id: true } }))) throw new Error('Related person not found.');
    if (leadId && !(await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new Error('Lead not found.');
    if (ticketId && !(await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } }))) throw new Error('Ticket not found.');
    Object.assign(data, { relatedUserId, leadId, ticketId });
  }
  return data;
};

const sendTaskError = (res: Response, err: unknown) => {
  const message = err instanceof Error ? err.message : 'Invalid task.';
  if (message.startsWith('FORBIDDEN:')) return apiResponse.error(res, message.slice(10), 403);
  return apiResponse.error(res, message, 400);
};

// POST /tasks
export const createTask = catchAsync(async (req: AuthRequest, res: Response) => {
  let data: Prisma.CrmTaskUncheckedUpdateInput;
  try { data = await parseTask(req.body ?? {}, false, req.user!); } catch (err) { return sendTaskError(res, err); }
  const task = await prisma.crmTask.create({
    data: { ...(data as Prisma.CrmTaskUncheckedCreateInput), createdById: req.user!.userId },
    select: taskSelect,
  });
  return apiResponse.success(res, 'Task created.', task, 201);
});

// PATCH /tasks/:id  { title?, description?, dueAt?, priority?, assigneeId?, status? }
export const updateTask = catchAsync(async (req: AuthRequest, res: Response) => {
  const task = await prisma.crmTask.findUnique({ where: { id: req.params.id } });
  if (!task) return apiResponse.error(res, 'Task not found.', 404);
  const actor = req.user!;
  const involved = task.assigneeId === actor.userId || task.createdById === actor.userId || task.assigneeId === null;
  if (!isOps(actor.role) && !involved) return apiResponse.error(res, 'You can only change your own or unassigned tasks.', 403);

  let data: Prisma.CrmTaskUncheckedUpdateInput;
  try { data = await parseTask(req.body ?? {}, true, actor); } catch (err) { return sendTaskError(res, err); }

  if ('status' in (req.body ?? {})) {
    const status = req.body.status as TaskStatus;
    if (!STATUSES.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);
    data.status = status;
    data.completedAt = status === 'OPEN' ? null : new Date();
  }
  const updated = await prisma.crmTask.update({ where: { id: task.id }, data, select: taskSelect });
  return apiResponse.success(res, 'Task updated.', updated);
});

// DELETE /tasks/:id  — creator or ops
export const deleteTask = catchAsync(async (req: AuthRequest, res: Response) => {
  const task = await prisma.crmTask.findUnique({ where: { id: req.params.id } });
  if (!task) return apiResponse.error(res, 'Task not found.', 404);
  if (!isOps(req.user!.role) && task.createdById !== req.user!.userId) return apiResponse.error(res, 'Only the creator can delete this task.', 403);
  await prisma.crmTask.delete({ where: { id: task.id } });
  return apiResponse.success(res, 'Task deleted.', { id: task.id });
});
