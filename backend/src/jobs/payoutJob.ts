import cron from 'node-cron';
import { runPayoutBatch } from '../services/payout.service';
import logger from '../utils/logger';

const schedule = process.env.PAYOUT_CRON_SCHEDULE || '30 11 * * *';

export const startPayoutJob = (): void => {
  cron.schedule(schedule, async () => {
    logger.info(`Payout cron triggered — ${new Date().toISOString()}`);
    await runPayoutBatch();
  });
  logger.info(`Payout job scheduled: "${schedule}"`);
};
