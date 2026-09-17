import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { claimJobRun, lagosDateKey } from '../utils/jobLock';
import { runTaskReminderSweep, sendTaskDigests } from '../services/crm/task.service';

const reminderSchedule = process.env.TASK_REMINDER_CRON_SCHEDULE || '*/15 * * * *';
const digestSchedule = process.env.TASK_DIGEST_CRON_SCHEDULE || '0 8 * * *';

export const startTaskJobs = (): void => {
  cron.schedule(reminderSchedule, () => { void runTaskReminderSweep(); });
  cron.schedule(digestSchedule, async () => {
    try {
      if (!(await claimJobRun(`task-digest:${lagosDateKey()}`))) return;
      await sendTaskDigests();
    } catch (err) {
      recordError('task-job', 'Task digest failed', err);
    }
  }, { timezone: 'Africa/Lagos' });
  logger.info(`Task jobs scheduled: reminders "${reminderSchedule}", digest "${digestSchedule}" (Africa/Lagos)`);
};
