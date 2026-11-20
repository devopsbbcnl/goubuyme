// PWM Phase 4: learning catalogue, enrolments, budgets, compliance, skills matrix, development plans.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { CURRENT_STATUSES, can, dateOnly, fromYmd, fullName } from '../../services/pwm/rules';
import { LearningError, assignMandatory, budgetFor, decideEnrolment, mandatoryCompliance, requestEnrolment } from '../../services/pwm/learning';
import { canSeeEmployee, employeeScope } from '../../services/pwm/people';
import { HttpError, access, fail, handle, int, oneOf, reqStr, reqYmd, str, ymd } from './common';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => { try { return await fn(); } catch (e) { if (e instanceof LearningError) throw new HttpError(e.status, e.message); throw e; } };

// ── Catalogue ────────────────────────────────────────────────────────────────

export const listCourses = handle(async (_req, res) => apiResponse.success(res, 'Courses.', (await prisma.pwmCourse.findMany({ orderBy: [{ active: 'desc' }, { title: 'asc' }] })).map((c) => ({ ...c, cost: num(c.cost), durationHours: num(c.durationHours) }))));

const courseData = (b: Record<string, unknown>, partial: boolean): Prisma.PwmCourseUncheckedUpdateInput => {
  const d: Prisma.PwmCourseUncheckedUpdateInput = {};
  if (!partial || b.title !== undefined) d.title = reqStr(b.title, 'Title', 160);
  if (b.provider !== undefined) d.provider = str(b.provider, 120);
  if (b.mode !== undefined) d.mode = oneOf(b.mode, ['CLASSROOM', 'ONLINE', 'ON_THE_JOB', 'EXTERNAL'] as const, 'Mode');
  if (b.cost !== undefined) { const n = Number(b.cost); if (!(n >= 0 && n <= 1e9)) fail(400, 'Cost is not valid.'); d.cost = n; }
  if (b.durationHours !== undefined) { const n = Number(b.durationHours); if (!(n >= 0 && n <= 2000)) fail(400, 'Duration is not valid.'); d.durationHours = n; }
  if (b.mandatory !== undefined) d.mandatory = !!b.mandatory;
  if (b.recurrenceMonths !== undefined) d.recurrenceMonths = int(b.recurrenceMonths, 'Repeat every (months)', 1, 120);
  if (b.active !== undefined) d.active = !!b.active;
  return d;
};
export const createCourse = handle(async (req, res) => {
  const c = await prisma.pwmCourse.create({ data: courseData(req.body ?? {}, false) as Prisma.PwmCourseUncheckedCreateInput });
  await pwmAudit(req, { action: 'COURSE_CREATED', entity: 'PwmCourse', entityId: c.id, after: { title: c.title } });
  return apiResponse.success(res, 'Added.', c, 201);
});
export const updateCourse = handle(async (req, res) => {
  const cur = await prisma.pwmCourse.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Course not found.');
  const d = courseData(req.body ?? {}, true);
  const c = await prisma.pwmCourse.update({ where: { id: cur!.id }, data: d });
  await pwmAudit(req, { action: 'COURSE_UPDATED', entity: 'PwmCourse', entityId: c.id, after: d });
  return apiResponse.success(res, 'Saved.', c);
});

// ── Enrolments ───────────────────────────────────────────────────────────────

// GET /learning/enrolments?status=
export const listEnrolments = handle(async (req, res) => {
  const a = access(req);
  const status = str(req.query.status, 20);
  const rows = await prisma.pwmEnrolment.findMany({ where: { employee: employeeScope(a), ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 300, include: { course: { select: { title: true, mandatory: true } }, employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true, departmentId: true, department: { select: { name: true } } } } } });
  const year = new Date().getFullYear();
  const budgets = new Map<string, Awaited<ReturnType<typeof budgetFor>>>();
  const out = [];
  for (const e of rows) {
    const key = e.employee.departmentId ?? '';
    if (e.status === 'REQUESTED' && !budgets.has(key)) budgets.set(key, await budgetFor(e.employee.departmentId, year));
    const b = budgets.get(key);
    out.push({ id: e.id, status: e.status, course: e.course.title, mandatory: e.course.mandatory, assigned: e.assigned, cost: num(e.cost), employee: { id: e.employee.id, name: fullName(e.employee), employeeNo: e.employee.employeeNo, department: e.employee.department?.name ?? null }, createdAt: e.createdAt, completedAt: e.completedAt, certificateUrl: e.certificateUrl, note: e.note, overBudget: e.status === 'REQUESTED' && !!b && b.amount > 0 && num(e.cost) > b.remaining, budgetRemaining: e.status === 'REQUESTED' && b && b.amount > 0 ? b.remaining : null });
  }
  return apiResponse.success(res, 'Enrolments.', out);
});

// POST /learning/enrolments { courseId, employeeIds } : HR assigns
export const assignCourse = handle(async (req, res) => {
  const a = access(req);
  const ids = (Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []).map(String).slice(0, 500);
  if (!ids.length) fail(400, 'Choose at least one person.');
  let n = 0; const skipped: string[] = [];
  for (const id of ids) { try { await requestEnrolment(reqStr(req.body?.courseId, 'Course', 60), id, a.userId, true); n++; } catch (e) { if (e instanceof LearningError) skipped.push(e.message); else throw e; } }
  return apiResponse.success(res, `${n} assigned${skipped.length ? `, ${skipped.length} skipped (already enrolled)` : ''}.`, { assigned: n });
});

export const decideEnrolmentReq = handle(async (req, res) => {
  const a = access(req);
  const r = await wrap(() => decideEnrolment(req.params.id, { userId: a.userId, isHr: can(a, 'manageLearning') }, req.body?.approve === true, str(req.body?.note, 300)));
  return apiResponse.success(res, r.overBudget ? 'Approved, but it takes the department over its training budget.' : r.status === 'APPROVED' ? 'Approved.' : 'Declined.', r);
});

// POST /learning/enrolments/:id/complete { certificateUrl, completedAt }
export const completeEnrolment = handle(async (req, res) => {
  const e = await prisma.pwmEnrolment.findUnique({ where: { id: req.params.id }, include: { course: { select: { title: true } } } });
  if (!e || e.status !== 'APPROVED') fail(404, 'Only an approved enrolment can be completed.');
  const when = ymd(req.body?.completedAt, 'Completion date') ?? dateOnly(new Date());
  const url = str(req.body?.certificateUrl, 1000);
  if (url && !/^https:\/\//i.test(url)) fail(400, 'The certificate must be uploaded first.');
  await prisma.pwmEnrolment.update({ where: { id: e!.id }, data: { status: 'COMPLETED', completedAt: fromYmd(when), certificateUrl: url ?? e!.certificateUrl } });
  await pwmAudit(req, { action: 'TRAINING_COMPLETED', entity: 'PwmEmployee', entityId: e!.employeeId, meta: { course: e!.course.title, completedAt: when } });
  return apiResponse.success(res, 'Recorded.', null);
});

export const cancelEnrolment = handle(async (req, res) => {
  const e = await prisma.pwmEnrolment.findUnique({ where: { id: req.params.id } });
  if (!e || !['REQUESTED', 'APPROVED'].includes(e.status)) fail(404, 'No open enrolment found.');
  await prisma.pwmEnrolment.update({ where: { id: e!.id }, data: { status: 'CANCELLED', note: str(req.body?.reason, 300) } });
  await pwmAudit(req, { action: 'TRAINING_CANCELLED', entity: 'PwmEmployee', entityId: e!.employeeId });
  return apiResponse.success(res, 'Cancelled.', null);
});

// ── Budgets and compliance ───────────────────────────────────────────────────

// GET /learning/budgets?year=
export const listBudgets = handle(async (req, res) => {
  const year = int(req.query.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  const depts = await prisma.pwmDepartment.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const rows = await Promise.all([{ id: null as string | null, name: 'Company-wide pool' }, ...depts].map(async (d) => ({ departmentId: d.id, name: d.name, ...(await budgetFor(d.id, year)) })));
  return apiResponse.success(res, 'Budgets.', { year, rows });
});
// PUT /learning/budgets { departmentId, year, amount }
export const setBudget = handle(async (req, res) => {
  const year = int(req.body?.year, 'Year', 2000, 2100) ?? new Date().getFullYear();
  const amount = Number(req.body?.amount);
  if (!(amount >= 0 && amount <= 1e11)) fail(400, 'The amount is not valid.');
  const departmentId = str(req.body?.departmentId, 60);
  const existing = await prisma.pwmTrainingBudget.findFirst({ where: { departmentId, year } });
  if (existing) await prisma.pwmTrainingBudget.update({ where: { id: existing.id }, data: { amount } }); else await prisma.pwmTrainingBudget.create({ data: { departmentId, year, amount } });
  await pwmAudit(req, { action: 'TRAINING_BUDGET_SET', entity: 'PwmTrainingBudget', entityId: `${departmentId ?? 'pool'}-${year}`, after: { amount, year, departmentId }, before: { amount: num(existing?.amount) } });
  return apiResponse.success(res, 'Saved.', null);
});

// GET /learning/compliance
export const compliance = handle(async (req, res) => {
  const a = access(req);
  return apiResponse.success(res, 'Compliance.', await mandatoryCompliance(a.level === 'DEPARTMENT_HEAD' ? a.headedDepartmentIds : undefined));
});
export const assignMandatoryReq = handle(async (req, res) => {
  const a = access(req);
  const n = await wrap(() => assignMandatory(req.params.id, a.userId));
  return apiResponse.success(res, `${n} people assigned and notified.`, { assigned: n });
});

// ── Skills ───────────────────────────────────────────────────────────────────

export const listSkills = handle(async (_req, res) => apiResponse.success(res, 'Skills.', await prisma.pwmSkill.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }], include: { requirements: { select: { jobTitle: true, requiredLevel: true } } } })));
export const createSkill = handle(async (req, res) => {
  const name = reqStr(req.body?.name, 'Skill', 80);
  if (await prisma.pwmSkill.findUnique({ where: { name } })) fail(409, 'That skill already exists.');
  const s = await prisma.pwmSkill.create({ data: { name, category: str(req.body?.category, 60) } });
  await pwmAudit(req, { action: 'SKILL_ADDED', entity: 'PwmSkill', entityId: s.id, after: { name } });
  return apiResponse.success(res, 'Added.', s, 201);
});
// POST /skills/assess { employeeId, skillId, level, note }
export const assessSkill = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(req.body?.employeeId, 'Employee', 60) }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const level = int(req.body?.level, 'Level', 1, 5);
  if (!level) fail(400, 'Level is 1 (basic) to 5 (expert).');
  const row = await prisma.pwmSkillAssessment.create({ data: { employeeId: e!.id, skillId: reqStr(req.body?.skillId, 'Skill', 60), level: level as number, note: str(req.body?.note, 300), assessedById: a.userId } });
  await pwmAudit(req, { action: 'SKILL_ASSESSED', entity: 'PwmEmployee', entityId: e!.id, after: { skillId: row.skillId, level } });
  return apiResponse.success(res, 'Recorded.', row, 201);
});
// PUT /skills/requirements { jobTitle, skillId, requiredLevel }  (requiredLevel 0 removes)
export const setRequirement = handle(async (req, res) => {
  const jobTitle = reqStr(req.body?.jobTitle, 'Job title', 120); const skillId = reqStr(req.body?.skillId, 'Skill', 60);
  const level = int(req.body?.requiredLevel, 'Required level', 0, 5) ?? 0;
  if (level === 0) await prisma.pwmPositionSkill.deleteMany({ where: { jobTitle, skillId } });
  else await prisma.pwmPositionSkill.upsert({ where: { jobTitle_skillId: { jobTitle, skillId } }, create: { jobTitle, skillId, requiredLevel: level }, update: { requiredLevel: level } });
  await pwmAudit(req, { action: 'SKILL_REQUIREMENT_SET', entity: 'PwmSkill', entityId: skillId, after: { jobTitle, level } });
  return apiResponse.success(res, 'Saved.', null);
});

// GET /skills/matrix?departmentId= : employees by skills, with gaps against the job title's requirements (LND-06)
export const skillMatrix = handle(async (req, res) => {
  const a = access(req);
  const dept = str(req.query.departmentId, 60);
  const [skills, emps, reqs] = await Promise.all([
    prisma.pwmSkill.findMany({ orderBy: { name: 'asc' } }),
    prisma.pwmEmployee.findMany({ where: { AND: [employeeScope(a), { status: { in: [...CURRENT_STATUSES] } }, ...(dept ? [{ departmentId: dept }] : [])] }, select: { id: true, firstName: true, lastName: true, jobTitle: true, skillAssessments: { orderBy: { assessedAt: 'desc' }, select: { skillId: true, level: true } } }, orderBy: { lastName: 'asc' }, take: 500 }),
    prisma.pwmPositionSkill.findMany(),
  ]);
  const need = new Map(reqs.map((r) => [`${r.jobTitle.toLowerCase()}|${r.skillId}`, r.requiredLevel]));
  const rows = emps.map((e) => {
    const latest = new Map<string, number>();
    for (const s of e.skillAssessments) if (!latest.has(s.skillId)) latest.set(s.skillId, s.level);
    return { id: e.id, name: fullName(e), jobTitle: e.jobTitle, cells: skills.map((s) => { const level = latest.get(s.id) ?? null; const required = need.get(`${e.jobTitle.toLowerCase()}|${s.id}`) ?? null; return { skillId: s.id, level, required, gap: required !== null ? Math.max(0, required - (level ?? 0)) : null }; }) };
  });
  const gaps = skills.map((s, i) => ({ skillId: s.id, name: s.name, peopleWithGap: rows.filter((r) => (r.cells[i].gap ?? 0) > 0).length }));
  return apiResponse.success(res, 'Skills matrix.', { skills: skills.map((s) => ({ id: s.id, name: s.name })), rows, gaps });
});

// ── Development plans ────────────────────────────────────────────────────────

export const listPlans = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const [plans, enrolments, assessments] = await Promise.all([
    prisma.pwmDevelopmentPlan.findMany({ where: { employeeId: e!.id }, orderBy: { createdAt: 'desc' } }),
    prisma.pwmEnrolment.findMany({ where: { employeeId: e!.id }, orderBy: { createdAt: 'desc' }, take: 30, include: { course: { select: { title: true, mandatory: true } } } }),
    prisma.pwmSkillAssessment.findMany({ where: { employeeId: e!.id }, orderBy: { assessedAt: 'desc' }, take: 40, include: { skill: { select: { name: true } } } }),
  ]);
  return apiResponse.success(res, 'Development.', { plans, enrolments: enrolments.map((x) => ({ id: x.id, course: x.course.title, mandatory: x.course.mandatory, status: x.status, completedAt: x.completedAt })), skills: assessments.map((x) => ({ skill: x.skill.name, level: x.level, at: x.assessedAt })) });
});
export const createPlan = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const review = ymd(req.body?.reviewDate, 'Review date');
  const p = await prisma.pwmDevelopmentPlan.create({ data: { employeeId: e!.id, goal: reqStr(req.body?.goal, 'Goal', 500), actions: (Array.isArray(req.body?.actions) ? req.body.actions : []).slice(0, 12).map((x: { title?: unknown; dueDate?: unknown }) => ({ title: String(x.title ?? '').slice(0, 200), dueDate: String(x.dueDate ?? '').slice(0, 10), done: false })).filter((x: { title: string }) => x.title), reviewDate: review ? fromYmd(review) : null, createdById: a.userId } });
  await pwmAudit(req, { action: 'DEVELOPMENT_PLAN_CREATED', entity: 'PwmEmployee', entityId: e!.id, meta: { planId: p.id } });
  return apiResponse.success(res, 'Plan saved.', p, 201);
});
export const updatePlan = handle(async (req, res) => {
  const p = await prisma.pwmDevelopmentPlan.findUnique({ where: { id: req.params.id } });
  if (!p) fail(404, 'Plan not found.');
  const b = req.body ?? {};
  const upd = await prisma.pwmDevelopmentPlan.update({ where: { id: p!.id }, data: { ...(b.status ? { status: oneOf(b.status, ['ACTIVE', 'ACHIEVED', 'DROPPED'] as const, 'Status') } : {}), ...(b.actions ? { actions: b.actions } : {}), ...(b.reviewDate ? { reviewDate: fromYmd(reqYmd(b.reviewDate, 'Review date')) } : {}) } });
  return apiResponse.success(res, 'Saved.', upd);
});

