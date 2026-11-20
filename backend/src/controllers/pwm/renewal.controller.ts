// PWM: the renewal workflow (recommendation, decision, preparation) and the Automated Reminders screen.
import { Prisma, PwmRenewalDecision, PwmRenewalStep } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextContractRef } from '../../services/pwm/settings';
import {
  DECISIONS_NEEDING_NEW_CONTRACT, addDays, addMonths, can, dateOnly, daysBetween, durationBetween, fromYmd, fullName, lagosYmd, renewalDueDates, slaState, validateContractDates,
} from '../../services/pwm/rules';
import { HEARTBEAT_ID, runReminderEngine } from '../../services/pwm/reminders';
import { applyStatus, approverUserIds, canSeeEmployee, cancelContractReminders, commitStatus, employeeScope, hrAdminUserIds } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, oneOf, page, reqStr, reqYmd, str } from './common';

const DECISIONS: readonly PwmRenewalDecision[] = ['RENEW_SAME_TERMS', 'RENEW_WITH_CHANGES', 'EXTEND', 'CONVERT_TO_PERMANENT', 'DO_NOT_RENEW', 'OTHER'];
const OPEN_STEPS: PwmRenewalStep[] = ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'];

const dueFor = (r: { step: PwmRenewalStep; dueRecommendation: Date; dueDecision: Date; duePreparation: Date; dueIssuance: Date; dueSignature: Date }): string | null => {
  const m: Partial<Record<PwmRenewalStep, Date>> = { RECOMMENDATION: r.dueRecommendation, DECISION: r.dueDecision, PREPARATION: r.duePreparation, ISSUANCE: r.dueIssuance, SIGNATURE: r.dueSignature };
  return m[r.step] ? dateOnly(m[r.step] as Date) : null;
};

const ctxInclude = {
  contract: { select: { id: true, reference: true, contractType: true, status: true, commencementDate: true, expiryDate: true, responsibleOfficerUserId: true, predecessorId: true } },
  employee: { select: { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, jobTitle: true, departmentId: true, hrOfficerUserId: true, userId: true, status: true, department: { select: { id: true, name: true } } } },
} satisfies Prisma.PwmRenewalInclude;

// ── Pipeline ─────────────────────────────────────────────────────────────────

// GET /renewals?view=open|done&departmentId=&step=
export const listRenewals = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const today = lagosYmd(new Date());
  const done = q.view === 'done';
  const where: Prisma.PwmRenewalWhereInput = {
    employee: { AND: [employeeScope(a), ...(q.departmentId ? [{ departmentId: q.departmentId }] : [])] },
    ...(done ? { step: { in: ['COMPLETED', 'CLOSED'] as PwmRenewalStep[] }, updatedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } : { step: q.step ? (q.step as PwmRenewalStep) : { in: OPEN_STEPS } }),
  };
  const rows = await prisma.pwmRenewal.findMany({ where, include: ctxInclude, orderBy: { dueDecision: 'asc' }, take: 500 });
  const officers = await nameMap(rows.map((r) => r.contract.responsibleOfficerUserId ?? r.employee.hrOfficerUserId));
  const data = rows.map((r) => {
    const due = dueFor(r);
    const expiry = r.contract.expiryDate ? dateOnly(r.contract.expiryDate) : null;
    return {
      id: r.id, step: r.step, recommendation: r.recommendation, decision: r.decision, due, sla: due ? slaState(due, today, false) : 'DONE',
      daysToExpiry: expiry ? daysBetween(today, expiry) : null, contract: r.contract, employee: r.employee,
      officerName: officers.get(r.contract.responsibleOfficerUserId ?? r.employee.hrOfficerUserId ?? '') ?? null, closedReason: r.closedReason, successorContractId: r.successorContractId,
    };
  });
  const open = done ? [] : data;
  const summary = {
    recommendationsOutstanding: open.filter((r) => r.step === 'RECOMMENDATION').length,
    awaitingDecision: open.filter((r) => r.step === 'DECISION').length,
    approvedNotSigned: open.filter((r) => ['PREPARATION', 'ISSUANCE', 'SIGNATURE'].includes(r.step)).length,
    overdue: open.filter((r) => r.sla === 'OVERDUE').length,
  };
  return apiResponse.success(res, 'Renewals.', { renewals: data, summary });
});

// GET /renewals/:id
export const getRenewal = handle(async (req, res) => {
  const a = access(req);
  const r = await prisma.pwmRenewal.findUnique({ where: { id: req.params.id }, include: { ...ctxInclude, events: { orderBy: { createdAt: 'asc' } } } });
  if (!r || !canSeeEmployee(a, r.employee)) fail(404, 'Renewal not found.');
  const rn = r!;
  const [history, statuses, names] = await Promise.all([
    prisma.pwmContract.findMany({ where: { employeeId: rn.employee.id }, orderBy: { commencementDate: 'asc' }, select: { id: true, reference: true, contractType: true, status: true, commencementDate: true, expiryDate: true } }),
    prisma.pwmStatusChange.findMany({ where: { employeeId: rn.employee.id, appliedAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 8, select: { toStatus: true, reason: true, effectiveDate: true } }),
    nameMap([rn.recommendedById, rn.decidedById, ...rn.events.map((e) => e.actorId)]),
  ]);
  const today = lagosYmd(new Date());
  const due = dueFor(rn);
  const latestReview = await prisma.pwmReview.findFirst({ where: { employeeId: rn.employee.id, status: 'ACKNOWLEDGED' }, orderBy: { ackedAt: 'desc' }, include: { cycle: { select: { name: true } } } });
  return apiResponse.success(res, 'Renewal.', {
    latestReview: latestReview ? { cycle: latestReview.cycle.name, rating: latestReview.managerRating, summary: latestReview.summary, strengths: latestReview.strengths, improvements: latestReview.improvements, at: latestReview.ackedAt } : null,
    ...rn, sla: due ? slaState(due, today, false) : 'DONE', due, history, recentStatus: statuses,
    recommendedByName: rn.recommendedById ? names.get(rn.recommendedById) ?? null : null, decidedByName: rn.decidedById ? names.get(rn.decidedById) ?? null : null,
    events: rn.events.map((e) => ({ ...e, actorName: e.actorId ? names.get(e.actorId) ?? null : 'System' })),
    canRecommend: rn.step === 'RECOMMENDATION' && can(a, 'recommend') && a.employeeId !== rn.employee.id && (a.level !== 'DEPARTMENT_HEAD' || canSeeEmployee(a, rn.employee)),
    canDecide: rn.step === 'DECISION' && can(a, 'decide') && a.employeeId !== rn.employee.id,
    canPrepare: rn.step === 'PREPARATION' && can(a, 'manageContracts'),
  });
});

const addEvent = (renewalId: string, action: string, actorId: string | null, note?: string | null) => prisma.pwmRenewalEvent.create({ data: { renewalId, action, actorId, note: note ?? null } });

// POST /contracts/:id/renewal : open a renewal task by hand (the engine normally does this)
export const openRenewal = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmContract.findUnique({ where: { id: req.params.id }, include: { employee: { select: { id: true, departmentId: true, status: true } }, renewals: { where: { step: { in: OPEN_STEPS } }, select: { id: true } } } });
  if (!c || !canSeeEmployee(a, c.employee)) fail(404, 'Contract not found.');
  const k = c!;
  if (!k.expiryDate) fail(409, 'A contract with no expiry date has nothing to renew.');
  if (!['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'].includes(k.status)) fail(409, 'Only a contract in force can be renewed.');
  if (k.renewals.length) fail(409, 'A renewal is already open for this contract.');
  const d = renewalDueDates(dateOnly(k.expiryDate as Date));
  const r = await prisma.pwmRenewal.create({ data: { contractId: k.id, employeeId: k.employeeId, dueRecommendation: fromYmd(d.recommendation), dueDecision: fromYmd(d.decision), duePreparation: fromYmd(d.preparation), dueIssuance: fromYmd(d.issuance), dueSignature: fromYmd(d.signature) } });
  await addEvent(r.id, 'OPENED', a.userId, 'Opened manually.');
  if (k.status === 'ACTIVE') await prisma.pwmContract.update({ where: { id: k.id }, data: { status: 'RENEWAL_PENDING' } });
  if (['ACTIVE', 'PROBATION'].includes(k.employee.status)) await applyStatus({ employeeId: k.employeeId, to: 'RENEWAL_PENDING', reason: 'Renewal opened', requestedById: a.userId }, prisma, req);
  await pwmAudit(req, { action: 'RENEWAL_OPENED', entity: 'PwmContract', entityId: k.id, after: { renewalId: r.id } });
  return apiResponse.success(res, 'Renewal opened.', r, 201);
});

// POST /renewals/:id/recommend { recommendation, note }
export const recommend = handle(async (req, res) => {
  const a = access(req);
  const r = await prisma.pwmRenewal.findUnique({ where: { id: req.params.id }, include: ctxInclude });
  if (!r || !canSeeEmployee(a, r.employee)) fail(404, 'Renewal not found.');
  const rn = r!;
  if (rn.step !== 'RECOMMENDATION') fail(409, 'This renewal is no longer waiting for a recommendation.');
  if (a.employeeId === rn.employee.id) fail(403, 'You cannot recommend on your own contract.');
  const recommendation = oneOf(req.body?.recommendation, DECISIONS, 'Recommendation');
  const note = reqStr(req.body?.note, 'Justification', 1500); // AC-REN-01: always justified
  await prisma.pwmRenewal.update({ where: { id: rn.id }, data: { recommendation, recommendationNote: note, recommendedById: a.userId, recommendedAt: new Date(), step: 'DECISION' } });
  await addEvent(rn.id, 'RECOMMENDED', a.userId, `${recommendation}: ${note}`);
  await pwmAudit(req, { action: 'RENEWAL_RECOMMENDED', entity: 'PwmContract', entityId: rn.contractId, after: { recommendation }, reason: note });
  await notifyPwm((await approverUserIds()).filter((id) => id !== a.userId), { title: `Renewal decision needed: ${fullName(rn.employee)} (${rn.employee.employeeNo})`, body: `Recommendation: ${recommendation.replace(/_/g, ' ').toLowerCase()}. Contract ${rn.contract.reference} expires ${rn.contract.expiryDate ? dateOnly(rn.contract.expiryDate) : 'n/a'}.`, link: `/pwm/renewals/${rn.id}` });
  return apiResponse.success(res, 'Recommendation recorded and sent for decision.', null);
});

// POST /renewals/:id/decide { outcome: APPROVE|MODIFY|REJECT, decision, note, newExpiryDate }
export const decide = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const r = await prisma.pwmRenewal.findUnique({ where: { id: req.params.id }, include: ctxInclude });
  if (!r || !canSeeEmployee(a, r.employee)) fail(404, 'Renewal not found.');
  const rn = r!;
  if (rn.step !== 'DECISION') fail(409, 'This renewal is not waiting for a decision.');
  if (a.employeeId === rn.employee.id) fail(403, 'You cannot decide on your own contract.');
  if (rn.recommendedById === a.userId && !cfg.allowSelfApproval) fail(403, 'You made the recommendation, so someone else must decide.');
  const outcome = oneOf(req.body?.outcome, ['APPROVE', 'MODIFY', 'REJECT'] as const, 'Outcome');
  const note = str(req.body?.note, 1500);
  const today = lagosYmd(new Date());

  if (outcome === 'REJECT') {
    if (!note) fail(400, 'A reason is required when sending a recommendation back.');
    await prisma.pwmRenewal.update({ where: { id: rn.id }, data: { step: 'RECOMMENDATION', decisionNote: note } });
    await addEvent(rn.id, 'REJECTED', a.userId, note);
    await pwmAudit(req, { action: 'RENEWAL_REJECTED', entity: 'PwmContract', entityId: rn.contractId, reason: note ?? undefined });
    return apiResponse.success(res, 'Sent back to the department head.', null);
  }
  const decision: PwmRenewalDecision = outcome === 'MODIFY' ? oneOf(req.body?.decision, DECISIONS, 'Decision') : (rn.recommendation as PwmRenewalDecision);
  if (outcome === 'MODIFY' && !note) fail(400, 'A reason is required when modifying the recommendation.');
  const c = rn.contract;
  const expiry = c.expiryDate ? dateOnly(c.expiryDate) : null;

  if (decision === 'EXTEND') {
    const newExpiry = reqYmd(req.body?.newExpiryDate, 'New expiry date');
    if (expiry && newExpiry <= expiry) fail(400, 'The extension must end after the current expiry date.');
    await prisma.$transaction(async (tx) => {
      await tx.pwmContractAmendment.create({ data: { contractId: c.id, effectiveDate: fromYmd(today), summary: `Extension approved by management${note ? `: ${note}` : ''}`, newExpiryDate: fromYmd(newExpiry), createdById: a.userId } });
      await cancelContractReminders(c.id, 'extension approved', tx);
      await tx.pwmContract.update({ where: { id: c.id }, data: { expiryDate: fromYmd(newExpiry), status: 'ACTIVE', renewalDecision: 'EXTEND', decidedById: a.userId, decisionRecordedAt: null, version: { increment: 1 } } });
      await tx.pwmRenewal.update({ where: { id: rn.id }, data: { step: 'COMPLETED', decision, decisionNote: note, decidedById: a.userId, decidedAt: new Date(), newExpiryDate: fromYmd(newExpiry), completedAt: new Date(), closedReason: `Extended to ${newExpiry}` } });
      if (['RENEWAL_PENDING', 'CONTRACT_EXPIRED'].includes(rn.employee.status)) await applyStatus({ employeeId: rn.employee.id, to: 'ACTIVE', reason: `Contract ${c.reference} extended to ${newExpiry}`, requestedById: a.userId, approvedById: a.userId, workflow: true }, tx, req);
    });
    await addEvent(rn.id, 'APPROVED', a.userId, `Extend to ${newExpiry}${note ? `. ${note}` : ''}`);
    await pwmAudit(req, { action: 'RENEWAL_DECIDED', entity: 'PwmContract', entityId: c.id, after: { decision, newExpiry }, reason: note ?? undefined });
    return apiResponse.success(res, `Extension approved. New expiry ${newExpiry}; reminders restart from that date.`, null);
  }

  // Any other decision is an authorised decision: it stops the expiry reminders (REM-05, AC-REM-02).
  await prisma.$transaction(async (tx) => {
    await tx.pwmContract.update({ where: { id: c.id }, data: { renewalDecision: decision, decidedById: a.userId, decisionRecordedAt: new Date(), ...(decision === 'DO_NOT_RENEW' ? { status: 'NOT_RENEWED' as const } : {}), version: { increment: 1 } } });
    const cancelled = await cancelContractReminders(c.id, 'decision recorded', tx);
    await tx.pwmRenewal.update({ where: { id: rn.id }, data: { decision, decisionNote: note, decidedById: a.userId, decidedAt: new Date(), step: decision === 'DO_NOT_RENEW' ? 'CLOSED' : 'PREPARATION', ...(decision === 'DO_NOT_RENEW' ? { closedReason: 'Not renewed', completedAt: new Date() } : {}) } });
    await pwmAudit(req, { action: 'REMINDERS_CANCELLED', entity: 'PwmContract', entityId: c.id, meta: { cancelled, why: 'decision recorded' } }, tx);
  });
  await addEvent(rn.id, outcome === 'MODIFY' ? 'MODIFIED' : 'APPROVED', a.userId, `${decision}${note ? `: ${note}` : ''}`);
  await pwmAudit(req, { action: 'RENEWAL_DECIDED', entity: 'PwmContract', entityId: c.id, after: { decision, outcome }, reason: note ?? undefined });

  if (decision === 'DO_NOT_RENEW') {
    // Offboarding starts with the final working day at the expiry date. The employee is not marked terminated; HR records the exit (AC-REN-04).
    const last = expiry ?? today;
    const r2 = await commitStatus({ employeeId: rn.employee.id, to: 'NOTICE_PERIOD', reason: `Contract ${c.reference} will not be renewed`, requestedById: a.userId, approvedById: a.userId, workflow: true, exitType: 'NON_RENEWAL', finalWorkingDay: last }, req);
    const list = await prisma.pwmChecklist.findFirst({ where: { employeeId: rn.employee.id, kind: 'OFFBOARDING', status: 'OPEN' }, select: { id: true } });
    if (list) await prisma.pwmChecklistTask.create({ data: { checklistId: list.id, stage: 'Initiation', title: 'Prepare and issue the non-renewal notice letter', ownerRole: 'HR_OFFICER', assigneeUserId: c.responsibleOfficerUserId ?? rn.employee.hrOfficerUserId, dueDate: fromYmd(today), sortOrder: -1 } });
    await notifyPwm(await hrAdminUserIds(), { title: `Not renewed: ${fullName(rn.employee)} (${rn.employee.employeeNo})`, body: `Management decided not to renew ${c.reference}. Offboarding has started with the final working day ${last}. Record the exit when it happens.${r2.ok ? '' : ' (Status could not be moved automatically.)'}`, link: `/pwm/employees/${rn.employee.id}` });
    return apiResponse.success(res, 'Decision recorded. Offboarding has started; reminders for this contract have stopped.', null);
  }
  const owner = c.responsibleOfficerUserId ?? rn.employee.hrOfficerUserId;
  await notifyPwm([owner, ...(owner ? [] : await hrAdminUserIds())], { title: `Renewal approved: ${fullName(rn.employee)} (${rn.employee.employeeNo})`, body: `${decision.replace(/_/g, ' ').toLowerCase()}. Prepare the new contract so it can be issued and signed before ${expiry ?? 'expiry'}.`, link: `/pwm/renewals/${rn.id}` });
  return apiResponse.success(res, 'Decision recorded. The new contract can now be prepared.', null);
});

// POST /renewals/:id/prepare { contractType, commencementDate, expiryDate, ...terms }
export const prepare = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const r = await prisma.pwmRenewal.findUnique({ where: { id: req.params.id }, include: ctxInclude });
  if (!r || !canSeeEmployee(a, r.employee)) fail(404, 'Renewal not found.');
  const rn = r!;
  if (rn.step !== 'PREPARATION' || !rn.decision || !DECISIONS_NEEDING_NEW_CONTRACT.includes(rn.decision)) fail(409, 'This renewal is not ready for a new contract.');
  const prev = await prisma.pwmContract.findUnique({ where: { id: rn.contractId } });
  if (!prev) fail(404, 'Contract not found.');
  const p = prev!;
  const b = req.body ?? {};
  const type = b.contractType ? oneOf(b.contractType, cfg.contractTypes.map((t) => t.key), 'Contract type') : rn.decision === 'CONVERT_TO_PERMANENT' ? 'PERMANENT' : p.contractType;
  const prevExpiry = p.expiryDate ? dateOnly(p.expiryDate) : null;
  const start = b.commencementDate ? reqYmd(b.commencementDate, 'Commencement date') : prevExpiry ? addDays(prevExpiry, 1) : lagosYmd(new Date());
  if (prevExpiry && start > addDays(prevExpiry, 1)) fail(400, `The new contract would leave a gap after ${prevExpiry}. It should start on or before ${addDays(prevExpiry, 1)}.`);
  if (start <= dateOnly(p.commencementDate)) fail(400, 'The new contract must start after the one it replaces.');
  let end: string | null = null;
  if (type !== 'PERMANENT') {
    if (b.expiryDate) end = reqYmd(b.expiryDate, 'Expiry date');
    else {
      const d = durationBetween(dateOnly(p.commencementDate), prevExpiry ?? start);
      const months = d.years * 12 + d.months;
      end = months > 0 ? addDays(addMonths(start, months), -1) : addDays(start, Math.max(d.days, 1) - 1);
    }
  }
  const errors = validateContractDates({ contractType: type, commencementDate: start, expiryDate: end }, cfg.contractTypes);
  if (errors.length) return apiResponse.error(res, errors[0], 400, errors);
  const reference = await nextContractRef(cfg.contractRefPrefix, Number(start.slice(0, 4)));
  const created = await prisma.pwmContract.create({
    data: {
      reference, employeeId: p.employeeId, departmentName: rn.employee.department?.name ?? p.departmentName, jobTitle: rn.employee.jobTitle, contractType: type,
      status: 'APPROVED', approvalStatus: 'APPROVED', approvedById: rn.decidedById, approvedAt: rn.decidedAt, approvalNote: 'Approved through the renewal decision.',
      commencementDate: fromYmd(start), expiryDate: end ? fromYmd(end) : null, predecessorId: p.id, renewalEligibility: 'SUBJECT_TO_REVIEW',
      probationMonths: rn.decision === 'CONVERT_TO_PERMANENT' ? null : (b.probationMonths ?? null), noticeValue: b.noticeValue ?? p.noticeValue, noticeUnit: b.noticeUnit ?? p.noticeUnit,
      workingPattern: b.workingPattern ?? p.workingPattern, hoursPerWeek: b.hoursPerWeek ?? p.hoursPerWeek, responsibleOfficerUserId: p.responsibleOfficerUserId, createdById: a.userId,
      notes: `Renewal of ${p.reference}`,
    },
    select: { id: true, reference: true },
  });
  await prisma.pwmRenewal.update({ where: { id: rn.id }, data: { step: 'ISSUANCE', successorContractId: created.id } });
  await addEvent(rn.id, 'PREPARED', a.userId, `New contract ${created.reference} prepared (${start} to ${end ?? 'open-ended'}).`);
  await pwmAudit(req, { action: 'RENEWAL_CONTRACT_PREPARED', entity: 'PwmContract', entityId: p.id, after: { successor: created.reference, start, end } });
  return apiResponse.success(res, `Contract ${created.reference} prepared. Issue it for signature next.`, created, 201);
});

// ── Automated Reminders screen (REM-12) ──────────────────────────────────────

// GET /reminders?view=sent|failed|unacknowledged|cancelled|mine&kind=&contractId=
export const listReminders = handle(async (req, res) => {
  const a = access(req);
  const q = req.query as Record<string, string>;
  const { page: p, limit, skip } = page(q, 50);
  const manage = can(a, 'manageReminders') || a.level === 'EXECUTIVE' || a.level === 'AUDITOR';
  const where: Prisma.PwmReminderWhereInput = {
    ...(q.view === 'mine' || !manage ? { recipientUserId: a.userId } : {}),
    ...(q.view === 'failed' ? { status: 'FAILED' } : q.view === 'cancelled' ? { status: 'CANCELLED' } : q.view === 'unacknowledged' ? { requiresAck: true, acknowledgedAt: null, status: { in: ['SENT', 'DELIVERED'] as never[] } } : q.view === 'sent' ? { status: { in: ['SENT', 'DELIVERED'] as never[] } } : q.view === 'queued' ? { status: 'QUEUED' } : {}),
    ...(q.kind ? { kind: q.kind } : {}), ...(q.contractId ? { contractId: q.contractId } : {}),
  };
  const [rows, total] = await Promise.all([prisma.pwmReminder.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }), prisma.pwmReminder.count({ where })]);
  const names = await nameMap(rows.map((r) => r.recipientUserId));
  return apiResponse.paginated(res, 'Reminders.', rows.map((r) => ({ ...r, recipientName: names.get(r.recipientUserId) ?? 'Unknown', canAcknowledge: r.recipientUserId === a.userId && !r.acknowledgedAt, canResend: can(a, 'manageReminders') && r.status !== 'CANCELLED' })), { page: p, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /reminders/upcoming : what the engine will send next, from the live schedule
export const upcomingReminders = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmContract.findMany({
    where: { status: { in: ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'] }, expiryDate: { not: null }, decisionRecordedAt: null, archivedAt: null, employee: employeeScope(a) },
    select: { id: true, reference: true, expiryDate: true, tiers: { select: { tierKey: true, expiryDate: true } }, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } }, take: 1500,
  });
  const out: { contractId: string; reference: string; employee: string; tier: string; severity: string; sendsOn: string; daysAway: number }[] = [];
  for (const c of rows) {
    const expiry = dateOnly(c.expiryDate as Date);
    const done = new Set(c.tiers.filter((t) => dateOnly(t.expiryDate) === expiry).map((t) => t.tierKey));
    for (const t of cfg.tiers.filter((x) => !x.repeat)) {
      const on = addDays(expiry, -t.offsetDays);
      if (on < today || done.has(t.key)) continue;
      out.push({ contractId: c.id, reference: c.reference, employee: `${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeNo})`, tier: t.key, severity: t.severity, sendsOn: on, daysAway: daysBetween(today, on) });
    }
  }
  out.sort((x, y) => x.sendsOn.localeCompare(y.sendsOn));
  return apiResponse.success(res, 'Upcoming.', out.slice(0, 300));
});

// POST /reminders/:id/ack
export const acknowledge = handle(async (req, res) => {
  const a = access(req);
  const r = await prisma.pwmReminder.findUnique({ where: { id: req.params.id } });
  if (!r) fail(404, 'Reminder not found.');
  if (r!.recipientUserId !== a.userId && !can(a, 'manageReminders')) fail(403, 'Forbidden. Insufficient permissions.');
  if (r!.acknowledgedAt) return apiResponse.success(res, 'Already acknowledged.', null);
  await prisma.pwmReminder.update({ where: { id: r!.id }, data: { acknowledgedAt: new Date(), readAt: r!.readAt ?? new Date() } });
  await pwmAudit(req, { action: 'REMINDER_ACKNOWLEDGED', entity: 'PwmContract', entityId: r!.contractId ?? r!.id, meta: { reminderId: r!.id, tier: r!.tierKey, onBehalf: r!.recipientUserId !== a.userId } });
  return apiResponse.success(res, 'Acknowledged.', null);
});

// POST /reminders/:id/resend
export const resend = handle(async (req, res) => {
  const r = await prisma.pwmReminder.findUnique({ where: { id: req.params.id } });
  if (!r || r.status === 'CANCELLED') fail(404, 'Reminder not found or cancelled.');
  await prisma.pwmReminder.update({ where: { id: r!.id }, data: { status: 'QUEUED', attempts: 0, nextAttemptAt: new Date(), lastError: null } });
  await pwmAudit(req, { action: 'REMINDER_RESENT', entity: 'PwmContract', entityId: r!.contractId ?? r!.id, meta: { reminderId: r!.id } });
  return apiResponse.success(res, 'Queued to send again.', null);
});

// GET /engine : heartbeat visible to administrators (REM risks table)
export const engineStatus = handle(async (_req, res) => {
  const row = await prisma.pwmSettings.findUnique({ where: { id: HEARTBEAT_ID } });
  const cfg = (row?.config ?? {}) as { lastRunAt?: string; ok?: boolean; error?: string; result?: unknown };
  const ageMin = cfg.lastRunAt ? Math.round((Date.now() - new Date(cfg.lastRunAt).getTime()) / 60_000) : null;
  const [queued, failed, noOfficer] = await Promise.all([
    prisma.pwmReminder.count({ where: { status: 'QUEUED' } }), prisma.pwmReminder.count({ where: { status: 'FAILED' } }),
    prisma.pwmContract.count({ where: { status: { in: ['ACTIVE', 'RENEWAL_PENDING'] }, responsibleOfficerUserId: null, employee: { hrOfficerUserId: null }, archivedAt: null } }),
  ]);
  return apiResponse.success(res, 'Engine.', { ...cfg, ageMinutes: ageMin, healthy: cfg.ok !== false && ageMin !== null && ageMin < 150, queued, failed, contractsWithoutOfficer: noOfficer });
});

// POST /engine/run (super admin): run a pass now, including evaluation regardless of the hour
export const runEngine = handle(async (req, res) => {
  const out = await runReminderEngine(new Date(), { force: true });
  await pwmAudit(req, { action: 'ENGINE_RUN_MANUAL', entity: 'PwmSettings', entityId: 'engine', meta: { ...out } });
  return apiResponse.success(res, 'Reminder engine ran.', out);
});

