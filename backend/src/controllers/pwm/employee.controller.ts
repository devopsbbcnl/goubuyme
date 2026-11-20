// PWM: employee registry, restricted fields, status workflow, documents, timeline, export and bulk import.
import { Prisma, PwmEmploymentStatus } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { encryptSecret } from '../../utils/crypto';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextContractRef, nextEmployeeNo } from '../../services/pwm/settings';
import {
  CURRENT_STATUSES, STATUS_LABEL, addDays, addMonths, allowedNextStatuses, can, checkTransition, dateOnly, fromYmd, fullName, isNin, lagosYmd,
  normalisePhone, validateContractDates, workingDaysBetween, daysBetween,
} from '../../services/pwm/rules';
import {
  SENSITIVE_KEYS, ENCRYPTED_KEYS, approverUserIds, canSeeEmployee, commitStatus, employeeScope, hrAdminUserIds, managementUserIds, revealField, shapeEmployee, startChecklist,
} from '../../services/pwm/people';
import { access, csvCell, email, fail, handle, int, nameMap, oneOf, page, reqStr, reqYmd, str, ymd } from './common';

const ENCRYPTED_INPUT = ['nin', 'tin', 'rsaPin', 'nhfNo', 'bankAccountNo'] as const;
const WORK_ARRANGEMENTS = ['ON_SITE', 'REMOTE', 'HYBRID'] as const;

const brief = {
  id: true, employeeNo: true, title: true, firstName: true, middleName: true, lastName: true, knownAs: true, photoUrl: true, workEmail: true, jobTitle: true,
  employmentType: true, status: true, hireDate: true, location: true, workArrangement: true, departmentId: true, managerId: true, probationEndDate: true,
  hrOfficerUserId: true, userId: true, archivedAt: true,
} satisfies Prisma.PwmEmployeeSelect;

const textList = (v: unknown, max = 10): unknown[] | null => (Array.isArray(v) ? v.slice(0, max).map((x) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, val]) => [k, typeof val === 'string' ? val.slice(0, 300) : val])) : x)) : null);

// ── List ─────────────────────────────────────────────────────────────────────

const listWhere = (a: ReturnType<typeof access>, q: Record<string, string>): Prisma.PwmEmployeeWhereInput => {
  const and: Prisma.PwmEmployeeWhereInput[] = [employeeScope(a)];
  if (q.q) {
    const term = q.q.trim();
    and.push({ OR: [
      { firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { employeeNo: { contains: term, mode: 'insensitive' } },
      { workEmail: { contains: term, mode: 'insensitive' } }, { jobTitle: { contains: term, mode: 'insensitive' } },
    ] });
  }
  if (q.status === 'current') and.push({ status: { in: [...CURRENT_STATUSES] } });
  else if (q.status === 'former') and.push({ status: { in: ['RESIGNED', 'TERMINATED', 'ARCHIVED'] } });
  else if (q.status) and.push({ status: q.status as PwmEmploymentStatus });
  else and.push({ status: { not: 'ARCHIVED' } });
  if (q.departmentId) and.push({ departmentId: q.departmentId });
  if (q.employmentType) and.push({ employmentType: q.employmentType });
  if (q.managerId) and.push({ managerId: q.managerId });
  return { AND: and };
};

const withContract = { contracts: { where: { status: { in: ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED', 'SIGNED', 'ISSUED'] as never[] }, archivedAt: null }, orderBy: { commencementDate: 'desc' as const }, take: 1, select: { id: true, reference: true, status: true, expiryDate: true, contractType: true } } };

// GET /employees
export const listEmployees = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const { page: p, limit, skip } = page(q);
  const where = listWhere(a, q);
  const [rows, total] = await Promise.all([
    prisma.pwmEmployee.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip, take: limit, select: { ...brief, department: { select: { id: true, name: true } }, manager: { select: { id: true, firstName: true, lastName: true } }, ...withContract } }),
    prisma.pwmEmployee.count({ where }),
  ]);
  const today = lagosYmd(new Date());
  const data = rows.map((e) => {
    const c = e.contracts[0] ?? null;
    return { ...e, contracts: undefined, contract: c ? { ...c, daysRemaining: c.expiryDate ? daysBetween(today, dateOnly(c.expiryDate)) : null } : null };
  });
  return apiResponse.paginated(res, 'Employees.', data, { page: p, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /employees/lookup?q= : small picker (managers, department heads)
export const lookupEmployees = handle(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const rows = await prisma.pwmEmployee.findMany({
    where: { archivedAt: null, status: { in: [...CURRENT_STATUSES, 'PENDING_ONBOARDING'] }, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { employeeNo: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { lastName: 'asc' }, take: 30, select: { id: true, employeeNo: true, firstName: true, lastName: true, jobTitle: true },
  });
  return apiResponse.success(res, 'Employees.', rows);
});

// ── Detail ───────────────────────────────────────────────────────────────────

// GET /employees/:id
export const getEmployee = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({
    where: { id: req.params.id },
    include: {
      department: { select: { id: true, name: true } }, manager: { select: { id: true, firstName: true, lastName: true, employeeNo: true } },
      contracts: { orderBy: { commencementDate: 'asc' }, include: { amendments: { orderBy: { effectiveDate: 'asc' } } } },
      documents: { where: { archivedAt: null }, orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }] },
      statusLog: { orderBy: { createdAt: 'desc' }, take: 50 },
      checklists: { orderBy: { createdAt: 'desc' }, include: { tasks: { select: { status: true, mandatory: true } } } },
    },
  });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const emp = e!;
  const restricted = can(a, 'viewRestricted') || a.employeeId === emp.id;
  const people = await nameMap([...emp.statusLog.flatMap((s) => [s.requestedById, s.approvedById]), emp.hrOfficerUserId]);

  const [lastEdit, hrOfficerName] = await Promise.all([
    prisma.auditLog.findFirst({ where: { entity: 'PwmEmployee', entityId: emp.id, action: { in: ['EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'STATUS_CHANGED'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, userId: true, actorType: true, action: true } }),
    Promise.resolve(emp.hrOfficerUserId ? people.get(emp.hrOfficerUserId) ?? null : null),
  ]);
  const editor = lastEdit?.userId ? (await nameMap([lastEdit.userId])).get(lastEdit.userId) ?? null : lastEdit ? 'System' : null;

  let compensation: unknown = null;
  if (can(a, 'viewCompensation')) {
    compensation = await prisma.pwmCompensation.findMany({ where: { employeeId: emp.id }, orderBy: { effectiveFrom: 'desc' } });
    await pwmAudit(req, { action: 'COMPENSATION_VIEWED', entity: 'PwmEmployee', entityId: emp.id });
  }

  const { contracts, documents, statusLog, checklists, ...rest } = emp;
  const today = lagosYmd(new Date());
  const shaped = shapeEmployee(rest as unknown as Record<string, unknown>, a);
  return apiResponse.success(res, 'Employee.', {
    ...shaped, fullName: fullName(emp), hrOfficerName,
    contracts: contracts.map((c) => ({ ...c, daysRemaining: c.expiryDate && ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'].includes(c.status) ? daysBetween(today, dateOnly(c.expiryDate)) : null })),
    documents: documents.filter((d) => !d.restricted || restricted),
    statusLog: statusLog.map((s) => ({ ...s, requestedByName: s.requestedById ? people.get(s.requestedById) ?? null : s.bySystem ? 'System' : null, approvedByName: s.approvedById ? people.get(s.approvedById) ?? null : null })),
    checklists: checklists.map((c) => ({ id: c.id, kind: c.kind, status: c.status, startDate: c.startDate, total: c.tasks.length, done: c.tasks.filter((t) => t.status === 'DONE' || t.status === 'SKIPPED').length })),
    compensation,
    allowedStatuses: allowedNextStatuses(emp.status).map((s) => ({ status: s, label: STATUS_LABEL[s], approver: checkTransition(emp.status, s).approver })),
    lastUpdated: lastEdit ? { at: lastEdit.createdAt, by: editor, action: lastEdit.action } : null,
    permissions: { edit: can(a, 'manageEmployees'), reveal: can(a, 'viewHighlyRestricted'), compensation: can(a, 'viewCompensation') },
  });
});

// ── Create / update ──────────────────────────────────────────────────────────

const personFields = async (b: Record<string, unknown>, partial: boolean) => {
  const cfg = await getPwmConfig();
  const data: Prisma.PwmEmployeeUncheckedUpdateInput = {};
  const need = (k: string, label: string, max = 120) => { if (!partial || b[k] !== undefined) (data as Record<string, unknown>)[k] = reqStr(b[k], label, max); };
  need('firstName', 'First name', 80); need('lastName', 'Last name', 80); need('jobTitle', 'Job title');
  if (!partial || b.employmentType !== undefined) data.employmentType = oneOf(b.employmentType, cfg.employmentTypes, 'Employment type');
  for (const k of ['title', 'middleName', 'knownAs', 'sex', 'maritalStatus', 'nationality', 'stateOfOrigin', 'address', 'grade', 'location', 'costCentre', 'pfaName', 'bankName', 'bankAccountName', 'companyEntity', 'photoUrl'] as const) {
    if (b[k] !== undefined) (data as Record<string, unknown>)[k] = str(b[k], k === 'address' ? 400 : 160);
  }
  if (b.workEmail !== undefined) data.workEmail = email(b.workEmail, 'Work email');
  if (b.personalEmail !== undefined) data.personalEmail = email(b.personalEmail, 'Personal email');
  if (b.phone !== undefined) {
    const raw = str(b.phone, 40);
    if (raw) { const p = normalisePhone(raw); if (!p) fail(400, 'Phone number is not valid. Use 0803... or +234...'); data.phone = p; } else data.phone = null;
  }
  if (b.workArrangement !== undefined) data.workArrangement = oneOf(b.workArrangement, WORK_ARRANGEMENTS, 'Work arrangement');
  if (b.dateOfBirth !== undefined) {
    const dob = ymd(b.dateOfBirth, 'Date of birth');
    if (dob) {
      const age = (Date.now() - new Date(`${dob}T00:00:00Z`).getTime()) / (365.25 * 86_400_000);
      if (age < cfg.minWorkingAge) fail(400, `Date of birth gives an age below the minimum working age of ${cfg.minWorkingAge}.`);
    }
    data.dateOfBirth = dob ? fromYmd(dob) : null;
  }
  if (!partial || b.hireDate !== undefined) data.hireDate = fromYmd(reqYmd(b.hireDate, 'Date of employment'));
  for (const k of ['originalHireDate', 'probationEndDate'] as const) if (b[k] !== undefined) { const d = ymd(b[k], k); (data as Record<string, unknown>)[k] = d ? fromYmd(d) : null; }
  if (b.emergencyContacts !== undefined) data.emergencyContacts = (textList(b.emergencyContacts) ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  if (b.nextOfKin !== undefined) data.nextOfKin = (textList(b.nextOfKin, 3) ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  if (b.guarantors !== undefined) data.guarantors = (textList(b.guarantors, 4) ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  for (const k of ENCRYPTED_INPUT) {
    if (b[k] === undefined) continue;
    const v = str(b[k], 40);
    if (v && k === 'nin' && !isNin(v)) fail(400, 'NIN must be 11 digits.');
    (data as Record<string, unknown>)[k] = v ? encryptSecret(v) : null;
  }
  if (b.departmentId !== undefined) {
    const id = str(b.departmentId, 60);
    if (id && !(await prisma.pwmDepartment.findFirst({ where: { id, archivedAt: null }, select: { id: true } }))) fail(400, 'Department not found.');
    data.departmentId = id;
  }
  if (b.hrOfficerUserId !== undefined) data.hrOfficerUserId = str(b.hrOfficerUserId, 60);
  if (b.userId !== undefined) {
    const uid = str(b.userId, 60);
    if (uid) {
      const taken = await prisma.pwmEmployee.findFirst({ where: { userId: uid, id: { not: String(b.__self ?? '') } }, select: { employeeNo: true } });
      if (taken) fail(409, `That login is already linked to ${taken.employeeNo}.`);
      if (!(await prisma.user.findUnique({ where: { id: uid }, select: { id: true } }))) fail(400, 'Login not found.');
    }
    data.userId = uid;
  }
  return data;
};

const checkManager = async (employeeId: string | null, managerId: string | null) => {
  if (!managerId) return;
  if (managerId === employeeId) fail(400, 'An employee cannot report to themselves.');
  if (!(await prisma.pwmEmployee.findFirst({ where: { id: managerId, archivedAt: null }, select: { id: true } }))) fail(400, 'Reporting manager not found.');
  // Walk up the chain to refuse a cycle.
  let cursor: string | null = managerId; let depth = 0;
  while (cursor && depth++ < 30) {
    if (cursor === employeeId) fail(400, 'That manager already reports (directly or indirectly) to this employee.');
    cursor = (await prisma.pwmEmployee.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null;
  }
};

const findDuplicates = async (d: { firstName: string; lastName: string; dateOfBirth?: Date | null; workEmail?: string | null; nin?: string | null }, excludeId?: string) => {
  const or: Prisma.PwmEmployeeWhereInput[] = [];
  if (d.workEmail) or.push({ workEmail: d.workEmail });
  if (d.dateOfBirth) or.push({ firstName: { equals: d.firstName, mode: 'insensitive' }, lastName: { equals: d.lastName, mode: 'insensitive' }, dateOfBirth: d.dateOfBirth });
  if (!d.dateOfBirth) or.push({ firstName: { equals: d.firstName, mode: 'insensitive' }, lastName: { equals: d.lastName, mode: 'insensitive' } });
  return prisma.pwmEmployee.findMany({ where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, employeeNo: true, firstName: true, lastName: true, status: true, workEmail: true }, take: 5 });
};

// POST /employees
export const createEmployee = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cfg = await getPwmConfig();
  const data = await personFields(b, false);
  if (!data.personalEmail && !b.allowMissingContact) fail(400, 'Personal email is required.');
  if (!data.phone && !b.allowMissingContact) fail(400, 'Phone number is required.');
  if (!data.departmentId) fail(400, 'Department is required.');
  const managerId = str(b.managerId, 60);
  await checkManager(null, managerId);

  const dups = await findDuplicates({ firstName: data.firstName as string, lastName: data.lastName as string, dateOfBirth: (data.dateOfBirth as Date | null) ?? null, workEmail: (data.workEmail as string | null) ?? null });
  if (dups.length && !b.confirmNotDuplicate) return apiResponse.error(res, 'Someone with the same name or work email is already on record. Check before creating a second record.', 409, dups);

  const startStatus = b.startStatus === undefined ? 'PENDING_ONBOARDING' : oneOf(b.startStatus, ['PENDING_ONBOARDING', 'PROBATION', 'ACTIVE'] as const, 'Starting status');
  const hire = dateOnly(data.hireDate as Date);
  const emp = await prisma.$transaction(async (tx) => {
    const employeeNo = await nextEmployeeNo(cfg.employeeIdPrefix, Number(hire.slice(0, 4)));
    const e = await tx.pwmEmployee.create({
      data: { ...(data as Prisma.PwmEmployeeUncheckedCreateInput), managerId, employeeNo, status: startStatus, originalHireDate: (data.originalHireDate as Date | undefined) ?? (data.hireDate as Date), createdById: a.userId },
      select: { id: true, employeeNo: true, departmentId: true },
    });
    await pwmAudit(req, { action: 'EMPLOYEE_CREATED', entity: 'PwmEmployee', entityId: e.id, after: { employeeNo: e.employeeNo, status: startStatus, hireDate: hire } }, tx);
    return e;
  });
  // ONB-01: onboarding starts by itself for a new hire; ONB-10: tell the department head.
  if (startStatus === 'PENDING_ONBOARDING') {
    await startChecklist(emp.id, 'ONBOARDING', hire, a.userId).catch(() => undefined);
    const head = emp.departmentId ? await prisma.pwmDepartment.findUnique({ where: { id: emp.departmentId }, select: { head: { select: { userId: true } } } }) : null;
    const { notifyPwm } = await import('../../services/pwm/notify');
    await notifyPwm([head?.head?.userId], { title: `New joiner in your department: ${fullName(data as { firstName: string; lastName: string })}`, body: `${emp.employeeNo} starts on ${hire}. Onboarding tasks have been created, including your department induction.`, link: `/pwm/employees/${emp.id}` });
  }
  return apiResponse.success(res, 'Employee created.', emp, 201);
});

// PATCH /employees/:id
export const updateEmployee = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cur = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id } });
  if (!cur || !canSeeEmployee(a, cur)) fail(404, 'Employee not found.');
  const c = cur!;
  if (c.archivedAt) fail(409, 'An archived record is read-only.');
  if (b.version !== undefined && Number(b.version) !== c.version) fail(409, 'Someone else changed this record while you were editing. Reload and try again.');
  const data = await personFields({ ...b, __self: c.id }, true);
  if (b.managerId !== undefined) { const m = str(b.managerId, 60); await checkManager(c.id, m); data.managerId = m; }
  if (data.workEmail && (await prisma.pwmEmployee.findFirst({ where: { workEmail: data.workEmail as string, id: { not: c.id } }, select: { id: true } }))) fail(409, 'That work email belongs to another employee.');

  const plainChanges: Record<string, { from: unknown; to: unknown }> = {};
  const sensitiveChanged: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if ((ENCRYPTED_KEYS as readonly string[]).includes(k)) { if (v !== (c as Record<string, unknown>)[k]) sensitiveChanged.push(k); continue; }
    const before = (c as Record<string, unknown>)[k];
    if (JSON.stringify(before) !== JSON.stringify(v)) plainChanges[k] = { from: before, to: v };
  }
  const e = await prisma.pwmEmployee.update({ where: { id: c.id }, data: { ...data, version: { increment: 1 } }, select: { id: true, version: true } });
  // Sensitive values never enter the log, only the fact that they changed.
  await pwmAudit(req, { action: 'EMPLOYEE_UPDATED', entity: 'PwmEmployee', entityId: c.id, before: Object.fromEntries(Object.entries(plainChanges).map(([k, v]) => [k, v.from])), after: Object.fromEntries(Object.entries(plainChanges).map(([k, v]) => [k, v.to])), meta: { sensitiveFieldsChanged: sensitiveChanged } });
  return apiResponse.success(res, 'Saved.', e);
});

// POST /employees/:id/reveal { field, reason }: the real value of one highly restricted field, logged.
export const revealSensitive = handle(async (req, res) => {
  const a = access(req);
  const field = oneOf(req.body?.field, [...SENSITIVE_KEYS, 'bankName', 'bankAccountName'] as const, 'Field');
  const reason = reqStr(req.body?.reason, 'Reason', 300);
  if (reason.length < 8) fail(400, 'Give a reason of at least a few words. It is recorded.');
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const isOwn = a.employeeId === e!.id;
  if (!can(a, 'viewHighlyRestricted') && !isOwn) fail(403, 'Forbidden. Insufficient permissions.');
  // Finance sees only bank and statutory numbers; the rest stays with HR.
  if (a.level === 'FINANCE' && field === 'nin') fail(403, 'Finance can view bank and statutory fields only.');
  const stored = (e as Record<string, unknown>)[field] as string | null;
  const value = ['bankName', 'bankAccountName'].includes(field) ? stored : revealField(stored);
  await pwmAudit(req, { action: 'SENSITIVE_REVEALED', entity: 'PwmEmployee', entityId: e!.id, reason, meta: { field } });
  return apiResponse.success(res, 'Revealed.', { field, value });
});

// ── Status workflow ──────────────────────────────────────────────────────────

const EXIT_TYPES = ['RESIGNATION', 'TERMINATION', 'NON_RENEWAL', 'RETIREMENT', 'END_OF_PROBATION', 'OTHER'] as const;

/** Who may apply a given kind of approval step on their own authority. */
const mayApply = (a: ReturnType<typeof access>, approver: string | undefined): boolean => {
  const hr = a.level === 'HR_ADMIN' || a.level === 'HR_OFFICER';
  switch (approver) {
    case 'NONE': return can(a, 'changeStatus') && a.level !== 'DEPARTMENT_HEAD';
    case 'HR': return a.level === 'SUPER' || hr;
    case 'HR_ADMIN': return a.level === 'SUPER' || a.level === 'HR_ADMIN';
    case 'MANAGEMENT': return can(a, 'approveStatus');
    default: return false;
  }
};

// POST /employees/:id/status { to, effectiveDate, reason, exitType, finalWorkingDay, rehireEligible }
export const changeStatus = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cfg = await getPwmConfig();
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, departmentId: true, employeeNo: true, firstName: true, lastName: true } });
  if (!emp || !canSeeEmployee(a, emp)) fail(404, 'Employee not found.');
  const e = emp!;
  const to = oneOf(b.to, Object.keys(STATUS_LABEL) as PwmEmploymentStatus[], 'New status');
  const reason = reqStr(b.reason, 'Reason', 500);
  const effective = ymd(b.effectiveDate, 'Effective date') ?? lagosYmd(new Date());
  const check = checkTransition(e.status, to);
  if (!check.ok) fail(409, check.reason ?? 'That status change is not allowed.');
  const exiting = to === 'RESIGNED' || to === 'TERMINATED' || to === 'NOTICE_PERIOD';
  const exitType = exiting ? oneOf(b.exitType ?? (to === 'RESIGNED' ? 'RESIGNATION' : to === 'TERMINATED' ? 'TERMINATION' : 'OTHER'), EXIT_TYPES, 'Exit type') : null;
  const finalWorkingDay = exiting ? ymd(b.finalWorkingDay, 'Final working day') : null;
  const rehireEligible = typeof b.rehireEligible === 'boolean' ? b.rehireEligible : undefined;

  // Suspensions and terminations need a second person unless this team has switched self-approval on.
  const direct = check.approver === 'MANAGEMENT' ? can(a, 'approveStatus') && cfg.allowSelfApproval : mayApply(a, check.approver);
  const future = effective > lagosYmd(new Date());

  // Needs someone else: record a request and tell the people who can decide.
  if (!direct) {
    const row = await prisma.pwmStatusChange.create({ data: { employeeId: e.id, fromStatus: e.status, toStatus: to, effectiveDate: fromYmd(effective), reason, requestedById: a.userId, approvalStatus: 'PENDING' } });
    await pwmAudit(req, { action: 'STATUS_REQUESTED', entity: 'PwmEmployee', entityId: e.id, before: { status: e.status }, after: { status: to }, reason, meta: { effectiveDate: effective, requestId: row.id, exitType, finalWorkingDay, rehireEligible, approver: check.approver } });
    const deciders = check.approver === 'MANAGEMENT' ? await approverUserIds() : await hrAdminUserIds();
    const { notifyPwm } = await import('../../services/pwm/notify');
    await notifyPwm(deciders.filter((id) => id !== a.userId), { title: `Status change awaiting approval: ${fullName(e)} (${e.employeeNo})`, body: `${STATUS_LABEL[e.status]} to ${STATUS_LABEL[to]}, effective ${effective}. Reason: ${reason}`, link: '/pwm/approvals' });
    return apiResponse.success(res, 'Sent for approval.', { requestId: row.id, pending: true }, 202);
  }

  if (future) {
    const row = await prisma.pwmStatusChange.create({ data: { employeeId: e.id, fromStatus: e.status, toStatus: to, effectiveDate: fromYmd(effective), reason, requestedById: a.userId, approvalStatus: 'NOT_REQUIRED' } });
    await pwmAudit(req, { action: 'STATUS_SCHEDULED', entity: 'PwmEmployee', entityId: e.id, before: { status: e.status }, after: { status: to }, reason, meta: { effectiveDate: effective, requestId: row.id, exitType, finalWorkingDay, rehireEligible } });
    return apiResponse.success(res, `Scheduled for ${effective}.`, { requestId: row.id, scheduled: true }, 202);
  }
  const r = await commitStatus({ employeeId: e.id, to, reason, effectiveDate: effective, requestedById: a.userId, approvedById: check.approver === 'MANAGEMENT' ? a.userId : null, exitType, finalWorkingDay, rehireEligible, exitReason: exiting ? reason : undefined }, req);
  if (!r.ok) fail(409, r.reason ?? 'Could not change status.');
  return apiResponse.success(res, `Status is now ${STATUS_LABEL[to]}.`, { status: to });
});

// GET /status-requests?view=pending
export const listStatusRequests = handle(async (req, res) => {
  const a = access(req);
  const rows = await prisma.pwmStatusChange.findMany({
    where: { approvalStatus: 'PENDING', employee: employeeScope(a) }, orderBy: { createdAt: 'asc' }, take: 100,
    include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, jobTitle: true, department: { select: { name: true } } } } },
  });
  const names = await nameMap(rows.map((r) => r.requestedById));
  return apiResponse.success(res, 'Requests.', rows.map((r) => ({
    ...r, requestedByName: r.requestedById ? names.get(r.requestedById) ?? null : null,
    approver: checkTransition(r.fromStatus, r.toStatus).approver,
    canDecide: mayApply(a, checkTransition(r.fromStatus, r.toStatus).approver) && (r.requestedById !== a.userId),
  })));
});

// POST /status-requests/:id/decide { approve, note }
export const decideStatusRequest = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const row = await prisma.pwmStatusChange.findUnique({ where: { id: req.params.id }, include: { employee: { select: { id: true, status: true, employeeNo: true, firstName: true, lastName: true, departmentId: true } } } });
  if (!row || row.approvalStatus !== 'PENDING') fail(404, 'No pending request found.');
  const r = row!;
  const approver = checkTransition(r.fromStatus, r.toStatus).approver;
  if (!mayApply(a, approver)) fail(403, 'Forbidden. Insufficient permissions.');
  if (r.requestedById === a.userId && !cfg.allowSelfApproval) fail(403, 'You cannot approve your own request.');
  const approve = req.body?.approve === true;
  const note = str(req.body?.note, 500);
  if (!approve && !note) fail(400, 'Say why the request is being declined.');

  if (!approve) {
    await prisma.pwmStatusChange.update({ where: { id: r.id }, data: { approvalStatus: 'REJECTED', approvedById: a.userId, approvedAt: new Date(), decisionNote: note } });
    await pwmAudit(req, { action: 'STATUS_REQUEST_DECLINED', entity: 'PwmEmployee', entityId: r.employeeId, reason: note ?? undefined, meta: { requestId: r.id, to: r.toStatus } });
    return apiResponse.success(res, 'Request declined.', null);
  }
  if (r.employee.status !== r.fromStatus) fail(409, 'The employee has changed status since this was requested. Decline it and raise a new request.');
  const effective = dateOnly(r.effectiveDate);
  await prisma.pwmStatusChange.update({ where: { id: r.id }, data: { approvalStatus: 'APPROVED', approvedById: a.userId, approvedAt: new Date(), decisionNote: note } });
  if (effective > lagosYmd(new Date())) {
    await pwmAudit(req, { action: 'STATUS_REQUEST_APPROVED', entity: 'PwmEmployee', entityId: r.employeeId, reason: note ?? undefined, meta: { requestId: r.id, scheduledFor: effective } });
    return apiResponse.success(res, `Approved. It takes effect on ${effective}.`, null);
  }
  const done = await commitStatus({ existingChangeId: r.id, employeeId: r.employeeId, to: r.toStatus, reason: r.reason, effectiveDate: effective, requestedById: r.requestedById, approvedById: a.userId, exitReason: r.reason }, req);
  if (!done.ok) fail(409, done.reason ?? 'Could not apply the change.');
  await pwmAudit(req, { action: 'STATUS_REQUEST_APPROVED', entity: 'PwmEmployee', entityId: r.employeeId, reason: note ?? undefined, meta: { requestId: r.id } });
  return apiResponse.success(res, 'Approved and applied.', null);
});

// POST /employees/:id/rehire { hireDate, jobTitle, departmentId, employmentType, overrideReason }
export const rehire = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id } });
  if (!e) fail(404, 'Employee not found.');
  const emp = e!;
  if (emp.status !== 'ARCHIVED') fail(409, 'Only an archived employee can be rehired.');
  if (emp.rehireEligible === false && !str(b.overrideReason, 300)) fail(409, 'This person was marked not eligible for rehire. Give an override reason to continue.');
  const hire = reqYmd(b.hireDate, 'New employment date');
  const data = await personFields({ jobTitle: b.jobTitle ?? emp.jobTitle, employmentType: b.employmentType ?? emp.employmentType, departmentId: b.departmentId ?? emp.departmentId, hireDate: hire, firstName: emp.firstName, lastName: emp.lastName }, true);
  await prisma.pwmEmployee.update({
    where: { id: emp.id },
    data: { jobTitle: data.jobTitle as string, employmentType: data.employmentType as string, departmentId: (data.departmentId as string | null) ?? emp.departmentId, hireDate: fromYmd(hire), status: 'PENDING_ONBOARDING', archivedAt: null, exitDate: null, exitType: null, exitReason: null, finalWorkingDay: null, probationEndDate: null, confirmationDate: null, employmentEpisode: { increment: 1 }, version: { increment: 1 } },
  });
  await prisma.pwmStatusChange.create({ data: { employeeId: emp.id, fromStatus: 'ARCHIVED', toStatus: 'PENDING_ONBOARDING', effectiveDate: fromYmd(hire), reason: 'Rehire', requestedById: a.userId, appliedAt: new Date() } });
  await pwmAudit(req, { action: 'EMPLOYEE_REHIRED', entity: 'PwmEmployee', entityId: emp.id, reason: str(b.overrideReason, 300) ?? 'Rehire', after: { episode: emp.employmentEpisode + 1, hireDate: hire } });
  await startChecklist(emp.id, 'ONBOARDING', hire, a.userId).catch(() => undefined);
  return apiResponse.success(res, 'Rehired. A new onboarding checklist has been started.', { id: emp.id });
});

// ── Documents and certifications ─────────────────────────────────────────────

const DOC_CATEGORIES = ['Identification', 'Contract', 'Offer/Appointment', 'Qualification', 'Certification', 'Guarantor', 'Medical', 'Disciplinary', 'Exit', 'Other'];

// POST /employees/:id/documents
export const addDocument = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const url = reqStr(b.url, 'File link', 1000);
  if (!/^https:\/\/\S+$/i.test(url)) fail(400, 'File link must be a secure (https) link from the upload.');
  const kind = oneOf(b.kind ?? 'DOCUMENT', ['DOCUMENT', 'CERTIFICATION'] as const, 'Kind');
  const category = kind === 'CERTIFICATION' ? 'Certification' : oneOf(b.category ?? 'Other', DOC_CATEGORIES, 'Category');
  const name = reqStr(b.name, 'Name', 200);
  const prev = await prisma.pwmDocument.findFirst({ where: { employeeId: e!.id, category, name, contractId: null }, orderBy: { version: 'desc' }, select: { version: true } });
  const restricted = ['Medical', 'Disciplinary', 'Identification', 'Guarantor'].includes(category) || !!b.restricted;
  const issue = ymd(b.issueDate, 'Issue date'); const expiry = ymd(b.expiryDate, 'Expiry date');
  if (issue && expiry && expiry < issue) fail(400, 'Expiry date is before the issue date.');
  const d = await prisma.pwmDocument.create({
    data: { employeeId: e!.id, kind, category, name, issuer: str(b.issuer, 160), number: str(b.number, 80), issueDate: issue ? fromYmd(issue) : null, expiryDate: expiry ? fromYmd(expiry) : null, url, checksum: str(b.checksum, 100), restricted, version: (prev?.version ?? 0) + 1, uploadedById: a.userId },
  });
  await pwmAudit(req, { action: kind === 'CERTIFICATION' ? 'CERTIFICATION_ADDED' : 'DOCUMENT_ADDED', entity: 'PwmEmployee', entityId: e!.id, after: { name, category, version: d.version, expiryDate: expiry, restricted } });
  return apiResponse.success(res, 'Saved.', d, 201);
});

// POST /documents/:id/archive
export const archiveDocument = handle(async (req, res) => {
  const d = await prisma.pwmDocument.findUnique({ where: { id: req.params.id } });
  if (!d || d.archivedAt) fail(404, 'Document not found.');
  await prisma.pwmDocument.update({ where: { id: d!.id }, data: { archivedAt: new Date() } });
  await pwmAudit(req, { action: 'DOCUMENT_ARCHIVED', entity: 'PwmEmployee', entityId: d!.employeeId, reason: str(req.body?.reason, 300) ?? undefined, before: { name: d!.name, version: d!.version } });
  return apiResponse.success(res, 'Archived. The history is kept.', null);
});

// GET /expiring-documents?days=30
export const expiringDocuments = handle(async (req, res) => {
  const a = access(req);
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
  const horizon = fromYmd(addDays(lagosYmd(new Date()), days));
  const rows = await prisma.pwmDocument.findMany({
    where: { expiryDate: { not: null, lte: horizon }, archivedAt: null, employee: { AND: [employeeScope(a), { status: { in: [...CURRENT_STATUSES] } }] } },
    orderBy: { expiryDate: 'asc' }, take: 200,
    include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
  });
  const restricted = can(a, 'viewRestricted');
  const today = lagosYmd(new Date());
  return apiResponse.success(res, 'Expiring documents.', rows.filter((d) => !d.restricted || restricted).map((d) => ({ ...d, url: undefined, daysRemaining: daysBetween(today, dateOnly(d.expiryDate as Date)) })));
});

// ── Timeline ─────────────────────────────────────────────────────────────────

// GET /employees/:id/timeline
export const timeline = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true, contracts: { select: { id: true } } } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const ids = [e!.id, ...e!.contracts.map((c) => c.id)];
  const rows = await prisma.auditLog.findMany({ where: { entity: { startsWith: 'Pwm' }, entityId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const names = await nameMap(rows.map((r) => r.userId));
  // Reveals and pay views are about who looked, so they stay with those allowed to audit.
  const hidden = can(a, 'viewAudit') ? [] : ['SENSITIVE_REVEALED', 'COMPENSATION_VIEWED'];
  return apiResponse.success(res, 'Timeline.', rows.filter((r) => !hidden.includes(r.action)).map((r) => ({ id: r.id, at: r.createdAt, action: r.action, entity: r.entity, by: r.userId ? names.get(r.userId) ?? 'Unknown' : 'System', meta: r.meta })));
});

// ── Export ───────────────────────────────────────────────────────────────────

// GET /employees/export.csv (standard fields only)
export const exportEmployees = handle(async (req, res) => {
  const a = access(req);
  const where = listWhere(a, req.query as Record<string, string>);
  const rows = await prisma.pwmEmployee.findMany({ where, orderBy: [{ lastName: 'asc' }], take: 5000, select: { ...brief, department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true } }, ...withContract } });
  const head = ['Employee ID', 'First name', 'Last name', 'Work email', 'Department', 'Job title', 'Employment type', 'Status', 'Hire date', 'Manager', 'Location', 'Contract ref', 'Contract status', 'Contract expiry'];
  const lines = [head.join(',')];
  for (const e of rows) {
    const c = e.contracts[0];
    lines.push([e.employeeNo, e.firstName, e.lastName, e.workEmail, e.department?.name, e.jobTitle, e.employmentType, STATUS_LABEL[e.status], dateOnly(e.hireDate), e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : '', e.location, c?.reference, c?.status, c?.expiryDate ? dateOnly(c.expiryDate) : ''].map(csvCell).join(','));
  }
  await pwmAudit(req, { action: 'EXPORT', entity: 'PwmEmployee', entityId: 'export', meta: { rows: rows.length, filters: req.query } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="employees-${lagosYmd(new Date())}.csv"`);
  res.send(lines.join('\r\n'));
});

// ── Bulk import ──────────────────────────────────────────────────────────────

interface ImportRow { [k: string]: unknown }

// POST /import/employees { rows, dryRun, skipInvalid }
export const importEmployees = handle(async (req, res) => {
  const a = access(req);
  const rows = req.body?.rows as ImportRow[] | undefined;
  if (!Array.isArray(rows) || !rows.length) fail(400, 'Add at least one row.');
  if (rows!.length > 500) fail(400, 'Import at most 500 rows at a time.');
  const dryRun = req.body?.dryRun !== false;
  const cfg = await getPwmConfig();
  const depts = new Map((await prisma.pwmDepartment.findMany({ where: { archivedAt: null }, select: { id: true, name: true } })).map((d) => [d.name.toLowerCase(), d.id]));
  const typeKeys = new Map(cfg.contractTypes.flatMap((t) => [[t.key.toLowerCase(), t], [t.label.toLowerCase(), t]] as const));
  const seenEmail = new Set<string>(); const seenName = new Set<string>();
  const today = lagosYmd(new Date());

  type Parsed = { index: number; errors: string[]; warnings: string[]; person?: Prisma.PwmEmployeeUncheckedCreateInput; contract?: { type: string; start: string; expiry: string | null; probationMonths?: number } };
  const parsed: Parsed[] = [];
  for (const [i, r] of rows!.entries()) {
    const errors: string[] = []; const warnings: string[] = [];
    const get = (k: string) => (typeof r[k] === 'string' || typeof r[k] === 'number' ? String(r[k]).trim() : '');
    const firstName = get('firstName'); const lastName = get('lastName');
    if (!firstName || !lastName) errors.push('First and last name are required.');
    const dept = depts.get(get('department').toLowerCase());
    if (!dept) errors.push(`Department "${get('department')}" does not exist. Create it first.`);
    const jobTitle = get('jobTitle'); if (!jobTitle) errors.push('Job title is required.');
    const type = typeKeys.get(get('employmentType').toLowerCase()); if (!type) errors.push(`Employment type "${get('employmentType')}" is not recognised.`);
    const hire = /^\d{4}-\d{2}-\d{2}$/.test(get('hireDate')) ? get('hireDate') : null; if (!hire) errors.push('Hire date must be YYYY-MM-DD.');
    const status = (get('status') || 'ACTIVE').toUpperCase().replace(/ /g, '_');
    if (!['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD'].includes(status)) errors.push(`Status "${get('status')}" cannot be imported. Use Active, Probation, On leave, Suspended or Notice period.`);
    let workEmail: string | null = null;
    if (get('workEmail')) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get('workEmail'))) errors.push('Work email is not valid.'); else workEmail = get('workEmail').toLowerCase(); }
    if (workEmail) { if (seenEmail.has(workEmail)) errors.push('Work email appears twice in this file.'); seenEmail.add(workEmail); }
    const nameKey = `${firstName}|${lastName}`.toLowerCase();
    if (seenName.has(nameKey)) warnings.push('Another row has the same name.'); seenName.add(nameKey);
    let phone: string | null = null;
    if (get('phone')) { phone = normalisePhone(get('phone')); if (!phone) warnings.push('Phone number could not be read and was left blank.'); }
    let probationEnd: string | null = null;
    if (get('probationEndDate')) { if (/^\d{4}-\d{2}-\d{2}$/.test(get('probationEndDate'))) probationEnd = get('probationEndDate'); else errors.push('Probation end date must be YYYY-MM-DD.'); }
    // Contract: required for anyone on a fixed-term kind of agreement.
    const cStart = get('contractStart') || hire || ''; const cExpiry = get('contractExpiry') || null;
    if (type && hire) {
      const bad = validateContractDates({ contractType: type.key, commencementDate: cStart, expiryDate: cExpiry }, cfg.contractTypes);
      errors.push(...bad);
    }
    parsed.push({
      index: i + 1, errors, warnings,
      ...(errors.length ? {} : {
        person: { employeeNo: '', firstName, lastName, middleName: get('middleName') || null, title: get('title') || null, workEmail, personalEmail: get('personalEmail') ? get('personalEmail').toLowerCase() : null, phone, departmentId: dept!, jobTitle, employmentType: type!.key, hireDate: fromYmd(hire!), originalHireDate: fromYmd(hire!), status: status as PwmEmploymentStatus, location: get('location') || null, probationEndDate: probationEnd ? fromYmd(probationEnd) : null, createdById: a.userId },
        contract: { type: type!.key, start: cStart, expiry: cExpiry },
      }),
    });
  }

  // Duplicates against what is already on record.
  const dbMatches = await prisma.pwmEmployee.findMany({ where: { OR: parsed.filter((p) => p.person).flatMap((p) => [p.person!.workEmail ? { workEmail: p.person!.workEmail } : null].filter(Boolean) as Prisma.PwmEmployeeWhereInput[]) }, select: { workEmail: true, employeeNo: true } });
  const emailTaken = new Map(dbMatches.map((m) => [m.workEmail, m.employeeNo]));
  for (const p of parsed) if (p.person?.workEmail && emailTaken.has(p.person.workEmail)) { p.errors.push(`Work email already belongs to ${emailTaken.get(p.person.workEmail)}.`); delete p.person; delete p.contract; }
  const nameClash = await prisma.pwmEmployee.findMany({ where: { OR: parsed.filter((p) => p.person).map((p) => ({ firstName: { equals: p.person!.firstName, mode: 'insensitive' as const }, lastName: { equals: p.person!.lastName, mode: 'insensitive' as const } })) }, select: { firstName: true, lastName: true, employeeNo: true } });
  for (const p of parsed) {
    const hit = p.person && nameClash.find((n) => n.firstName.toLowerCase() === p.person!.firstName.toLowerCase() && n.lastName.toLowerCase() === p.person!.lastName.toLowerCase());
    if (hit) p.warnings.push(`Someone with this name is already on record (${hit.employeeNo}). It will still be imported as a new person.`);
  }

  const valid = parsed.filter((p) => p.person && !p.errors.length);
  const invalid = parsed.filter((p) => p.errors.length);
  const summary = { total: parsed.length, valid: valid.length, invalid: invalid.length };
  const report = parsed.map((p) => ({ row: p.index, ok: !p.errors.length, errors: p.errors, warnings: p.warnings }));
  if (dryRun) return apiResponse.success(res, 'Dry run complete. Nothing was saved.', { dryRun: true, summary, report });
  if (invalid.length && !req.body?.skipInvalid) return apiResponse.error(res, 'Fix the rows with errors, or choose to skip them, then import again.', 422, report.filter((r) => !r.ok));
  if (!valid.length) fail(422, 'There are no valid rows to import.');

  const batchId = `import-${Date.now()}`;
  let contractsExpiring30 = 0; let contractsExpired = 0; const created: string[] = [];
  for (const p of valid) {
    const year = Number(dateOnly(p.person!.hireDate as Date).slice(0, 4));
    const employeeNo = await nextEmployeeNo(cfg.employeeIdPrefix, year);
    const emp = await prisma.pwmEmployee.create({ data: { ...p.person!, employeeNo }, select: { id: true } });
    const ref = await nextContractRef(cfg.contractRefPrefix, year);
    const dept = [...depts.entries()].find(([, id]) => id === p.person!.departmentId)?.[0];
    await prisma.pwmContract.create({
      data: { reference: ref, employeeId: emp.id, departmentName: dept ? dept.replace(/\b\w/g, (c) => c.toUpperCase()) : null, jobTitle: p.person!.jobTitle, contractType: p.contract!.type, status: 'ACTIVE', commencementDate: fromYmd(p.contract!.start), expiryDate: p.contract!.expiry ? fromYmd(p.contract!.expiry) : null, isImported: true, approvalStatus: 'NOT_REQUIRED', createdById: a.userId, notes: `Imported ${batchId}. Signed copy to be attached.` },
    });
    if (p.contract!.expiry) { const left = daysBetween(today, p.contract!.expiry); if (left < 0) contractsExpired++; else if (left <= 30) contractsExpiring30++; }
    created.push(emp.id);
  }
  await pwmAudit(req, { action: 'BULK_IMPORT', entity: 'PwmEmployee', entityId: batchId, meta: { created: created.length, skipped: invalid.length, contractsExpiring30, contractsExpired } });

  // One summary per person instead of an alert per contract (PRD 12.4).
  const { insertSummary } = await import('../../services/pwm/notify');
  await insertSummary(batchId, [...new Set([...(await hrAdminUserIds()), ...(await managementUserIds())])], { imported: created.length, expiring30: contractsExpiring30, expired: contractsExpired });
  return apiResponse.success(res, `${created.length} employees imported.`, { dryRun: false, summary: { ...summary, imported: created.length, contractsExpiring30, contractsExpired }, report: report.filter((r) => !r.ok || r.warnings.length) }, 201);
});

// Re-exported so the working-day helpers stay available to report code.
export { workingDaysBetween, addMonths };
