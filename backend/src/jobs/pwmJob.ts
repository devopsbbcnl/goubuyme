import cron from 'node-cron';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';
import { claimJobRun } from '../utils/jobLock';
import { runReminderEngine } from '../services/pwm/reminders';
import { runLifecycleSweep } from '../services/pwm/lifecycle';
import { sweepCandidates } from '../controllers/pwm/recruitment.controller';
import { runMonthlyReport } from '../services/pwm/monthlyReport';
import { leaveStatusSweep } from '../services/pwm/leave';
import { absenceSweep } from '../services/pwm/attendance';
import { reviewSweep } from '../services/pwm/performance';
import { assetSweep, caseSweep } from '../services/pwm/sweeps4';
import { getPwmConfig } from '../services/pwm/settings';
import { lagosHour, lagosYmd } from '../services/pwm/rules';

// Hourly, on the quarter past. The engine evaluates from the configured send hour (default 08:00 Lagos)
// and is idempotent, so an hour that is missed is simply caught up by the next run.
const schedule = process.env.PWM_ENGINE_CRON_SCHEDULE || '15 * * * *';

export const startPwmJobs = (): void => {
  cron.schedule(schedule, async () => {
    try {
      // One worker per hour across all PM2 instances.
      const bucket = Math.floor(Date.now() / 3_600_000);
      if (!(await claimJobRun(`pwm-engine:${bucket}`))) return;
      await runLifecycleSweep();
      await runReminderEngine();
      await sweepCandidates();
      await runMonthlyReport();
      // Once a day, from the send hour: leave status, absences, review reminders.
      const cfg = await getPwmConfig();
      if (lagosHour(new Date()) >= cfg.sendHour && (await claimJobRun(`pwm-daily:${lagosYmd(new Date())}`))) {
        await leaveStatusSweep();
        await absenceSweep();
        await reviewSweep();
        await assetSweep();
        await caseSweep();
      }
    } catch (err) {
      recordError('pwm-job', 'PWM reminder engine failed', err);
    }
  }, { timezone: 'Africa/Lagos' });
  logger.info(`PWM reminder engine scheduled: "${schedule}" (Africa/Lagos)`);
};
