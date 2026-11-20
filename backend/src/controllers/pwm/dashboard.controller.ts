// PWM: HR dashboard, monthly report, contract export and the activity (audit) log.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import {
  BUCKET_LABEL, CONTRACT_STATUS_LABEL, CURRENT_STATUSES, ExpiryBucket, STATUS_LABEL, WATCHED_CONTRACT, addDays, can, dateOnly, daysBetween, expiryBucket, fromYmd, lagosYmd, tenureYears,
} from '../../services/pwm/rules';
import { employeeScope } from '../../services/pwm/people';
import { buildMonthlyReport } from '../../services/pwm/reports';
import { access, csvCell, handle, nameMap, page } from './common';
import { HEARTBEAT_ID } from '../../services/pwm/reminders';

// GET /dashboard
export const getDashboard = handle(async (req, res) => {
  const a = access(req);
  const scope = employeeScope(a);
  const today = lagosYmd(new Date());
  const current = { AND: [scope, { status: { in: [...CURRENT_STATUSES] } }] } as Prisma.PwmEmployeeWhereInput;
  const yearAgo = fromYmd(addDays(today, -365));
  const monthAgo = fromYmd(addDays(today, -30));

  const [employees, pendingOnboarding, newHires, leavers, contracts, openRenewals, probation, docs, statusPending, contractPending, compPending, hb, deptsNoHead, noDept] = await Promise.all([
    prisma.pwmEmployee.findMany({ where: current, select: { id: true, status: true, employmentType: true, hireDate: true, departmentId: true, department: { select: { name: true } }, workEmail: true, dateOfBirth: true, address: true, emergencyContacts: true, managerId: true, hrOfficerUserId: true } }),
    prisma.pwmEmployee.count({ where: { AND: [scope, { status: 'PENDING_ONBOARDING' }] } }),
    prisma.pwmEmployee.count({ where: { AND: [scope, { hireDate: { gte: monthAgo }, status: { notIn: ['ARCHIVED'] } }] } }),
    prisma.pwmEmployee.count({ where: { AND: [scope, { exitDate: { gte: yearAgo } }] } }),
    prisma.pwmContract.findMany({
      where: { status: { in: [...WATCHED_CONTRACT] }, archivedAt: null, employee: scope }, orderBy: { expiryDate: 'asc' }, take: 3000,
      select: { id: true, reference: true, status: true, expiryDate: true, contractType: true, decisionRecordedAt: true, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
    }),
    prisma.pwmRenewal.findMany({ where: { step: { in: ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'] }, employee: scope }, select: { step: true, dueRecommendation: true, dueDecision: true, duePreparation: true, dueIssuance: true, dueSignature: true } }),
    prisma.pwmEmployee.findMany({ where: { AND: [scope, { status: 'PROBATION', probationEndDate: { not: null, lte: fromYmd(addDays(today, 30)) } }] }, orderBy: { probationEndDate: 'asc' }, take: 10, select: { id: true, employeeNo: true, firstName: true, lastName: true, probationEndDate: true } }),
    prisma.pwmDocument.count({ where: { expiryDate: { not: null, lte: fromYmd(addDays(today, 30)) }, archivedAt: null, employee: current } }),
    can(a, 'approveStatus') || can(a, 'manageEmployees') ? prisma.pwmStatusChange.count({ where: { approvalStatus: 'PENDING' } }) : 0,
    can(a, 'approveContracts') ? prisma.pwmContract.count({ where: { status: 'PENDING_APPROVAL' } }) : 0,
    can(a, 'approveCompensation') ? prisma.pwmCompensation.count({ where: { approvalStatus: 'PENDING', preparedById: { not: a.userId } } }) : 0,
    prisma.pwmSettings.findUnique({ where: { id: HEARTBEAT_ID } }),
    can(a, 'manageOrganisation') ? prisma.pwmDepartment.count({ where: { archivedAt: null, headEmployeeId: null } }) : 0,
    prisma.pwmEmployee.count({ where: { AND: [current, { departmentId: null }] } }),
  ]);

  const tally = <T,>(items: T[], key: (t: T) => string) => Object.entries(items.reduce<Record<string, number>>((m, i) => { const k = key(i); m[k] = (m[k] ?? 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
  const headcount = employees.length;
  const tenureAvg = headcount ? employees.reduce((s, e) => s + tenureYears(dateOnly(e.hireDate), today), 0) / headcount : null;

  const watched = contracts.map((c) => ({ ...c, days: c.expiryDate ? daysBetween(today, dateOnly(c.expiryDate)) : null }));
  const buckets: Record<ExpiryBucket, number> = { EXPIRED_ACTION: 0, TODAY: 0, D1_3: 0, D4_7: 0, D8_30: 0, D31_60: 0, D61_90: 0, LATER: 0, NO_EXPIRY: 0 };
  for (const c of watched) buckets[expiryBucket(c.days)]++;
  const brief = (c: (typeof watched)[number]) => ({ id: c.id, reference: c.reference, status: c.status, statusLabel: CONTRACT_STATUS_LABEL[c.status], expiryDate: c.expiryDate, daysRemaining: c.days, decisionRecorded: !!c.decisionRecordedAt, employee: c.employee });

  const steps = ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'] as const;
  const dueOf = (r: (typeof openRenewals)[number]) => ({ RECOMMENDATION: r.dueRecommendation, DECISION: r.dueDecision, PREPARATION: r.duePreparation, ISSUANCE: r.dueIssuance, SIGNATURE: r.dueSignature } as Record<string, Date>)[r.step];
  const renewals = {
    open: openRenewals.length,
    recommendationsOutstanding: openRenewals.filter((r) => r.step === 'RECOMMENDATION').length,
    awaitingDecision: openRenewals.filter((r) => r.step === 'DECISION').length,
    approvedNotSigned: openRenewals.filter((r) => ['PREPARATION', 'ISSUANCE', 'SIGNATURE'].includes(r.step)).length,
    overdue: openRenewals.filter((r) => steps.includes(r.step as never) && dateOnly(dueOf(r)) < today).length,
  };

  // Contract coverage: people on a fixed arrangement with no contract in force (a gap HR must close).
  const withContract = new Set((await prisma.pwmContract.findMany({ where: { status: { in: [...WATCHED_CONTRACT, 'SIGNED'] }, archivedAt: null, employee: scope }, select: { employeeId: true } })).map((c) => c.employeeId));
  const uncovered = employees.filter((e) => !withContract.has(e.id)).length;

  const completeness = {
    total: headcount,
    missingWorkEmail: employees.filter((e) => !e.workEmail).length, missingDob: employees.filter((e) => !e.dateOfBirth).length, missingAddress: employees.filter((e) => !e.address).length,
    missingEmergencyContact: employees.filter((e) => !e.emergencyContacts || (Array.isArray(e.emergencyContacts) && e.emergencyContacts.length === 0)).length,
    missingManager: employees.filter((e) => !e.managerId).length, missingHrOfficer: employees.filter((e) => !e.hrOfficerUserId).length,
  };
  const hbc = (hb?.config ?? {}) as { lastRunAt?: string; ok?: boolean };
  const ageMin = hbc.lastRunAt ? Math.round((Date.now() - new Date(hbc.lastRunAt).getTime()) / 60_000) : null;

  return apiResponse.success(res, 'Dashboard.', {
    scope: a.level === 'DEPARTMENT_HEAD' ? 'DEPARTMENT' : 'COMPANY',
    headcount, pendingOnboarding, newHires30d: newHires, leavers12m: leavers,
    turnoverPct12m: headcount ? Math.round((leavers / (headcount + leavers / 2)) * 1000) / 10 : null, avgTenureYears: tenureAvg === null ? null : Math.round(tenureAvg * 10) / 10,
    byDepartment: tally(employees, (e) => e.department?.name ?? 'No department'), byStatus: tally(employees, (e) => STATUS_LABEL[e.status]), byType: tally(employees, (e) => e.employmentType),
    buckets: Object.entries(buckets).map(([key, count]) => ({ key, label: BUCKET_LABEL[key as ExpiryBucket], count })),
    expiredActionRequired: watched.filter((c) => c.status === 'EXPIRED_ACTION_REQUIRED').slice(0, 10).map(brief),
    expiringSoon: watched.filter((c) => c.days !== null && c.days >= 0 && c.days <= 30).slice(0, 10).map(brief),
    expiringThisMonth: watched.filter((c) => c.days !== null && c.days >= 0 && c.expiryDate && dateOnly(c.expiryDate).slice(0, 7) === today.slice(0, 7)).length,
    renewals, probationEnding: probation.map((p) => ({ ...p, daysRemaining: daysBetween(today, dateOnly(p.probationEndDate as Date)) })), documentsExpiring30d: docs,
    waiting: { statusRequests: statusPending, contractApprovals: contractPending, payChanges: compPending },
    gaps: { employeesWithoutContract: uncovered, employeesWithoutDepartment: noDept, departmentsWithoutHead: deptsNoHead, ...completeness },
    engine: can(a, 'configure') || a.level === 'EXECUTIVE' ? { lastRunAt: hbc.lastRunAt ?? null, ageMinutes: ageMin, healthy: hbc.ok !== false && ageMin !== null && ageMin < 150 } : null,
  });
});

// GET /reports/monthly?month=YYYY-MM
export const monthlyReport = handle(async (req, res) => {
  const a = access(req);
  const month = /^d{4}-d{2}$/.test(String(req.query.month ?? '')) ? String(req.query.month) : lagosYmd(new Date()).slice(0, 7);
  return apiResponse.success(res, 'Monthly HR report.', await buildMonthlyReport(month, employeeScope(a)));
});

// GET /contracts/export.csv
export const exportContracts = handle(async (req, res) => {
  const a = access(req);
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmContract.findMany({ where: { employee: employeeScope(a), archivedAt: null, status: { in: [...WATCHED_CONTRACT] } }, orderBy: { expiryDate: 'asc' }, take: 5000, include: { employee: { select: { employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } } } });
  const officers = await nameMap(rows.map((r) => r.responsibleOfficerUserId));
  const lines = [['Contract', 'Employee ID', 'Employee', 'Department', 'Type', 'Status', 'Start', 'Expiry', 'Days remaining', 'Decision recorded', 'HR officer'].join(',')];
  for (const c of rows) {
    lines.push([c.reference, c.employee.employeeNo, `${c.employee.firstName} ${c.employee.lastName}`, c.employee.department?.name, c.contractType, CONTRACT_STATUS_LABEL[c.status], dateOnly(c.commencementDate), c.expiryDate ? dateOnly(c.expiryDate) : '', c.expiryDate ? daysBetween(today, dateOnly(c.expiryDate)) : '', c.decisionRecordedAt ? 'Yes' : 'No', c.responsibleOfficerUserId ? officers.get(c.responsibleOfficerUserId) ?? '' : ''].map(csvCell).join(','));
  }
  await pwmAudit(req, { action: 'EXPORT', entity: 'PwmContract', entityId: 'export', meta: { rows: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contract-expiry-${today}.csv"`);
  res.send(lines.join('\r\n'));
});

// ── Activity log ─────────────────────────────────────────────────────────────

const activityWhere = (q: Record<string, string>): Prisma.AuditLogWhereInput => ({
  entity: q.entity ? q.entity : { startsWith: 'Pwm' },
  ...(q.action ? { action: q.action } : {}), ...(q.userId ? { userId: q.userId } : {}), ...(q.entityId ? { entityId: q.entityId } : {}),
  ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
});

// GET /activity
export const listActivity = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page: p, limit, skip } = page(q, 50);
  const where = activityWhere(q);
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }), prisma.auditLog.count({ where })]);
  const names = await nameMap(rows.map((r) => r.userId));
  return apiResponse.paginated(res, 'Activity.', rows.map((r) => ({ id: r.id, at: r.createdAt, action: r.action, entity: r.entity, entityId: r.entityId, by: r.userId ? names.get(r.userId) ?? 'Unknown' : 'System', ip: r.ip, meta: r.meta })), { page: p, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /activity/export.csv
export const exportActivity = handle(async (req, res) => {
  const rows = await prisma.auditLog.findMany({ where: activityWhere(req.query as Record<string, string>), orderBy: { createdAt: 'desc' }, take: 10000 });
  const names = await nameMap(rows.map((r) => r.userId));
  const lines = [['When', 'Who', 'Action', 'Record', 'Record id', 'Reason', 'IP'].join(',')];
  for (const r of rows) {
    const m = (r.meta ?? {}) as { reason?: string };
    lines.push([r.createdAt.toISOString(), r.userId ? names.get(r.userId) ?? r.userId : 'System', r.action, r.entity, r.entityId, m.reason ?? '', r.ip ?? ''].map(csvCell).join(','));
  }
  await pwmAudit(req, { action: 'EXPORT', entity: 'PwmAudit', entityId: 'activity', meta: { rows: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pwm-activity-${lagosYmd(new Date())}.csv"`);
  res.send(lines.join('\r\n'));
});

