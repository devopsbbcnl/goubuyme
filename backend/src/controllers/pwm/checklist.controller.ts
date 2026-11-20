// PWM: onboarding and offboarding checklists, and pay records (prepared by one person, approved by another).
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { can, dateOnly, fromYmd, fullName, lagosYmd } from '../../services/pwm/rules';
import { approverUserIds, canSeeEmployee, commitStatus, employeeScope, startChecklist } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, oneOf, reqStr, reqYmd, str, ymd } from './common';
import { Prisma } from '@prisma/client';

const OWNER_ROLES = ['HR_OFFICER', 'HR_ADMIN', 'IT', 'ASSETS', 'DEPARTMENT_HEAD', 'EMPLOYEE', 'FINANCE'];

// ── Checklists ───────────────────────────────────────────────────────────────

// GET /checklists?kind=&status=OPEN&mine=1
export const listChecklists = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmChecklist.findMany({
    where: {
      employee: employeeScope(a), status: q.status ?? 'OPEN', ...(q.kind ? { kind: q.kind as never } : {}),
      ...(q.mine ? { tasks: { some: { assigneeUserId: a.userId, status: { in: ['PENDING', 'IN_PROGRESS'] } } } } : {}),
    },
    orderBy: { startDate: 'asc' }, take: 300,
    include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, jobTitle: true, status: true, department: { select: { name: true } } } }, tasks: { select: { status: true, mandatory: true, dueDate: true } } },
  });
  return apiResponse.success(res, 'Checklists.', rows.map((c) => {
    const open = c.tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
    return {
      id: c.id, kind: c.kind, status: c.status, startDate: c.startDate, employee: c.employee, total: c.tasks.length, done: c.tasks.length - open.length,
      percent: c.tasks.length ? Math.round(((c.tasks.length - open.length) / c.tasks.length) * 100) : 0,
      overdue: open.filter((t) => t.dueDate && dateOnly(t.dueDate) < today).length, mandatoryOpen: open.filter((t) => t.mandatory).length,
    };
  }));
});

// GET /checklists/:id
export const getChecklist = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmChecklist.findUnique({
    where: { id: req.params.id },
    include: { tasks: { orderBy: [{ sortOrder: 'asc' }] }, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, jobTitle: true, status: true, departmentId: true, finalWorkingDay: true, department: { select: { name: true } } } } },
  });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Checklist not found.');
  const k = c!;
  const names = await nameMap([...k.tasks.flatMap((t) => [t.assigneeUserId, t.completedById]), k.completedById]);
  const today = lagosYmd(new Date());
  return apiResponse.success(res, 'Checklist.', {
    ...k, canManage: can(a, 'manageChecklists'),
    tasks: k.tasks.map((t) => ({
      ...t, assigneeName: t.assigneeUserId ? names.get(t.assigneeUserId) ?? null : null, completedByName: t.completedById ? names.get(t.completedById) ?? null : null,
      overdue: !!t.dueDate && (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && dateOnly(t.dueDate) < today, canUpdate: can(a, 'manageChecklists') || t.assigneeUserId === a.userId,
    })),
  });
});

// POST /employees/:id/checklists { kind, startDate }
export const startForEmployee = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true, hireDate: true, finalWorkingDay: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const kind = oneOf(req.body?.kind, ['ONBOARDING', 'OFFBOARDING'] as const, 'Kind');
  const start = ymd(req.body?.startDate, 'Start date') ?? (kind === 'ONBOARDING' ? dateOnly(e!.hireDate) : e!.finalWorkingDay ? dateOnly(e!.finalWorkingDay) : lagosYmd(new Date()));
  const r = await startChecklist(e!.id, kind, start, a.userId);
  if (r.created) await pwmAudit(req, { action: 'CHECKLIST_STARTED', entity: 'PwmEmployee', entityId: e!.id, after: { kind, start, checklistId: r.id } });
  return apiResponse.success(res, r.created ? 'Checklist started.' : 'An open checklist of this kind already exists.', r, r.created ? 201 : 200);
});

// PATCH /checklist-tasks/:id { status, note, assigneeUserId, dueDate }
export const updateTask = handle(async (req, res) => {
  const a = access(req);
  const t = await prisma.pwmChecklistTask.findUnique({ where: { id: req.params.id }, include: { checklist: { select: { id: true, status: true, employeeId: true, kind: true, employee: { select: { id: true, departmentId: true } } } } } });
  if (!t || !canSeeEmployee(a, t.checklist.employee)) fail(404, 'Task not found.');
  const task = t!;
  const manage = can(a, 'manageChecklists');
  if (!manage && task.assigneeUserId !== a.userId) fail(403, 'Forbidden. This task is assigned to someone else.');
  if (task.checklist.status !== 'OPEN') fail(409, 'This checklist is closed.');
  const b = req.body ?? {};
  const data: Prisma.PwmChecklistTaskUncheckedUpdateInput = {};
  if (b.status !== undefined) {
    data.status = oneOf(b.status, ['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'] as const, 'Status');
    if (data.status === 'SKIPPED' && task.mandatory && !manage) fail(403, 'Only HR can skip a mandatory task.');
    if (data.status === 'SKIPPED' && !str(b.note, 300) && !task.note) fail(400, 'Say why the task is being skipped.');
    const finished = data.status === 'DONE' || data.status === 'SKIPPED';
    data.completedAt = finished ? new Date() : null; data.completedById = finished ? a.userId : null;
  }
  if (b.note !== undefined) data.note = str(b.note, 500);
  if (manage && b.assigneeUserId !== undefined) data.assigneeUserId = str(b.assigneeUserId, 60);
  if (manage && b.dueDate !== undefined) { const d = ymd(b.dueDate, 'Due date'); data.dueDate = d ? fromYmd(d) : null; }
  if (manage && b.ownerRole !== undefined) data.ownerRole = oneOf(b.ownerRole, OWNER_ROLES, 'Owner');
  const u = await prisma.pwmChecklistTask.update({ where: { id: task.id }, data });
  await pwmAudit(req, { action: 'CHECKLIST_TASK_UPDATED', entity: 'PwmEmployee', entityId: task.checklist.employeeId, after: { task: task.title, status: u.status }, meta: { checklistId: task.checklistId } });
  return apiResponse.success(res, 'Saved.', u);
});

// POST /checklist-tasks (add a one-off task) { checklistId, title, stage, ownerRole, assigneeUserId, dueDate }
export const addTask = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const c = await prisma.pwmChecklist.findUnique({ where: { id: reqStr(b.checklistId, 'Checklist', 60) }, include: { employee: { select: { id: true, departmentId: true } } } });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Checklist not found.');
  if (c!.status !== 'OPEN') fail(409, 'This checklist is closed.');
  const max = await prisma.pwmChecklistTask.aggregate({ where: { checklistId: c!.id }, _max: { sortOrder: true } });
  const due = ymd(b.dueDate, 'Due date');
  const t = await prisma.pwmChecklistTask.create({ data: { checklistId: c!.id, title: reqStr(b.title, 'Task', 200), stage: str(b.stage, 60) ?? 'Other', ownerRole: oneOf(b.ownerRole ?? 'HR_OFFICER', OWNER_ROLES, 'Owner'), assigneeUserId: str(b.assigneeUserId, 60), dueDate: due ? fromYmd(due) : null, mandatory: !!b.mandatory, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await pwmAudit(req, { action: 'CHECKLIST_TASK_ADDED', entity: 'PwmEmployee', entityId: c!.employeeId, after: { task: t.title } });
  return apiResponse.success(res, 'Task added.', t, 201);
});

// POST /checklists/:id/complete { rehireEligible }
export const completeChecklist = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmChecklist.findUnique({ where: { id: req.params.id }, include: { tasks: true, employee: { select: { id: true, status: true, departmentId: true, probationEndDate: true, employeeNo: true, firstName: true, lastName: true } } } });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Checklist not found.');
  const k = c!;
  if (k.status !== 'OPEN') fail(409, 'This checklist is already closed.');
  const open = k.tasks.filter((t) => t.mandatory && (t.status === 'PENDING' || t.status === 'IN_PROGRESS'));
  if (open.length) return apiResponse.error(res, `${open.length} mandatory task${open.length === 1 ? ' is' : 's are'} still open.`, 409, open.map((t) => t.title));
  const emp = k.employee;
  const today = lagosYmd(new Date());

  if (k.kind === 'ONBOARDING') {
    if (emp.status === 'PENDING_ONBOARDING') {
      const to = emp.probationEndDate ? 'PROBATION' : 'ACTIVE';
      const r = await commitStatus({ employeeId: emp.id, to, reason: 'Onboarding completed', requestedById: a.userId, approvedById: a.userId, workflow: true }, req);
      if (!r.ok) fail(409, r.reason ?? 'Could not update the status.');
    }
  } else {
    if (emp.status === 'NOTICE_PERIOD') fail(409, 'Record the resignation or termination first, then close the offboarding.');
    const uncleared = await prisma.pwmClearance.findMany({ where: { employeeId: emp.id, status: { not: 'CLEARED' } }, select: { area: true } });
    if (uncleared.length) return apiResponse.error(res, `Clearance is still outstanding for: ${uncleared.map((u) => u.area.toLowerCase()).join(', ')}.`, 409, uncleared);
    if (emp.status === 'RESIGNED' || emp.status === 'TERMINATED') {
      if (typeof req.body?.rehireEligible !== 'boolean') fail(400, 'Record whether this person is eligible for rehire.');
      const r = await commitStatus({ employeeId: emp.id, to: 'ARCHIVED', reason: 'Offboarding and clearance completed', requestedById: a.userId, approvedById: a.userId, workflow: true, rehireEligible: req.body.rehireEligible }, req);
      if (!r.ok) fail(409, r.reason ?? 'Could not archive the record.');
    }
  }
  await prisma.pwmChecklist.update({ where: { id: k.id }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: a.userId } });
  await pwmAudit(req, { action: 'CHECKLIST_COMPLETED', entity: 'PwmEmployee', entityId: emp.id, after: { kind: k.kind, completedOn: today } });
  return apiResponse.success(res, k.kind === 'ONBOARDING' ? 'Onboarding confirmed.' : 'Offboarding closed.', null);
});

// ── Compensation (restricted, four-eyes) ─────────────────────────────────────

const component = (v: unknown) => (Array.isArray(v) ? v.slice(0, 20).map((x) => ({ name: String((x as { name?: unknown }).name ?? '').slice(0, 60), amount: Number((x as { amount?: unknown }).amount) || 0 })).filter((x) => x.name) : []);

// GET /employees/:id/compensation
export const listCompensation = handle(async (req, res) => {
  const a = access(req);
  const own = a.employeeId === req.params.id;
  if (!can(a, 'viewCompensation') && !own) fail(403, 'Forbidden. Insufficient permissions.');
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const rows = await prisma.pwmCompensation.findMany({ where: { employeeId: e!.id, ...(own && !can(a, 'viewCompensation') ? { approvalStatus: 'APPROVED' as const } : {}) }, orderBy: { effectiveFrom: 'desc' } });
  const names = await nameMap(rows.flatMap((r) => [r.preparedById, r.approvedById]));
  await pwmAudit(req, { action: 'COMPENSATION_VIEWED', entity: 'PwmEmployee', entityId: e!.id });
  return apiResponse.success(res, 'Compensation.', rows.map((r) => ({ ...r, baseSalary: r.baseSalary.toString(), preparedByName: r.preparedById ? names.get(r.preparedById) ?? null : null, approvedByName: r.approvedById ? names.get(r.approvedById) ?? null : null })));
});

// POST /employees/:id/compensation { effectiveFrom, baseSalary, components, reason }
export const proposeCompensation = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, employeeNo: true, firstName: true, lastName: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  if (a.employeeId === e!.id) fail(403, 'You cannot prepare changes to your own pay.');
  const salary = Number(b.baseSalary);
  if (!Number.isFinite(salary) || salary < 0 || salary > 1_000_000_000) fail(400, 'Base salary must be a valid amount.');
  const from = reqYmd(b.effectiveFrom, 'Effective from');
  const pending = await prisma.pwmCompensation.count({ where: { employeeId: e!.id, approvalStatus: 'PENDING' } });
  if (pending) fail(409, 'A pay change for this employee is already waiting for approval.');
  const row = await prisma.pwmCompensation.create({ data: { employeeId: e!.id, effectiveFrom: fromYmd(from), baseSalary: salary, components: component(b.components), reason: reqStr(b.reason, 'Reason', 500), preparedById: a.userId } });
  await pwmAudit(req, { action: 'COMPENSATION_PROPOSED', entity: 'PwmEmployee', entityId: e!.id, after: { effectiveFrom: from, compensationId: row.id }, reason: row.reason }); // amounts are deliberately not written to the log
  await notifyPwm((await approverUserIds()).filter((id) => id !== a.userId), { title: `Pay change awaiting approval: ${fullName(e!)} (${e!.employeeNo})`, body: 'Open the record to review and approve or decline.', link: `/pwm/employees/${e!.id}` });
  return apiResponse.success(res, 'Sent for approval.', { id: row.id }, 201);
});

// POST /compensation/:id/decide { approve, note }
export const decideCompensation = handle(async (req, res) => {
  const a = access(req);
  const row = await prisma.pwmCompensation.findUnique({ where: { id: req.params.id }, include: { employee: { select: { id: true, departmentId: true } } } });
  if (!row || row.approvalStatus !== 'PENDING') fail(404, 'No pending pay change found.');
  const r = row!;
  if (r.preparedById === a.userId) fail(403, 'You prepared this change, so someone else must approve it.');
  if (a.employeeId === r.employeeId) fail(403, 'You cannot approve a change to your own pay.');
  const approve = req.body?.approve === true; const note = str(req.body?.note, 500);
  if (!approve && !note) fail(400, 'Say why the change is being declined.');
  await prisma.$transaction(async (tx) => {
    if (approve) {
      // The previous record ends the day before this one starts, so pay history never overlaps.
      const prev = await tx.pwmCompensation.findFirst({ where: { employeeId: r.employeeId, approvalStatus: 'APPROVED', effectiveTo: null, effectiveFrom: { lt: r.effectiveFrom } }, orderBy: { effectiveFrom: 'desc' } });
      if (prev) await tx.pwmCompensation.update({ where: { id: prev.id }, data: { effectiveTo: r.effectiveFrom } });
    }
    await tx.pwmCompensation.update({ where: { id: r.id }, data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED', approvedById: a.userId, approvedAt: new Date(), decisionNote: note } });
  });
  await pwmAudit(req, { action: approve ? 'COMPENSATION_APPROVED' : 'COMPENSATION_DECLINED', entity: 'PwmEmployee', entityId: r.employeeId, reason: note ?? undefined, meta: { compensationId: r.id } });
  return apiResponse.success(res, approve ? 'Approved.' : 'Declined.', null);
});

// GET /compensation/pending
export const pendingCompensation = handle(async (req, res) => {
  const a = access(req);
  if (!can(a, 'approveCompensation') && !can(a, 'manageCompensation')) fail(403, 'Forbidden. Insufficient permissions.');
  const rows = await prisma.pwmCompensation.findMany({ where: { approvalStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100, include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } } });
  const names = await nameMap(rows.map((r) => r.preparedById));
  return apiResponse.success(res, 'Pending.', rows.map((r) => ({ id: r.id, employee: r.employee, effectiveFrom: r.effectiveFrom, reason: r.reason, preparedByName: r.preparedById ? names.get(r.preparedById) ?? null : null, baseSalary: r.baseSalary.toString(), canDecide: can(a, 'approveCompensation') && r.preparedById !== a.userId })));
});

