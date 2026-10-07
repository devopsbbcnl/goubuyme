import cron from 'node-cron';
import prisma from '../config/db';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

const schedule = process.env.ANALYTICS_RETENTION_CRON_SCHEDULE || '15 3 * * *';

// ~13 months by default: enough for year-over-year comparisons, short enough to honour
// the privacy policy's stated retention. Must match what the policy tells users.
const retentionDays = (): number => {
  const n = parseInt(process.env.ANALYTICS_RETENTION_DAYS ?? '', 10);
  return Number.isNaN(n) || n < 30 ? 395 : n;
};

/** Deletes AppEvent rows older than the retention window. Idempotent, so safe under PM2 cluster mode. */
export const runAnalyticsRetention = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now.getTime() - retentionDays() * 24 * 60 * 60 * 1000);
  const { count } = await prisma.appEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
  return count;
};

export const startAnalyticsRetentionJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      const deleted = await runAnalyticsRetention();
      if (deleted) logger.info(`Analytics retention: deleted ${deleted} event(s) older than ${retentionDays()} days`);
    } catch (err) {
      recordError('analytics-retention-job', 'Analytics retention sweep failed', err);
    }
  });
  logger.info(`Analytics retention job scheduled: "${schedule}" (${retentionDays()} days)`);
};
