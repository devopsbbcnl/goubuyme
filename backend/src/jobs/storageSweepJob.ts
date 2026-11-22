import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { runStorageSweep } from '../services/storageSweep.service';

const schedule = process.env.STORAGE_SWEEP_CRON_SCHEDULE || '15 4 * * *';

/**
 * Nightly clean-up of uploaded files (see storageSweep.service). Does nothing destructive unless
 * STORAGE_SWEEP_DELETE=true; until then it logs what it would delete so you can check it first.
 */
export const startStorageSweepJob = (): void => {
  cron.schedule(schedule, async () => {
    try {
      const r = await runStorageSweep();
      if (r.aborted) logger.warn(`Storage sweep: ${r.aborted}`, r);
      else if (r.oversize || r.orphans || r.deleted) logger.info(`Storage sweep (${r.dryRun ? 'dry run' : 'live'})`, r);
    } catch (err) {
      recordError('storage-sweep-job', 'Storage sweep failed', err);
    }
  });
  logger.info(`Storage sweep job scheduled: "${schedule}" (${process.env.STORAGE_SWEEP_DELETE === 'true' ? 'deleting' : 'dry run'})`);
};
