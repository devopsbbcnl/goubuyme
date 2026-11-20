// PWM Phase 5: workforce planning (headcount plan vs actual) and succession planning (PRD 10.18, 10.19).
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { CURRENT_STATUSES, READINESS, fullName, staffingGap, successionRisk } from '../../services/pwm/rules';
import { access, fail, handle, int, oneOf, reqStr, str } from './common';

const yearOf = (v: unknown): number => int(v ?? new Date().getFullYear(), 'Year', 2000, 2100) as number;

// GET /planning?year=
export const plan = handle(async (req, res) => {
  const year = yearOf(req.query.year);
  const [lines, emps, vacs, depts] = await Promise.all([
    prisma.pwmHeadcountPlan.findMany({ where: { year } }),
    prisma.pwmEmployee.findMany({ where: { archivedAt: null, status: { in: [...CURRENT_STATUSES] as never[] } }, select: { departmentId: true, jobTitle: true } }),
    prisma.pwmVacancy.findMany({ where: { status: 'OPEN' as never }, select: { departmentId: true, title: true, headcount: true } }),
    prisma.pwmDepartment.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const dname = new Map(depts.map((d) => [d.id, d.name]));
  const key = (d: string | null, t: string) => `${d ?? ''}|${t.trim().toLowerCase()}`;
  const actual = new Map<string, number>();
  for (const e of emps) actual.set(key(e.departmentId, e.jobTitle), (actual.get(key(e.departmentId, e.jobTitle)) ?? 0) + 1);
  const open = new Map<string, number>();
  for (const v of vacs) open.set(key(v.departmentId, v.title), (open.get(key(v.departmentId, v.title)) ?? 0) + v.headcount);
  const rows = lines
    .map((l) => ({ ...l, department: dname.get(l.departmentId) ?? 'Unknown', actual: actual.get(key(l.departmentId, l.jobTitle)) ?? 0, openVacancies: open.get(key(l.departmentId, l.jobTitle)) ?? 0 }))
    .map((r) => ({ ...r, ...staffingGap(r) }))
    .sort((a, b) => a.department.localeCompare(b.department) || a.jobTitle.localeCompare(b.jobTitle));
  // Only approved lines count toward the headline numbers.
  const approved = rows.filter((r) => r.status === 'APPROVED');
  return apiResponse.success(res, 'Workforce plan.', {
    year, departments: depts, rows,
    totals: {
      planned: approved.reduce((s, r) => s + r.planned, 0), actual: approved.reduce((s, r) => s + r.actual, 0),
      short: approved.filter((r) => r.state === 'SHORT').length, toRecruit: approved.reduce((s, r) => s + r.toRecruit, 0),
      pendingApproval: rows.filter((r) => r.status === 'SUBMITTED').length,
    },
  });
});

// PUT /planning  { year, departmentId, jobTitle, planned, notes }
export const upsertLine = handle(async (req, res) => {
  const a = access(req); const b = req.body ?? {};
  const year = yearOf(b.year); const departmentId = reqStr(b.departmentId, 'Department', 60); const jobTitle = reqStr(b.jobTitle, 'Job title', 120);
  const planned = int(b.planned, 'Planned headcount', 0, 10000);
  if (planned === null) fail(400, 'Planned headcount is required.');
  if (!(await prisma.pwmDepartment.findUnique({ where: { id: departmentId }, select: { id: true } }))) fail(404, 'Department not found.');
  const where = { year_departmentId_jobTitle: { year, departmentId, jobTitle } };
  const before = await prisma.pwmHeadcountPlan.findUnique({ where });
  // Any edit sends an approved line back to draft: the approved number must be the one the approver saw.
  const row = await prisma.pwmHeadcountPlan.upsert({
    where,
    create: { year, departmentId, jobTitle, planned: planned as number, notes: str(b.notes, 500), preparedById: a.userId },
    update: { planned: planned as number, notes: str(b.notes, 500), status: 'DRAFT', preparedById: a.userId, decidedById: null, decidedAt: null, decisionNote: null },
  });
  await pwmAudit(req, { action: before ? 'PLAN_LINE_CHANGED' : 'PLAN_LINE_ADDED', entity: 'PwmHeadcountPlan', entityId: row.id, before: before ? { planned: before.planned, status: before.status } : undefined, after: { year, jobTitle, planned } });
  return apiResponse.success(res, 'Plan line saved as a draft.', row);
});

// POST /planning/submit  { year }
export const submitYear = handle(async (req, res) => {
  const year = yearOf(req.body?.year);
  const r = await prisma.pwmHeadcountPlan.updateMany({ where: { year, status: 'DRAFT' }, data: { status: 'SUBMITTED' } });
  if (!r.count) fail(400, 'There are no draft lines to submit.');
  await pwmAudit(req, { action: 'PLAN_SUBMITTED', entity: 'PwmHeadcountPlan', entityId: String(year), after: { lines: r.count } });
  return apiResponse.success(res, `${r.count} line(s) sent for approval.`, { lines: r.count });
});

// POST /planning/decide  { year, approve, note }
export const decideYear = handle(async (req, res) => {
  const a = access(req); const b = req.body ?? {}; const year = yearOf(b.year); const approve = b.approve === true;
  const note = str(b.note, 500);
  if (!approve && !note) fail(400, 'Say why the plan is being sent back.');
  const lines = await prisma.pwmHeadcountPlan.findMany({ where: { year, status: 'SUBMITTED' } });
  if (!lines.length) fail(400, 'Nothing is waiting for approval.');
  // Segregation of duties: whoever prepared a line cannot approve it.
  if (lines.some((l) => l.preparedById === a.userId)) fail(403, 'You prepared some of these lines, so someone else must approve them.');
  await prisma.pwmHeadcountPlan.updateMany({ where: { year, status: 'SUBMITTED' }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: a.userId, decidedAt: new Date(), decisionNote: note } });
  await pwmAudit(req, { action: approve ? 'PLAN_APPROVED' : 'PLAN_REJECTED', entity: 'PwmHeadcountPlan', entityId: String(year), after: { lines: lines.length }, reason: note ?? undefined });
  return apiResponse.success(res, approve ? 'Plan approved.' : 'Plan sent back.', { lines: lines.length });
});

// DELETE /planning/:id  (draft or returned lines only)
export const deleteLine = handle(async (req, res) => {
  const l = await prisma.pwmHeadcountPlan.findUnique({ where: { id: req.params.id } });
  if (!l) fail(404, 'Line not found.');
  if (!['DRAFT', 'REJECTED'].includes(l!.status)) fail(409, 'Only draft or returned lines can be removed.');
  await prisma.pwmHeadcountPlan.delete({ where: { id: l!.id } });
  await pwmAudit(req, { action: 'PLAN_LINE_REMOVED', entity: 'PwmHeadcountPlan', entityId: l!.id, before: { jobTitle: l!.jobTitle, planned: l!.planned } });
  return apiResponse.success(res, 'Removed.', null);
});

// ── Succession ───────────────────────────────────────────────────────────────

// GET /succession
export const listPositions = handle(async (req, res) => {
  const rows = await prisma.pwmKeyPosition.findMany({ where: { archivedAt: null }, include: { successors: true }, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set(rows.flatMap((p) => [p.incumbentId, ...p.successors.map((s) => s.employeeId)]).filter(Boolean) as string[])];
  const emps = await prisma.pwmEmployee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, jobTitle: true } });
  const nm = new Map(emps.map((e) => [e.id, e]));
  const depts = await prisma.pwmDepartment.findMany({ select: { id: true, name: true } });
  const dn = new Map(depts.map((d) => [d.id, d.name]));
  const rank: Record<string, number> = { EXPOSED: 0, THIN: 1, COVERED: 2 };
  const out = rows.map((p) => ({
    id: p.id, jobTitle: p.jobTitle, department: p.departmentId ? dn.get(p.departmentId) ?? null : null, departmentId: p.departmentId, criticality: p.criticality, notes: p.notes,
    incumbent: p.incumbentId && nm.get(p.incumbentId) ? { id: p.incumbentId, name: fullName(nm.get(p.incumbentId)!) } : null,
    successors: p.successors.map((s) => ({ id: s.id, employeeId: s.employeeId, name: nm.get(s.employeeId) ? fullName(nm.get(s.employeeId)!) : 'Unknown', currentTitle: nm.get(s.employeeId)?.jobTitle ?? null, readiness: s.readiness, developmentNote: s.developmentNote })),
    risk: successionRisk(p.criticality, p.successors),
  })).sort((a, b) => rank[a.risk] - rank[b.risk]);
  // Reading this list is itself sensitive: record that it was opened (no content in the log).
  await pwmAudit(req, { action: 'SUCCESSION_VIEWED', entity: 'PwmKeyPosition', entityId: 'list' });
  return apiResponse.success(res, 'Key positions.', { positions: out, summary: { exposed: out.filter((p) => p.risk === 'EXPOSED').length, thin: out.filter((p) => p.risk === 'THIN').length, covered: out.filter((p) => p.risk === 'COVERED').length } });
});

const emp = async (id: unknown, label: string): Promise<string> => {
  const e = await prisma.pwmEmployee.findUnique({ where: { id: String(id ?? '') }, select: { id: true } });
  if (!e) fail(404, `${label} not found.`);
  return e!.id;
};
const CRIT = ['HIGH', 'MEDIUM', 'LOW'] as const;

// POST /succession
export const createPosition = handle(async (req, res) => {
  const b = req.body ?? {};
  const p = await prisma.pwmKeyPosition.create({ data: { jobTitle: reqStr(b.jobTitle, 'Job title', 120), departmentId: str(b.departmentId, 60), incumbentId: b.incumbentId ? await emp(b.incumbentId, 'Incumbent') : null, criticality: oneOf(b.criticality ?? 'MEDIUM', CRIT, 'Criticality'), notes: str(b.notes, 500) } });
  await pwmAudit(req, { action: 'KEY_POSITION_ADDED', entity: 'PwmKeyPosition', entityId: p.id, after: { jobTitle: p.jobTitle, criticality: p.criticality } });
  return apiResponse.success(res, 'Key position added.', p, 201);
});

// PATCH /succession/:id
export const updatePosition = handle(async (req, res) => {
  const b = req.body ?? {}; const d: Record<string, unknown> = {};
  if (b.criticality !== undefined) d.criticality = oneOf(b.criticality, CRIT, 'Criticality');
  if (b.notes !== undefined) d.notes = str(b.notes, 500);
  if (b.incumbentId !== undefined) d.incumbentId = b.incumbentId ? await emp(b.incumbentId, 'Incumbent') : null;
  const p = await prisma.pwmKeyPosition.update({ where: { id: req.params.id }, data: d }).catch(() => null);
  if (!p) fail(404, 'Position not found.');
  await pwmAudit(req, { action: 'KEY_POSITION_CHANGED', entity: 'PwmKeyPosition', entityId: p!.id, after: Object.keys(d) });
  return apiResponse.success(res, 'Saved.', p);
});

// DELETE /succession/:id
export const archivePosition = handle(async (req, res) => {
  const p = await prisma.pwmKeyPosition.update({ where: { id: req.params.id }, data: { archivedAt: new Date() } }).catch(() => null);
  if (!p) fail(404, 'Position not found.');
  await pwmAudit(req, { action: 'KEY_POSITION_ARCHIVED', entity: 'PwmKeyPosition', entityId: p!.id });
  return apiResponse.success(res, 'Removed from the list.', null);
});

// POST /succession/:id/successors  { employeeId, readiness, developmentNote }
export const setSuccessor = handle(async (req, res) => {
  const a = access(req); const b = req.body ?? {};
  const pos = await prisma.pwmKeyPosition.findUnique({ where: { id: req.params.id } });
  if (!pos || pos.archivedAt) fail(404, 'Position not found.');
  const employeeId = await emp(b.employeeId, 'Employee');
  if (pos!.incumbentId === employeeId) fail(400, 'The current post-holder cannot be their own successor.');
  const readiness = oneOf(b.readiness, READINESS, 'Readiness');
  const s = await prisma.pwmSuccessor.upsert({
    where: { positionId_employeeId: { positionId: pos!.id, employeeId } },
    create: { positionId: pos!.id, employeeId, readiness, developmentNote: str(b.developmentNote, 500), addedById: a.userId },
    update: { readiness, developmentNote: str(b.developmentNote, 500) },
  });
  await pwmAudit(req, { action: 'SUCCESSOR_SET', entity: 'PwmKeyPosition', entityId: pos!.id, after: { employeeId, readiness } });
  return apiResponse.success(res, 'Successor saved.', s);
});

// DELETE /succession/successors/:id
export const removeSuccessor = handle(async (req, res) => {
  const s = await prisma.pwmSuccessor.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!s) fail(404, 'Not found.');
  await pwmAudit(req, { action: 'SUCCESSOR_REMOVED', entity: 'PwmKeyPosition', entityId: s!.positionId, after: { employeeId: s!.employeeId } });
  return apiResponse.success(res, 'Removed.', null);
});
