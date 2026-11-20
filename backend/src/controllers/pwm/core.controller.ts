// PWM: identity, team access, settings, departments.
import { Prisma, PwmRole } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { DEFAULT_CONFIG, getPwmConfig, PwmConfig } from '../../services/pwm/settings';
import { Capability, can, DEFAULT_DEPARTMENTS, ReminderTier } from '../../services/pwm/rules';
import { access, fail, handle, nameMap, oneOf, reqStr, str } from './common';

const ROLES: readonly PwmRole[] = ['HR_ADMIN', 'HR_OFFICER', 'DEPARTMENT_HEAD', 'EXECUTIVE', 'FINANCE', 'AUDITOR'];
const CAPS: Capability[] = ['view', 'viewRestricted', 'viewHighlyRestricted', 'manageEmployees', 'manageOrganisation', 'manageContracts', 'approveContracts', 'recommend', 'decide', 'changeStatus', 'approveStatus', 'manageChecklists', 'viewCompensation', 'manageCompensation', 'approveCompensation', 'viewReminders', 'manageReminders', 'configure', 'manageTeam', 'viewAudit', 'import', 'viewRecruitment', 'manageRecruitment', 'approveVacancies', 'manageTemplates', 'managePolicies', 'manageAnnouncements', 'viewExitInterviews', 'viewLeave', 'manageLeave', 'configureLeave', 'viewAttendance', 'manageAttendance', 'viewPerformance', 'managePerformance', 'viewLearning', 'manageLearning', 'viewAssets', 'manageAssets', 'createCases', 'handleCases', 'viewERReports', 'manageSurveys', 'viewSurveyResults', 'manageRecognition', 'viewExpenses', 'payExpenses', 'viewAnalytics'];

// ── Identity ─────────────────────────────────────────────────────────────────

// GET /me
export const getMe = handle(async (req, res) => {
  const a = access(req);
  const [user, unread, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: a.userId }, select: { id: true, name: true, email: true, role: true } }),
    prisma.pwmReminder.count({ where: { recipientUserId: a.userId, channel: 'IN_APP', requiresAck: true, acknowledgedAt: null, status: { in: ['SENT', 'DELIVERED'] } } }),
    a.memberId ? prisma.pwmMember.findUnique({ where: { id: a.memberId }, select: { jobTitle: true } }) : null,
  ]);
  return apiResponse.success(res, 'PWM access.', {
    user, level: a.level, memberId: a.memberId, isMd: a.isMd, employeeId: a.employeeId, headedDepartmentIds: a.headedDepartmentIds,
    jobTitle: member?.jobTitle ?? null, unacknowledged: unread, can: Object.fromEntries(CAPS.map((c) => [c, can(a, c)])),
  });
});

// GET /people: login holders who can own work (HR officers, assignees).
export const listPeople = handle(async (_req, res) => {
  const [members, supers] = await Promise.all([
    prisma.pwmMember.findMany({ where: { isActive: true }, select: { userId: true, role: true } }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, name: true } }),
  ]);
  const names = await nameMap(members.map((m) => m.userId));
  const out = [
    ...supers.map((s) => ({ userId: s.id, name: s.name, role: 'SUPER' })),
    ...members.map((m) => ({ userId: m.userId, name: names.get(m.userId) ?? 'Unknown', role: m.role })),
  ];
  return apiResponse.success(res, 'People.', out);
});

// ── Team ─────────────────────────────────────────────────────────────────────

// GET /members
export const listMembers = handle(async (_req, res) => {
  const rows = await prisma.pwmMember.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true, email: true, role: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return apiResponse.success(res, 'Team.', rows.map((r) => ({ ...r, user: byId.get(r.userId) ?? null })));
});

// GET /eligible-users
export const listEligibleUsers = handle(async (_req, res) => {
  const taken = (await prisma.pwmMember.findMany({ select: { userId: true } })).map((m) => m.userId);
  const users = await prisma.user.findMany({
    where: { role: { in: ['OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] }, isActive: true, id: { notIn: taken } },
    select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' },
  });
  return apiResponse.success(res, 'Eligible admins.', users);
});

// POST /members { userId, role, jobTitle, isMd, canViewCompensation }
export const createMember = handle(async (req, res) => {
  const b = req.body ?? {};
  const userId = reqStr(b.userId, 'Person');
  const role = oneOf(b.role, ROLES, 'Role');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true, name: true } });
  if (!user || !user.isActive || !['OPERATIONS_ADMIN', 'SUPPORT_ADMIN'].includes(user.role)) fail(400, 'Choose an active admin. Create their admin login first under Admin Users.');
  if (await prisma.pwmMember.findUnique({ where: { userId } })) fail(409, 'That person already has People & Workforce access.');
  const m = await prisma.pwmMember.create({ data: { userId, role, jobTitle: str(b.jobTitle, 120), isMd: !!b.isMd && role === 'EXECUTIVE', canViewCompensation: !!b.canViewCompensation && role === 'HR_ADMIN', createdById: access(req).userId } });
  await pwmAudit(req, { action: 'MEMBER_ADDED', entity: 'PwmMember', entityId: m.id, after: { userId, name: user!.name, role } });
  return apiResponse.success(res, 'Access granted.', m, 201);
});

// PATCH /members/:id
export const updateMember = handle(async (req, res) => {
  const b = req.body ?? {};
  const cur = await prisma.pwmMember.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Team member not found.');
  const role = b.role !== undefined ? oneOf(b.role, ROLES, 'Role') : cur!.role;
  const data = {
    role, jobTitle: b.jobTitle !== undefined ? str(b.jobTitle, 120) : cur!.jobTitle,
    isMd: role === 'EXECUTIVE' ? (b.isMd !== undefined ? !!b.isMd : cur!.isMd) : false,
    canViewCompensation: role === 'HR_ADMIN' ? (b.canViewCompensation !== undefined ? !!b.canViewCompensation : cur!.canViewCompensation) : false,
  };
  const m = await prisma.pwmMember.update({ where: { id: cur!.id }, data });
  await pwmAudit(req, { action: 'MEMBER_UPDATED', entity: 'PwmMember', entityId: m.id, before: { role: cur!.role, isMd: cur!.isMd, canViewCompensation: cur!.canViewCompensation }, after: { role: m.role, isMd: m.isMd, canViewCompensation: m.canViewCompensation } });
  return apiResponse.success(res, 'Saved.', m);
});

export const setMemberActive = (active: boolean) => handle(async (req, res) => {
  const cur = await prisma.pwmMember.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Team member not found.');
  const m = await prisma.pwmMember.update({ where: { id: cur!.id }, data: { isActive: active, revokedAt: active ? null : new Date() } });
  await pwmAudit(req, { action: active ? 'MEMBER_RESTORED' : 'MEMBER_REVOKED', entity: 'PwmMember', entityId: m.id, reason: str(req.body?.reason, 300) ?? undefined });
  return apiResponse.success(res, active ? 'Access restored.' : 'Access revoked.', m);
});

// ── Settings ─────────────────────────────────────────────────────────────────

// GET /settings
export const readSettings = handle(async (_req, res) => apiResponse.success(res, 'Settings.', { ...(await getPwmConfig()), defaults: { tiers: DEFAULT_CONFIG.tiers } }));

const TIER_RECIPIENTS = ['HR_OFFICER', 'HR_ADMIN', 'DEPT_HEAD', 'MANAGEMENT', 'MD', 'SUPER_ADMIN', 'EMPLOYEE'];
const SEVERITIES = ['EARLY', 'ACTION', 'URGENT', 'CRITICAL'];

const cleanTiers = (v: unknown): ReminderTier[] => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 12) fail(400, 'Provide between 1 and 12 reminder tiers.');
  const seen = new Set<string>();
  return (v as Record<string, unknown>[]).map((t) => {
    const key = reqStr(t.key, 'Tier name', 12);
    if (seen.has(key)) fail(400, `Tier "${key}" appears twice.`);
    seen.add(key);
    const offsetDays = Number(t.offsetDays);
    if (!Number.isInteger(offsetDays) || offsetDays < -30 || offsetDays > 365) fail(400, `Tier ${key}: days before expiry must be a whole number between -30 and 365.`);
    const severity = oneOf(t.severity, SEVERITIES as ReminderTier['severity'][], `Tier ${key} severity`);
    const recipients = (Array.isArray(t.recipients) ? t.recipients : []).filter((r): r is ReminderTier['recipients'][number] => TIER_RECIPIENTS.includes(String(r)));
    if (!recipients.length) fail(400, `Tier ${key} needs at least one recipient role.`);
    const channels = (Array.isArray(t.channels) ? t.channels : []).filter((c): c is ReminderTier['channels'][number] => c === 'IN_APP' || c === 'EMAIL');
    if (!channels.length) fail(400, `Tier ${key} needs at least one channel.`);
    return { key, offsetDays, severity, recipients, channels, ...(t.digest ? { digest: true } : {}), ...(t.repeat ? { repeat: true } : {}), ...(t.deptHeadOnlyIfRecommendationOutstanding ? { deptHeadOnlyIfRecommendationOutstanding: true } : {}) };
  });
};

// PATCH /settings
export const updateSettings = handle(async (req, res) => {
  const b = req.body ?? {};
  const cur = await getPwmConfig();
  const next: PwmConfig = { ...cur };
  const num = (k: keyof PwmConfig, min: number, max: number, label: string) => {
    if (b[k] === undefined) return;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} must be a whole number between ${min} and ${max}.`);
    (next as unknown as Record<string, unknown>)[k] = n;
  };
  if (b.tiers !== undefined) next.tiers = cleanTiers(b.tiers);
  num('sendHour', 0, 23, 'Send hour'); num('ackEscalationHours', 1, 240, 'Acknowledgement window'); num('repeatEveryWorkingDays', 1, 10, 'Repeat interval');
  num('superAdminAfterWorkingDays', 1, 30, 'Super admin escalation'); num('probationReminderDays', 1, 90, 'Probation reminder'); num('certificationReminderDays', 1, 365, 'Certification reminder');
  num('documentReminderDays', 1, 365, 'Document reminder'); num('minWorkingAge', 14, 25, 'Minimum working age');
  if (b.holidays !== undefined) next.holidays = (Array.isArray(b.holidays) ? b.holidays : []).map(String).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 80);
  if (b.approvalRequiredTypes !== undefined) next.approvalRequiredTypes = (Array.isArray(b.approvalRequiredTypes) ? b.approvalRequiredTypes : []).map(String).filter((t: string) => cur.contractTypes.some((c) => c.key === t));
  if (b.locations !== undefined) next.locations = (Array.isArray(b.locations) ? b.locations : []).map((l: unknown) => String(l).trim()).filter(Boolean).slice(0, 60);
  num('warningValidityMonths', 1, 60, 'Warning validity'); num('surveyMinGroup', 3, 50, 'Survey group size');
  if (b.perDiemRate !== undefined) { const n = Number(b.perDiemRate); if (!(n >= 0 && n <= 10_000_000)) fail(400, 'Per-diem rate is not valid.'); next.perDiemRate = n; }
  if (b.expenseCategories !== undefined) next.expenseCategories = (Array.isArray(b.expenseCategories) ? b.expenseCategories : []).slice(0, 20).map((c: { key?: unknown; label?: unknown; limit?: unknown }) => ({ key: String(c.key ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 30), label: String(c.label ?? '').slice(0, 50), limit: Math.max(0, Number(c.limit) || 0) })).filter((c: { key: string; label: string }) => c.key && c.label);
  num('candidateRetentionDays', 30, 1825, 'Candidate retention'); num('preboardingDays', 1, 60, 'Pre-boarding link validity');
  if (b.companyName !== undefined) next.companyName = reqStr(b.companyName, 'Company name', 80);
  for (const k of ['directoryVisible', 'monthlyReportOn', 'vacancyApprovalRequired'] as const) if (b[k] !== undefined) next[k] = !!b[k];
  if (b.employeeRecipientOn !== undefined) next.employeeRecipientOn = !!b.employeeRecipientOn;
  if (b.allowSelfApproval !== undefined) next.allowSelfApproval = !!b.allowSelfApproval;
  if (b.employeeIdPrefix !== undefined) { const p = reqStr(b.employeeIdPrefix, 'Employee ID prefix', 8).toUpperCase(); if (!/^[A-Z0-9]{2,8}$/.test(p)) fail(400, 'Employee ID prefix must be 2 to 8 letters or digits.'); next.employeeIdPrefix = p; }
  if (b.contractRefPrefix !== undefined) { const p = reqStr(b.contractRefPrefix, 'Contract prefix', 8).toUpperCase(); if (!/^[A-Z0-9]{2,8}$/.test(p)) fail(400, 'Contract prefix must be 2 to 8 letters or digits.'); next.contractRefPrefix = p; }
  if (b.contractTypes !== undefined) {
    if (!Array.isArray(b.contractTypes) || !b.contractTypes.length) fail(400, 'Keep at least one contract type.');
    next.contractTypes = (b.contractTypes as Record<string, unknown>[]).map((t) => ({
      key: reqStr(t.key, 'Type key', 40).toUpperCase().replace(/[^A-Z0-9_]/g, '_'), label: reqStr(t.label, 'Type name', 60), expiryRequired: !!t.expiryRequired,
      ...(t.defaultMonths ? { defaultMonths: Math.min(120, Math.max(1, Number(t.defaultMonths) || 12)) } : {}), ...(t.probationMonths ? { probationMonths: Math.min(24, Math.max(1, Number(t.probationMonths) || 6)) } : {}),
      ...(t.concurrentAllowed ? { concurrentAllowed: true } : {}),
    }));
    next.employmentTypes = next.contractTypes.map((t) => t.key);
  }
  await prisma.pwmSettings.update({ where: { id: 'default' }, data: { config: next as unknown as Prisma.InputJsonValue, updatedById: access(req).userId } });
  const changed = (Object.keys(next) as (keyof PwmConfig)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
  await pwmAudit(req, { action: 'SETTINGS_CHANGED', entity: 'PwmSettings', entityId: 'default', before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])), meta: { changed } });
  return apiResponse.success(res, 'Settings saved.', next);
});

// ── Departments ──────────────────────────────────────────────────────────────

const CURRENT = ['PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'CONTRACT_EXPIRED'] as const;

// GET /departments
export const listDepartments = handle(async (_req, res) => {
  const depts = await prisma.pwmDepartment.findMany({
    where: { archivedAt: null }, orderBy: { name: 'asc' },
    include: { head: { select: { id: true, firstName: true, lastName: true, employeeNo: true, userId: true } }, _count: { select: { employees: { where: { status: { in: [...CURRENT] } } } } } },
  });
  return apiResponse.success(res, 'Departments.', depts.map((d) => ({ ...d, headcount: d._count.employees, _count: undefined })));
});

// POST /departments/seed: the default departments from the PRD (only adds missing ones).
export const seedDepartments = handle(async (req, res) => {
  const have = new Set((await prisma.pwmDepartment.findMany({ select: { name: true } })).map((d) => d.name));
  const missing = DEFAULT_DEPARTMENTS.filter((n) => !have.has(n));
  if (missing.length) await prisma.pwmDepartment.createMany({ data: missing.map((name) => ({ name, createdById: access(req).userId })) });
  await pwmAudit(req, { action: 'DEPARTMENTS_SEEDED', entity: 'PwmDepartment', entityId: 'seed', after: { added: missing } });
  return apiResponse.success(res, missing.length ? `${missing.length} departments added.` : 'All default departments already exist.', { added: missing });
});

const deptData = async (b: Record<string, unknown>, partial = false) => {
  const data: Prisma.PwmDepartmentUncheckedUpdateInput = {};
  if (!partial || b.name !== undefined) data.name = reqStr(b.name, 'Department name', 120);
  if (b.code !== undefined) data.code = str(b.code, 20);
  if (b.parentId !== undefined) {
    const pid = str(b.parentId, 60);
    if (pid && !(await prisma.pwmDepartment.findFirst({ where: { id: pid, archivedAt: null }, select: { id: true } }))) fail(400, 'Parent department not found.');
    data.parentId = pid;
  }
  if (b.headEmployeeId !== undefined) {
    const hid = str(b.headEmployeeId, 60);
    if (hid && !(await prisma.pwmEmployee.findFirst({ where: { id: hid, archivedAt: null }, select: { id: true } }))) fail(400, 'Department head not found among employees.');
    data.headEmployeeId = hid;
  }
  return data;
};

// POST /departments
export const createDepartment = handle(async (req, res) => {
  const data = await deptData(req.body ?? {});
  if (await prisma.pwmDepartment.findUnique({ where: { name: data.name as string } })) fail(409, 'A department with that name already exists.');
  const d = await prisma.pwmDepartment.create({ data: { ...(data as Prisma.PwmDepartmentUncheckedCreateInput), createdById: access(req).userId } });
  await pwmAudit(req, { action: 'DEPARTMENT_CREATED', entity: 'PwmDepartment', entityId: d.id, after: d });
  return apiResponse.success(res, 'Department created.', d, 201);
});

// PATCH /departments/:id
export const updateDepartment = handle(async (req, res) => {
  const cur = await prisma.pwmDepartment.findFirst({ where: { id: req.params.id, archivedAt: null } });
  if (!cur) fail(404, 'Department not found.');
  const data = await deptData(req.body ?? {}, true);
  if (data.parentId === cur!.id) fail(400, 'A department cannot sit under itself.');
  const d = await prisma.pwmDepartment.update({ where: { id: cur!.id }, data });
  await pwmAudit(req, { action: data.headEmployeeId !== undefined && data.headEmployeeId !== cur!.headEmployeeId ? 'DEPARTMENT_HEAD_CHANGED' : 'DEPARTMENT_UPDATED', entity: 'PwmDepartment', entityId: d.id, before: cur, after: d });
  return apiResponse.success(res, 'Saved.', d);
});

// POST /departments/:id/archive
export const archiveDepartment = handle(async (req, res) => {
  const cur = await prisma.pwmDepartment.findFirst({ where: { id: req.params.id, archivedAt: null } });
  if (!cur) fail(404, 'Department not found.');
  const n = await prisma.pwmEmployee.count({ where: { departmentId: cur!.id, status: { in: [...CURRENT, 'PENDING_ONBOARDING'] } } });
  if (n > 0) fail(409, `${n} current employees are still in this department. Move them first.`);
  await prisma.pwmDepartment.update({ where: { id: cur!.id }, data: { archivedAt: new Date(), isActive: false } });
  await pwmAudit(req, { action: 'DEPARTMENT_ARCHIVED', entity: 'PwmDepartment', entityId: cur!.id, before: cur });
  return apiResponse.success(res, 'Department archived.', null);
});
