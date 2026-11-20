// PWM Phase 4: company assets, custody and returns (PRD 10.16).
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { nextNumber } from '../../services/pwm/settings';
import { can, dateOnly, fromYmd, fullName } from '../../services/pwm/rules';
import { canSeeEmployee } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, oneOf, reqStr, str, ymd } from './common';

const CATEGORIES = ['LAPTOP', 'PHONE', 'ID_CARD', 'ACCESS_CARD', 'EQUIPMENT', 'VEHICLE', 'SOFTWARE', 'OTHER'] as const;
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'] as const;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));

const assetData = (b: Record<string, unknown>, partial: boolean): Prisma.PwmAssetUncheckedUpdateInput => {
  const d: Prisma.PwmAssetUncheckedUpdateInput = {};
  if (!partial || b.category !== undefined) d.category = oneOf(b.category, CATEGORIES, 'Category');
  if (!partial || b.name !== undefined) d.name = reqStr(b.name, 'Make and model', 160);
  for (const k of ['serial', 'supplier', 'location', 'notes'] as const) if (b[k] !== undefined) (d as Record<string, unknown>)[k] = str(b[k], 300);
  for (const k of ['purchaseDate', 'warrantyExpiry'] as const) if (b[k] !== undefined) { const v = ymd(b[k], k); (d as Record<string, unknown>)[k] = v ? fromYmd(v) : null; }
  if (b.cost !== undefined) { const n = b.cost === '' || b.cost === null ? null : Number(b.cost); if (n !== null && !(n >= 0 && n <= 1e10)) fail(400, 'Cost is not valid.'); d.cost = n; }
  if (b.condition !== undefined) d.condition = oneOf(b.condition, CONDITIONS, 'Condition');
  if (b.seats !== undefined) d.seats = b.seats === '' || b.seats === null ? null : Math.max(0, Math.floor(Number(b.seats)) || 0);
  if (b.expiries !== undefined) d.expiries = (Array.isArray(b.expiries) ? b.expiries : []).slice(0, 6).map((x: { label?: unknown; date?: unknown }) => ({ label: String(x.label ?? '').slice(0, 60), date: String(x.date ?? '').slice(0, 10) })).filter((x: { label: string; date: string }) => x.label && /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  return d;
};

// GET /assets?status=&category=&q=
export const listAssets = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const rows = await prisma.pwmAsset.findMany({
    where: { archivedAt: null, ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}), ...(q.q ? { OR: [{ tag: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { serial: { contains: q.q, mode: 'insensitive' } }] } : {}) },
    orderBy: { createdAt: 'desc' }, take: 500, include: { assignments: { where: { status: 'ACTIVE' }, take: 1, include: { employee: { select: { id: true, firstName: true, lastName: true } } } } },
  });
  const sum = await prisma.pwmAsset.groupBy({ by: ['status'], where: { archivedAt: null }, _count: true });
  return apiResponse.success(res, 'Assets.', { summary: Object.fromEntries(sum.map((s) => [s.status, s._count])), assets: rows.map((a) => ({ ...a, cost: num(a.cost), holder: a.assignments[0] ? { id: a.assignments[0].employee.id, name: fullName(a.assignments[0].employee), acknowledged: !!a.assignments[0].acknowledgedAt } : null, assignments: undefined })) });
});

// POST /assets
export const createAsset = handle(async (req, res) => {
  const b = req.body ?? {};
  const year = new Date().getFullYear();
  const tag = str(b.tag, 40)?.toUpperCase() ?? `AST-${year}-${String(await nextNumber(`asset:${year}`)).padStart(5, '0')}`;
  if (await prisma.pwmAsset.findUnique({ where: { tag } })) fail(409, 'That asset tag is already used.');
  const a = await prisma.pwmAsset.create({ data: { ...(assetData(b, false) as Prisma.PwmAssetUncheckedCreateInput), tag } });
  await pwmAudit(req, { action: 'ASSET_ADDED', entity: 'PwmAsset', entityId: a.id, after: { tag, name: a.name } });
  return apiResponse.success(res, `Asset ${tag} added.`, a, 201);
});

// GET /assets/:id
export const getAsset = handle(async (req, res) => {
  const a = await prisma.pwmAsset.findUnique({ where: { id: req.params.id }, include: { assignments: { orderBy: { assignedAt: 'desc' }, include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } } }, events: { orderBy: { createdAt: 'desc' } } } });
  if (!a) fail(404, 'Asset not found.');
  const names = await nameMap([...a!.events.map((e) => e.byUserId), ...a!.assignments.flatMap((x) => [x.assignedById, x.receivedById, x.resolvedById])]);
  return apiResponse.success(res, 'Asset.', { ...a, cost: num(a!.cost), events: a!.events.map((e) => ({ ...e, cost: num(e.cost), byName: e.byUserId ? names.get(e.byUserId) ?? null : null })), assignments: a!.assignments.map((x) => ({ ...x, employee: { ...x.employee, name: fullName(x.employee) }, assignedByName: x.assignedById ? names.get(x.assignedById) ?? null : null, receivedByName: x.receivedById ? names.get(x.receivedById) ?? null : null })) });
});

// PATCH /assets/:id
export const updateAsset = handle(async (req, res) => {
  const cur = await prisma.pwmAsset.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Asset not found.');
  const d = assetData(req.body ?? {}, true);
  const a = await prisma.pwmAsset.update({ where: { id: cur!.id }, data: d });
  await pwmAudit(req, { action: 'ASSET_UPDATED', entity: 'PwmAsset', entityId: a.id, after: d });
  return apiResponse.success(res, 'Saved.', a);
});

// POST /assets/:id/assign { employeeId, conditionOut }
export const assign = handle(async (req, res) => {
  const a = access(req);
  const asset = await prisma.pwmAsset.findUnique({ where: { id: req.params.id } });
  if (!asset || asset.archivedAt) fail(404, 'Asset not found.');
  if (asset!.status !== 'IN_STOCK') fail(409, `This asset is ${asset!.status.replace(/_/g, ' ').toLowerCase()} and cannot be assigned.`);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(req.body?.employeeId, 'Employee', 60) }, select: { id: true, userId: true, firstName: true, lastName: true, departmentId: true, status: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  if (['RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(e!.status)) fail(409, 'This person has left.');
  const cond = oneOf(req.body?.conditionOut ?? asset!.condition, CONDITIONS, 'Condition');
  const as = await prisma.$transaction(async (tx) => {
    const x = await tx.pwmAssetAssignment.create({ data: { assetId: asset!.id, employeeId: e!.id, assignedById: a.userId, conditionOut: cond } });
    await tx.pwmAsset.update({ where: { id: asset!.id }, data: { status: 'ASSIGNED', condition: cond } });
    return x;
  });
  await pwmAudit(req, { action: 'ASSET_ASSIGNED', entity: 'PwmEmployee', entityId: e!.id, meta: { tag: asset!.tag, assignmentId: as.id }, after: { condition: cond } });
  // AC-AST-01: the employee is asked to acknowledge custody.
  await notifyPwm([e!.userId], { title: `Company property assigned to you: ${asset!.name}`, body: `Tag ${asset!.tag}. Please confirm you have received it in My HR → My Assets.`, link: '/my-hr/assets' });
  return apiResponse.success(res, 'Assigned. The employee has been asked to acknowledge it.', as, 201);
});

// POST /assets/assignments/:id/return { conditionIn, note }
export const returnAsset = handle(async (req, res) => {
  const a = access(req);
  const as = await prisma.pwmAssetAssignment.findUnique({ where: { id: req.params.id }, include: { asset: true } });
  if (!as || as.status !== 'ACTIVE') fail(404, 'No active assignment found.');
  const cond = oneOf(req.body?.conditionIn, CONDITIONS, 'Condition on return');
  await prisma.$transaction(async (tx) => {
    await tx.pwmAssetAssignment.update({ where: { id: as!.id }, data: { status: 'RETURNED', returnedAt: new Date(), conditionIn: cond, receivedById: a.userId, resolutionNote: str(req.body?.note, 300) } });
    await tx.pwmAsset.update({ where: { id: as!.assetId }, data: { status: cond === 'POOR' ? 'IN_REPAIR' : 'IN_STOCK', condition: cond } });
    await tx.pwmAssetEvent.create({ data: { assetId: as!.assetId, kind: 'CONDITION', note: `Returned in ${cond.toLowerCase()} condition${str(req.body?.note, 300) ? `: ${str(req.body?.note, 300)}` : ''}`, byUserId: a.userId } });
  });
  await pwmAudit(req, { action: 'ASSET_RETURNED', entity: 'PwmEmployee', entityId: as!.employeeId, meta: { tag: as!.asset.tag, condition: cond } });
  return apiResponse.success(res, 'Return recorded.', null);
});

// POST /assets/assignments/:id/resolve { outcome: WRITTEN_OFF|CHARGED, note } : needs a senior approver (AST-07)
export const resolveAssignment = handle(async (req, res) => {
  const a = access(req);
  if (!['SUPER', 'HR_ADMIN', 'EXECUTIVE'].includes(a.level)) fail(403, 'Forbidden. A write-off or charge needs an HR administrator or executive.');
  const as = await prisma.pwmAssetAssignment.findUnique({ where: { id: req.params.id }, include: { asset: true, employee: { select: { userId: true } } } });
  if (!as || as.status !== 'ACTIVE') fail(404, 'No active assignment found.');
  if (as!.employee.userId === a.userId) fail(403, 'You cannot resolve your own assignment.');
  const outcome = oneOf(req.body?.outcome, ['WRITTEN_OFF', 'CHARGED'] as const, 'Outcome');
  const note = reqStr(req.body?.note, 'Reason', 400);
  await prisma.$transaction(async (tx) => {
    await tx.pwmAssetAssignment.update({ where: { id: as!.id }, data: { status: outcome, resolutionNote: note, resolvedById: a.userId, returnedAt: new Date() } });
    await tx.pwmAsset.update({ where: { id: as!.assetId }, data: { status: 'RETIRED' } });
    await tx.pwmAssetEvent.create({ data: { assetId: as!.assetId, kind: outcome === 'CHARGED' ? 'LOST' : 'NOTE', note: `${outcome === 'CHARGED' ? 'Charged to the employee' : 'Written off'}: ${note}`, recovery: outcome === 'CHARGED' ? 'EMPLOYEE' : 'COMPANY', byUserId: a.userId } });
  });
  await pwmAudit(req, { action: `ASSET_${outcome}`, entity: 'PwmEmployee', entityId: as!.employeeId, reason: note, meta: { tag: as!.asset.tag } });
  return apiResponse.success(res, outcome === 'CHARGED' ? 'Recorded as charged to the employee. Finance handles recovery.' : 'Written off.', null);
});

// POST /assets/:id/events { kind, note, cost, recovery }: maintenance, condition, lost or damaged (AST-04, AST-08)
export const addEvent = handle(async (req, res) => {
  const a = access(req);
  const asset = await prisma.pwmAsset.findUnique({ where: { id: req.params.id } });
  if (!asset) fail(404, 'Asset not found.');
  const kind = oneOf(req.body?.kind, ['MAINTENANCE', 'CONDITION', 'LOST', 'DAMAGED', 'FOUND', 'NOTE'] as const, 'Kind');
  const cost = req.body?.cost === undefined || req.body?.cost === '' ? null : Number(req.body.cost);
  if (cost !== null && !(cost >= 0 && cost <= 1e10)) fail(400, 'Cost is not valid.');
  const status = kind === 'LOST' ? 'LOST' : kind === 'MAINTENANCE' || kind === 'DAMAGED' ? 'IN_REPAIR' : kind === 'FOUND' ? 'IN_STOCK' : null;
  await prisma.$transaction(async (tx) => {
    await tx.pwmAssetEvent.create({ data: { assetId: asset!.id, kind, note: reqStr(req.body?.note, 'Note', 500), cost, recovery: str(req.body?.recovery, 40), byUserId: a.userId } });
    // An assigned item that is reported lost or damaged stays with its holder until the case is resolved.
    if (status && !(asset!.status === 'ASSIGNED' && status !== 'LOST')) await tx.pwmAsset.update({ where: { id: asset!.id }, data: { status } });
  });
  await pwmAudit(req, { action: `ASSET_${kind}`, entity: 'PwmAsset', entityId: asset!.id, meta: { cost, recovery: str(req.body?.recovery, 40) } });
  return apiResponse.success(res, 'Recorded.', null, 201);
});

// POST /assets/:id/retire
export const retireAsset = handle(async (req, res) => {
  const asset = await prisma.pwmAsset.findUnique({ where: { id: req.params.id } });
  if (!asset) fail(404, 'Asset not found.');
  if (asset!.status === 'ASSIGNED') fail(409, 'Return it first.');
  await prisma.pwmAsset.update({ where: { id: asset!.id }, data: { status: 'RETIRED' } });
  await pwmAudit(req, { action: 'ASSET_RETIRED', entity: 'PwmAsset', entityId: asset!.id, reason: str(req.body?.reason, 300) ?? undefined });
  return apiResponse.success(res, 'Retired.', null);
});

// GET /employees/:id/assets : custody history on the profile (AST-06)
export const employeeAssets = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, departmentId: true } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const rows = await prisma.pwmAssetAssignment.findMany({ where: { employeeId: e!.id }, orderBy: { assignedAt: 'desc' }, include: { asset: { select: { id: true, tag: true, name: true, category: true } } } });
  return apiResponse.success(res, 'Assets.', { outstanding: rows.filter((r) => r.status === 'ACTIVE').length, assignments: rows, canManage: can(a, 'manageAssets') });
});

/** Assets an exiting employee still holds. Used by clearance. */
export const outstandingFor = (employeeId: string) => prisma.pwmAssetAssignment.findMany({ where: { employeeId, status: 'ACTIVE' }, include: { asset: { select: { tag: true, name: true } } } });

// GET /assets/expiring : warranties, insurance, roadworthiness and licence renewals in the next 60 days
export const expiring = handle(async (_req, res) => {
  const rows = await prisma.pwmAsset.findMany({ where: { archivedAt: null, status: { not: 'RETIRED' } }, select: { id: true, tag: true, name: true, category: true, warrantyExpiry: true, expiries: true } });
  const horizon = dateOnly(new Date(Date.now() + 60 * 86_400_000));
  const out: { assetId: string; tag: string; name: string; label: string; date: string }[] = [];
  for (const r of rows) {
    if (r.warrantyExpiry && dateOnly(r.warrantyExpiry) <= horizon) out.push({ assetId: r.id, tag: r.tag, name: r.name, label: 'Warranty', date: dateOnly(r.warrantyExpiry) });
    for (const x of (r.expiries as { label: string; date: string }[] | null) ?? []) if (x.date <= horizon) out.push({ assetId: r.id, tag: r.tag, name: r.name, label: x.label, date: x.date });
  }
  return apiResponse.success(res, 'Expiring.', out.sort((a, b) => a.date.localeCompare(b.date)));
});

