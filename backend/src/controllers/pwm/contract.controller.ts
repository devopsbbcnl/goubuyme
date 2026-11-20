// PWM: contracts, the expiry tracker, amendments, approval, issue and signature.
import { Prisma, PwmContractStatus } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextContractRef } from '../../services/pwm/settings';
import {
  BUCKET_LABEL, CONTRACT_STATUS_LABEL, ExpiryBucket, WATCHED_CONTRACT, addDays, addMonths, dateOnly, daysBetween, durationBetween, expiryBucket,
  fromYmd, fullName, isLockedForEdit, lagosYmd, rangesOverlap, validateContractDates,
} from '../../services/pwm/rules';
import { activateContract, applyStatus, approverUserIds, canSeeEmployee, cancelContractReminders, employeeScope } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, int, nameMap, oneOf, page, reqStr, reqYmd, str, ymd } from './common';

const NOTICE_UNITS = ['DAYS', 'WEEKS', 'MONTHS'] as const;
const PATTERNS = ['FULL_TIME', 'PART_TIME', 'SHIFT'] as const;
const ELIGIBILITY = ['ELIGIBLE', 'NOT_ELIGIBLE', 'SUBJECT_TO_REVIEW'] as const;
const IN_FORCE: PwmContractStatus[] = ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'];

const empBrief = { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, status: true, departmentId: true, jobTitle: true, hrOfficerUserId: true, department: { select: { id: true, name: true } } } satisfies Prisma.PwmEmployeeSelect;

const renderDays = (c: { expiryDate: Date | null; status: PwmContractStatus }, today: string): number | null =>
  c.expiryDate && (WATCHED_CONTRACT as readonly string[]).includes(c.status) ? daysBetween(today, dateOnly(c.expiryDate)) : null;

// ── List / tracker ───────────────────────────────────────────────────────────

// GET /contracts?view=tracker|all&bucket=&status=&departmentId=&type=&officer=&q=&renewalStage=
export const listContracts = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const today = lagosYmd(new Date());
  const tracker = q.view !== 'all';
  const where: Prisma.PwmContractWhereInput = {
    employee: { AND: [employeeScope(a), ...(q.departmentId ? [{ departmentId: q.departmentId }] : [])] },
    ...(tracker ? { status: { in: [...WATCHED_CONTRACT] }, archivedAt: null } : q.status ? { status: q.status as PwmContractStatus } : {}),
    ...(q.type ? { contractType: q.type } : {}), ...(q.officer ? { responsibleOfficerUserId: q.officer } : {}),
    ...(q.q ? { OR: [{ reference: { contains: q.q, mode: 'insensitive' } }, { employee: { OR: [{ firstName: { contains: q.q, mode: 'insensitive' } }, { lastName: { contains: q.q, mode: 'insensitive' } }, { employeeNo: { contains: q.q, mode: 'insensitive' } }] } }] } : {}),
  };
  const rows = await prisma.pwmContract.findMany({
    where, orderBy: tracker ? [{ expiryDate: 'asc' }] : [{ createdAt: 'desc' }], take: 3000,
    include: { employee: { select: empBrief }, renewals: { where: { step: { notIn: ['COMPLETED', 'CLOSED'] } }, take: 1, select: { id: true, step: true } } },
  });
  const officers = await nameMap(rows.map((r) => r.responsibleOfficerUserId));
  let data = rows.map((c) => {
    const days = renderDays(c, today);
    return {
      id: c.id, reference: c.reference, contractType: c.contractType, status: c.status, commencementDate: c.commencementDate, expiryDate: c.expiryDate, approvalStatus: c.approvalStatus,
      daysRemaining: days, bucket: expiryBucket(days), renewalStep: c.renewals[0]?.step ?? null, renewalId: c.renewals[0]?.id ?? null, employee: c.employee,
      officerName: c.responsibleOfficerUserId ? officers.get(c.responsibleOfficerUserId) ?? null : null, decisionRecorded: !!c.decisionRecordedAt,
    };
  });
  const counts: Record<string, number> = {};
  if (tracker) {
    for (const d of data) counts[d.bucket] = (counts[d.bucket] ?? 0) + 1;
    if (q.bucket) data = data.filter((d) => d.bucket === (q.bucket as ExpiryBucket));
    if (q.renewalStage) data = data.filter((d) => (d.renewalStep ?? 'NONE') === q.renewalStage);
  }
  const { page: p, limit, skip } = page(q, 50);
  return res.json({ status: 'success', message: 'Contracts.', data: data.slice(skip, skip + limit), counts, bucketLabels: BUCKET_LABEL, pagination: { page: p, limit, total: data.length, totalPages: Math.max(1, Math.ceil(data.length / limit)) } });
});

// ── Detail ───────────────────────────────────────────────────────────────────

// GET /contracts/:id
export const getContract = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmContract.findUnique({
    where: { id: req.params.id },
    include: {
      employee: { select: { ...empBrief, userId: true } }, amendments: { orderBy: { effectiveDate: 'asc' } },
      documents: { where: { archivedAt: null }, orderBy: { version: 'desc' } },
      renewals: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'asc' } } } },
      predecessor: { select: { id: true, reference: true, status: true, expiryDate: true } }, successor: { select: { id: true, reference: true, status: true, commencementDate: true } },
      reminders: { orderBy: { createdAt: 'desc' }, take: 80 },
    },
  });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Contract not found.');
  const k = c!;
  const today = lagosYmd(new Date());
  const ids = [k.createdById, k.approvedById, k.issuedById, k.decidedById, k.responsibleOfficerUserId, ...k.renewals.flatMap((r) => [r.recommendedById, r.decidedById, ...r.events.map((e) => e.actorId)]), ...k.reminders.map((r) => r.recipientUserId)];
  const names = await nameMap(ids);
  const n = (id: string | null | undefined) => (id ? names.get(id) ?? null : null);
  const dur = k.expiryDate ? durationBetween(dateOnly(k.commencementDate), dateOnly(k.expiryDate)) : null;
  return apiResponse.success(res, 'Contract.', {
    ...k, createdByName: n(k.createdById), approvedByName: n(k.approvedById), issuedByName: n(k.issuedById), decidedByName: n(k.decidedById), officerName: n(k.responsibleOfficerUserId),
    daysRemaining: renderDays(k, today), duration: dur, locked: isLockedForEdit(k.status), statusLabel: CONTRACT_STATUS_LABEL[k.status],
    renewals: k.renewals.map((r) => ({ ...r, recommendedByName: n(r.recommendedById), decidedByName: n(r.decidedById), events: r.events.map((e) => ({ ...e, actorName: n(e.actorId) })) })),
    reminders: k.reminders.map((r) => ({ id: r.id, tierKey: r.tierKey, severity: r.severity, channel: r.channel, recipient: n(r.recipientUserId), recipientRole: r.recipientRole, status: r.status, sentAt: r.sentAt, acknowledgedAt: r.acknowledgedAt, cancelReason: r.cancelReason, attempts: r.attempts, createdAt: r.createdAt })),
  });
});

// ── Create / edit ────────────────────────────────────────────────────────────

const termFields = async (b: Record<string, unknown>, partial: boolean) => {
  const cfg = await getPwmConfig();
  const d: Prisma.PwmContractUncheckedUpdateInput = {};
  if (!partial || b.contractType !== undefined) d.contractType = oneOf(b.contractType, cfg.contractTypes.map((t) => t.key), 'Contract type');
  if (!partial || b.commencementDate !== undefined) d.commencementDate = fromYmd(reqYmd(b.commencementDate, 'Commencement date'));
  if (b.expiryDate !== undefined) { const e = ymd(b.expiryDate, 'Expiry date'); d.expiryDate = e ? fromYmd(e) : null; }
  if (b.renewalEligibility !== undefined) d.renewalEligibility = oneOf(b.renewalEligibility, ELIGIBILITY, 'Renewal eligibility');
  if (b.renewalEligibilityNote !== undefined) d.renewalEligibilityNote = str(b.renewalEligibilityNote, 300);
  if (b.probationMonths !== undefined) d.probationMonths = int(b.probationMonths, 'Probation months', 0, 24);
  if (b.noticeValue !== undefined) d.noticeValue = int(b.noticeValue, 'Notice period', 0, 365);
  if (b.noticeUnit !== undefined) d.noticeUnit = b.noticeUnit ? oneOf(b.noticeUnit, NOTICE_UNITS, 'Notice unit') : null;
  if (b.workingPattern !== undefined) d.workingPattern = b.workingPattern ? oneOf(b.workingPattern, PATTERNS, 'Working pattern') : null;
  if (b.hoursPerWeek !== undefined) d.hoursPerWeek = int(b.hoursPerWeek, 'Hours per week', 1, 80);
  if (b.templateName !== undefined) d.templateName = str(b.templateName, 120);
  if (b.notes !== undefined) d.notes = str(b.notes, 2000);
  if (b.responsibleOfficerUserId !== undefined) d.responsibleOfficerUserId = str(b.responsibleOfficerUserId, 60);
  return d;
};

/** An employee has at most one contract in force at a time unless the type allows concurrent engagements (CON-04). */
const assertNoOverlap = async (employeeId: string, type: string, start: string, end: string | null, ignoreId?: string, successorOf?: string | null) => {
  const cfg = await getPwmConfig();
  if (cfg.contractTypes.find((t) => t.key === type)?.concurrentAllowed) return;
  const others = await prisma.pwmContract.findMany({
    where: { employeeId, id: { not: ignoreId }, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'SIGNED', 'ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'] }, archivedAt: null },
    select: { id: true, reference: true, commencementDate: true, expiryDate: true, contractType: true, status: true },
  });
  for (const o of others) {
    if (o.id === successorOf) continue; // a successor may start while its predecessor is still running out
    if (rangesOverlap(start, end, dateOnly(o.commencementDate), o.expiryDate ? dateOnly(o.expiryDate) : null)) fail(409, `This overlaps contract ${o.reference} (${o.contractType}). An employee can have only one contract in force at a time.`);
  }
};

// POST /contracts { employeeId, contractType, commencementDate, expiryDate, ..., recordExisting, signedDate }
export const createContract = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cfg = await getPwmConfig();
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(b.employeeId, 'Employee', 60) }, select: { ...empBrief, userId: true, archivedAt: true } });
  if (!emp || !canSeeEmployee(a, emp)) fail(404, 'Employee not found.');
  const e = emp!;
  if (e.archivedAt) fail(409, 'This employee record is archived.');
  const d = await termFields(b, false);
  const start = dateOnly(d.commencementDate as Date); const end = d.expiryDate ? dateOnly(d.expiryDate as Date) : null;
  const errors = validateContractDates({ contractType: d.contractType as string, commencementDate: start, expiryDate: end }, cfg.contractTypes);
  if (errors.length) return apiResponse.error(res, errors[0], 400, errors);
  const predecessorId = str(b.predecessorId, 60);
  await assertNoOverlap(e.id, d.contractType as string, start, end, undefined, predecessorId);

  const existing = b.recordExisting === true;
  const today = lagosYmd(new Date());
  let signed: string | null = null; let counter: string | null = null;
  if (existing) {
    signed = reqYmd(b.signedDate, 'Date signed'); counter = ymd(b.countersignedDate, 'Date countersigned') ?? signed;
  }
  const rule = cfg.contractTypes.find((t) => t.key === d.contractType);
  const probationMonths = (d.probationMonths as number | null | undefined) ?? rule?.probationMonths ?? null;
  const reference = await nextContractRef(cfg.contractRefPrefix, Number(start.slice(0, 4)));
  const c = await prisma.pwmContract.create({
    data: {
      ...(d as Prisma.PwmContractUncheckedCreateInput), reference, employeeId: e.id, departmentName: e.department?.name ?? null, jobTitle: e.jobTitle, predecessorId,
      probationMonths, probationEndDate: probationMonths ? fromYmd(addDays(addMonths(start, probationMonths), -1)) : null,
      responsibleOfficerUserId: (d.responsibleOfficerUserId as string | null | undefined) ?? e.hrOfficerUserId, createdById: a.userId,
      ...(existing ? { status: start <= today ? 'ACTIVE' : 'SIGNED', signedDate: fromYmd(signed!), countersignedDate: fromYmd(counter!), approvalStatus: 'NOT_REQUIRED' as const } : {}),
    },
    select: { id: true, reference: true, status: true },
  });
  await pwmAudit(req, { action: existing ? 'CONTRACT_RECORDED' : 'CONTRACT_CREATED', entity: 'PwmContract', entityId: c.id, after: { reference, type: d.contractType, start, end, status: c.status, employeeNo: e.employeeNo } });
  return apiResponse.success(res, `Contract ${reference} created.`, c, 201);
});

// PATCH /contracts/:id
export const updateContract = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const cur = await prisma.pwmContract.findUnique({ where: { id: req.params.id }, include: { employee: { select: { id: true, departmentId: true } } } });
  if (!cur || !canSeeEmployee(a, cur.employee)) fail(404, 'Contract not found.');
  const c = cur!;
  const d = await termFields(b, true);
  const CORE = ['contractType', 'commencementDate', 'expiryDate', 'probationMonths', 'noticeValue', 'noticeUnit', 'workingPattern', 'hoursPerWeek'];
  const touchesCore = CORE.some((k) => k in d && JSON.stringify((c as Record<string, unknown>)[k]) !== JSON.stringify((d as Record<string, unknown>)[k]));
  if (touchesCore && isLockedForEdit(c.status)) {
    return apiResponse.error(res, 'The core terms of a signed contract cannot be edited. Create an amendment (for example a new expiry date) or a renewal instead.', 409, [{ options: ['Create amendment', 'Create renewal'] }]);
  }
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(c.status) && touchesCore) fail(409, 'This contract has already been approved. Cancel it and prepare a new one to change its terms.');
  const cfg = await getPwmConfig();
  const start = dateOnly((d.commencementDate as Date | undefined) ?? c.commencementDate);
  const end = d.expiryDate !== undefined ? (d.expiryDate ? dateOnly(d.expiryDate as Date) : null) : c.expiryDate ? dateOnly(c.expiryDate) : null;
  const type = (d.contractType as string | undefined) ?? c.contractType;
  const errors = validateContractDates({ contractType: type, commencementDate: start, expiryDate: end }, cfg.contractTypes);
  if (errors.length) return apiResponse.error(res, errors[0], 400, errors);
  if (touchesCore) await assertNoOverlap(c.employeeId, type, start, end, c.id, c.predecessorId);
  const upd = await prisma.pwmContract.update({ where: { id: c.id }, data: { ...d, version: { increment: 1 } }, select: { id: true, version: true } });
  await pwmAudit(req, { action: 'CONTRACT_UPDATED', entity: 'PwmContract', entityId: c.id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (c as Record<string, unknown>)[k]])), after: d });
  return apiResponse.success(res, 'Saved.', upd);
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

const load = async (req: Parameters<typeof access>[0]) => {
  const a = access(req);
  const c = await prisma.pwmContract.findUnique({ where: { id: req.params.id }, include: { employee: { select: { ...empBrief, userId: true } }, renewals: { where: { step: { notIn: ['COMPLETED', 'CLOSED'] } }, take: 1 } } });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Contract not found.');
  return { a, c: c! };
};

// POST /contracts/:id/submit
export const submitContract = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (c.status !== 'DRAFT') fail(409, 'Only a draft can be submitted.');
  const cfg = await getPwmConfig();
  const needs = cfg.approvalRequiredTypes.includes(c.contractType);
  await prisma.pwmContract.update({ where: { id: c.id }, data: needs ? { status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' } : { status: 'APPROVED', approvalStatus: 'NOT_REQUIRED' } });
  await pwmAudit(req, { action: needs ? 'CONTRACT_SUBMITTED' : 'CONTRACT_APPROVED_AUTO', entity: 'PwmContract', entityId: c.id, before: { status: c.status }, after: { status: needs ? 'PENDING_APPROVAL' : 'APPROVED' } });
  if (needs) await notifyPwm((await approverUserIds()).filter((id) => id !== a.userId), { title: `Contract awaiting approval: ${c.reference}`, body: `${fullName(c.employee)} (${c.employee.employeeNo}), ${c.contractType}. Review and approve before it can be issued.`, link: `/pwm/contracts/${c.id}` });
  return apiResponse.success(res, needs ? 'Sent for management approval.' : 'Approved for issue (no approval needed for this type).', null);
});

// POST /contracts/:id/approval { approve, note }
export const decideContract = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (c.status !== 'PENDING_APPROVAL') fail(409, 'This contract is not waiting for approval.');
  const cfg = await getPwmConfig();
  if (c.createdById === a.userId && !cfg.allowSelfApproval) fail(403, 'You cannot approve a contract you prepared.');
  const approve = req.body?.approve === true; const note = str(req.body?.note, 500);
  if (!approve && !note) fail(400, 'Say why the contract is being returned.');
  await prisma.pwmContract.update({ where: { id: c.id }, data: approve ? { status: 'APPROVED', approvalStatus: 'APPROVED', approvedById: a.userId, approvedAt: new Date(), approvalNote: note } : { status: 'DRAFT', approvalStatus: 'REJECTED', approvedById: a.userId, approvedAt: new Date(), approvalNote: note } });
  await pwmAudit(req, { action: approve ? 'CONTRACT_APPROVED' : 'CONTRACT_RETURNED', entity: 'PwmContract', entityId: c.id, reason: note ?? undefined });
  if (c.createdById) await notifyPwm([c.createdById], { title: `Contract ${c.reference} ${approve ? 'approved' : 'returned'}`, body: note ?? (approve ? 'It can now be issued.' : 'Please revise it.'), link: `/pwm/contracts/${c.id}` });
  return apiResponse.success(res, approve ? 'Approved.' : 'Returned to draft.', null);
});

// POST /contracts/:id/issue
export const issueContract = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (c.status !== 'APPROVED') fail(409, 'Only an approved contract can be issued.');
  await prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'ISSUED', issuedAt: new Date(), issuedById: a.userId } });
  if (c.predecessorId && ['RENEWAL_PENDING', 'CONTRACT_EXPIRED', 'ACTIVE', 'PROBATION'].includes(c.employee.status)) {
    await applyStatus({ employeeId: c.employeeId, to: 'CONTRACT_ISSUED', reason: `Contract ${c.reference} issued for signature`, requestedById: a.userId, workflow: true }, prisma, req);
  }
  const r = await prisma.pwmRenewal.findFirst({ where: { successorContractId: c.id, step: { notIn: ['COMPLETED', 'CLOSED'] } } });
  if (r) {
    await prisma.pwmRenewal.update({ where: { id: r.id }, data: { step: 'SIGNATURE' } });
    await prisma.pwmRenewalEvent.create({ data: { renewalId: r.id, action: 'ISSUED', actorId: a.userId, note: `Contract ${c.reference} issued for signature.` } });
  }
  await pwmAudit(req, { action: 'CONTRACT_ISSUED', entity: 'PwmContract', entityId: c.id, before: { status: 'APPROVED' }, after: { status: 'ISSUED' } });
  return apiResponse.success(res, 'Issued for signature.', null);
});

// POST /contracts/:id/sign { signedDate, countersignedDate, documentUrl, documentChecksum }
export const signContract = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (c.status !== 'ISSUED') fail(409, 'Only an issued contract can be recorded as signed.');
  const b = req.body ?? {};
  const signed = reqYmd(b.signedDate, 'Date signed by the employee');
  const counter = reqYmd(b.countersignedDate, 'Date countersigned by the company');
  const url = reqStr(b.documentUrl, 'Signed contract (PDF)', 1000);
  if (!/^https:\/\/\S+$/i.test(url)) fail(400, 'The signed copy must be uploaded first.');
  const prev = await prisma.pwmDocument.findFirst({ where: { contractId: c.id, category: 'Contract' }, orderBy: { version: 'desc' }, select: { version: true } });
  await prisma.$transaction([
    prisma.pwmDocument.create({ data: { employeeId: c.employeeId, contractId: c.id, category: 'Contract', name: `Signed contract ${c.reference}`, url, checksum: str(b.documentChecksum, 100), version: (prev?.version ?? 0) + 1, uploadedById: a.userId, restricted: false } }),
    prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'SIGNED', signedDate: fromYmd(signed), countersignedDate: fromYmd(counter), version: { increment: 1 } } }),
  ]);
  await pwmAudit(req, { action: 'CONTRACT_SIGNED', entity: 'PwmContract', entityId: c.id, before: { status: 'ISSUED' }, after: { status: 'SIGNED', signed, counter } });
  const live = await activateContract(c.id, req); // takes effect now if its start date has arrived
  return apiResponse.success(res, live ? 'Signed. The contract is now active.' : `Signed. It becomes active on ${dateOnly(c.commencementDate)}.`, { active: live });
});

// POST /contracts/:id/decline { note }
export const declineContract = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (c.status !== 'ISSUED') fail(409, 'Only an issued contract can be declined.');
  const note = reqStr(req.body?.note, 'Reason', 500);
  await prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'DECLINED', archivedAt: new Date(), notes: [c.notes, `Declined: ${note}`].filter(Boolean).join('\n') } });
  const r = await prisma.pwmRenewal.findFirst({ where: { successorContractId: c.id, step: { notIn: ['COMPLETED', 'CLOSED'] } } });
  if (r) {
    await prisma.pwmRenewal.update({ where: { id: r.id }, data: { step: 'PREPARATION', successorContractId: null } });
    await prisma.pwmRenewalEvent.create({ data: { renewalId: r.id, action: 'DECLINED_BY_EMPLOYEE', actorId: a.userId, note } });
  }
  await pwmAudit(req, { action: 'CONTRACT_DECLINED', entity: 'PwmContract', entityId: c.id, reason: note });
  return apiResponse.success(res, 'Recorded as declined. The renewal is back at preparation.', null);
});

// POST /contracts/:id/cancel { note }
export const cancelContract = handle(async (req, res) => {
  const { c } = await load(req);
  if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED'].includes(c.status)) fail(409, 'Only a contract that has not been signed can be cancelled.');
  const note = reqStr(req.body?.note, 'Reason', 500);
  await prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'CANCELLED', archivedAt: new Date(), predecessorId: null } });
  const r = await prisma.pwmRenewal.findFirst({ where: { successorContractId: c.id, step: { notIn: ['COMPLETED', 'CLOSED'] } } });
  if (r) await prisma.pwmRenewal.update({ where: { id: r.id }, data: { step: 'PREPARATION', successorContractId: null } });
  await pwmAudit(req, { action: 'CONTRACT_CANCELLED', entity: 'PwmContract', entityId: c.id, reason: note });
  return apiResponse.success(res, 'Cancelled.', null);
});

// POST /contracts/:id/amendments { effectiveDate, summary, newExpiryDate, documentUrl }
export const addAmendment = handle(async (req, res) => {
  const { a, c } = await load(req);
  if (!IN_FORCE.includes(c.status) && c.status !== 'SIGNED') fail(409, 'Amendments apply to a signed contract that is in force.');
  const b = req.body ?? {};
  const summary = reqStr(b.summary, 'Summary of the change', 1000);
  const effective = reqYmd(b.effectiveDate, 'Effective date');
  const newExpiry = ymd(b.newExpiryDate, 'New expiry date');
  const url = str(b.documentUrl, 1000);
  if (url && !/^https:\/\/\S+$/i.test(url)) fail(400, 'The addendum link must be a secure (https) upload.');
  if (newExpiry && newExpiry <= dateOnly(c.commencementDate)) fail(400, 'The new expiry date must be after the commencement date.');
  if (newExpiry && c.contractType === 'PERMANENT') fail(400, 'A permanent contract has no expiry date.');
  const oldExpiry = c.expiryDate ? dateOnly(c.expiryDate) : null;
  const today = lagosYmd(new Date());

  const am = await prisma.$transaction(async (tx) => {
    const created = await tx.pwmContractAmendment.create({ data: { contractId: c.id, effectiveDate: fromYmd(effective), summary, newExpiryDate: newExpiry ? fromYmd(newExpiry) : null, documentUrl: url, documentChecksum: str(b.documentChecksum, 100), createdById: a.userId } });
    if (newExpiry && newExpiry !== oldExpiry) {
      // Unsent reminders for the old date are cancelled; the engine re-evaluates against the new date (REM-06).
      await cancelContractReminders(c.id, 'expiry date changed by amendment', tx);
      const reopen = newExpiry >= today;
      await tx.pwmContract.update({ where: { id: c.id }, data: { expiryDate: fromYmd(newExpiry), decisionRecordedAt: null, version: { increment: 1 }, ...(reopen && ['EXPIRED_ACTION_REQUIRED', 'RENEWAL_PENDING'].includes(c.status) ? { status: 'ACTIVE' as const } : {}) } });
      await tx.pwmRenewal.updateMany({ where: { contractId: c.id, step: { notIn: ['COMPLETED', 'CLOSED'] } }, data: { step: 'CLOSED', closedReason: `Superseded by an amendment moving expiry to ${newExpiry}`, completedAt: new Date() } });
      if (reopen && ['CONTRACT_EXPIRED', 'RENEWAL_PENDING'].includes(c.employee.status)) await applyStatus({ employeeId: c.employeeId, to: 'ACTIVE', reason: `Contract ${c.reference} extended to ${newExpiry}`, requestedById: a.userId, workflow: true }, tx, req);
    }
    return created;
  });
  await pwmAudit(req, { action: 'CONTRACT_AMENDED', entity: 'PwmContract', entityId: c.id, before: { expiryDate: oldExpiry }, after: { expiryDate: newExpiry ?? oldExpiry }, reason: summary, meta: { amendmentId: am.id, effective } });
  return apiResponse.success(res, 'Amendment recorded.', am, 201);
});

// POST /contracts/:id/documents { url, checksum, name }: a new version of a contract file (CON-07)
export const addContractDocument = handle(async (req, res) => {
  const { a, c } = await load(req);
  const b = req.body ?? {};
  const url = reqStr(b.url, 'File link', 1000);
  if (!/^https:\/\/\S+$/i.test(url)) fail(400, 'The file must be uploaded first.');
  const prev = await prisma.pwmDocument.findFirst({ where: { contractId: c.id, category: 'Contract' }, orderBy: { version: 'desc' }, select: { version: true } });
  const d = await prisma.pwmDocument.create({ data: { employeeId: c.employeeId, contractId: c.id, category: 'Contract', name: str(b.name, 200) ?? `Contract ${c.reference}`, url, checksum: str(b.checksum, 100), version: (prev?.version ?? 0) + 1, uploadedById: a.userId } });
  await pwmAudit(req, { action: 'CONTRACT_DOCUMENT_ADDED', entity: 'PwmContract', entityId: c.id, after: { version: d.version, checksum: d.checksum } });
  return apiResponse.success(res, 'Uploaded.', d, 201);
});

