import cron from 'node-cron';
import { runScheduledOpsBriefing } from '../services/opsBriefing.service';
import logger from '../utils/logger';

// Daily ops briefing (see opsBriefing.service.ts). Defaults to 7:00 Lagos time, covering the
// previous Lagos day. Set OPS_BRIEFING_ENABLED=false to turn it off.
const schedule = process.env.OPS_BRIEFING_CRON || '0 7 * * *';

export const startOpsBriefingJob = (): void => {
  if (process.env.OPS_BRIEFING_ENABLED === 'false') {
    logger.info('Ops briefing job disabled (OPS_BRIEFING_ENABLED=false)');
    return;
  }
  cron.schedule(schedule, () => { void runScheduledOpsBriefing(); }, { timezone: 'Africa/Lagos' });
  logger.info(`Ops briefing job scheduled: "${schedule}" Africa/Lagos`);
};
