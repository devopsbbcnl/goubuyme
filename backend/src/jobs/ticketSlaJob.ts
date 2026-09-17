import cron from 'node-cron';
import prisma from '../config/db';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { escapeTelegramHtml, sendTelegramAlert } from '../services/telegram.service';
import { AUTO_CLOSE_HOURS } from '../services/crm/ticketSla.service';

const schedule = process.env.TICKET_SLA_CRON_SCHEDULE || '*/5 * * * *';

/** Flags newly breached tickets (alerting on HIGH/URGENT) and auto-closes stale resolved ones. */
export const runTicketSlaSweep = async (now = new Date()): Promise<{ breached: number; closed: number }> => {
  const candidates = await prisma.ticket.findMany({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now }, slaBreachedAt: null },
    select: {
      id: true, number: true, subject: true, priority: true, firstResponseAt: true,
      assignee: { select: { name: true } },
    },
    take: 200,
  });

  let breached = 0;
  for (const t of candidates) {
    // Conditional claim: under PM2 cluster mode every worker runs this job, and only the
    // worker whose update succeeds sends the alert.
    const claimed = await prisma.ticket.updateMany({ where: { id: t.id, slaBreachedAt: null }, data: { slaBreachedAt: now } });
    if (claimed.count === 0) continue;
    breached++;

    if (t.priority === 'URGENT' || t.priority === 'HIGH') {
      await sendTelegramAlert(
        `⏰ <b>SLA breached: ticket #${t.number}</b> (${t.priority.toLowerCase()})\n` +
        `${escapeTelegramHtml(t.subject)}\n` +
        `${t.firstResponseAt ? 'Not resolved in time' : 'No first response yet'} · ` +
        `${t.assignee ? `Assigned to ${escapeTelegramHtml(t.assignee.name)}` : '<b>Unassigned</b>'}`,
      );
    }
  }

  const closeBefore = new Date(now.getTime() - AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  const closed = await prisma.ticket.updateMany({
    where: { status: 'RESOLVED', resolvedAt: { lt: closeBefore } },
    data: { status: 'CLOSED', closedAt: now },
  });

  return { breached, closed: closed.count };
};

export const startTicketSlaJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      const { breached, closed } = await runTicketSlaSweep();
      if (breached || closed) logger.info(`Ticket SLA sweep: ${breached} breached, ${closed} auto-closed`);
    } catch (err) {
      recordError('ticket-sla-job', 'Ticket SLA sweep failed', err);
    }
  });
  logger.info(`Ticket SLA job scheduled: "${schedule}"`);
};
