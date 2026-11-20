// PWM Phase 2: policies and acknowledgements, announcements, and document templates with generation.
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig } from '../../services/pwm/settings';
import { CURRENT_STATUSES, can, fromYmd, lagosYmd } from '../../services/pwm/rules';
import { DEFAULT_TEMPLATES, MERGE_FIELDS, mergeValues, renderTemplate, toDocx, toPdf, unknownFields } from '../../services/pwm/docgen';
import { canSeeEmployee } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, oneOf, reqStr, ymd, str } from './common';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'policy';

/** Login ids of current employees, optionally limited to departments. */
const staffUserIds = async (departmentIds?: string[] | null): Promise<string[]> =>
  (await prisma.pwmEmployee.findMany({ where: { userId: { not: null }, status: { in: [...CURRENT_STATUSES] }, ...(departmentIds?.length ? { departmentId: { in: departmentIds } } : {}) }, select: { userId: true } })).map((e) => e.userId as string);

// ── Policies ─────────────────────────────────────────────────────────────────

// GET /policies
export const listPolicies = handle(async (req, res) => {
  const a = access(req);
  const manage = can(a, 'managePolicies');
  const rows = await prisma.pwmPolicy.findMany({ where: manage ? {} : { status: 'PUBLISHED' }, orderBy: [{ slug: 'asc' }, { version: 'desc' }], include: { _count: { select: { acks: true } } } });
  const total = await prisma.pwmEmployee.count({ where: { status: { in: [...CURRENT_STATUSES] } } });
  return apiResponse.success(res, 'Policies.', rows.map((p) => ({ ...p, body: undefined, acknowledged: p._count.acks, audience: total, _count: undefined })));
});

// GET /policies/:id
export const getPolicy = handle(async (req, res) => {
  const p = await prisma.pwmPolicy.findUnique({ where: { id: req.params.id } });
  if (!p || (p.status !== 'PUBLISHED' && !can(access(req), 'managePolicies'))) fail(404, 'Policy not found.');
  return apiResponse.success(res, 'Policy.', p);
});

// POST /policies { title, category, body, fileUrl, requiresAck, effectiveDate, slug? }
export const createPolicy = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const title = reqStr(b.title, 'Title', 160);
  if (!str(b.body, 50000) && !str(b.fileUrl, 1000)) fail(400, 'Add the policy text or upload a file.');
  const slug = str(b.slug, 60) ?? slugify(title);
  const last = await prisma.pwmPolicy.findFirst({ where: { slug }, orderBy: { version: 'desc' }, select: { version: true } });
  const eff = ymd(b.effectiveDate, 'Effective date');
  const p = await prisma.pwmPolicy.create({ data: { slug, title, category: str(b.category, 60), version: (last?.version ?? 0) + 1, body: str(b.body, 50000), fileUrl: str(b.fileUrl, 1000), requiresAck: b.requiresAck !== false, effectiveDate: eff ? fromYmd(eff) : null, createdById: a.userId } });
  await pwmAudit(req, { action: 'POLICY_CREATED', entity: 'PwmPolicy', entityId: p.id, after: { title, version: p.version } });
  return apiResponse.success(res, `Draft version ${p.version} created.`, p, 201);
});

// PATCH /policies/:id (drafts only)
export const updatePolicy = handle(async (req, res) => {
  const b = req.body ?? {};
  const cur = await prisma.pwmPolicy.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Policy not found.');
  if (cur!.status !== 'DRAFT') fail(409, 'A published policy cannot be edited. Create a new version instead.');
  const eff = b.effectiveDate !== undefined ? ymd(b.effectiveDate, 'Effective date') : undefined;
  const p = await prisma.pwmPolicy.update({ where: { id: cur!.id }, data: { ...(b.title !== undefined ? { title: reqStr(b.title, 'Title', 160) } : {}), ...(b.category !== undefined ? { category: str(b.category, 60) } : {}), ...(b.body !== undefined ? { body: str(b.body, 50000) } : {}), ...(b.fileUrl !== undefined ? { fileUrl: str(b.fileUrl, 1000) } : {}), ...(b.requiresAck !== undefined ? { requiresAck: !!b.requiresAck } : {}), ...(eff !== undefined ? { effectiveDate: eff ? fromYmd(eff) : null } : {}) } });
  await pwmAudit(req, { action: 'POLICY_UPDATED', entity: 'PwmPolicy', entityId: p.id });
  return apiResponse.success(res, 'Saved.', p);
});

// POST /policies/:id/publish : the earlier version is archived and everyone is asked to acknowledge the new one
export const publishPolicy = handle(async (req, res) => {
  const cur = await prisma.pwmPolicy.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Policy not found.');
  if (cur!.status !== 'DRAFT') fail(409, 'Only a draft can be published.');
  await prisma.$transaction([
    prisma.pwmPolicy.updateMany({ where: { slug: cur!.slug, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } }),
    prisma.pwmPolicy.update({ where: { id: cur!.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
  ]);
  await pwmAudit(req, { action: 'POLICY_PUBLISHED', entity: 'PwmPolicy', entityId: cur!.id, after: { title: cur!.title, version: cur!.version } });
  if (cur!.requiresAck) await notifyPwm(await staffUserIds(), { title: `Please read and acknowledge: ${cur!.title}`, body: `Version ${cur!.version} is now in force. Open My HR → Policies.`, link: '/my-hr/policies' });
  return apiResponse.success(res, 'Published.', null);
});

// POST /policies/:id/archive
export const archivePolicy = handle(async (req, res) => {
  const cur = await prisma.pwmPolicy.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Policy not found.');
  await prisma.pwmPolicy.update({ where: { id: cur!.id }, data: { status: 'ARCHIVED' } });
  await pwmAudit(req, { action: 'POLICY_ARCHIVED', entity: 'PwmPolicy', entityId: cur!.id });
  return apiResponse.success(res, 'Archived.', null);
});

// GET /policies/:id/acknowledgements : who has and who has not
export const policyAcks = handle(async (req, res) => {
  const p = await prisma.pwmPolicy.findUnique({ where: { id: req.params.id }, include: { acks: true } });
  if (!p) fail(404, 'Policy not found.');
  const emps = await prisma.pwmEmployee.findMany({ where: { status: { in: [...CURRENT_STATUSES] } }, select: { id: true, employeeNo: true, firstName: true, lastName: true, userId: true, department: { select: { name: true } } }, orderBy: { lastName: 'asc' } });
  const done = new Map(p!.acks.map((x) => [x.employeeId, x.ackedAt]));
  return apiResponse.success(res, 'Acknowledgements.', { policy: { id: p!.id, title: p!.title, version: p!.version }, employees: emps.map((e) => ({ ...e, acknowledgedAt: done.get(e.id) ?? null, hasLogin: !!e.userId })) });
});

// ── Announcements ────────────────────────────────────────────────────────────

// GET /announcements
export const listAnnouncements = handle(async (_req, res) => {
  const rows = await prisma.pwmAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const names = await nameMap(rows.map((r) => r.createdById));
  return apiResponse.success(res, 'Announcements.', rows.map((r) => ({ ...r, createdByName: r.createdById ? names.get(r.createdById) ?? null : null })));
});

// POST /announcements { title, body, departmentIds, publishAt, expiresAt, pinned }
export const createAnnouncement = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const publishAt = b.publishAt ? new Date(String(b.publishAt)) : new Date();
  const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
  if (Number.isNaN(publishAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) fail(400, 'Dates are not valid.');
  if (expiresAt && expiresAt <= publishAt) fail(400, 'The end date must be after the start date.');
  const depts = (Array.isArray(b.departmentIds) ? b.departmentIds : []).map(String).slice(0, 30);
  const n = await prisma.pwmAnnouncement.create({ data: { title: reqStr(b.title, 'Title', 160), body: reqStr(b.body, 'Message', 5000), departmentIds: depts.length ? depts : undefined, publishAt, expiresAt, pinned: !!b.pinned, createdById: a.userId } });
  await pwmAudit(req, { action: 'ANNOUNCEMENT_CREATED', entity: 'PwmAnnouncement', entityId: n.id, after: { title: n.title, audience: depts.length ? depts : 'everyone' } });
  if (publishAt <= new Date()) await notifyPwm(await staffUserIds(depts), { title: n.title, body: n.body.slice(0, 160), link: '/my-hr' });
  return apiResponse.success(res, 'Announcement posted.', n, 201);
});

// POST /announcements/:id/archive
export const archiveAnnouncement = handle(async (req, res) => {
  const cur = await prisma.pwmAnnouncement.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Announcement not found.');
  await prisma.pwmAnnouncement.update({ where: { id: cur!.id }, data: { archivedAt: new Date() } });
  await pwmAudit(req, { action: 'ANNOUNCEMENT_ARCHIVED', entity: 'PwmAnnouncement', entityId: cur!.id });
  return apiResponse.success(res, 'Archived.', null);
});

// ── Templates ────────────────────────────────────────────────────────────────

// GET /templates
export const listTemplates = handle(async (_req, res) => {
  const rows = await prisma.pwmTemplate.findMany({ orderBy: [{ slug: 'asc' }, { version: 'desc' }], take: 200 });
  return apiResponse.success(res, 'Templates.', { templates: rows, fields: MERGE_FIELDS });
});

// POST /templates { slug?, name, kind, body }: a new template, or a new version when the slug exists
export const createTemplate = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const name = reqStr(b.name, 'Name', 120); const body = reqStr(b.body, 'Template text', 50000);
  const kind = oneOf(b.kind, ['CONTRACT', 'LETTER', 'EXIT'] as const, 'Kind');
  const bad = unknownFields(body);
  if (bad.length) fail(400, `Unknown merge fields: ${bad.map((f) => `{{${f}}}`).join(', ')}. Use the field list beside the editor.`);
  const slug = str(b.slug, 60) ?? slugify(name);
  const last = await prisma.pwmTemplate.findFirst({ where: { slug }, orderBy: { version: 'desc' }, select: { version: true } });
  const t = await prisma.pwmTemplate.create({ data: { slug, name, kind, body, version: (last?.version ?? 0) + 1, createdById: a.userId } });
  await pwmAudit(req, { action: 'TEMPLATE_CREATED', entity: 'PwmTemplate', entityId: t.id, after: { name, version: t.version } });
  return apiResponse.success(res, `Draft version ${t.version} saved. It must be approved before use.`, t, 201);
});

// PATCH /templates/:id (drafts only)
export const updateTemplate = handle(async (req, res) => {
  const b = req.body ?? {};
  const cur = await prisma.pwmTemplate.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Template not found.');
  if (cur!.status !== 'DRAFT') fail(409, 'An approved template cannot be edited. Save a new version instead.');
  const body = b.body !== undefined ? reqStr(b.body, 'Template text', 50000) : cur!.body;
  const bad = unknownFields(body);
  if (bad.length) fail(400, `Unknown merge fields: ${bad.map((f) => `{{${f}}}`).join(', ')}.`);
  const t = await prisma.pwmTemplate.update({ where: { id: cur!.id }, data: { body, ...(b.name !== undefined ? { name: reqStr(b.name, 'Name', 120) } : {}) } });
  await pwmAudit(req, { action: 'TEMPLATE_UPDATED', entity: 'PwmTemplate', entityId: t.id });
  return apiResponse.success(res, 'Saved.', t);
});

// POST /templates/:id/approve : a second person approves; older approved versions are archived
export const approveTemplate = handle(async (req, res) => {
  const a = access(req);
  const cfg = await getPwmConfig();
  const cur = await prisma.pwmTemplate.findUnique({ where: { id: req.params.id } });
  if (!cur) fail(404, 'Template not found.');
  if (cur!.status !== 'DRAFT') fail(409, 'Only a draft can be approved.');
  if (cur!.createdById === a.userId && !cfg.allowSelfApproval) fail(403, 'You cannot approve a template you wrote.');
  await prisma.$transaction([
    prisma.pwmTemplate.updateMany({ where: { slug: cur!.slug, status: 'APPROVED' }, data: { status: 'ARCHIVED' } }),
    prisma.pwmTemplate.update({ where: { id: cur!.id }, data: { status: 'APPROVED', approvedById: a.userId, approvedAt: new Date() } }),
  ]);
  await pwmAudit(req, { action: 'TEMPLATE_APPROVED', entity: 'PwmTemplate', entityId: cur!.id, after: { name: cur!.name, version: cur!.version } });
  return apiResponse.success(res, 'Approved and ready to use.', null);
});

// POST /templates/seed : the starter set, as drafts
export const seedTemplates = handle(async (req, res) => {
  const a = access(req);
  const have = new Set((await prisma.pwmTemplate.findMany({ select: { slug: true } })).map((t) => t.slug));
  const add = DEFAULT_TEMPLATES.filter((t) => !have.has(t.slug));
  for (const t of add) await prisma.pwmTemplate.create({ data: { ...t, createdById: a.userId } });
  await pwmAudit(req, { action: 'TEMPLATES_SEEDED', entity: 'PwmTemplate', entityId: 'seed', after: { added: add.map((t) => t.slug) } });
  return apiResponse.success(res, add.length ? `${add.length} starter templates added as drafts.` : 'The starter templates already exist.', null);
});

// POST /templates/:id/generate { employeeId, contractId, format: docx|pdf|txt, preview }
export const generate = handle(async (req, res) => {
  const a = access(req);
  const b = req.body ?? {};
  const t = await prisma.pwmTemplate.findUnique({ where: { id: req.params.id } });
  if (!t) fail(404, 'Template not found.');
  if (t!.status !== 'APPROVED' && !b.preview) fail(409, 'Only an approved template can be used to generate a document.');
  const e = await prisma.pwmEmployee.findUnique({ where: { id: reqStr(b.employeeId, 'Employee', 60) }, include: { department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true } } } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const contract = b.contractId
    ? await prisma.pwmContract.findFirst({ where: { id: String(b.contractId), employeeId: e!.id } })
    : await prisma.pwmContract.findFirst({ where: { employeeId: e!.id, archivedAt: null }, orderBy: { commencementDate: 'desc' } });
  const cfg = await getPwmConfig();
  let caseData: { reference: string; hearingAt: Date | null; responseDue: Date | null; outcome: string | null; summary: string } | null = null;
  if (b.caseId) {
    // Letters about a case are for the people named on it only, and each use is logged against the case.
    const c = await prisma.pwmCase.findFirst({ where: { id: String(b.caseId), employeeId: e!.id, handlers: { some: { userId: a.userId, recusedAt: null } } } });
    if (!c) fail(403, 'You are not named on that case.');
    caseData = { reference: c!.reference, hearingAt: c!.hearingAt, responseDue: c!.responseDue, outcome: c!.outcome, summary: c!.summary };
    if (!b.preview) await prisma.pwmCaseEvent.create({ data: { caseId: c!.id, kind: 'LETTER', text: `Letter generated: ${t!.name}`, byUserId: a.userId } });
  }
  const { text, empty } = renderTemplate(t!.body, mergeValues({ employee: e!, contract, case: caseData, companyName: cfg.companyName, today: lagosYmd(new Date()) }));
  if (b.preview) return apiResponse.success(res, 'Preview.', { text, empty });
  if (empty.length && !b.allowEmpty) return apiResponse.error(res, `These fields have no value for this person: ${empty.map((f) => `{{${f}}}`).join(', ')}. Fill them in on the record, or generate anyway.`, 409, empty);
  const format = oneOf(b.format ?? 'docx', ['docx', 'pdf', 'txt'] as const, 'Format');
  await pwmAudit(req, { action: 'DOCUMENT_GENERATED', entity: 'PwmEmployee', entityId: e!.id, meta: { template: t!.name, version: t!.version, format, contractId: contract?.id ?? null } });
  const fileBase = `${t!.slug}-${e!.employeeNo}`;
  if (format === 'txt') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.txt"`); return void res.send(text); }
  const buf = format === 'pdf' ? await toPdf(text) : await toDocx(text);
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.${format}"`);
  return void res.send(buf);
});
