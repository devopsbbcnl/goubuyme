// PWM Phase 2: My HR (the employee's own view) and the HR side of giving people access to it.
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { RequestHandler, Response } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { encryptSecret, decryptSecret } from '../../utils/crypto';
import { generateReferralCode } from '../../utils/generateToken';
import { generateTempPassword } from '../../services/branchAccess.service';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig } from '../../services/pwm/settings';
import { CURRENT_STATUSES, dateOnly, daysBetween, fullName, lagosYmd, normalisePhone, can } from '../../services/pwm/rules';
import { hrAdminUserIds, canSeeEmployee } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { MyHrRequest } from '../../middleware/myhr.middleware';
import { PwmRequest } from '../../middleware/pwm.middleware';
import { HttpError, access, email, fail, handle, oneOf, reqStr, str } from './common';

/** Wrap an async handler for the My HR routes so HttpError becomes a clean response. */
const my = (fn: (req: MyHrRequest, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req as MyHrRequest, res).catch((err) => {
    if (err instanceof HttpError) return apiResponse.error(res, err.message, err.status);
    next(err);
  });
};
const me = (req: MyHrRequest) => req.my!;

const openStatuses = ['PENDING', 'IN_PROGRESS'] as const;

// GET /my-hr/me
export const getMe = my(async (req, res) => {
  const m = me(req);
  const e = await prisma.pwmEmployee.findUnique({
    where: { id: m.employeeId },
    include: { department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true, jobTitle: true } } },
  });
  if (!e) fail(404, 'Record not found.');
  const emp = e!;
  const today = lagosYmd(new Date());
  const [contract, openTasks, policies, acked, announcements, user] = await Promise.all([
    prisma.pwmContract.findFirst({ where: { employeeId: emp.id, status: { in: ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED', 'SIGNED', 'ISSUED'] }, archivedAt: null }, orderBy: { commencementDate: 'desc' }, select: { id: true, reference: true, contractType: true, status: true, commencementDate: true, expiryDate: true, noticeValue: true, noticeUnit: true } }),
    prisma.pwmChecklistTask.count({ where: { assigneeUserId: m.userId, status: { in: [...openStatuses] }, checklist: { status: 'OPEN' } } }),
    prisma.pwmPolicy.findMany({ where: { status: 'PUBLISHED', requiresAck: true }, select: { id: true } }),
    prisma.pwmPolicyAck.findMany({ where: { employeeId: emp.id }, select: { policyId: true } }),
    visibleAnnouncements(emp.departmentId),
    prisma.user.findUnique({ where: { id: m.userId }, select: { name: true, role: true } }),
  ]);
  const ackedIds = new Set(acked.map((a) => a.policyId));
  const { bankName, bankAccountNo, bankAccountName, nin, tin, rsaPin, nhfNo, ...safe } = emp as typeof emp & Record<string, unknown>;
  void bankName; void bankAccountNo; void bankAccountName; void nin; void tin; void rsaPin; void nhfNo;
  const cfg = await getPwmConfig();
  return apiResponse.success(res, 'My HR.', {
    profile: { ...safe, fullName: fullName(emp), departmentName: emp.department?.name ?? null, manager: emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : null },
    contract: contract ? { ...contract, daysRemaining: contract.expiryDate ? daysBetween(today, dateOnly(contract.expiryDate)) : null } : null,
    openTasks, policiesToAcknowledge: policies.filter((p) => !ackedIds.has(p.id)).length, announcements: announcements.slice(0, 5),
    directoryVisible: cfg.directoryVisible, userRole: user?.role,
  });
});

const visibleAnnouncements = async (departmentId: string | null) => {
  const now = new Date();
  const rows = await prisma.pwmAnnouncement.findMany({ where: { archivedAt: null, publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }], take: 50 });
  return rows.filter((r) => { const d = r.departmentIds as string[] | null; return !d?.length || (!!departmentId && d.includes(departmentId)); }).map((r) => ({ id: r.id, title: r.title, body: r.body, pinned: r.pinned, publishAt: r.publishAt }));
};

// GET /my-hr/announcements
export const announcements = my(async (req, res) => apiResponse.success(res, 'Announcements.', await visibleAnnouncements(me(req).departmentId)));

// PATCH /my-hr/profile : contact details the employee may keep up to date themselves
export const updateProfile = my(async (req, res) => {
  const b = req.body ?? {};
  const data: Prisma.PwmEmployeeUpdateInput = {};
  if (b.phone !== undefined) { const raw = str(b.phone, 40); if (raw) { const p = normalisePhone(raw); if (!p) fail(400, 'Phone number is not valid. Use 0803... or +234...'); data.phone = p; } else data.phone = null; }
  if (b.personalEmail !== undefined) data.personalEmail = email(b.personalEmail, 'Personal email');
  if (b.address !== undefined) data.address = str(b.address, 400);
  if (b.knownAs !== undefined) data.knownAs = str(b.knownAs, 80);
  if (b.photoUrl !== undefined) { const u = str(b.photoUrl, 1000); if (u && !/^https:\/\//i.test(u)) fail(400, 'Photo must be uploaded first.'); data.photoUrl = u; }
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map((x) => ({ name: String((x as Record<string, unknown>).name ?? '').slice(0, 120), relationship: String((x as Record<string, unknown>).relationship ?? '').slice(0, 60), phone: String((x as Record<string, unknown>).phone ?? '').slice(0, 30), address: String((x as Record<string, unknown>).address ?? '').slice(0, 300) })).filter((x) => x.name) : []);
  if (b.emergencyContacts !== undefined) data.emergencyContacts = list(b.emergencyContacts, 5);
  if (b.nextOfKin !== undefined) data.nextOfKin = list(b.nextOfKin, 3);
  await prisma.pwmEmployee.update({ where: { id: me(req).employeeId }, data: { ...data, version: { increment: 1 } } });
  await pwmAudit(req as unknown as PwmRequest, { action: 'EMPLOYEE_SELF_UPDATED', entity: 'PwmEmployee', entityId: me(req).employeeId, meta: { fields: Object.keys(data) } });
  return apiResponse.success(res, 'Saved.', null);
});

// POST /my-hr/bank-change { bankName, bankAccountNo, bankAccountName }: HR verifies before it takes effect
export const requestBankChange = my(async (req, res) => {
  const b = req.body ?? {};
  const payload = { bankName: reqStr(b.bankName, 'Bank', 80), bankAccountNo: reqStr(b.bankAccountNo, 'Account number', 20), bankAccountName: reqStr(b.bankAccountName, 'Account name', 120) };
  if (!/^\d{10}$/.test(payload.bankAccountNo)) fail(400, 'A Nigerian bank account number has 10 digits.');
  if (await prisma.pwmChangeRequest.findFirst({ where: { employeeId: me(req).employeeId, kind: 'BANK', status: 'PENDING' } })) fail(409, 'You already have a bank change waiting for HR to verify.');
  const row = await prisma.pwmChangeRequest.create({ data: { employeeId: me(req).employeeId, kind: 'BANK', payloadEnc: encryptSecret(JSON.stringify(payload)) } });
  await pwmAudit(req as unknown as PwmRequest, { action: 'BANK_CHANGE_REQUESTED', entity: 'PwmEmployee', entityId: me(req).employeeId, meta: { requestId: row.id } });
  const e = await prisma.pwmEmployee.findUnique({ where: { id: me(req).employeeId }, select: { firstName: true, lastName: true, employeeNo: true } });
  await notifyPwm(await hrAdminUserIds(), { title: `Bank details change to verify: ${e ? fullName(e) : ''} (${e?.employeeNo ?? ''})`, body: 'Confirm with the employee through a known channel before approving.', link: '/pwm/approvals' });
  return apiResponse.success(res, 'Sent to HR. Your current details stay in place until HR has verified the change.', null, 201);
});

// GET /my-hr/contracts : terms only, never pay
export const myContracts = my(async (req, res) => {
  const today = lagosYmd(new Date());
  const rows = await prisma.pwmContract.findMany({ where: { employeeId: me(req).employeeId, status: { notIn: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'] } }, orderBy: { commencementDate: 'asc' }, include: { documents: { where: { archivedAt: null, restricted: false }, orderBy: { version: 'desc' }, take: 1 }, amendments: true } });
  return apiResponse.success(res, 'Contracts.', rows.map((c) => ({ id: c.id, reference: c.reference, contractType: c.contractType, status: c.status, commencementDate: c.commencementDate, expiryDate: c.expiryDate, signedDate: c.signedDate, daysRemaining: c.expiryDate && ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'].includes(c.status) ? daysBetween(today, dateOnly(c.expiryDate)) : null, noticeValue: c.noticeValue, noticeUnit: c.noticeUnit, amendments: c.amendments.length, documentUrl: c.documents[0]?.url ?? null })));
});

// GET /my-hr/documents
export const myDocuments = my(async (req, res) => {
  const rows = await prisma.pwmDocument.findMany({ where: { employeeId: me(req).employeeId, archivedAt: null, contractId: null }, orderBy: { createdAt: 'desc' } });
  return apiResponse.success(res, 'Documents.', rows.filter((d) => !['Medical', 'Disciplinary'].includes(d.category)));
});

// POST /my-hr/documents { name, category, url, checksum, expiryDate, issuer, number }
export const addMyDocument = my(async (req, res) => {
  const b = req.body ?? {};
  const url = reqStr(b.url, 'File', 1000);
  if (!/^https:\/\/\S+$/i.test(url)) fail(400, 'Upload the file first.');
  const category = oneOf(b.category ?? 'Other', ['Identification', 'Qualification', 'Certification', 'Guarantor', 'Other'] as const, 'Category');
  const exp = str(b.expiryDate, 10);
  if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) fail(400, 'Expiry date is not valid.');
  const name = reqStr(b.name, 'Name', 200);
  const prev = await prisma.pwmDocument.findFirst({ where: { employeeId: me(req).employeeId, category, name, contractId: null }, orderBy: { version: 'desc' }, select: { version: true } });
  const d = await prisma.pwmDocument.create({ data: { employeeId: me(req).employeeId, kind: category === 'Certification' ? 'CERTIFICATION' : 'DOCUMENT', category, name, issuer: str(b.issuer, 160), number: str(b.number, 80), expiryDate: exp ? new Date(`${exp}T00:00:00Z`) : null, url, checksum: str(b.checksum, 100), restricted: ['Identification', 'Guarantor'].includes(category), version: (prev?.version ?? 0) + 1, uploadedById: me(req).userId } });
  await pwmAudit(req as unknown as PwmRequest, { action: 'DOCUMENT_SUBMITTED_BY_EMPLOYEE', entity: 'PwmEmployee', entityId: me(req).employeeId, after: { name, category } });
  return apiResponse.success(res, 'Uploaded. HR can now see it.', d, 201);
});

// GET /my-hr/tasks : checklist tasks assigned to me
export const myTasks = my(async (req, res) => {
  const rows = await prisma.pwmChecklistTask.findMany({
    where: { assigneeUserId: me(req).userId, checklist: { status: 'OPEN' } }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    include: { checklist: { select: { kind: true, employee: { select: { firstName: true, lastName: true, employeeNo: true } } } } },
  });
  return apiResponse.success(res, 'Tasks.', rows.map((t) => ({ id: t.id, title: t.title, stage: t.stage, status: t.status, dueDate: t.dueDate, kind: t.checklist.kind, about: `${t.checklist.employee.firstName} ${t.checklist.employee.lastName}` })));
});

// PATCH /my-hr/tasks/:id { status }
export const updateMyTask = my(async (req, res) => {
  const t = await prisma.pwmChecklistTask.findUnique({ where: { id: req.params.id }, include: { checklist: { select: { status: true, employeeId: true } } } });
  if (!t || t.assigneeUserId !== me(req).userId) fail(404, 'Task not found.');
  if (t!.checklist.status !== 'OPEN') fail(409, 'This checklist is closed.');
  const status = oneOf(req.body?.status, ['PENDING', 'IN_PROGRESS', 'DONE'] as const, 'Status');
  await prisma.pwmChecklistTask.update({ where: { id: t!.id }, data: { status, completedAt: status === 'DONE' ? new Date() : null, completedById: status === 'DONE' ? me(req).userId : null } });
  await pwmAudit(req as unknown as PwmRequest, { action: 'CHECKLIST_TASK_UPDATED', entity: 'PwmEmployee', entityId: t!.checklist.employeeId, after: { task: t!.title, status }, meta: { by: 'assignee' } });
  return apiResponse.success(res, 'Saved.', null);
});

// GET /my-hr/policies
export const myPolicies = my(async (req, res) => {
  const [rows, acks] = await Promise.all([prisma.pwmPolicy.findMany({ where: { status: 'PUBLISHED' }, orderBy: { title: 'asc' } }), prisma.pwmPolicyAck.findMany({ where: { employeeId: me(req).employeeId } })]);
  const by = new Map(acks.map((a) => [a.policyId, a.ackedAt]));
  return apiResponse.success(res, 'Policies.', rows.map((p) => ({ id: p.id, title: p.title, category: p.category, version: p.version, body: p.body, fileUrl: p.fileUrl, requiresAck: p.requiresAck, effectiveDate: p.effectiveDate, acknowledgedAt: by.get(p.id) ?? null })));
});

// POST /my-hr/policies/:id/ack : version, time and IP are kept (ONB-05)
export const ackPolicy = my(async (req, res) => {
  const p = await prisma.pwmPolicy.findFirst({ where: { id: req.params.id, status: 'PUBLISHED' } });
  if (!p) fail(404, 'Policy not found or no longer current.');
  await prisma.pwmPolicyAck.upsert({ where: { policyId_employeeId: { policyId: p!.id, employeeId: me(req).employeeId } }, create: { policyId: p!.id, employeeId: me(req).employeeId, ip: req.ip ?? null }, update: {} });
  await pwmAudit(req as unknown as PwmRequest, { action: 'POLICY_ACKNOWLEDGED', entity: 'PwmPolicy', entityId: p!.id, meta: { version: p!.version, employeeId: me(req).employeeId } });
  return apiResponse.success(res, 'Thank you. Your acknowledgement is recorded.', null);
});

// GET /my-hr/directory?q=  and  /my-hr/org-chart : name, title and department only (decision D10)
export const directory = my(async (req, res) => {
  const cfg = await getPwmConfig();
  if (!cfg.directoryVisible) fail(403, 'The staff directory is switched off.');
  const q = String(req.query.q ?? '').trim();
  const rows = await prisma.pwmEmployee.findMany({
    where: { status: { in: [...CURRENT_STATUSES] }, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { jobTitle: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true, managerId: true, department: { select: { name: true } } }, orderBy: { lastName: 'asc' }, take: 300,
  });
  return apiResponse.success(res, 'Directory.', rows);
});

// ── HR side ──────────────────────────────────────────────────────────────────

// POST /employees/:id/my-hr-access : link or create a login so this person can use My HR
export const provisionAccess = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  const emp = e!;
  if (['RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(emp.status)) fail(409, 'This person has left.');
  const address = (emp.workEmail ?? emp.personalEmail ?? '').toLowerCase();
  if (!address) fail(400, 'Add a work or personal email to the record first.');

  if (emp.userId) {
    const u = await prisma.user.findUnique({ where: { id: emp.userId }, select: { id: true, isActive: true, role: true } });
    if (u && !u.isActive && u.role === 'STAFF') await prisma.user.update({ where: { id: u.id }, data: { isActive: true } });
    await pwmAudit(req, { action: 'MY_HR_ACCESS_RESTORED', entity: 'PwmEmployee', entityId: emp.id });
    return apiResponse.success(res, 'This person already has a login linked. Access is active.', { email: address, tempPassword: null });
  }
  const existing = await prisma.user.findUnique({ where: { email: address }, select: { id: true, role: true, isActive: true } });
  if (existing) {
    if (!['STAFF', 'SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'].includes(existing.role)) fail(409, 'That email already belongs to a customer, vendor or rider account. Use a different work email for the staff login.');
    if (await prisma.pwmEmployee.findFirst({ where: { userId: existing.id } })) fail(409, 'That login is already linked to another employee.');
    await prisma.pwmEmployee.update({ where: { id: emp.id }, data: { userId: existing.id } });
    await pwmAudit(req, { action: 'MY_HR_LOGIN_LINKED', entity: 'PwmEmployee', entityId: emp.id, meta: { userId: existing.id } });
    return apiResponse.success(res, 'Linked to their existing admin login.', { email: address, tempPassword: null });
  }
  const temp = generateTempPassword();
  const user = await prisma.user.create({ data: { name: fullName(emp), email: address, password: await bcrypt.hash(temp, 12), role: 'STAFF', isEmailVerified: true, referralCode: generateReferralCode() }, select: { id: true } });
  await prisma.pwmEmployee.update({ where: { id: emp.id }, data: { userId: user.id } });
  await pwmAudit(req, { action: 'MY_HR_ACCESS_GRANTED', entity: 'PwmEmployee', entityId: emp.id, meta: { userId: user.id } });
  return apiResponse.success(res, 'Login created. Hand over these details privately; they are shown once.', { email: address, tempPassword: temp }, 201);
});

// POST /employees/:id/my-hr-access/revoke
export const revokeAccess = handle(async (req, res) => {
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } });
  if (!e?.userId) fail(404, 'No login is linked.');
  const u = await prisma.user.findUnique({ where: { id: e!.userId as string }, select: { id: true, role: true } });
  if (u?.role === 'STAFF') await prisma.user.update({ where: { id: u.id }, data: { isActive: false, refreshToken: null } });
  await pwmAudit(req, { action: 'MY_HR_ACCESS_REVOKED', entity: 'PwmEmployee', entityId: e!.id, reason: str(req.body?.reason, 300) ?? undefined });
  return apiResponse.success(res, u?.role === 'STAFF' ? 'My HR access switched off.' : 'This is an admin login, so only the link to the employee was considered; it keeps its admin access.', null);
});

// GET /change-requests
export const listChangeRequests = handle(async (req, res) => {
  if (!can(access(req), 'viewRestricted')) fail(403, 'Forbidden. Insufficient permissions.');
  const rows = await prisma.pwmChangeRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
  const emps = new Map((await prisma.pwmEmployee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, employeeNo: true, firstName: true, lastName: true, bankName: true } })).map((e) => [e.id, e]));
  return apiResponse.success(res, 'Requests.', rows.map((r) => {
    let requested: { bankName?: string; bankAccountNo?: string } = {};
    try { requested = JSON.parse(decryptSecret(r.payloadEnc)); } catch { /* unreadable payload shows as empty */ }
    const acct = requested.bankAccountNo ?? '';
    return { id: r.id, kind: r.kind, createdAt: r.createdAt, employee: emps.get(r.employeeId) ?? null, requested: { bankName: requested.bankName, accountEnding: acct.slice(-4) } };
  }));
});

// POST /change-requests/:id/decide { approve, note }: HR confirms with the employee through a known channel first
export const decideChangeRequest = handle(async (req, res) => {
  const a = access(req);
  if (!(a.level === 'SUPER' || a.level === 'HR_ADMIN')) fail(403, 'Forbidden. Insufficient permissions.');
  const r = await prisma.pwmChangeRequest.findUnique({ where: { id: req.params.id } });
  if (!r || r.status !== 'PENDING') fail(404, 'No pending request found.');
  const approve = req.body?.approve === true; const note = str(req.body?.note, 500);
  if (approve && !note) fail(400, 'Record how you verified this change (for example "confirmed by phone").');
  if (!approve && !note) fail(400, 'Say why the change is declined.');
  if (approve) {
    const p = JSON.parse(decryptSecret(r!.payloadEnc)) as { bankName: string; bankAccountNo: string; bankAccountName: string };
    await prisma.pwmEmployee.update({ where: { id: r!.employeeId }, data: { bankName: p.bankName, bankAccountNo: encryptSecret(p.bankAccountNo), bankAccountName: p.bankAccountName, version: { increment: 1 } } });
  }
  await prisma.pwmChangeRequest.update({ where: { id: r!.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedById: a.userId, reviewedAt: new Date(), note } });
  await pwmAudit(req, { action: approve ? 'BANK_CHANGE_APPROVED' : 'BANK_CHANGE_DECLINED', entity: 'PwmEmployee', entityId: r!.employeeId, reason: note ?? undefined, meta: { requestId: r!.id } });
  const emp = await prisma.pwmEmployee.findUnique({ where: { id: r!.employeeId }, select: { userId: true } });
  await notifyPwm([emp?.userId], { title: `Bank details change ${approve ? 'approved' : 'declined'}`, body: note ?? '', link: '/my-hr/profile' });
  return apiResponse.success(res, approve ? 'Approved and applied.' : 'Declined.', null);
});

