import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { claimJobRun } from '../utils/jobLock';
import { sweepConnections } from '../services/smois/connectors/sync';
import { generateRecurringTasks, sweepApprovals, sweepAssetExpiry, sweepDuePublishing, sweepReportsDue, sweepReputation, sweepResponseTargets, sweepTargetStatus, sweepTaskDeadlines, sweepUnusualPerformance } from '../services/smois/sweep';

const schedule = process.env.SMOIS_SWEEP_CRON_SCHEDULE || '*/15 * * * *';

export const startSmoisJobs = (): void => {
  cron.schedule(schedule, async () => {
    try {
      // One worker per 15-minute bucket.
      const bucket = Math.floor(Date.now() / (15 * 60_000));
      if (!(await claimJobRun(`smois-sweep:${bucket}`))) return;
      await generateRecurringTasks();
      await sweepTaskDeadlines();
      await sweepApprovals();
      await sweepDuePublishing();
      await sweepReportsDue();
      await sweepResponseTargets();
      await sweepAssetExpiry();
      await sweepReputation();
      await sweepTargetStatus();
      await sweepUnusualPerformance();
      await sweepConnections();
    } catch (err) {
      recordError('smois-job', 'SMOIS sweep failed', err);
    }
  }, { timezone: 'Africa/Lagos' });
  logger.info(`SMOIS sweep scheduled: "${schedule}" (Africa/Lagos)`);
};
