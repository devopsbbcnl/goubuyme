import cron from 'node-cron';
import { syncStoreOpenStates } from '../services/availability.service';
import logger from '../utils/logger';

// Runs every minute so stores flip open/closed close to their configured boundary.
const schedule = process.env.STORE_HOURS_CRON_SCHEDULE || '* * * * *';

export const startStoreHoursJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      await syncStoreOpenStates();
    } catch (err) {
      logger.error(`Store hours sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  // Run once at boot so states are correct immediately, not only after the first tick.
  syncStoreOpenStates().catch(err =>
    logger.error(`Initial store hours sync failed: ${err instanceof Error ? err.message : String(err)}`),
  );
  logger.info(`Store hours job scheduled: "${schedule}"`);
};
