import { Prisma, Role, TicketChannel } from '@prisma/client';
import prisma from '../../config/db';
import { recordError } from '../../utils/recordError';
import { notifyUser } from '../notification.service';
import { emailLayout, sendEmail } from '../email.service';
import { escapeTelegramHtml, sendTelegramAlert } from '../telegram.service';
import { getPrimaryClientUrl } from '../../utils/clientUrl';
import { logCrmActivity } from './activity.service';
import {
  CATEGORY_LABEL, TicketCategory, TicketPriority, TicketStatus, defaultPriority, slaDueAt, statusAfterStaffReply,
} from './ticketSla.service';
import { issueCredit } from '../storeCredit.service';

export const MAX_TICKET_BODY = 4000;
export const MAX_OPEN_TICKETS_PER_USER = 5;

export class TicketError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Returns the order if it belongs to this user in any role (customer, vendor or rider). */
export const findOwnedOrder = async (userId: string, orderId: string) => {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [
        { customer: { userId } },
        { vendor: { userId } },
        { rider: { userId } },
      ],
    },
    select: { id: true, orderNumber: true, status: true },
  });
};

export interface CreateTicketInput {
  requesterId: string;
  category: TicketCategory;
  subject?: string;
  body: string;
  orderId?: string | null;
  channel: TicketChannel;
  /** Staff member logging the ticket on the requester's behalf (phone/email). */
  createdByStaffId?: string;
  priority?: TicketPriority;
}

export const createTicket = async (input: CreateTicketInput) => {
  const body = input.body.trim();
  if (!body) throw new TicketError('Please describe the problem.');
  if (body.length > MAX_TICKET_BODY) throw new TicketError('Message is too long.');

  const requester = await prisma.user.findFirst({
    where: { id: input.requesterId, deletedAt: null, role: { in: [Role.CUSTOMER, Role.VENDOR, Role.RIDER] } },
    select: { id: true, name: true, role: true },
  });
  if (!requester) throw new TicketError('Requester not found.', 404);

  if (!input.createdByStaffId) {
    const open = await prisma.ticket.count({
      where: { requesterId: requester.id, status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER'] } },
    });
    if (open >= MAX_OPEN_TICKETS_PER_USER) {
      throw new TicketError('You already have several open requests. Please reply on one of those and we\'ll help you there.', 429);
    }
  }

  let order: { id: string; orderNumber: string; status: string } | null = null;
  if (input.orderId) {
    order = await findOwnedOrder(requester.id, input.orderId);
    if (!order) throw new TicketError('That order was not found on this account.', 404);
  }

  const subject = (input.subject?.trim() || `${CATEGORY_LABEL[input.category]}${order ? ` · Order #${order.orderNumber}` : ''}`).slice(0, 140);
  const priority = input.priority ?? defaultPriority(input.category, order?.status);
  const now = new Date();

  const ticket = await prisma.ticket.create({
    data: {
      requesterId: requester.id,
      requesterRole: requester.role,
      orderId: order?.id,
      subject,
      category: input.category,
      priority,
      channel: input.channel,
      slaDueAt: slaDueAt(priority, now, null),
      lastMessageAt: now,
      createdAt: now,
      messages: {
        create: {
          // Tickets logged by staff record the requester's words, attributed to the requester.
          authorId: requester.id,
          body,
        },
      },
    },
    select: { id: true, number: true, subject: true, priority: true, status: true, category: true, createdAt: true },
  });

  await logCrmActivity({
    subjectUserId: requester.id,
    actorId: input.createdByStaffId ?? requester.id,
    type: 'TICKET_CREATED',
    title: `Ticket #${ticket.number} opened: ${subject}`,
    meta: { ticketId: ticket.id, priority, channel: input.channel },
  });

  if (priority === 'URGENT') {
    void sendTelegramAlert(
      `🚨 <b>Urgent support ticket #${ticket.number}</b>\n` +
      `${escapeTelegramHtml(subject)}\n` +
      `From: ${escapeTelegramHtml(requester.name)} (${requester.role.toLowerCase()})\n` +
      `<i>${escapeTelegramHtml(body.slice(0, 300))}</i>`,
    );
  }

  return ticket;
};

export const MAX_TICKET_CREDIT = 50_000;

/**
 * Staff reply (or internal note) on a ticket. Shared by the support inbox and the ticket triager
 * agent (when an admin approves its drafted reply), so both behave identically.
 */
export const sendStaffReply = async (input: {
  ticketId: string;
  staffId: string;
  body: string;
  isInternal?: boolean;
  status?: TicketStatus;
}) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) throw new TicketError('Ticket not found.', 404);

  const body = input.body.trim();
  const isInternal = input.isInternal === true;
  if (!body) throw new TicketError('Message cannot be empty.');
  if (body.length > MAX_TICKET_BODY) throw new TicketError('Message is too long.');
  if (ticket.status === 'CLOSED' && !isInternal) {
    throw new TicketError('This ticket is closed. Add an internal note or open a new ticket.', 409);
  }

  const now = new Date();
  const data: Prisma.TicketUpdateInput = { lastMessageAt: now };
  if (!isInternal) {
    const nextStatus = statusAfterStaffReply(ticket.status as TicketStatus, input.status);
    const firstResponseAt = ticket.firstResponseAt ?? now;
    Object.assign(data, {
      status: nextStatus,
      firstResponseAt,
      requesterUnread: true,
      slaDueAt: slaDueAt(ticket.priority, ticket.createdAt, firstResponseAt),
      ...(nextStatus === 'RESOLVED' && !ticket.resolvedAt ? { resolvedAt: now } : {}),
      ...(nextStatus === 'CLOSED' ? { closedAt: now } : {}),
      // Replying claims an unassigned ticket so two agents don't work the same one.
      ...(ticket.assigneeId ? {} : { assignee: { connect: { id: input.staffId } } }),
    });
  }

  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: input.staffId, body, isInternal },
      select: { id: true, body: true, isInternal: true, createdAt: true, author: { select: { id: true, name: true, role: true } } },
    }),
    prisma.ticket.update({ where: { id: ticket.id }, data }),
  ]);

  if (!isInternal) {
    void notifyRequester({ ticketId: ticket.id, kind: 'reply', replyBody: body });
    if (data.status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
      await logCrmActivity({
        subjectUserId: ticket.requesterId, actorId: input.staffId, type: 'TICKET_RESOLVED',
        title: `Ticket #${ticket.number} resolved`, meta: { ticketId: ticket.id },
      });
    }
  }
  return message;
};

/** Goodwill store credit from a ticket — one per ticket, capped at MAX_TICKET_CREDIT. */
export const issueTicketCredit = async (input: { ticketId: string; staffId: string; amount: number; reason: string }) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) throw new TicketError('Ticket not found.', 404);

  const amount = Math.round(Number(input.amount));
  const reason = input.reason.trim();
  if (!Number.isFinite(amount) || amount <= 0) throw new TicketError('Amount must be a positive number.');
  if (amount > MAX_TICKET_CREDIT) throw new TicketError(`Ticket credit is capped at ₦${MAX_TICKET_CREDIT.toLocaleString()}.`);
  if (reason.length < 3) throw new TicketError('A reason is required.');

  // One credit per ticket guards against double-clicks and repeat compensation.
  const already = await prisma.creditTransaction.findFirst({
    where: { userId: ticket.requesterId, reason: { startsWith: `Support #${ticket.number}:` } },
  });
  if (already) throw new TicketError(`₦${already.amount.toLocaleString()} was already credited for this ticket.`, 409);

  await issueCredit(ticket.requesterId, amount, `Support #${ticket.number}: ${reason}`, ticket.orderId ?? undefined);
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorId: input.staffId, isInternal: true, body: `Issued ₦${amount.toLocaleString()} store credit — ${reason}` },
  });
  await logCrmActivity({
    subjectUserId: ticket.requesterId, actorId: input.staffId, type: 'TICKET_CREDIT_ISSUED',
    title: `₦${amount.toLocaleString()} credit on ticket #${ticket.number}`, meta: { ticketId: ticket.id, amount, reason },
  });
  return { amount };
};

/** Notifies the requester that staff replied or changed the ticket. Never throws. */
export const notifyRequester = async (params: {
  ticketId: string;
  kind: 'reply' | 'resolved';
  replyBody?: string;
}) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
      select: { id: true, number: true, subject: true, requester: { select: { id: true, email: true, name: true } } },
    });
    if (!ticket) return;

    const title = params.kind === 'resolved'
      ? `Request #${ticket.number} resolved`
      : `New reply on request #${ticket.number}`;
    const body = params.kind === 'resolved'
      ? 'We\'ve marked your request as resolved. Tap to tell us how we did, or reply if you still need help.'
      : (params.replyBody ?? '').slice(0, 160);

    await notifyUser(ticket.requester.id, {
      title, body, type: 'support_ticket', data: { ticketId: ticket.id },
    });

    const link = `${getPrimaryClientUrl() || 'https://gobuyme.shop'}/help/${ticket.id}`;
    const content = params.kind === 'resolved'
      ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#444;">Hi ${escapeHtml(ticket.requester.name)}, we've resolved your request <strong>#${ticket.number}: ${escapeHtml(ticket.subject)}</strong>.</p>
         <p style="margin:0;font-size:15px;line-height:1.6;color:#444;">If anything is still wrong, just reply in the app and we'll pick it straight back up.</p>`
      : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#444;">Hi ${escapeHtml(ticket.requester.name)}, GoBuyMe Support replied to <strong>#${ticket.number}: ${escapeHtml(ticket.subject)}</strong>:</p>
         <blockquote style="margin:0;padding:12px 16px;background:#F7F5F3;border-left:3px solid #FF521B;font-size:15px;line-height:1.6;color:#1A1410;white-space:pre-wrap;">${escapeHtml(params.replyBody ?? '')}</blockquote>`;
    await sendEmail(
      ticket.requester.email,
      title,
      emailLayout(`${content}
        <a href="${link}" style="display:inline-block;background:#FF521B;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">View request</a>`),
    );
  } catch (err) {
    recordError('support', 'notifyRequester failed', err, { ticketId: params.ticketId });
  }
};

// ─── Serializers ──────────────────────────────────────────────────────────────

export const requesterTicketSelect = {
  id: true, number: true, subject: true, category: true, status: true, channel: true,
  requesterUnread: true, csatScore: true, csatComment: true, lastMessageAt: true, createdAt: true, resolvedAt: true,
  order: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.TicketSelect;

export type { TicketStatus };
