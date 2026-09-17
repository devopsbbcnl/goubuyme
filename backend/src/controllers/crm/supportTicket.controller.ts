// Requester-facing helpdesk endpoints (customers, vendors, riders). Mounted under /api/v1/support.
import { Response } from 'express';
import { TicketChannel } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import {
  MAX_TICKET_BODY, TicketError, createTicket, requesterTicketSelect,
} from '../../services/crm/ticket.service';
import {
  TICKET_CATEGORIES, TicketCategory, TicketStatus, slaDueAt, statusAfterRequesterReply,
} from '../../services/crm/ticketSla.service';

const handleTicketError = (res: Response, err: unknown) => {
  if (err instanceof TicketError) return apiResponse.error(res, err.message, err.status);
  throw err;
};

// POST /support/tickets  { category, subject?, body, orderId?, channel? }
export const createMyTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const category = req.body?.category as TicketCategory;
  if (!TICKET_CATEGORIES.includes(category)) return apiResponse.error(res, 'Please choose what this is about.', 400);
  const channel: TicketChannel = req.body?.channel === 'WEB' ? 'WEB' : 'APP';

  try {
    const ticket = await createTicket({
      requesterId: req.user!.userId,
      category,
      subject: typeof req.body?.subject === 'string' ? req.body.subject : undefined,
      body: String(req.body?.body ?? ''),
      orderId: typeof req.body?.orderId === 'string' && req.body.orderId ? req.body.orderId : null,
      channel,
    });
    return apiResponse.success(res, 'Request received. We\'ll get back to you shortly.', ticket, 201);
  } catch (err) {
    return handleTicketError(res, err);
  }
});

// GET /support/tickets
export const listMyTickets = catchAsync(async (req: AuthRequest, res: Response) => {
  const tickets = await prisma.ticket.findMany({
    where: { requesterId: req.user!.userId },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    select: requesterTicketSelect,
  });
  return apiResponse.success(res, 'Tickets fetched.', tickets);
});

const loadOwnTicket = (userId: string, ticketId: string) =>
  prisma.ticket.findFirst({ where: { id: ticketId, requesterId: userId } });

// GET /support/tickets/:id  — never exposes internal notes, priority, assignee or staff identities
export const getMyTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const ticket = await prisma.ticket.findFirst({
    where: { id: req.params.id, requesterId: userId },
    select: {
      ...requesterTicketSelect,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, createdAt: true, authorId: true },
      },
    },
  });
  if (!ticket) return apiResponse.error(res, 'Request not found.', 404);

  if (ticket.requesterUnread) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { requesterUnread: false } });
  }

  const { messages, ...rest } = ticket;
  return apiResponse.success(res, 'Ticket fetched.', {
    ...rest,
    requesterUnread: false,
    canReply: ticket.status !== 'CLOSED',
    canRate: (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && ticket.csatScore === null,
    messages: messages.map(m => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      from: m.authorId === userId ? 'you' : 'support',
    })),
  });
});

// POST /support/tickets/:id/messages  { body }
export const replyToMyTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const ticket = await loadOwnTicket(userId, req.params.id);
  if (!ticket) return apiResponse.error(res, 'Request not found.', 404);

  const body = String(req.body?.body ?? '').trim();
  if (!body) return apiResponse.error(res, 'Message cannot be empty.', 400);
  if (body.length > MAX_TICKET_BODY) return apiResponse.error(res, 'Message is too long.', 400);

  const next = statusAfterRequesterReply(ticket.status as TicketStatus);
  if (!next) return apiResponse.error(res, 'This request is closed. Please start a new one.', 409);

  const now = new Date();
  const reopened = ticket.status === 'RESOLVED';
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: userId, body },
      select: { id: true, body: true, createdAt: true },
    }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: next,
        lastMessageAt: now,
        ...(reopened
          ? { resolvedAt: null, slaBreachedAt: null, slaDueAt: slaDueAt(ticket.priority, now, ticket.firstResponseAt ? now : null) }
          : {}),
      },
    }),
  ]);

  return apiResponse.success(res, 'Reply sent.', { ...message, from: 'you' }, 201);
});

// POST /support/tickets/:id/rating  { score: 1-5, comment? }
export const rateMyTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const ticket = await loadOwnTicket(req.user!.userId, req.params.id);
  if (!ticket) return apiResponse.error(res, 'Request not found.', 404);
  if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
    return apiResponse.error(res, 'You can rate a request once it has been resolved.', 409);
  }
  if (ticket.csatScore !== null) return apiResponse.error(res, 'You have already rated this request.', 409);

  const score = Number(req.body?.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) return apiResponse.error(res, 'Rating must be 1 to 5.', 400);
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1000) || null : null;

  await prisma.ticket.update({ where: { id: ticket.id }, data: { csatScore: score, csatComment: comment } });

  // An unhappy rating is worth a human follow-up before the customer churns.
  if (score <= 2) {
    await prisma.crmTask.create({
      data: {
        title: `Follow up on ${score}★ rating for ticket #${ticket.number}`,
        description: comment ? `Customer said: "${comment}"` : null,
        priority: 'HIGH',
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        assigneeId: ticket.assigneeId,
        relatedUserId: ticket.requesterId,
        ticketId: ticket.id,
      },
    });
  }
  return apiResponse.success(res, 'Thanks for the feedback!', { csatScore: score });
});
