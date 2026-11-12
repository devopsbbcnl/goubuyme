import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { claimJobRun, lagosDateKey } from '../utils/jobLock';
import { purgeOldProspects, runProspectingTick } from '../services/crm/prospecting/prospecting.service';

const tickSchedule = process.env.PROSPECTING_CRON_SCHEDULE || '*/10 * * * *';
const purgeSchedule = process.env.PROSPECTING_PURGE_CRON_SCHEDULE || '30 3 * * *';

let running = false;

export const startProspectingJobs = (): void => {
  // Saved searches that are due, plus clean-up of runs a restart left hanging.
  cron.schedule(tickSchedule, async () => {
    if (running) return;
    running = true;
    try {
      await runProspectingTick();
    } catch (err) {
      recordError('lead-finder', 'Lead finder tick failed', err);
    } finally {
      running = false;
    }
  });
  cron.schedule(purgeSchedule, async () => {
    try {
      if (!(await claimJobRun(`prospect-purge:${lagosDateKey()}`))) return;
      const { deleted, stripped } = await purgeOldProspects();
      if (deleted || stripped) logger.info(`Lead finder retention: deleted ${deleted} stale prospects, stripped contacts from ${stripped} dismissed`);
    } catch (err) {
      recordError('lead-finder', 'Prospect retention purge failed', err);
    }
  }, { timezone: 'Africa/Lagos' });
  logger.info(`Lead finder jobs scheduled: searches "${tickSchedule}", retention "${purgeSchedule}" (Africa/Lagos)`);
};
