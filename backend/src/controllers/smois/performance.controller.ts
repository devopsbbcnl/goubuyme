// SMOIS KPI targets, staff performance and written evaluations.
import { Prisma, SmoisPlatform } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { ALL_TARGET_METRICS, EMPLOYEE_METRICS, TARGET_UNIT, ymd } from '../../services/smois/analytics';
import { memberScorecard, targetActual } from '../../services/smois/insights';
import { can } from '../../services/smois/workflow';
import { access, date, fail, handle, nameMap, notifyMany, oneOf, readPeriod, reqStr, str, visibleAccountIds } from './common';

const SCOPES = ['DEPARTMENT', 'PLATFORM', 'ACCOUNT', 'EMPLOYEE'] as const;
const PLATFORMS: SmoisPlatform[] = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER'];

// ── Targets ─────────────────────────────────────────────────────────────────

const decorate = async (rows: Prisma.SmoisTargetGetPayload<object>[]) => {
  const members = await prisma.smoisMember.findMany({ where: { id: { in: rows.map((r) => r.memberId).filter(Boolean) as string[] } }, select: { id: true, user: { select: { name: true } } } });
  const accounts = await prisma.smoisAccount.findMany({ where: { id: { in: rows.map((r) => r.accountId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const sup = await nameMap(rows.map((r) => r.supervisorId));
  const mName = new Map(members.map((m) => [m.id, m.user.name]));
  const aName = new Map(accounts.map((x) => [x.id, x.name]));
  const now = new Date();
  return Promise.all(rows.map(async (t) => ({
    ...t, unit: TARGET_UNIT[t.metric] ?? '', memberName: t.memberId ? mName.get(t.memberId) ?? null : null,
    accountName: t.accountId ? aName.get(t.accountId) ?? null : null, supervisorName: t.supervisorId ? sup.get(t.supervisorId) ?? null : null,
    progress: await targetActual(t, now),
  })));
};

// GET /targets?view=active|ended|all
export const listTargets = handle(async (req, res) => {
  const a = access(req);
  const view = String(req.query.view ?? 'active');
  const now = new Date();
  const where: Prisma.SmoisTargetWhereInput = { isActive: true };
  if (view === 'active') { where.endsAt = { gte: now }; }
  else if (view === 'ended') { where.endsAt = { lt: now }; }

  // Managers see department and platform goals, goals on their accounts, and their own.
  if (!can(a, 'manageTargets') && a.level !== 'VIEWER') {
    const accounts = await visibleAccountIds(a);
    where.OR = [
      { scope: 'DEPARTMENT' }, { scope: 'PLATFORM' },
      { scope: 'ACCOUNT', accountId: { in: accounts.map((x) => x.id) } },
      { scope: 'EMPLOYEE', memberId: a.memberId ?? '__none__' },
    ];
  } else if (a.level === 'VIEWER') {
    where.scope = { not: 'EMPLOYEE' };
  }
  const rows = await prisma.smoisTarget.findMany({ where, orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }], take: 200 });
  return apiResponse.success(res, 'Targets.', await decorate(rows));
});

const parseTarget = async (b: Record<string, unknown>) => {
  const metric = oneOf(b.metric, ALL_TARGET_METRICS, 'Metric');
  const scope = oneOf(b.scope, SCOPES, 'Scope');
  const targetValue = Number(b.targetValue);
  if (!Number.isFinite(targetValue) || targetValue <= 0) fail(400, 'Target value must be a number above zero.');
  const startsAt = date(b.startsAt, 'Start date');
  const endsAt = date(b.endsAt, 'End date');
  if (!startsAt || !endsAt) fail(400, 'Choose a start and end date.');
  if (endsAt! <= startsAt!) fail(400, 'The end date must be after the start date.');
  if (TARGET_UNIT[metric] === '%' && targetValue > 100) fail(400, 'A percentage target cannot be above 100.');

  let platform: SmoisPlatform | null = null; let accountId: string | null = null; let memberId: string | null = null;
  if (scope === 'PLATFORM') platform = oneOf(b.platform, PLATFORMS, 'Platform');
  if (scope === 'ACCOUNT') {
    accountId = reqStr(b.accountId, 'Account', 60);
    if (!(await prisma.smoisAccount.findUnique({ where: { id: accountId }, select: { id: true } }))) fail(400, 'Unknown account.');
  }
  if (scope === 'EMPLOYEE') {
    // PRD 18.5: shared account growth is never an individual's result, so people only get targets their own work decides.
    if (!(EMPLOYEE_METRICS as readonly string[]).includes(metric)) fail(400, 'That measure depends on the whole team\'s accounts, so it cannot be an individual target. Use a department, platform or account target.');
    memberId = reqStr(b.memberId, 'Team member', 60);
    const m = await prisma.smoisMember.findUnique({ where: { id: memberId }, select: { isActive: true, role: true } });
    if (!m || !m.isActive || (m.role !== 'MANAGER' && m.role !== 'MANAGEMENT')) fail(400, 'Choose an active manager.');
  }
  return { name: reqStr(b.name, 'Name', 120), metric, scope, targetValue, startsAt: startsAt!, endsAt: endsAt!, platform, accountId, memberId, supervisorId: b.supervisorId ? String(b.supervisorId) : null, notes: str(b.notes, 500) };
};

// POST /targets
export const createTarget = handle(async (req, res) => {
  const data = await parseTarget((req.body ?? {}) as Record<string, unknown>);
  const t = await prisma.smoisTarget.create({ data: { ...data, createdById: access(req).userId } });
  await smoisAudit(req, { action: 'TARGET_CREATED', entity: 'SmoisTarget', entityId: t.id, after: { name: t.name, metric: t.metric, scope: t.scope, targetValue: t.targetValue, from: ymd(t.startsAt), to: ymd(t.endsAt) } });
  if (data.memberId) {
    const m = await prisma.smoisMember.findUnique({ where: { id: data.memberId }, select: { userId: true } });
    await notifyMany([m?.userId], { title: 'New target for you', body: `${t.name}: ${t.targetValue}${TARGET_UNIT[t.metric] ? ` ${TARGET_UNIT[t.metric]}` : ''}`, data: { link: '/smois/targets' } }, access(req).userId);
  }
  return apiResponse.success(res, 'Target set.', (await decorate([t]))[0], 201);
});

// PATCH /targets/:id { name?, targetValue?, endsAt?, notes?, isActive?, reason }
export const updateTarget = handle(async (req, res) => {
  const t = await prisma.smoisTarget.findUnique({ where: { id: req.params.id } });
  if (!t) return fail(404, 'Target not found.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = reqStr(b.reason, 'Reason for the change', 300);
  const data: Prisma.SmoisTargetUpdateInput = {};
  if ('name' in b) data.name = reqStr(b.name, 'Name', 120);
  if ('notes' in b) data.notes = str(b.notes, 500);
  if ('isActive' in b) data.isActive = !!b.isActive;
  if ('targetValue' in b) {
    const v = Number(b.targetValue);
    if (!Number.isFinite(v) || v <= 0 || (TARGET_UNIT[t.metric] === '%' && v > 100)) fail(400, 'Enter a valid target value.');
    data.targetValue = v;
  }
  if ('endsAt' in b) { const e = date(b.endsAt, 'End date'); if (!e || e <= t.startsAt) fail(400, 'The end date must be after the start date.'); data.endsAt = e!; }
  const u = await prisma.smoisTarget.update({ where: { id: t.id }, data });
  await smoisAudit(req, { action: 'TARGET_UPDATED', entity: 'SmoisTarget', entityId: t.id, before: { name: t.name, targetValue: t.targetValue, endsAt: ymd(t.endsAt), isActive: t.isActive }, after: { name: u.name, targetValue: u.targetValue, endsAt: ymd(u.endsAt), isActive: u.isActive }, meta: { reason } });
  return apiResponse.success(res, 'Target updated.', (await decorate([u]))[0]);
});

// ── Performance ─────────────────────────────────────────────────────────────

// GET /performance?period&from&to  (management and super admin: everyone)
export const listPerformance = handle(async (req, res) => {
  const p = readPeriod(req.query as Record<string, string>);
  const members = await prisma.smoisMember.findMany({ where: { role: { in: ['MANAGER', 'MANAGEMENT'] } }, select: { id: true, userId: true, role: true, isActive: true, jobTitle: true, user: { select: { name: true } } }, orderBy: { user: { name: 'asc' } } });
  const now = new Date();
  const rows = await Promise.all(members.map(async (m) => {
    const r = await memberScorecard(m.id, m.userId, p.from, p.to, now);
    return { memberId: m.id, name: m.user.name, role: m.role, isActive: m.isActive, jobTitle: m.jobTitle, overall: r.scorecard.overall, scoredWeight: r.scorecard.scoredWeight, tasks: r.stats.tasks, content: r.stats.content, reports: r.stats.reports };
  }));
  // Revoked staff stay in the history only if they had activity in the period.
  const visible = rows.filter((r) => r.isActive || r.tasks.assigned + r.content.created + r.content.published > 0);
  return apiResponse.success(res, 'Performance.', { period: { key: p.key, label: p.label, from: p.from, to: p.to }, members: visible });
});

const detail = async (memberId: string, q: Record<string, string>, includeEvaluations: boolean) => {
  const m = await prisma.smoisMember.findUnique({ where: { id: memberId }, select: { id: true, userId: true, role: true, isActive: true, jobTitle: true, responsibilities: true, user: { select: { name: true, email: true } } } });
  if (!m) return fail(404, 'Team member not found.');
  const p = readPeriod(q);
  const r = await memberScorecard(m.id, m.userId, p.from, p.to);
  const evaluations = includeEvaluations
    ? await prisma.smoisEvaluation.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 50 })
    : [];
  const names = await nameMap(evaluations.map((e) => e.reviewerId));
  const targets = await decorate(r.targets);
  return {
    member: { id: m.id, name: m.user.name, email: m.user.email, role: m.role, isActive: m.isActive, jobTitle: m.jobTitle, responsibilities: m.responsibilities },
    period: { key: p.key, label: p.label, from: p.from, to: p.to },
    scorecard: r.scorecard, stats: r.stats, targets,
    evaluations: evaluations.map((e) => ({ ...e, reviewerName: names.get(e.reviewerId) ?? null })),
  };
};

// GET /performance/me
export const getMyPerformance = handle(async (req, res) => {
  const a = access(req);
  if (!a.memberId) fail(404, 'Super admins do not have a personal scorecard.');
  return apiResponse.success(res, 'My performance.', await detail(a.memberId!, req.query as Record<string, string>, false));
});

// GET /performance/:memberId  (management; evaluations included)
export const getPerformance = handle(async (req, res) => {
  const a = access(req);
  if (!can(a, 'viewPerformance') && req.params.memberId !== a.memberId) fail(403, 'You can only see your own performance.');
  return apiResponse.success(res, 'Performance.', await detail(req.params.memberId, req.query as Record<string, string>, can(a, 'viewPerformance')));
});

// POST /evaluations { memberId, periodStart, periodEnd, feedback, rating? }: add-only, confidential to management
export const createEvaluation = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const m = await prisma.smoisMember.findUnique({ where: { id: reqStr(b.memberId, 'Team member', 60) }, select: { id: true, user: { select: { name: true } } } });
  if (!m) return fail(404, 'Team member not found.');
  const periodStart = date(b.periodStart, 'Period start'); const periodEnd = date(b.periodEnd, 'Period end');
  if (!periodStart || !periodEnd || periodEnd < periodStart) fail(400, 'Choose a valid period.');
  const rating = b.rating === undefined || b.rating === null || b.rating === '' ? null : Number(b.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) fail(400, 'Rating must be 1 to 5.');
  const e = await prisma.smoisEvaluation.create({ data: { memberId: m.id, periodStart: periodStart!, periodEnd: periodEnd!, feedback: reqStr(b.feedback, 'Feedback', 3000), rating, reviewerId: access(req).userId } });
  await smoisAudit(req, { action: 'EVALUATION_ADDED', entity: 'SmoisMember', entityId: m.id, after: { rating, from: ymd(e.periodStart), to: ymd(e.periodEnd) }, meta: { member: m.user.name } });
  return apiResponse.success(res, 'Evaluation recorded. Earlier evaluations are kept.', e, 201);
});
