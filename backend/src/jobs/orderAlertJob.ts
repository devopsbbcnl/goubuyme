import cron from 'node-cron';
import { runOrderAlertTick } from '../services/orderAlert.service';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Announces order progress to admins (in-app + Telegram) every 10 seconds, so support hears about
// a new order or a cancellation within moments. ORDER_ALERTS_ENABLED=false turns it off.
let running = false;

export const startOrderAlertJob = (): void => {
  if (process.env.ORDER_ALERTS_ENABLED === 'false') {
    logger.info('Order alert job disabled (ORDER_ALERTS_ENABLED=false)');
    return;
  }
  cron.schedule('*/10 * * * * *', async () => {
    if (running) return; // a slow tick must not overlap the next one
    running = true;
    try {
      await runOrderAlertTick();
    } catch (err) {
      recordError('order-alerts', 'Order alert tick failed', err);
    } finally {
      running = false;
    }
  });
  logger.info('Order alerts scheduled (every 10 seconds)');
};
