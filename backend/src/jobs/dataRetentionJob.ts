import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { runRetentionSweep, retentionWindows } from '../services/retention.service';

const schedule = process.env.DATA_RETENTION_CRON_SCHEDULE || '45 3 * * *';

/** Daily sweep of data that has outlived its purpose. Idempotent, so safe under PM2 cluster mode. */
export const startDataRetentionJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      const r = await runRetentionSweep();
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      if (total) logger.info('Data retention sweep', r);
    } catch (err) {
      recordError('data-retention-job', 'Data retention sweep failed', err);
    }
  });
  logger.info(`Data retention job scheduled: "${schedule}"`, retentionWindows());
};
