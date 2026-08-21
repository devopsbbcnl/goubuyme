import cron from 'node-cron';
import { syncStoreOpenStates } from '../services/availability.service';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Runs every minute so stores flip open/closed close to their configured boundary.
const schedule = process.env.STORE_HOURS_CRON_SCHEDULE || '* * * * *';

export const startStoreHoursJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      await syncStoreOpenStates();
    } catch (err) {
      recordError('store-hours-job', 'Store hours sync failed', err);
    }
  });
  // Run once at boot so states are correct immediately, not only after the first tick.
  syncStoreOpenStates().catch(err => recordError('store-hours-job', 'Initial store hours sync failed', err));
  logger.info(`Store hours job scheduled: "${schedule}"`);
};
