// PWM Phase 4: employee surveys, department scorecards and workforce analytics (HR Intelligence).
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig } from '../../services/pwm/settings';
import { mandatoryCompliance } from '../../services/pwm/learning';
import { notifyPwm } from '../../services/pwm/notify';
import { CURRENT_STATUSES, addDays, addMonths, dateOnly, daysBetween, fromYmd, lagosYmd } from '../../services/pwm/rules';
import { employeeScope } from '../../services/pwm/people';
import { access, fail, handle, oneOf, reqStr, str } from './common';
import type { RequestHandler, Response } from 'express';
import { HttpError } from './common';
import type { MyHrRequest } from '../../middleware/myhr.middleware';
import { apiResponse as respond } from '../../utils/apiResponse';

type Q = { id: string; type: 'RATING' | 'TEXT' | 'CHOICE'; text: string; options?: string[] };

const cleanQuestions = (v: unknown): Q[] => {
  if (!Array.isArray(v) || !v.length) fail(400, 'Add at least one question.');
  if ((v as unknown[]).length > 30) fail(400, 'A survey can have at most 30 questions.');
  return (v as { type?: unknown; text?: unknown; options?: unknown }[]).map((q, i) => {
    const type = oneOf(q.type, ['RATING', 'TEXT', 'CHOICE'] as const, `Question ${i + 1} type`);
    const options = type === 'CHOICE' ? (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 8) : undefined;
    if (type === 'CHOICE' && (options?.length ?? 0) < 2) fail(400, `Question ${i + 1} needs at least two choices.`);
    return { id: `q${i + 1}`, type, text: reqStr(q.text, `Question ${i + 1}`, 300), ...(options ? { options } : {}) };
  });
};

// ── Admin: surveys ───────────────────────────────────────────────────────────

export const listSurveys = handle(async (_req, res) => {
  const rows = await prisma.pwmSurvey.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { responses: true } } } });
  return apiResponse.success(res, 'Surveys.', rows.map((s) => ({ ...s, responses: s._count.responses, _count: undefined })));
});

export const createSurvey = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const s = await prisma.pwmSurvey.create({ data: { title: reqStr(b.title, 'Title', 160), description: str(b.description, 1000), anonymous: b.anonymous !== false, questions: cleanQuestions(b.questions) as unknown as Prisma.InputJsonValue, departmentIds: (Array.isArray(b.departmentIds) && b.departmentIds.length ? b.departmentIds.map(String).slice(0, 30) : undefined), createdById: a.userId } });
  await pwmAudit(req, { action: 'SURVEY_CREATED', entity: 'PwmSurvey', entityId: s.id, after: { title: s.title, anonymous: s.anonymous } });
  return apiResponse.success(res, 'Draft saved.', s, 201);
});

export const updateSurvey = handle(async (req, res) => {
  const cur = await prisma.pwmSurvey.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Survey not found.');
  if (cur!.status !== 'DRAFT') fail(409, 'Only a draft can be edited. Answers already given would no longer match.');
  const b = req.body ?? {};
  const s = await prisma.pwmSurvey.update({ where: { id: cur!.id }, data: { ...(b.title !== undefined ? { title: reqStr(b.title, 'Title', 160) } : {}), ...(b.description !== undefined ? { description: str(b.description, 1000) } : {}), ...(b.anonymous !== undefined ? { anonymous: !!b.anonymous } : {}), ...(b.questions !== undefined ? { questions: cleanQuestions(b.questions) as unknown as Prisma.InputJsonValue } : {}) } });
  return apiResponse.success(res, 'Saved.', s);
});

const audienceUserIds = async (departmentIds: string[] | null): Promise<string[]> =>
  (await prisma.pwmEmployee.findMany({ where: { userId: { not: null }, status: { in: [...CURRENT_STATUSES] }, ...(departmentIds?.length ? { departmentId: { in: departmentIds } } : {}) }, select: { userId: true } })).map((e) => e.userId as string);

export const openSurvey = handle(async (req, res) => {
  const s = await prisma.pwmSurvey.findUnique({ where: { id: req.params.id } });
  if (!s || s.status !== 'DRAFT') fail(404, 'Only a draft can be opened.');
  const closes = req.body?.closesAt ? new Date(String(req.body.closesAt)) : null;
  if (closes && (Number.isNaN(closes.getTime()) || closes.getTime() < Date.now())) fail(400, 'The closing date must be in the future.');
  await prisma.pwmSurvey.update({ where: { id: s!.id }, data: { status: 'OPEN', opensAt: new Date(), closesAt: closes } });
  await pwmAudit(req, { action: 'SURVEY_OPENED', entity: 'PwmSurvey', entityId: s!.id });
  await notifyPwm(await audienceUserIds((s!.departmentIds as string[] | null) ?? null), { title: `Survey: ${s!.title}`, body: s!.anonymous ? 'It takes a few minutes and your answers are anonymous.' : 'It takes a few minutes.', link: '/my-hr/surveys' });
  return apiResponse.success(res, 'Open. Everyone in the audience has been notified.', null);
});

export const closeSurvey = handle(async (req, res) => {
  const s = await prisma.pwmSurvey.findUnique({ where: { id: req.params.id } });
  if (!s || s.status !== 'OPEN') fail(404, 'Only an open survey can be closed.');
  await prisma.pwmSurvey.update({ where: { id: s!.id }, data: { status: 'CLOSED' } });
  await pwmAudit(req, { action: 'SURVEY_CLOSED', entity: 'PwmSurvey', entityId: s!.id });
  return apiResponse.success(res, 'Closed.', null);
});

interface Answer { qid: string; rating?: number; text?: string; choice?: string }

const summarise = (qs: Q[], rows: { answers: Answer[] }[], showText: boolean) =>
  qs.map((q) => {
    const a = rows.map((r) => r.answers.find((x) => x.qid === q.id)).filter((x): x is Answer => !!x);
    if (q.type === 'RATING') { const v = a.map((x) => x.rating).filter((n): n is number => typeof n === 'number'); return { id: q.id, text: q.text, type: q.type, answered: v.length, average: v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null, distribution: [1, 2, 3, 4, 5].map((n) => v.filter((x) => x === n).length) }; }
    if (q.type === 'CHOICE') { const v = a.map((x) => x.choice).filter(Boolean) as string[]; return { id: q.id, text: q.text, type: q.type, answered: v.length, counts: (q.options ?? []).map((o) => ({ option: o, count: v.filter((x) => x === o).length })) }; }
    // Comments are shown in a shuffled order with nothing about who wrote them.
    const t = a.map((x) => x.text?.trim()).filter(Boolean) as string[];
    return { id: q.id, text: q.text, type: q.type, answered: t.length, comments: showText ? t.sort(() => crypto.randomInt(3) - 1) : [] };
  });

// GET /surveys/:id/results : only groups of at least the minimum size (PRD 10.23)
export const surveyResults = handle(async (req, res) => {
  const cfg = await getPwmConfig();
  const s = await prisma.pwmSurvey.findUnique({ where: { id: req.params.id }, include: { responses: true, _count: { select: { participation: true } } } });
  if (!s) fail(404, 'Survey not found.');
  const min = cfg.surveyMinGroup;
  const qs = s!.questions as unknown as Q[];
  const audience = (await audienceUserIds((s!.departmentIds as string[] | null) ?? null)).length;
  const total = s!.responses.length;
  const base = { id: s!.id, title: s!.title, status: s!.status, anonymous: s!.anonymous, responses: total, audience, participationPct: audience ? Math.round((s!._count.participation / audience) * 100) : null, minGroup: min };
  if (total < min) return apiResponse.success(res, 'Results.', { ...base, hidden: true, message: `Results appear once at least ${min} people have responded, so nobody can be identified.` });
  const rows = s!.responses.map((r) => ({ ...r, answers: r.answers as unknown as Answer[] }));
  const depts = new Map((await prisma.pwmDepartment.findMany({ select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const groups = [...new Set(rows.map((r) => r.departmentId ?? ''))].map((id) => ({ id, rows: rows.filter((r) => (r.departmentId ?? '') === id) }));
  const shown = groups.filter((g) => g.rows.length >= min);
  // Small groups are folded into one line, and shown only if that line is itself large enough.
  const rest = groups.filter((g) => g.rows.length < min).flatMap((g) => g.rows);
  return apiResponse.success(res, 'Results.', {
    ...base, hidden: false, questions: summarise(qs, rows, true),
    byDepartment: [...shown.map((g) => ({ name: depts.get(g.id) ?? 'No department', responses: g.rows.length, questions: summarise(qs.filter((q) => q.type !== 'TEXT'), g.rows, false) })), ...(rest.length >= min ? [{ name: 'Other departments combined', responses: rest.length, questions: summarise(qs.filter((q) => q.type !== 'TEXT'), rest, false) }] : [])],
  });
});

// ── My HR: answering ─────────────────────────────────────────────────────────

const my = (fn: (req: MyHrRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req as MyHrRequest, res).catch((err) => { if (err instanceof HttpError) return respond.error(res, err.message, err.status); next(err); });
};

// GET /my-hr/surveys
export const mySurveys = my(async (req, res) => {
  const m = req.my!;
  const now = new Date();
  const open = await prisma.pwmSurvey.findMany({ where: { status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }] }, orderBy: { createdAt: 'desc' } });
  const done = new Set((await prisma.pwmSurveyParticipation.findMany({ where: { employeeId: m.employeeId, surveyId: { in: open.map((s) => s.id) } }, select: { surveyId: true } })).map((p) => p.surveyId));
  const mine = open.filter((s) => { const d = s.departmentIds as string[] | null; return !d?.length || (!!m.departmentId && d.includes(m.departmentId)); });
  return respond.success(res, 'Surveys.', mine.map((s) => ({ id: s.id, title: s.title, description: s.description, anonymous: s.anonymous, closesAt: s.closesAt, answered: done.has(s.id), questions: s.questions })));
});

// POST /my-hr/surveys/:id/respond { answers }
export const respondSurvey = my(async (req, res) => {
  const m = req.my!;
  const s = await prisma.pwmSurvey.findUnique({ where: { id: req.params.id } });
  if (!s || s.status !== 'OPEN' || (s.closesAt && s.closesAt < new Date())) fail(404, 'This survey is not open.');
  const d = s!.departmentIds as string[] | null;
  if (d?.length && !(m.departmentId && d.includes(m.departmentId))) fail(403, 'This survey is not for your department.');
  const qs = s!.questions as unknown as Q[];
  const raw = (Array.isArray(req.body?.answers) ? req.body.answers : []) as Answer[];
  const answers: Answer[] = [];
  for (const q of qs) {
    const a = raw.find((x) => x.qid === q.id);
    if (!a) continue;
    if (q.type === 'RATING') { const n = Number(a.rating); if (!Number.isInteger(n) || n < 1 || n > 5) fail(400, `Rate "${q.text}" from 1 to 5.`); answers.push({ qid: q.id, rating: n }); }
    else if (q.type === 'CHOICE') { if (!q.options?.includes(String(a.choice))) fail(400, `Pick one of the choices for "${q.text}".`); answers.push({ qid: q.id, choice: String(a.choice) }); }
    else if (a.text?.trim()) answers.push({ qid: q.id, text: a.text.trim().slice(0, 2000) });
  }
  if (!answers.length) fail(400, 'Answer at least one question.');
  try {
    // Participation is kept apart from the answers, so an anonymous survey cannot be traced back to a person.
    await prisma.$transaction([
      prisma.pwmSurveyParticipation.create({ data: { surveyId: s!.id, employeeId: m.employeeId } }),
      prisma.pwmSurveyResponse.create({ data: { surveyId: s!.id, employeeId: s!.anonymous ? null : m.employeeId, departmentId: m.departmentId, answers: answers as unknown as Prisma.InputJsonValue } }),
    ]);
  } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') fail(409, 'You have already answered this survey.'); throw e; }
  return respond.success(res, 'Thank you. Your answers are recorded.', null, 201);
});

// ── Scorecards and analytics ─────────────────────────────────────────────────

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

// GET /analytics/scorecards
export const scorecards = handle(async (req, res) => {
  const a = access(req);
  const today = lagosYmd(new Date());
  const yearAgo = fromYmd(addDays(today, -365)); const monthAgo = fromYmd(addDays(today, -30));
  const depts = await prisma.pwmDepartment.findMany({ where: { archivedAt: null, ...(a.level === 'DEPARTMENT_HEAD' ? { id: { in: a.headedDepartmentIds } } : {}) }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const compliance = await mandatoryCompliance(a.level === 'DEPARTMENT_HEAD' ? a.headedDepartmentIds : undefined);
  const lastCycle = await prisma.pwmReviewCycle.findFirst({ where: { reviews: { some: {} } }, orderBy: { dueDate: 'desc' } });
  const rows = [];
  for (const d of depts) {
    const scope: Prisma.PwmEmployeeWhereInput = { departmentId: d.id };
    const [headcount, leavers, vacancies, reviews, att, rated] = await Promise.all([
      prisma.pwmEmployee.count({ where: { ...scope, status: { in: [...CURRENT_STATUSES] } } }),
      prisma.pwmEmployee.count({ where: { ...scope, exitDate: { gte: yearAgo } } }),
      prisma.pwmVacancy.count({ where: { departmentId: d.id, status: 'OPEN' } }),
      lastCycle ? prisma.pwmReview.findMany({ where: { cycleId: lastCycle.id, employee: scope }, select: { status: true } }) : Promise.resolve([]),
      prisma.pwmAttendance.groupBy({ by: ['status'], where: { date: { gte: monthAgo }, employee: scope }, _count: true }),
      lastCycle ? prisma.pwmReview.aggregate({ where: { cycleId: lastCycle.id, status: 'ACKNOWLEDGED', employee: scope }, _avg: { managerRating: true } }) : Promise.resolve(null),
    ]);
    const c = (s: string) => att.find((x) => x.status === s)?._count ?? 0;
    const worked = c('PRESENT') + c('LATE') + c('ABSENT') + c('REMOTE');
    let comp = 0; let compTotal = 0;
    for (const r of compliance) { const mine = r.overdue.length; compTotal += r.total; comp += r.total - mine; }
    rows.push({ id: d.id, name: d.name, headcount, openVacancies: vacancies, turnoverPct: pct(leavers, headcount + leavers / 2), reviewCompletionPct: reviews.length ? pct(reviews.filter((r) => r.status === 'ACKNOWLEDGED').length, reviews.length) : null, averageRating: rated?._avg.managerRating ? Math.round(rated._avg.managerRating * 10) / 10 : null, absenteeismPct: pct(c('ABSENT'), worked), latePct: pct(c('LATE'), worked), _comp: { comp, compTotal } });
  }
  // Mandatory training is measured company-wide per course; the department figure uses the same people list.
  const deptComp = await Promise.all(depts.map(async (d) => { const r = await mandatoryCompliance([d.id]); const total = r.reduce((s, x) => s + x.total, 0); const ok = r.reduce((s, x) => s + x.total - x.overdue.length, 0); return { id: d.id, pct: total ? pct(ok, total) : null }; }));
  return apiResponse.success(res, 'Scorecards.', { cycle: lastCycle?.name ?? null, note: 'Staffing against plan arrives with workforce planning; open vacancies are shown until then.', departments: rows.map((r) => ({ ...r, _comp: undefined, trainingCompliancePct: deptComp.find((x) => x.id === r.id)?.pct ?? null })) });
});

// GET /analytics/workforce?months=12
export const workforce = handle(async (req, res) => {
  const a = access(req);
  const months = Math.min(36, Math.max(3, parseInt(String(req.query.months ?? '12'), 10) || 12));
  const emps = await prisma.pwmEmployee.findMany({ where: employeeScope(a), select: { hireDate: true, exitDate: true, status: true, employmentType: true, department: { select: { name: true } } } });
  const today = lagosYmd(new Date());
  const series: { month: string; headcount: number; hires: number; leavers: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const first = addMonths(`${today.slice(0, 7)}-01`, -i);
    const next = addMonths(first, 1); const end = addDays(next, -1);
    series.push({ month: first.slice(0, 7), headcount: emps.filter((e) => dateOnly(e.hireDate) <= end && (!e.exitDate || dateOnly(e.exitDate) > end) && e.status !== 'PENDING_ONBOARDING').length, hires: emps.filter((e) => dateOnly(e.hireDate) >= first && dateOnly(e.hireDate) < next).length, leavers: emps.filter((e) => e.exitDate && dateOnly(e.exitDate) >= first && dateOnly(e.exitDate) < next).length });
  }
  const current = emps.filter((e) => (CURRENT_STATUSES as readonly string[]).includes(e.status));
  const tally = (k: (e: (typeof emps)[number]) => string) => Object.entries(current.reduce<Record<string, number>>((m, e) => { const x = k(e); m[x] = (m[x] ?? 0) + 1; return m; }, {})).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
  const tenure = current.map((e) => daysBetween(dateOnly(e.hireDate), today) / 365.25);
  const band = (lo: number, hi: number) => tenure.filter((t) => t >= lo && t < hi).length;
  const yearLeavers = emps.filter((e) => e.exitDate && dateOnly(e.exitDate) >= addDays(today, -365)).length;
  const avgHeadcount = series.slice(-12).reduce((s, x) => s + x.headcount, 0) / Math.max(1, series.slice(-12).length);
  return apiResponse.success(res, 'Workforce analytics.', {
    series, headcount: current.length, turnoverPct12m: pct(yearLeavers, avgHeadcount), retentionPct12m: avgHeadcount ? Math.round((100 - (pct(yearLeavers, avgHeadcount) ?? 0)) * 10) / 10 : null,
    averageTenureYears: tenure.length ? Math.round((tenure.reduce((s, t) => s + t, 0) / tenure.length) * 10) / 10 : null,
    tenureBands: [{ name: 'Under 1 year', count: band(0, 1) }, { name: '1 to 3 years', count: band(1, 3) }, { name: '3 to 5 years', count: band(3, 5) }, { name: '5 years or more', count: band(5, 100) }],
    byDepartment: tally((e) => e.department?.name ?? 'No department'), byType: tally((e) => e.employmentType),
    note: 'Built from hire and exit dates on the records. Figures are only as complete as those dates.',
  });
});
