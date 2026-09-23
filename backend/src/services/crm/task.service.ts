// Staff task reminders: an email when an assigned task becomes overdue, and a morning digest.
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { recordError } from '../../utils/recordError';
import { emailLayout, sendEmail } from '../email.service';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const adminUrl = () => (process.env.ADMIN_URL ?? '').split(',')[0].trim() || 'https://munakay.gobuyme.shop';

/** Emails each assignee once when their task passes its due time. Claimed per task (cluster-safe). */
export const sendOverdueReminders = async (now = new Date()) => {
  const due = await prisma.crmTask.findMany({
    where: { status: 'OPEN', dueAt: { lt: now }, reminderSentAt: null, assigneeId: { not: null } },
    select: { id: true, title: true, dueAt: true, assignee: { select: { email: true, name: true, isActive: true } } },
    take: 200,
  });
  let sent = 0;
  for (const t of due) {
    const claimed = await prisma.crmTask.updateMany({ where: { id: t.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0 || !t.assignee?.isActive) continue;
    await sendEmail(t.assignee.email, `Overdue task: ${t.title}`, emailLayout(`
      <p style="margin:0 0 12px;font-size:15px;color:#444;">Hi ${escapeHtml(t.assignee.name)}, this task is now overdue:</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#1A1410;">${escapeHtml(t.title)}</p>
      <a href="${adminUrl()}/crm/tasks" style="display:inline-block;background:#FF521B;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">Open tasks</a>`));
    sent++;
  }
  return sent;
};

/** Morning email per admin listing tasks due today and overdue. */
export const sendTaskDigests = async (now = new Date()) => {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const tasks = await prisma.crmTask.findMany({
    where: { status: 'OPEN', assigneeId: { not: null }, dueAt: { lte: endOfDay } },
    orderBy: { dueAt: 'asc' },
    select: { title: true, dueAt: true, assigneeId: true, assignee: { select: { email: true, name: true, isActive: true } } },
  });

  const byAssignee = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.assigneeId || !t.assignee?.isActive) continue;
    byAssignee.set(t.assigneeId, [...(byAssignee.get(t.assigneeId) ?? []), t]);
  }

  for (const list of byAssignee.values()) {
    const { email, name } = list[0].assignee!;
    const overdue = list.filter(t => t.dueAt! < now).length;
    const items = list.map(t => `<li style="margin:6px 0;">${escapeHtml(t.title)}${t.dueAt! < now ? ' <strong style="color:#E23B3B;">(overdue)</strong>' : ''}</li>`).join('');
    await sendEmail(email, `Your GoBuyMe tasks today: ${list.length}${overdue ? ` (${overdue} overdue)` : ''}`, emailLayout(`
      <p style="margin:0 0 12px;font-size:15px;color:#444;">Good morning ${escapeHtml(name)}, here's what's on your list:</p>
      <ul style="margin:0;padding-left:20px;font-size:15px;color:#1A1410;">${items}</ul>
      <a href="${adminUrl()}/crm/tasks" style="display:inline-block;background:#FF521B;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:4px;margin-top:24px;">Open tasks</a>`));
  }
  logger.info(`Task digests sent to ${byAssignee.size} admins`);
  return byAssignee.size;
};

export const runTaskReminderSweep = async () => {
  try {
    await sendOverdueReminders();
  } catch (err) {
    recordError('task-job', 'Overdue task reminders failed', err);
  }
};
