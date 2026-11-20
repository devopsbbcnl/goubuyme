// My HR, Phase 4: learning, assets, my cases and grievance intake, recognition, expenses and travel.
import { Prisma } from '@prisma/client';
import { RequestHandler, Response } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextNumber } from '../../services/pwm/settings';
import { LearningError, decideEnrolment, mandatoryCompliance, requestEnrolment } from '../../services/pwm/learning';
import { dateOnly, fullName, lagosYmd } from '../../services/pwm/rules';
import { hrAdminUserIds } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { MyHrRequest } from '../../middleware/myhr.middleware';
import type { PwmRequest } from '../../middleware/pwm.middleware';
import { SpendError, decideClaim, decideTravel, requestTravel, submitClaim } from './spend.controller';
import { HttpError, fail, oneOf, reqStr, reqYmd, str } from './common';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const my = (fn: (req: MyHrRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req as MyHrRequest, res).catch((err) => {
    if (err instanceof HttpError || err instanceof LearningError || err instanceof SpendError) return apiResponse.error(res, err.message, (err as { status: number }).status);
    next(err);
  });
};
const me = (r: MyHrRequest) => r.my!;
const audit = (r: MyHrRequest) => r as unknown as PwmRequest;

// ── Learning ─────────────────────────────────────────────────────────────────

// GET /my-hr/learning
export const myLearning = my(async (req, res) => {
  const m = me(req);
  const [courses, mine, plans, skills, comp] = await Promise.all([
    prisma.pwmCourse.findMany({ where: { active: true }, orderBy: { title: 'asc' } }),
    prisma.pwmEnrolment.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, include: { course: { select: { title: true, mandatory: true } } } }),
    prisma.pwmDevelopmentPlan.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' } }),
    prisma.pwmSkillAssessment.findMany({ where: { employeeId: m.employeeId }, orderBy: { assessedAt: 'desc' }, take: 30, include: { skill: { select: { name: true } } } }),
    mandatoryCompliance(),
  ]);
  const mandatory = comp.map((c) => ({ courseId: c.courseId, course: c.course, upToDate: !c.overdue.some((o) => o.id === m.employeeId), recurrenceMonths: c.recurrenceMonths }));
  return apiResponse.success(res, 'Learning.', {
    catalogue: courses.map((c) => ({ id: c.id, title: c.title, provider: c.provider, mode: c.mode, cost: num(c.cost), durationHours: num(c.durationHours), mandatory: c.mandatory })),
    enrolments: mine.map((e) => ({ id: e.id, course: e.course.title, mandatory: e.course.mandatory, status: e.status, assigned: e.assigned, completedAt: e.completedAt, certificateUrl: e.certificateUrl, note: e.note })),
    mandatory, plans, skills: skills.map((s) => ({ skill: s.skill.name, level: s.level, at: s.assessedAt })),
  });
});
export const requestCourse = my(async (req, res) => { await requestEnrolment(reqStr(req.body?.courseId, 'Course', 60), me(req).employeeId, me(req).userId, false); return apiResponse.success(res, 'Request sent for approval.', null, 201); });
export const attachCertificate = my(async (req, res) => {
  const e = await prisma.pwmEnrolment.findUnique({ where: { id: req.params.id } });
  if (!e || e.employeeId !== me(req).employeeId) fail(404, 'Enrolment not found.');
  const url = reqStr(req.body?.url, 'Certificate', 1000);
  if (!/^https:\/\//i.test(url)) fail(400, 'Upload the certificate first.');
  await prisma.pwmEnrolment.update({ where: { id: e!.id }, data: { certificateUrl: url } });
  return apiResponse.success(res, 'Attached. HR will confirm completion.', null);
});
export const cancelMyCourse = my(async (req, res) => {
  const e = await prisma.pwmEnrolment.findUnique({ where: { id: req.params.id } });
  if (!e || e.employeeId !== me(req).employeeId || e.status !== 'REQUESTED') fail(404, 'Only a request that is still waiting can be withdrawn.');
  await prisma.pwmEnrolment.update({ where: { id: e!.id }, data: { status: 'CANCELLED' } });
  return apiResponse.success(res, 'Withdrawn.', null);
});
export const myPlan = my(async (req, res) => {
  const goal = reqStr(req.body?.goal, 'Goal', 500);
  const p = await prisma.pwmDevelopmentPlan.create({ data: { employeeId: me(req).employeeId, goal, actions: (Array.isArray(req.body?.actions) ? req.body.actions : []).slice(0, 12).map((x: { title?: unknown; dueDate?: unknown }) => ({ title: String(x.title ?? '').slice(0, 200), dueDate: String(x.dueDate ?? '').slice(0, 10), done: false })).filter((x: { title: string }) => x.title), createdById: me(req).userId } });
  return apiResponse.success(res, 'Saved.', p, 201);
});

// ── Assets ───────────────────────────────────────────────────────────────────

export const myAssets = my(async (req, res) => {
  const rows = await prisma.pwmAssetAssignment.findMany({ where: { employeeId: me(req).employeeId }, orderBy: { assignedAt: 'desc' }, include: { asset: { select: { tag: true, name: true, category: true } } } });
  return apiResponse.success(res, 'Assets.', rows.map((r) => ({ id: r.id, tag: r.asset.tag, name: r.asset.name, category: r.asset.category, status: r.status, assignedAt: r.assignedAt, conditionOut: r.conditionOut, acknowledgedAt: r.acknowledgedAt, returnedAt: r.returnedAt })));
});
export const acknowledgeAsset = my(async (req, res) => {
  const a = await prisma.pwmAssetAssignment.findUnique({ where: { id: req.params.id }, include: { asset: { select: { tag: true } } } });
  if (!a || a.employeeId !== me(req).employeeId || a.status !== 'ACTIVE') fail(404, 'Assignment not found.');
  await prisma.pwmAssetAssignment.update({ where: { id: a!.id }, data: { acknowledgedAt: new Date() } });
  await pwmAudit(audit(req), { action: 'ASSET_CUSTODY_ACKNOWLEDGED', entity: 'PwmEmployee', entityId: me(req).employeeId, meta: { tag: a!.asset.tag } });
  return apiResponse.success(res, 'Thank you. Custody is recorded in your name.', null);
});

// ── Cases (the employee's side) ──────────────────────────────────────────────

// GET /my-hr/cases : cases about me, showing only what I am entitled to see
export const myCases = my(async (req, res) => {
  const rows = await prisma.pwmCase.findMany({ where: { employeeId: me(req).employeeId }, orderBy: { createdAt: 'desc' }, include: { events: { where: { kind: { in: ['QUERY', 'RESPONSE', 'APPEAL', 'HEARING'] } }, orderBy: { createdAt: 'asc' } } } });
  const today = lagosYmd(new Date());
  return apiResponse.success(res, 'My cases.', rows.map((c) => {
    const decided = ['OUTCOME', 'APPEAL', 'CLOSED'].includes(c.stage);
    return {
      id: c.id, reference: c.reference, type: c.type, category: c.category, stage: c.stage, summary: c.type === 'GRIEVANCE' ? c.summary : null, responseDue: c.responseDue, hearingAt: c.hearingAt,
      outcome: decided ? c.outcome : null, outcomeNote: decided ? c.outcomeNote : null, appealDue: decided ? c.appealDue : null, canRespond: c.type === 'DISCIPLINARY' && !!c.responseDue && c.stage !== 'CLOSED' && c.stage !== 'OUTCOME',
      canAppeal: decided && c.stage !== 'CLOSED' && c.stage !== 'APPEAL' && !!c.appealDue && dateOnly(c.appealDue) >= today, events: c.events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, createdAt: e.createdAt })),
    };
  }));
});
export const respondToCase = my(async (req, res) => {
  const c = await prisma.pwmCase.findUnique({ where: { id: req.params.id }, include: { handlers: true } });
  if (!c || c.employeeId !== me(req).employeeId || c.stage === 'CLOSED') fail(404, 'Case not found.');
  await prisma.pwmCaseEvent.create({ data: { caseId: c!.id, kind: 'RESPONSE', text: reqStr(req.body?.text, 'Response', 4000), byUserId: me(req).userId } });
  await pwmAudit(audit(req), { action: 'CASE_RESPONSE', entity: 'PwmCase', entityId: c!.id, meta: { reference: c!.reference } });
  await notifyPwm(c!.handlers.filter((h) => !h.recusedAt).map((h) => h.userId), { title: `Response received: ${c!.reference}`, body: 'The employee has responded.', link: '/pwm/cases' });
  return apiResponse.success(res, 'Your response has been recorded.', null, 201);
});
export const appealCase = my(async (req, res) => {
  const c = await prisma.pwmCase.findUnique({ where: { id: req.params.id }, include: { handlers: true } });
  if (!c || c.employeeId !== me(req).employeeId) fail(404, 'Case not found.');
  if (!['OUTCOME'].includes(c!.stage) || !c!.appealDue || dateOnly(c!.appealDue) < lagosYmd(new Date())) fail(409, 'The appeal period has ended or an appeal is already in.');
  await prisma.pwmCase.update({ where: { id: c!.id }, data: { stage: 'APPEAL' } });
  await prisma.pwmCaseEvent.create({ data: { caseId: c!.id, kind: 'APPEAL', text: reqStr(req.body?.text, 'Appeal', 4000), byUserId: me(req).userId } });
  await pwmAudit(audit(req), { action: 'CASE_APPEAL', entity: 'PwmCase', entityId: c!.id, meta: { reference: c!.reference } });
  await notifyPwm(c!.handlers.filter((h) => !h.recusedAt).map((h) => h.userId), { title: `Appeal received: ${c!.reference}`, body: 'Review it before the case is closed.', link: '/pwm/cases' });
  return apiResponse.success(res, 'Your appeal has been sent.', null, 201);
});

// POST /my-hr/grievance { category, severity, description } : intake by the employee (ERL-01)
export const raiseGrievance = my(async (req, res) => {
  const b = req.body ?? {};
  const year = new Date().getFullYear();
  const reference = `GRV-${year}-${String(await nextNumber(`case:${year}`)).padStart(4, '0')}`;
  const admins = await hrAdminUserIds();
  const handlerIds = admins.filter((id) => id !== me(req).userId).slice(0, 2);
  const c = await prisma.pwmCase.create({
    data: { reference, type: 'GRIEVANCE', employeeId: me(req).employeeId, category: reqStr(b.category, 'Category', 80), severity: oneOf(b.severity ?? 'MEDIUM', ['LOW', 'MEDIUM', 'HIGH'] as const, 'Severity'), summary: reqStr(b.description, 'Description', 4000), raisedByUserId: me(req).userId, handlers: { create: handlerIds.map((u) => ({ userId: u, role: 'HANDLER' })) }, events: { create: { kind: 'STAGE', text: 'Raised by the employee through My HR.', byUserId: me(req).userId } } },
    select: { id: true, reference: true },
  });
  await pwmAudit(audit(req), { action: 'CASE_OPENED', entity: 'PwmCase', entityId: c.id, meta: { reference, type: 'GRIEVANCE', by: 'employee' } });
  await notifyPwm(handlerIds, { title: `New grievance: ${reference}`, body: 'Raised through My HR. Open Employee Relations.', link: '/pwm/cases' });
  return apiResponse.success(res, `Your concern is with HR as ${reference}. Only the people handling it can see it.`, c, 201);
});

// ── Recognition ──────────────────────────────────────────────────────────────

export const myRecognition = my(async (req, res) => apiResponse.success(res, 'Recognition.', await prisma.pwmRecognition.findMany({ where: { employeeId: me(req).employeeId }, orderBy: { date: 'desc' } })));

// ── Expenses and travel ──────────────────────────────────────────────────────

export const myExpenses = my(async (req, res) => {
  const m = me(req);
  const cfg = await getPwmConfig();
  const [claims, travel] = await Promise.all([
    prisma.pwmExpenseClaim.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, take: 60, include: { items: true } }),
    prisma.pwmTravelRequest.findMany({ where: { employeeId: m.employeeId }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  return apiResponse.success(res, 'Expenses.', {
    categories: cfg.expenseCategories, perDiemRate: cfg.perDiemRate,
    claims: claims.map((c) => ({ id: c.id, reference: c.reference, title: c.title, status: c.status, total: num(c.total), submittedAt: c.submittedAt, decisionNote: c.decisionNote, paymentRef: c.paymentRef, items: c.items.map((i) => ({ id: i.id, category: i.category, amount: num(i.amount), date: i.date, description: i.description })) })),
    travel: travel.map((t) => ({ id: t.id, purpose: t.purpose, destination: t.destination, startDate: t.startDate, endDate: t.endDate, estimatedCost: num(t.estimatedCost), advance: num(t.advance), perDiem: num(t.perDiem), status: t.status, decisionNote: t.decisionNote })),
  });
});
export const submitMyClaim = my(async (req, res) => {
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).map((i: Record<string, unknown>) => ({ category: String(i.category ?? ''), amount: Number(i.amount), date: String(i.date ?? '').slice(0, 10), description: String(i.description ?? '').trim(), receiptUrl: str(i.receiptUrl, 1000), exception: str(i.exception, 300) }));
  if (items.some((i: { description: string; date: string }) => !i.description || !/^\d{4}-\d{2}-\d{2}$/.test(i.date))) fail(400, 'Every item needs a date and a description.');
  const c = await submitClaim(me(req).employeeId, me(req).userId, reqStr(req.body?.title, 'Title', 160), items, str(req.body?.travelRequestId, 60));
  return apiResponse.success(res, `Claim ${c.reference} sent for approval.`, { id: c.id, reference: c.reference }, 201);
});
export const submitMyTravel = my(async (req, res) => {
  const b = req.body ?? {};
  const t = await requestTravel(me(req).employeeId, me(req).userId, { purpose: reqStr(b.purpose, 'Purpose', 300), destination: reqStr(b.destination, 'Destination', 120), start: reqYmd(b.start, 'Departure'), end: reqYmd(b.end, 'Return'), estimatedCost: Number(b.estimatedCost) || 0, advance: Number(b.advance) || 0 });
  return apiResponse.success(res, 'Travel request sent for approval.', t, 201);
});

// ── Supervisor approvals added in this phase ─────────────────────────────────

export const approvalsPhase4 = my(async (req, res) => {
  const uid = me(req).userId;
  const [enrol, claims, travel] = await Promise.all([
    prisma.pwmEnrolment.findMany({ where: { approverUserId: uid, status: 'REQUESTED' }, include: { course: { select: { title: true } }, employee: { select: { firstName: true, lastName: true } } } }),
    prisma.pwmExpenseClaim.findMany({ where: { approverUserId: uid, status: 'SUBMITTED' }, include: { employee: { select: { firstName: true, lastName: true } }, items: true } }),
    prisma.pwmTravelRequest.findMany({ where: { approverUserId: uid, status: 'PENDING' }, include: { employee: { select: { firstName: true, lastName: true } } } }),
  ]);
  return apiResponse.success(res, 'Approvals.', {
    enrolments: enrol.map((e) => ({ id: e.id, employee: fullName(e.employee), course: e.course.title, cost: num(e.cost) })),
    claims: claims.map((c) => ({ id: c.id, employee: fullName(c.employee), reference: c.reference, title: c.title, total: num(c.total), items: c.items.map((i) => ({ category: i.category, amount: num(i.amount), description: i.description, receiptUrl: i.receiptUrl, exception: i.exception })) })),
    travel: travel.map((t) => ({ id: t.id, employee: fullName(t.employee), destination: t.destination, purpose: t.purpose, startDate: t.startDate, endDate: t.endDate, estimatedCost: num(t.estimatedCost), advance: num(t.advance), perDiem: num(t.perDiem) })),
  });
});
export const decideMy4 = (kind: 'enrolment' | 'claim' | 'travel') => my(async (req, res) => {
  const actor = { userId: me(req).userId, isHr: false };
  const approve = req.body?.approve === true; const note = str(req.body?.note, 300);
  if (kind === 'enrolment') { const r = await decideEnrolment(req.params.id, actor, approve, note); return apiResponse.success(res, r.overBudget ? 'Approved. It takes the department over its training budget.' : approve ? 'Approved.' : 'Declined.', r); }
  if (kind === 'claim') await decideClaim(req.params.id, actor, approve, note); else await decideTravel(req.params.id, actor, approve, note);
  return apiResponse.success(res, approve ? 'Approved.' : 'Declined.', null);
});

