// Staff helpdesk endpoints. Mounted under /api/v1/admin/crm.
import { Request, Response } from 'express';
import { Prisma, TicketChannel } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { logCrmActivity } from '../../services/crm/activity.service';
import { lifecycleStage, CrmRole } from '../../services/crm/health.service';
import { retriageTicket } from '../../services/agents/ticketTriager';
import {
  MAX_TICKET_BODY, TicketError, createTicket, issueTicketCredit, notifyRequester, sendStaffReply,
} from '../../services/crm/ticket.service';
import {
  TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TicketCategory, TicketPriority, TicketStatus,
  isSlaBreached, slaDueAt,
} from '../../services/crm/ticketSla.service';

const ADMIN_ROLES = ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] as const;
const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER'];

const isOps = (role: string) => role === 'SUPER_ADMIN' || role === 'OPERATIONS_ADMIN';

const listSelect = {
  id: true, number: true, subject: true, category: true, priority: true, status: true, channel: true,
  slaDueAt: true, slaBreachedAt: true, firstResponseAt: true, lastMessageAt: true, createdAt: true, csatScore: true,
  requesterRole: true,
  requester: { select: { id: true, name: true, email: true, vendor: { select: { businessName: true } } } },
  assignee: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { body: true, authorId: true, isInternal: true } },
} satisfies Prisma.TicketSelect;

type ListRow = Prisma.TicketGetPayload<{ select: typeof listSelect }>;

const shapeListRow = (t: ListRow, now: Date) => {
  const { messages, requester, ...rest } = t;
  const last = messages[0];
  return {
    ...rest,
    requester: { id: requester.id, name: requester.vendor?.businessName ?? requester.name, email: requester.email },
    breached: isSlaBreached({ status: t.status as TicketStatus, slaDueAt: t.slaDueAt }, now),
    preview: last ? last.body.slice(0, 140) : '',
    awaitingStaff: !!last && last.authorId === requester.id,
  };
};

// GET /admin/crm/tickets?view=mine|unassigned|open|breached|resolved|all&priority=&category=&search=&requesterId=
export const listTickets = catchAsync(async (req: AuthRequest, res: Response) => {
  const { view = 'open', priority, category, search, requesterId, page = '1', limit = '30' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 30));
  const now = new Date();

  const and: Prisma.TicketWhereInput[] = [];
  switch (view) {
    case 'mine': and.push({ assigneeId: req.user!.userId, status: { in: OPEN_STATUSES } }); break;
    case 'unassigned': and.push({ assigneeId: null, status: { in: OPEN_STATUSES } }); break;
    case 'breached': and.push({ status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now } }); break;
    case 'resolved': and.push({ status: { in: ['RESOLVED', 'CLOSED'] } }); break;
    case 'all': break;
    default: and.push({ status: { in: OPEN_STATUSES } });
  }
  if (priority && TICKET_PRIORITIES.includes(priority as TicketPriority)) and.push({ priority: priority as TicketPriority });
  if (category && TICKET_CATEGORIES.includes(category as TicketCategory)) and.push({ category: category as TicketCategory });
  if (requesterId) and.push({ requesterId });
  if (search?.trim()) {
    const q = search.trim().replace(/^#/, '');
    const asNumber = /^\d+$/.test(q) ? parseInt(q) : null;
    and.push({
      OR: [
        ...(asNumber !== null ? [{ number: asNumber }] : []),
        { subject: { contains: q, mode: 'insensitive' } },
        { requester: { name: { contains: q, mode: 'insensitive' } } },
        { requester: { email: { contains: q, mode: 'insensitive' } } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const where: Prisma.TicketWhereInput = { AND: and };
  // Open queues are worked by urgency; history views by recency.
  const orderBy: Prisma.TicketOrderByWithRelationInput[] = view === 'resolved' || view === 'all'
    ? [{ lastMessageAt: 'desc' }]
    : [{ slaDueAt: 'asc' }];

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({ where, select: listSelect, orderBy, skip: (pageNum - 1) * limitNum, take: limitNum }),
    prisma.ticket.count({ where }),
  ]);

  return apiResponse.paginated(res, 'Tickets fetched.', rows.map(r => shapeListRow(r, now)), {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/crm/tickets/summary — queue counts for tabs and the sidebar badge
export const ticketSummary = catchAsync(async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [open, mine, unassigned, breached, csat] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { assigneeId: req.user!.userId, status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { assigneeId: null, status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now } } }),
    prisma.ticket.aggregate({ where: { csatScore: { not: null }, resolvedAt: { gte: since30 } }, _avg: { csatScore: true }, _count: { csatScore: true } }),
  ]);
  return apiResponse.success(res, 'Summary fetched.', {
    open, mine, unassigned, breached,
    csatAverage30d: csat._avg.csatScore ? Math.round(csat._avg.csatScore * 10) / 10 : null,
    csatResponses30d: csat._count.csatScore,
  });
});

// GET /admin/crm/tickets/agents — assignable staff
export const listAgents = catchAsync(async (_req: Request, res: Response) => {
  const agents = await prisma.user.findMany({
    where: { role: { in: [...ADMIN_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
  return apiResponse.success(res, 'Agents fetched.', agents);
});

// GET /admin/crm/tickets/:id
export const getTicket = catchAsync(async (req: Request, res: Response) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      assignee: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, isInternal: true, createdAt: true, author: { select: { id: true, name: true, role: true } } },
      },
      order: {
        select: {
          id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, totalAmount: true,
          deliveryFee: true, createdAt: true, cancelReason: true, creditIssued: true,
          vendor: { select: { businessName: true, user: { select: { id: true, phone: true } } } },
          customer: { select: { user: { select: { id: true, name: true, phone: true } } } },
          rider: { select: { user: { select: { id: true, name: true, phone: true } } } },
          items: { select: { id: true, name: true, quantity: true, price: true } },
        },
      },
      requester: {
        select: {
          id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true, storeCreditBalance: true,
          vendor: { select: { businessName: true } },
          crmTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        },
      },
    },
  });
  if (!ticket) return apiResponse.error(res, 'Ticket not found.', 404);

  const requester = ticket.requester;
  const role = requester.role as CrmRole;
  const [lastOrder, ticketCount, agentSuggestions] = await Promise.all([
    prisma.order.findFirst({
      where: {
        status: role === 'RIDER' ? 'DELIVERED' : { not: 'CANCELLED' },
        ...(role === 'CUSTOMER' ? { customer: { userId: requester.id } }
          : role === 'VENDOR' ? { vendor: { userId: requester.id } }
          : { rider: { userId: requester.id } }),
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.ticket.count({ where: { requesterId: requester.id } }),
    // Ticket triager proposals waiting on a person (draft reply, credit).
    prisma.agentSuggestion.findMany({
      where: { ticketId: ticket.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, action: true, title: true, reason: true, payload: true, expiresAt: true },
    }),
  ]);

  return apiResponse.success(res, 'Ticket fetched.', {
    ...ticket,
    breached: isSlaBreached({ status: ticket.status as TicketStatus, slaDueAt: ticket.slaDueAt }),
    agentSuggestions,
    requester: {
      id: requester.id,
      name: requester.name,
      displayName: requester.vendor?.businessName ?? requester.name,
      email: requester.email,
      phone: requester.phone,
      role: requester.role,
      isActive: requester.isActive,
      createdAt: requester.createdAt,
      storeCreditBalance: requester.storeCreditBalance,
      tags: requester.crmTags.map(t => t.tag),
      stage: lifecycleStage(role, lastOrder?.createdAt ?? null),
      ticketCount,
    },
  });
});

// POST /admin/crm/tickets  { requesterId, category, subject?, body, orderId?, channel, priority? }
export const createTicketForUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { requesterId, category, subject, body, orderId, channel, priority } = req.body ?? {};
  if (!TICKET_CATEGORIES.includes(category)) return apiResponse.error(res, 'Invalid category.', 400);
  const ch: TicketChannel = ['PHONE', 'EMAIL', 'ADMIN'].includes(channel) ? channel : 'ADMIN';
  if (priority !== undefined && !TICKET_PRIORITIES.includes(priority)) return apiResponse.error(res, 'Invalid priority.', 400);

  try {
    const ticket = await createTicket({
      requesterId: String(requesterId ?? ''),
      category,
      subject,
      body: String(body ?? ''),
      orderId: orderId || null,
      channel: ch,
      priority,
      createdByStaffId: req.user!.userId,
    });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { assigneeId: req.user!.userId } });
    return apiResponse.success(res, 'Ticket created.', ticket, 201);
  } catch (err) {
    if (err instanceof TicketError) return apiResponse.error(res, err.message, err.status);
    throw err;
  }
});

// POST /admin/crm/tickets/:id/messages  { body, isInternal?, status? }
export const replyToTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const requested = req.body?.status as TicketStatus | undefined;
  if (requested !== undefined && !TICKET_STATUSES.includes(requested)) return apiResponse.error(res, 'Invalid status.', 400);
  const isInternal = req.body?.isInternal === true;
  try {
    const message = await sendStaffReply({
      ticketId: req.params.id, staffId: req.user!.userId, body: String(req.body?.body ?? ''), isInternal, status: requested,
    });
    return apiResponse.success(res, isInternal ? 'Note added.' : 'Reply sent.', message, 201);
  } catch (err) {
    if (err instanceof TicketError) return apiResponse.error(res, err.message, err.status);
    throw err;
  }
});

// PATCH /admin/crm/tickets/:id  { status?, priority?, category?, assigneeId? }
export const updateTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) return apiResponse.error(res, 'Ticket not found.', 404);

  const { status, priority, category } = req.body ?? {};
  const staffId = req.user!.userId;
  const data: Prisma.TicketUpdateInput = {};
  const changes: Record<string, unknown> = {};
  const now = new Date();

  if (status !== undefined) {
    if (!TICKET_STATUSES.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);
    data.status = status;
    if (status === 'RESOLVED' && !ticket.resolvedAt) data.resolvedAt = now;
    if (status === 'CLOSED') data.closedAt = now;
    if (status !== 'RESOLVED' && status !== 'CLOSED') { data.resolvedAt = null; data.closedAt = null; }
    changes.status = status;
  }
  if (priority !== undefined) {
    if (!TICKET_PRIORITIES.includes(priority)) return apiResponse.error(res, 'Invalid priority.', 400);
    data.priority = priority;
    data.slaDueAt = slaDueAt(priority, ticket.createdAt, ticket.firstResponseAt);
    data.slaBreachedAt = null;
    changes.priority = priority;
  }
  if (category !== undefined) {
    if (!TICKET_CATEGORIES.includes(category)) return apiResponse.error(res, 'Invalid category.', 400);
    data.category = category;
    changes.category = category;
  }
  if ('assigneeId' in (req.body ?? {})) {
    const assigneeId: string | null = req.body.assigneeId || null;
    // Support agents can pick up or drop their own tickets; assigning others is ops work.
    if (!isOps(req.user!.role) && assigneeId !== staffId && !(assigneeId === null && ticket.assigneeId === staffId)) {
      return apiResponse.error(res, 'You can only assign tickets to yourself.', 403);
    }
    if (assigneeId) {
      const agent = await prisma.user.findFirst({ where: { id: assigneeId, role: { in: [...ADMIN_ROLES] }, isActive: true } });
      if (!agent) return apiResponse.error(res, 'Assignee must be an active admin.', 400);
      data.assignee = { connect: { id: assigneeId } };
    } else {
      data.assignee = { disconnect: true };
    }
    changes.assigneeId = assigneeId;
  }

  if (Object.keys(changes).length === 0) return apiResponse.error(res, 'Nothing to update.', 400);

  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data, select: { id: true, status: true, priority: true, category: true, assigneeId: true } });
  await prisma.auditLog.create({
    data: { userId: staffId, action: 'CRM_TICKET_UPDATED', entity: 'Ticket', entityId: ticket.id, meta: changes as Prisma.InputJsonValue },
  });

  if (changes.status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
    void notifyRequester({ ticketId: ticket.id, kind: 'resolved' });
    await logCrmActivity({
      subjectUserId: ticket.requesterId, actorId: staffId, type: 'TICKET_RESOLVED',
      title: `Ticket #${ticket.number} resolved`, meta: { ticketId: ticket.id },
    });
  }

  return apiResponse.success(res, 'Ticket updated.', updated);
});

// POST /admin/crm/tickets/bulk  { ids: string[], status?, assigneeId? }
export const bulkUpdateTickets = catchAsync(async (req: AuthRequest, res: Response) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some(i => typeof i !== 'string')) {
    return apiResponse.error(res, 'Provide 1–100 ticket ids.', 400);
  }
  const { status } = req.body;
  const data: Prisma.TicketUpdateManyMutationInput & { assigneeId?: string | null } = {};
  const now = new Date();

  if (status !== undefined) {
    // Resolving in bulk would skip requester notifications, so bulk is limited to triage states.
    if (!['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
      return apiResponse.error(res, 'Bulk status must be OPEN, IN_PROGRESS or CLOSED.', 400);
    }
    data.status = status;
    if (status === 'CLOSED') data.closedAt = now;
  }
  if ('assigneeId' in req.body) {
    const assigneeId: string | null = req.body.assigneeId || null;
    if (assigneeId) {
      const agent = await prisma.user.findFirst({ where: { id: assigneeId, role: { in: [...ADMIN_ROLES] }, isActive: true } });
      if (!agent) return apiResponse.error(res, 'Assignee must be an active admin.', 400);
    }
    data.assigneeId = assigneeId;
  }
  if (Object.keys(data).length === 0) return apiResponse.error(res, 'Nothing to update.', 400);

  const result = await prisma.ticket.updateMany({ where: { id: { in: ids as string[] } }, data });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId, action: 'CRM_TICKETS_BULK_UPDATED', entity: 'Ticket', entityId: (ids as string[])[0],
      meta: { ids, status, assigneeId: data.assigneeId } as Prisma.InputJsonValue,
    },
  });
  return apiResponse.success(res, `${result.count} tickets updated.`, { count: result.count });
});

// POST /admin/crm/tickets/:id/credit  { amount, reason }
export const creditFromTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const result = await issueTicketCredit({
      ticketId: req.params.id, staffId: req.user!.userId, amount: Number(req.body?.amount), reason: String(req.body?.reason ?? ''),
    });
    return apiResponse.success(res, 'Credit issued.', result);
  } catch (err) {
    if (err instanceof TicketError) return apiResponse.error(res, err.message, err.status);
    throw err;
  }
});

// ─── Canned replies ───────────────────────────────────────────────────────────

export const listCannedReplies = catchAsync(async (_req: Request, res: Response) => {
  const replies = await prisma.cannedReply.findMany({
    orderBy: { title: 'asc' },
    select: { id: true, title: true, body: true, category: true, updatedAt: true },
  });
  return apiResponse.success(res, 'Canned replies fetched.', replies);
});

const validateCanned = (body: Record<string, unknown>) => {
  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  const category = body.category ? String(body.category) : null;
  if (!title || title.length > 80) return { error: 'Title must be 1–80 characters.' };
  if (!text || text.length > MAX_TICKET_BODY) return { error: 'Reply text is required.' };
  if (category && !TICKET_CATEGORIES.includes(category as TicketCategory)) return { error: 'Invalid category.' };
  return { title, body: text, category: category as TicketCategory | null };
};

export const createCannedReply = catchAsync(async (req: AuthRequest, res: Response) => {
  const v = validateCanned(req.body ?? {});
  if ('error' in v) return apiResponse.error(res, v.error as string, 400);
  const reply = await prisma.cannedReply.create({
    data: { title: v.title, body: v.body, category: v.category, createdById: req.user!.userId },
    select: { id: true, title: true, body: true, category: true, updatedAt: true },
  });
  return apiResponse.success(res, 'Canned reply created.', reply, 201);
});

export const updateCannedReply = catchAsync(async (req: AuthRequest, res: Response) => {
  const v = validateCanned(req.body ?? {});
  if ('error' in v) return apiResponse.error(res, v.error as string, 400);
  const existing = await prisma.cannedReply.findUnique({ where: { id: req.params.id } });
  if (!existing) return apiResponse.error(res, 'Canned reply not found.', 404);
  const reply = await prisma.cannedReply.update({
    where: { id: existing.id },
    data: { title: v.title, body: v.body, category: v.category },
    select: { id: true, title: true, body: true, category: true, updatedAt: true },
  });
  return apiResponse.success(res, 'Canned reply updated.', reply);
});

export const deleteCannedReply = catchAsync(async (req: AuthRequest, res: Response) => {
  const existing = await prisma.cannedReply.findUnique({ where: { id: req.params.id } });
  if (!existing) return apiResponse.error(res, 'Canned reply not found.', 404);
  await prisma.cannedReply.delete({ where: { id: existing.id } });
  return apiResponse.success(res, 'Canned reply deleted.', { id: existing.id });
});

// POST /admin/crm/tickets/:id/triage — re-run the ticket triager agent on this ticket now
export const retriage = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!ticket) return apiResponse.error(res, 'Ticket not found.', 404);
  try {
    const result = await retriageTicket(ticket.id);
    if (result?.stored.analyzedBy === 'failed') {
      return apiResponse.error(res, `Triage failed: ${result.stored.error ?? 'unknown error'}`, 502);
    }
    return apiResponse.success(res, 'Ticket triaged.', result?.stored ?? null);
  } catch (err) {
    return apiResponse.error(res, (err as Error).message, 409);
  }
});
