// One-off notifications for PWM events that are not part of the reminder schedule (approvals waiting, import summaries).
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { notifyUser } from '../notification.service';
import { sendPwmReminderEmail } from '../email.service';

/** In-app plus email to each person. Failures are logged, never thrown: an alert must not undo the action it reports. */
export const notifyPwm = async (userIds: (string | null | undefined)[], p: { title: string; body: string; link?: string }): Promise<void> => {
  const targets = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!targets.length) return;
  const users = await prisma.user.findMany({ where: { id: { in: targets }, isActive: true }, select: { id: true, name: true, email: true } });
  await Promise.all(users.map(async (u) => {
    try {
      await notifyUser(u.id, { title: p.title, body: p.body, type: 'pwm', data: { link: p.link } });
      await sendPwmReminderEmail(u.email, u.name, p.title, p.body, p.link);
    } catch (err) {
      logger.warn(`PWM notify failed for ${u.id}: ${(err as Error).message}`);
    }
  }));
};

/** Queue one bulk-import summary per person; the reminder engine delivers it like any other reminder. */
export const insertSummary = async (batchId: string, userIds: string[], c: { imported: number; expiring30: number; expired: number }): Promise<void> => {
  const body = `${c.imported} employees were imported. ${c.expiring30} contracts expire within 30 days and ${c.expired} are already past their expiry date. Reminders for these contracts are covered by this summary, then follow the normal schedule.`;
  const rows = userIds.flatMap((userId) => (['IN_APP', 'EMAIL'] as const).map((channel) => ({
    kind: 'IMPORT_SUMMARY', tierKey: 'IMPORT', severity: c.expired > 0 ? 'URGENT' : 'INFO', recipientUserId: userId, recipientRole: 'HR_ADMIN', channel,
    idempotencyKey: `import|${batchId}|${userId}|${channel}`, title: `Bulk import finished: ${c.imported} employees`, body, link: '/pwm/contracts', requiresAck: false, nextAttemptAt: new Date(),
  })));
  await prisma.pwmReminder.createMany({ data: rows, skipDuplicates: true });
};
