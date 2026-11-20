// The monthly HR report, emailed to HR administrators and executives on the first morning of the month.
import { claimJobRun } from '../../utils/jobLock';
import { buildMonthlyReport, monthlyReportText } from './reports';
import { getPwmConfig } from './settings';
import { addDays, lagosHour, lagosYmd } from './rules';
import { hrAdminUserIds, managementUserIds } from './people';
import { notifyPwm } from './notify';

/** Runs hourly; sends once per month, from the configured hour (Lagos) on the 1st, covering the month that just ended. */
export const runMonthlyReport = async (now = new Date()): Promise<boolean> => {
  const cfg = await getPwmConfig();
  if (!cfg.monthlyReportOn) return false;
  const today = lagosYmd(now);
  if (today.slice(8, 10) !== '01' || lagosHour(now) < cfg.sendHour) return false;
  const month = addDays(today, -1).slice(0, 7);
  if (!(await claimJobRun(`pwm-monthly-report:${month}`))) return false;
  const report = await buildMonthlyReport(month);
  const to = [...new Set([...(await hrAdminUserIds()), ...(await managementUserIds())])];
  await notifyPwm(to, { title: `Monthly HR report: ${month}`, body: monthlyReportText(report), link: '/pwm' });
  return true;
};
