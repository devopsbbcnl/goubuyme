import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { runCampaignSweep } from '../services/crm/campaign.service';
import { runDueAutomations } from '../services/crm/automation.service';

const campaignSchedule = process.env.CAMPAIGN_CRON_SCHEDULE || '* * * * *';
// 10:00 Lagos time: late enough to not wake anyone, early enough to drive lunch orders.
const automationSchedule = process.env.AUTOMATION_CRON_SCHEDULE || '0 10 * * *';

export const startCampaignJobs = (): void => {
  cron.schedule(campaignSchedule, () => {
    runCampaignSweep().catch(err => recordError('campaign-job', 'Campaign sweep crashed', err));
  });
  cron.schedule(automationSchedule, () => {
    runDueAutomations().catch(err => recordError('automation-job', 'Automation run crashed', err));
  }, { timezone: 'Africa/Lagos' });
  logger.info(`Campaign job scheduled: "${campaignSchedule}", automations: "${automationSchedule}" (Africa/Lagos)`);
};
