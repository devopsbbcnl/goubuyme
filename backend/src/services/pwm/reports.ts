// Report data shared by the dashboard screen and the scheduled monthly email.
import prisma from '../../config/db';
import { CURRENT_STATUSES, STATUS_LABEL, fromYmd } from './rules';
import type { Prisma } from '@prisma/client';

export interface MonthlyReport {
  month: string; headcountNow: number; joiners: number; leavers: number; contractsExpiring: number; contractsRenewed: number; contractsNotRenewed: number; renewalDecisions: number;
  statusChanges: { status: string; count: number }[];
}

export const buildMonthlyReport = async (month: string, scope: Prisma.PwmEmployeeWhereInput = {}): Promise<MonthlyReport> => {
  const start = fromYmd(`${month}-01`);
  const next = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1));
  const range = { gte: start, lt: next };
  const [joiners, leavers, status, expiring, renewed, notRenewed, decided, headcountNow] = await Promise.all([
    prisma.pwmEmployee.count({ where: { AND: [scope, { hireDate: range }] } }),
    prisma.pwmEmployee.count({ where: { AND: [scope, { exitDate: range }] } }),
    prisma.pwmStatusChange.groupBy({ by: ['toStatus'], where: { effectiveDate: range, appliedAt: { not: null }, employee: scope }, _count: true }),
    prisma.pwmContract.count({ where: { expiryDate: range, employee: scope } }),
    prisma.pwmContract.count({ where: { status: 'ACTIVE', predecessorId: { not: null }, commencementDate: range, employee: scope } }),
    prisma.pwmContract.count({ where: { status: 'NOT_RENEWED', expiryDate: range, employee: scope } }),
    prisma.pwmRenewal.count({ where: { decidedAt: range, employee: scope } }),
    prisma.pwmEmployee.count({ where: { AND: [scope, { status: { in: [...CURRENT_STATUSES] } }] } }),
  ]);
  return { month, headcountNow, joiners, leavers, contractsExpiring: expiring, contractsRenewed: renewed, contractsNotRenewed: notRenewed, renewalDecisions: decided, statusChanges: status.map((s) => ({ status: STATUS_LABEL[s.toStatus], count: s._count })) };
};

export const monthlyReportText = (r: MonthlyReport): string =>
  `${r.month}: ${r.headcountNow} current employees. ${r.joiners} joined and ${r.leavers} left. ${r.contractsExpiring} contracts reached expiry; ${r.contractsRenewed} were renewed and ${r.contractsNotRenewed} were not. ${r.renewalDecisions} renewal decisions were recorded.`;
