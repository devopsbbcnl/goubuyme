import { Router, Response } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { apiResponse } from '../utils/apiResponse';
import { sendEmail } from '../services/email.service';
import prisma from '../config/db';
import { TicketError, createTicket } from '../services/crm/ticket.service';
import { categoryFromLegacyTopic } from '../services/crm/ticketSla.service';
import {
  createMyTicket, getMyTicket, listMyTickets, rateMyTicket, replyToMyTicket,
} from '../controllers/crm/supportTicket.controller';

const router = Router();
router.use(verifyToken);

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@gobuyme.shop';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Legacy "Contact support" chat (older app builds). Now opens a helpdesk ticket, and still
// emails the support inbox so nothing is lost while the team moves over to the CRM inbox.
router.post('/contact', catchAsync(async (req: AuthRequest, res: Response) => {
  const { topic, message } = req.body;
  if (!message?.trim()) return apiResponse.error(res, 'Message is required.', 400);

  const user = req.user!;
  const userRecord = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { email: true }
  });
  const userEmail = userRecord?.email || 'unknown';

  let ticket: { id: string; number: number } | null = null;
  try {
    ticket = await createTicket({
      requesterId: user.userId,
      category: categoryFromLegacyTopic(topic),
      body: String(message),
      channel: 'APP',
    });
  } catch (err) {
    if (!(err instanceof TicketError)) throw err;
    // Admin accounts or users over the open-ticket cap still reach support by email.
  }

  await sendEmail(
    SUPPORT_EMAIL,
    `[Support${ticket ? ` #${ticket.number}` : ''}] ${escapeHtml(topic || 'General')} — ${userEmail}`,
    `<p><strong>From:</strong> ${escapeHtml(userEmail)} (ID: ${user.userId})</p>
     <p><strong>Topic:</strong> ${escapeHtml(topic || 'General')}</p>
     ${ticket ? `<p><strong>Ticket:</strong> #${ticket.number}</p>` : ''}
     <p><strong>Message:</strong></p>
     <p style="white-space:pre-wrap">${escapeHtml(String(message).trim())}</p>`,
  );

  return apiResponse.success(res, 'Support message received.', ticket ? { ticketId: ticket.id, number: ticket.number } : undefined);
}));

// Helpdesk tickets
router.post('/tickets',              createMyTicket);
router.get('/tickets',               listMyTickets);
router.get('/tickets/:id',           getMyTicket);
router.post('/tickets/:id/messages', replyToMyTicket);
router.post('/tickets/:id/rating',   rateMyTicket);

export default router;
