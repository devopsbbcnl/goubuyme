// PWM domain helpers shared by the controllers and the scheduled jobs: audiences, field-level shaping,
// status changes, checklists and contract activation.
import { Prisma, PwmChecklistKind, PwmEmploymentStatus, PwmRole } from '@prisma/client';
import prisma from '../../config/db';
import { decryptSecret } from '../../utils/crypto';
import { pwmAudit } from './audit';
import {
  PwmAccess, SENSITIVE_FIELDS, SENSITIVE_FIELDS as SENSITIVE, ChecklistTemplateTask, OFFBOARDING_TEMPLATE, ONBOARDING_TEMPLATE,
  addDays, can, checkTransition, dateOnly, fromYmd, lagosYmd, maskValue,
} from './rules';

type Db = Prisma.TransactionClient | typeof prisma;

// ── Audiences ────────────────────────────────────────────────────────────────

const activeUsers = async (ids: string[]): Promise<string[]> => {
  if (!ids.length) return [];
  const u = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  return u.map((x) => x.id);
};

export const superAdminUserIds = async (): Promise<string[]> =>
  (await prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);

export const memberUserIds = async (roles: PwmRole[], extra: Prisma.PwmMemberWhereInput = {}): Promise<string[]> =>
  activeUsers((await prisma.pwmMember.findMany({ where: { role: { in: roles }, isActive: true, ...extra }, select: { userId: true } })).map((m) => m.userId));

/** HR administrators, or the super admins until someone has been given the role (so nothing is ever unowned). */
export const hrAdminUserIds = async (): Promise<string[]> => {
  const ids = await memberUserIds(['HR_ADMIN']);
  return ids.length ? ids : superAdminUserIds();
};
export const managementUserIds = (): Promise<string[]> => memberUserIds(['EXECUTIVE']);
export const mdUserIds = (): Promise<string[]> => memberUserIds(['EXECUTIVE'], { isMd: true });
export const approverUserIds = async (): Promise<string[]> => [...new Set([...(await managementUserIds()), ...(await superAdminUserIds())])];

// ── Scope and field-level shaping ────────────────────────────────────────────

/** Department heads only see their own department's people (plus themselves). Everyone else with access sees all. */
export const employeeScope = (a: PwmAccess): Prisma.PwmEmployeeWhereInput =>
  a.level === 'DEPARTMENT_HEAD'
    ? { OR: [{ departmentId: { in: a.headedDepartmentIds.length ? a.headedDepartmentIds : ['__none__'] } }, ...(a.employeeId ? [{ id: a.employeeId }] : [])] }
    : {};

export const canSeeEmployee = (a: PwmAccess, e: { id: string; departmentId: string | null }): boolean =>
  a.level !== 'DEPARTMENT_HEAD' || e.id === a.employeeId || (!!e.departmentId && a.headedDepartmentIds.includes(e.departmentId));

const RESTRICTED_KEYS = ['dateOfBirth', 'sex', 'maritalStatus', 'nationality', 'stateOfOrigin', 'personalEmail', 'phone', 'address', 'emergencyContacts', 'nextOfKin', 'guarantors', 'grade', 'costCentre'] as const;
const ENCRYPTED_KEYS = [...SENSITIVE, 'bankName', 'bankAccountName', 'pfaName'] as const;

const safeDecrypt = (v: string | null): string | null => {
  if (!v) return null;
  try { return decryptSecret(v); } catch { return null; }
};

/**
 * Remove fields the viewer may not see, on the server. Restricted fields go for people without that right;
 * the highly restricted numbers only ever leave as masked text (the real value needs a logged reveal).
 */
export const shapeEmployee = <T extends Record<string, unknown>>(e: T, a: PwmAccess): Record<string, unknown> => {
  const own = a.employeeId !== null && e.id === a.employeeId;
  const out: Record<string, unknown> = { ...e };
  if (!(can(a, 'viewRestricted') || own)) for (const k of RESTRICTED_KEYS) delete out[k];
  const showMasked = can(a, 'viewHighlyRestricted') || own;
  for (const k of SENSITIVE) {
    const plain = safeDecrypt((e[k] as string | null) ?? null);
    delete out[k];
    if (showMasked && plain) out[k] = maskValue(plain);
  }
  for (const k of ['bankName', 'bankAccountName', 'pfaName'] as const) if (!showMasked) delete out[k];
  out.hasSensitive = Object.fromEntries(SENSITIVE.map((k) => [k, !!e[k]]));
  return out;
};

/** Plain value of one highly restricted field (callers must log the reveal). */
export const revealField = (stored: string | null): string | null => safeDecrypt(stored);

export { ENCRYPTED_KEYS, SENSITIVE as SENSITIVE_KEYS };

// ── Status changes ───────────────────────────────────────────────────────────

export interface StatusChangeInput {
  employeeId: string;
  to: PwmEmploymentStatus;
  reason: string;
  effectiveDate?: string;
  requestedById?: string | null;
  approvedById?: string | null;
  bySystem?: boolean;
  /** An existing request row to stamp as applied instead of writing a new log entry. */
  existingChangeId?: string;
  /** Skip the matrix (used by the renewal workflow, which is itself an approved process). */
  workflow?: boolean;
  extra?: Prisma.PwmEmployeeUpdateInput;
}

/** Apply a status change now: update the employee, log the change and write the audit row. Returns false when disallowed. */
export const applyStatus = async (input: StatusChangeInput, db: Db = prisma, req: Parameters<typeof pwmAudit>[0] = null): Promise<{ ok: boolean; reason?: string }> => {
  const emp = await db.pwmEmployee.findUnique({ where: { id: input.employeeId }, select: { status: true, version: true } });
  if (!emp) return { ok: false, reason: 'Employee not found.' };
  if (emp.status === input.to) return { ok: true };
  if (!input.workflow) {
    const check = checkTransition(emp.status, input.to);
    if (!check.ok) return { ok: false, reason: check.reason };
  }
  const today = lagosYmd(new Date());
  const effective = input.effectiveDate ?? today;
  await db.pwmEmployee.update({ where: { id: input.employeeId }, data: { status: input.to, version: { increment: 1 }, ...(input.extra ?? {}) } });
  if (input.existingChangeId) {
    await db.pwmStatusChange.update({ where: { id: input.existingChangeId }, data: { appliedAt: new Date() } });
  } else {
    await db.pwmStatusChange.create({
      data: {
        employeeId: input.employeeId, fromStatus: emp.status, toStatus: input.to, effectiveDate: fromYmd(effective), reason: input.reason,
        requestedById: input.requestedById ?? null, bySystem: !!input.bySystem, approvedById: input.approvedById ?? null,
        approvalStatus: input.approvedById ? 'APPROVED' : 'NOT_REQUIRED', approvedAt: input.approvedById ? new Date() : null, appliedAt: new Date(),
      },
    });
  }
  await pwmAudit(req, {
    action: 'STATUS_CHANGED', entity: 'PwmEmployee', entityId: input.employeeId, before: { status: emp.status }, after: { status: input.to },
    reason: input.reason, meta: { effectiveDate: effective, approvedBy: input.approvedById ?? null, system: !!input.bySystem },
    ...(input.bySystem ? { userId: null } : {}),
  }, db as Prisma.TransactionClient);
  return { ok: true };
};

// ── Checklists ───────────────────────────────────────────────────────────────

const deptHeadUserOf = async (departmentId: string | null): Promise<string | null> => {
  if (!departmentId) return null;
  const d = await prisma.pwmDepartment.findUnique({ where: { id: departmentId }, select: { head: { select: { userId: true } } } });
  return d?.head?.userId ?? null;
};

const assigneeFor = async (role: ChecklistTemplateTask['ownerRole'], emp: { hrOfficerUserId: string | null; departmentId: string | null; userId: string | null }, hrAdmins: string[]): Promise<string | null> => {
  switch (role) {
    case 'HR_OFFICER': return emp.hrOfficerUserId ?? hrAdmins[0] ?? null;
    case 'HR_ADMIN': return hrAdmins[0] ?? null;
    case 'DEPARTMENT_HEAD': return deptHeadUserOf(emp.departmentId);
    case 'EMPLOYEE': return emp.userId;
    case 'FINANCE': return (await memberUserIds(['FINANCE']))[0] ?? null;
    default: return null; // IT and ASSETS are picked up by whoever holds that duty; HR can assign a person on the task
  }
};

/** Start a checklist for an employee unless an open one of that kind already exists (ONB-01, OFF-02). */
export const startChecklist = async (employeeId: string, kind: PwmChecklistKind, startYmd: string, createdById: string | null): Promise<{ id: string; created: boolean }> => {
  const existing = await prisma.pwmChecklist.findFirst({ where: { employeeId, kind, status: 'OPEN' }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { hrOfficerUserId: true, departmentId: true, userId: true } });
  if (!emp) throw new Error('Employee not found');
  const hrAdmins = await hrAdminUserIds();
  const template = kind === 'ONBOARDING' ? ONBOARDING_TEMPLATE : OFFBOARDING_TEMPLATE;
  const tasks = await Promise.all(template.map(async (t, i) => ({
    stage: t.stage, title: t.title, ownerRole: t.ownerRole, mandatory: t.mandatory !== false, sortOrder: i,
    dueDate: fromYmd(addDays(startYmd, t.offsetDays)), assigneeUserId: await assigneeFor(t.ownerRole, emp, hrAdmins),
  })));
  const c = await prisma.pwmChecklist.create({ data: { employeeId, kind, startDate: fromYmd(startYmd), createdById, tasks: { create: tasks } }, select: { id: true } });
  if (kind === 'OFFBOARDING') {
    // Clearance sign-offs: one per area, each signed by the person responsible for it (OFF-07).
    const ep = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { employmentEpisode: true } });
    await prisma.pwmClearance.createMany({ data: ['DEPARTMENT', 'IT', 'FINANCE', 'ASSETS', 'HR'].map((area) => ({ employeeId, area, episode: ep?.employmentEpisode ?? 1 })), skipDuplicates: true });
  }
  return { id: c.id, created: true };
};

// ── Contracts ────────────────────────────────────────────────────────────────

/** Stop outstanding reminders for a contract (decision recorded, date changed, employee exit). The history stays. */
export const cancelContractReminders = async (contractId: string, reason: string, db: Db = prisma): Promise<number> => {
  const r = await db.pwmReminder.updateMany({
    where: { contractId, status: { in: ['QUEUED', 'FAILED'] }, sentAt: null },
    data: { status: 'CANCELLED', cancelReason: reason, nextAttemptAt: null },
  });
  return r.count;
};

/**
 * Make a signed contract live: successor takes over from its predecessor, the renewal closes, the employee
 * goes (back) to Active and the reminder schedule restarts from the new expiry date (REN-06).
 */
export const activateContract = async (contractId: string, req: Parameters<typeof pwmAudit>[0] = null, now = new Date()): Promise<boolean> => {
  const c = await prisma.pwmContract.findUnique({ where: { id: contractId }, include: { predecessor: true, employee: { select: { id: true, status: true, probationEndDate: true } } } });
  if (!c || c.status !== 'SIGNED') return false;
  const today = lagosYmd(now);
  if (dateOnly(c.commencementDate) > today) return false;

  await prisma.$transaction(async (tx) => {
    await tx.pwmContract.update({ where: { id: c.id }, data: { status: 'ACTIVE', version: { increment: 1 } } });
    if (c.predecessor) {
      await tx.pwmContract.update({ where: { id: c.predecessor.id }, data: { status: 'SUPERSEDED', archivedAt: new Date(), version: { increment: 1 } } });
      await cancelContractReminders(c.predecessor.id, 'superseded by successor contract', tx);
      await tx.pwmRenewal.updateMany({ where: { contractId: c.predecessor.id, step: { notIn: ['COMPLETED', 'CLOSED'] } }, data: { step: 'COMPLETED', completedAt: new Date() } });
    }
    await tx.pwmEmployee.update({ where: { id: c.employeeId }, data: { employmentType: c.contractType, version: { increment: 1 } } });
    const flagged: PwmEmploymentStatus[] = ['CONTRACT_ISSUED', 'RENEWAL_PENDING', 'CONTRACT_EXPIRED'];
    if (flagged.includes(c.employee.status)) {
      await applyStatus({ employeeId: c.employeeId, to: 'ACTIVE', reason: `Contract ${c.reference} is now in force`, bySystem: true, workflow: true }, tx);
    }
    await pwmAudit(req, { action: 'CONTRACT_ACTIVATED', entity: 'PwmContract', entityId: c.id, before: { status: 'SIGNED' }, after: { status: 'ACTIVE', supersedes: c.predecessor?.reference ?? null }, userId: req ? undefined : null }, tx);
  });
  return true;
};

// ── Status changes with their consequences ───────────────────────────────────

export interface CommitStatusInput extends StatusChangeInput {
  exitType?: string | null;
  finalWorkingDay?: string | null;
  exitReason?: string | null;
  rehireEligible?: boolean | null;
}

/**
 * Apply a status change and everything that follows from it: exit details, the offboarding checklist, the end of
 * the current contract and the end of its reminders. Employment is only ever ended by a person's decision here.
 */
export const commitStatus = async (input: CommitStatusInput, req: Parameters<typeof pwmAudit>[0] = null): Promise<{ ok: boolean; reason?: string }> => {
  const today = lagosYmd(new Date());
  const effective = input.effectiveDate ?? today;
  const exiting = input.to === 'RESIGNED' || input.to === 'TERMINATED';
  const extra: Prisma.PwmEmployeeUpdateInput = { ...(input.extra ?? {}) };
  if (input.to === 'NOTICE_PERIOD' || exiting) {
    if (input.exitType !== undefined) extra.exitType = input.exitType;
    if (input.exitReason !== undefined) extra.exitReason = input.exitReason;
    if (input.finalWorkingDay) extra.finalWorkingDay = fromYmd(input.finalWorkingDay);
  }
  if (exiting) {
    extra.exitDate = fromYmd(effective);
    if (!input.finalWorkingDay) extra.finalWorkingDay = fromYmd(effective);
    if (input.rehireEligible !== undefined) extra.rehireEligible = input.rehireEligible;
  }
  if (input.to === 'ACTIVE') extra.confirmationDate = fromYmd(effective);
  if (input.to === 'ARCHIVED') extra.archivedAt = new Date();

  const before = await prisma.pwmEmployee.findUnique({ where: { id: input.employeeId }, select: { status: true } });
  const r = await applyStatus({ ...input, effectiveDate: effective, extra }, prisma, req);
  if (!r.ok) return r;
  if (before?.status === 'PROBATION' && input.to === 'ACTIVE') await prisma.pwmEmployee.update({ where: { id: input.employeeId }, data: { probationEndDate: null } });

  if (input.to === 'NOTICE_PERIOD' || exiting) {
    const lastDay = input.finalWorkingDay ?? effective;
    await startChecklist(input.employeeId, 'OFFBOARDING', lastDay, input.requestedById ?? null).catch(() => undefined);
  }
  if (exiting) {
    // The leaver's own My HR login is switched off (OFF-10). Admin logins keep their admin access.
    const who = await prisma.pwmEmployee.findUnique({ where: { id: input.employeeId }, select: { userId: true } });
    if (who?.userId) await prisma.user.updateMany({ where: { id: who.userId, role: 'STAFF' }, data: { isActive: false, refreshToken: null } });
    // The current contract ends with the employment; its remaining reminders are cancelled (PRD 12.4).
    const inForce = await prisma.pwmContract.findMany({ where: { employeeId: input.employeeId, status: { in: ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'] } } });
    for (const c of inForce) {
      const early = !c.expiryDate || dateOnly(c.expiryDate) > effective;
      await prisma.pwmContract.update({ where: { id: c.id }, data: { status: early ? 'TERMINATED_EARLY' : 'EXPIRED', decisionRecordedAt: c.decisionRecordedAt ?? new Date(), version: { increment: 1 } } });
      await cancelContractReminders(c.id, 'employee exit recorded');
      await prisma.pwmRenewal.updateMany({ where: { contractId: c.id, step: { notIn: ['COMPLETED', 'CLOSED'] } }, data: { step: 'CLOSED', closedReason: 'Employee exit recorded', completedAt: new Date() } });
    }
  }
  return { ok: true };
};
