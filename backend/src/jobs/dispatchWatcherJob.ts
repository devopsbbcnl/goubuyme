import cron from 'node-cron';
import { runDispatchWatcherTick } from '../services/agents/dispatchWatcher';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Runs the dispatch watcher agent every minute. Turn it off from Admin → Agents (mode OFF);
// DISPATCH_WATCHER_ENABLED=false stops the job entirely (e.g. on a worker that shouldn't run it).
let running = false;

export const startDispatchWatcherJob = (): void => {
  if (process.env.DISPATCH_WATCHER_ENABLED === 'false') {
    logger.info('Dispatch watcher job disabled (DISPATCH_WATCHER_ENABLED=false)');
    return;
  }
  cron.schedule('* * * * *', async () => {
    if (running) return; // a slow tick must not overlap the next one
    running = true;
    try {
      await runDispatchWatcherTick();
    } catch (err) {
      recordError('dispatch-watcher', 'Dispatch watcher tick failed', err);
    } finally {
      running = false;
    }
  });
  logger.info('Dispatch watcher agent scheduled (every minute)');
};
