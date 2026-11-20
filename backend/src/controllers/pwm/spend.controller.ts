// PWM Phase 4: expense claims and travel requests. Employees file in My HR; the supervisor approves; Finance pays.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig, nextNumber } from '../../services/pwm/settings';
import { supervisorUserId } from '../../services/pwm/attendance';
import { csvCell, HttpError } from './common';
import { can, dateOnly, daysBetween, fromYmd, fullName } from '../../services/pwm/rules';
import { employeeScope, hrAdminUserIds } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { access, fail, handle, nameMap, reqStr, str } from './common';

const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const RECEIPT_FROM = 5000;

export class SpendError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (status: number, message: string): never => { throw new SpendError(status, message); };

// ── Services used by both screens ────────────────────────────────────────────

export interface ItemInput { category: string; amount: number; date: string; description: string; receiptUrl?: string | null; exception?: string | null }

export const submitClaim = async (employeeId: string, byUserId: string, title: string, items: ItemInput[], travelRequestId?: string | null) => {
  const cfg = await getPwmConfig();
  if (!items.length) bad(400, 'Add at least one item.');
  if (items.length > 40) bad(400, 'A claim can have at most 40 items.');
  const today = dateOnly(new Date());
  for (const [i, it] of items.entries()) {
    const cat = cfg.expenseCategories.find((c) => c.key === it.category);
    if (!cat) bad(400, `Item ${i + 1}: choose a category.`);
    if (!(it.amount > 0 && it.amount <= 1e9)) bad(400, `Item ${i + 1}: the amount is not valid.`);
    if (it.date > today) bad(400, `Item ${i + 1}: the date is in the future.`);
    if (cat!.limit > 0 && it.amount > cat!.limit && !it.exception?.trim()) bad(400, `Item ${i + 1}: ₦${it.amount.toLocaleString('en-NG')} is above the ${cat!.label} limit of ₦${cat!.limit.toLocaleString('en-NG')}. Explain why in the exception box.`);
    if (it.amount >= RECEIPT_FROM && !it.receiptUrl) bad(400, `Item ${i + 1}: attach the receipt (needed from ₦${RECEIPT_FROM.toLocaleString('en-NG')}).`);
    if (it.receiptUrl && !/^https:\/\//i.test(it.receiptUrl)) bad(400, `Item ${i + 1}: upload the receipt first.`);
  }
  if (travelRequestId) {
    const t = await prisma.pwmTravelRequest.findFirst({ where: { id: travelRequestId, employeeId, status: { in: ['APPROVED', 'COMPLETED'] } } });
    if (!t) bad(409, 'That travel request is not approved.');
  }
  const year = new Date().getFullYear();
  const reference = `EXP-${year}-${String(await nextNumber(`expense:${year}`)).padStart(6, '0')}`;
  const approver = await supervisorUserId(employeeId);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const claim = await prisma.pwmExpenseClaim.create({
    data: { reference, employeeId, title, travelRequestId: travelRequestId ?? null, status: 'SUBMITTED', total, approverUserId: approver, submittedAt: new Date(), items: { create: items.map((i) => ({ category: i.category, amount: i.amount, date: fromYmd(i.date), description: i.description.slice(0, 300), receiptUrl: i.receiptUrl ?? null, exception: i.exception?.slice(0, 300) ?? null })) } },
  });
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
  await pwmAudit(null, { action: 'EXPENSE_SUBMITTED', entity: 'PwmEmployee', entityId: employeeId, meta: { reference, total }, userId: byUserId });
  await notifyPwm(approver ? [approver] : await hrAdminUserIds(), { title: `Expense claim to approve: ${e ? fullName(e) : ''}`, body: `${reference}, ₦${total.toLocaleString('en-NG')}: ${title}`, link: '/my-hr/approvals' });
  return claim;
};

export const decideClaim = async (id: string, actor: { userId: string; isHr: boolean }, approve: boolean, note: string | null) => {
  const c = await prisma.pwmExpenseClaim.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!c || c.status !== 'SUBMITTED') return bad(404, 'No claim waiting for approval.');
  if (c.employee.userId === actor.userId) bad(403, 'You cannot approve your own claim.');
  if (c.approverUserId !== actor.userId && !actor.isHr) bad(403, 'This is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why it is declined.');
  await prisma.pwmExpenseClaim.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note } });
  await pwmAudit(null, { action: approve ? 'EXPENSE_APPROVED' : 'EXPENSE_DECLINED', entity: 'PwmEmployee', entityId: c.employeeId, reason: note ?? undefined, meta: { reference: c.reference, total: num(c.total) }, userId: actor.userId });
  await notifyPwm([c.employee.userId], { title: `Expense claim ${approve ? 'approved' : 'declined'}: ${c.reference}`, body: approve ? 'Finance will reimburse you.' : note ?? '', link: '/my-hr/expenses' });
  return approve;
};

export const requestTravel = async (employeeId: string, byUserId: string, b: { purpose: string; destination: string; start: string; end: string; estimatedCost: number; advance: number }) => {
  const cfg = await getPwmConfig();
  if (b.end < b.start) bad(400, 'The return date is before the departure date.');
  if (b.start < dateOnly(new Date())) bad(400, 'Request travel before you go.');
  if (!(b.estimatedCost >= 0 && b.advance >= 0 && b.advance <= b.estimatedCost + 1)) bad(400, 'The advance cannot be more than the estimated cost.');
  const days = daysBetween(b.start, b.end) + 1;
  const approver = await supervisorUserId(employeeId);
  const t = await prisma.pwmTravelRequest.create({ data: { employeeId, purpose: b.purpose, destination: b.destination, startDate: fromYmd(b.start), endDate: fromYmd(b.end), estimatedCost: b.estimatedCost, advance: b.advance, perDiem: days * cfg.perDiemRate, approverUserId: approver } });
  const e = await prisma.pwmEmployee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
  await pwmAudit(null, { action: 'TRAVEL_REQUESTED', entity: 'PwmEmployee', entityId: employeeId, meta: { destination: b.destination, days }, userId: byUserId });
  await notifyPwm(approver ? [approver] : await hrAdminUserIds(), { title: `Travel request: ${e ? fullName(e) : ''}`, body: `${b.destination}, ${b.start} to ${b.end}. ${b.purpose}`, link: '/my-hr/approvals' });
  return t;
};

export const decideTravel = async (id: string, actor: { userId: string; isHr: boolean }, approve: boolean, note: string | null) => {
  const t = await prisma.pwmTravelRequest.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  if (!t || t.status !== 'PENDING') return bad(404, 'No travel request waiting.');
  if (t.employee.userId === actor.userId) bad(403, 'You cannot approve your own travel.');
  if (t.approverUserId !== actor.userId && !actor.isHr) bad(403, 'This is waiting for someone else.');
  if (!approve && !note) bad(400, 'Say why it is declined.');
  await prisma.pwmTravelRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date(), decisionNote: note } });
  await pwmAudit(null, { action: approve ? 'TRAVEL_APPROVED' : 'TRAVEL_DECLINED', entity: 'PwmEmployee', entityId: t.employeeId, reason: note ?? undefined, userId: actor.userId });
  await notifyPwm([t.employee.userId], { title: `Travel request ${approve ? 'approved' : 'declined'}: ${t.destination}`, body: approve ? `Per diem ₦${num(t.perDiem).toLocaleString('en-NG')}.${num(t.advance) ? ` Advance ₦${num(t.advance).toLocaleString('en-NG')} goes to Finance.` : ''}` : note ?? '', link: '/my-hr/expenses' });
};

// ── HR / Finance screens ─────────────────────────────────────────────────────

// GET /expenses?status=
export const listClaims = handle(async (req, res) => {
  const a = access(req);
  const status = str(req.query.status, 20);
  const rows = await prisma.pwmExpenseClaim.findMany({ where: { employee: employeeScope(a), ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 300, include: { employee: { select: { employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } }, items: true } });
  const names = await nameMap(rows.flatMap((r) => [r.approverUserId, r.decidedById, r.paidById]));
  return apiResponse.success(res, 'Claims.', rows.map((r) => ({ id: r.id, reference: r.reference, title: r.title, status: r.status, total: num(r.total), employee: { name: fullName(r.employee), employeeNo: r.employee.employeeNo, department: r.employee.department?.name ?? null }, submittedAt: r.submittedAt, decidedByName: r.decidedById ? names.get(r.decidedById) ?? null : null, paidByName: r.paidById ? names.get(r.paidById) ?? null : null, paidAt: r.paidAt, paymentRef: r.paymentRef, decisionNote: r.decisionNote, canDecide: r.status === 'SUBMITTED' && can(a, 'manageLeave'), canPay: r.status === 'APPROVED' && can(a, 'payExpenses') && r.decidedById !== a.userId, items: r.items.map((i) => ({ ...i, amount: num(i.amount) })) })));
});

export const decideClaimReq = handle(async (req, res) => {
  const a = access(req);
  try { const ok = await decideClaim(req.params.id, { userId: a.userId, isHr: can(a, 'manageLeave') }, req.body?.approve === true, str(req.body?.note, 300)); return apiResponse.success(res, ok ? 'Approved.' : 'Declined.', null); } catch (e) { if (e instanceof SpendError) throw new HttpError(e.status, e.message); throw e; }
});

// POST /expenses/:id/pay { paymentRef } : Finance, and never the person who approved it (segregation of duties)
export const payClaim = handle(async (req, res) => {
  const a = access(req);
  const c = await prisma.pwmExpenseClaim.findUnique({ where: { id: req.params.id }, include: { employee: { select: { userId: true } } } });
  if (!c || c.status !== 'APPROVED') fail(404, 'No approved claim found.');
  if (c!.employee.userId === a.userId) fail(403, 'You cannot pay your own claim.');
  if (c!.decidedById === a.userId) fail(403, 'You approved this claim, so someone else must pay it.');
  await prisma.pwmExpenseClaim.update({ where: { id: c!.id }, data: { status: 'PAID', paidById: a.userId, paidAt: new Date(), paymentRef: reqStr(req.body?.paymentRef, 'Payment reference', 80) } });
  if (c!.travelRequestId) await prisma.pwmTravelRequest.updateMany({ where: { id: c!.travelRequestId, status: 'APPROVED' }, data: { status: 'COMPLETED' } });
  await pwmAudit(req, { action: 'EXPENSE_PAID', entity: 'PwmEmployee', entityId: c!.employeeId, meta: { reference: c!.reference, total: num(c!.total) } });
  await notifyPwm([c!.employee.userId], { title: `Expense claim paid: ${c!.reference}`, body: `Reference ${str(req.body?.paymentRef, 80)}.`, link: '/my-hr/expenses' });
  return apiResponse.success(res, 'Marked as paid.', null);
});

// GET /expenses/export.csv : approved and paid lines for the accounting system
export const exportClaims = handle(async (req, res) => {
  const rows = await prisma.pwmExpenseClaim.findMany({ where: { status: { in: ['APPROVED', 'PAID'] } }, orderBy: { createdAt: 'desc' }, take: 5000, include: { employee: { select: { employeeNo: true, firstName: true, lastName: true, department: { select: { name: true } } } }, items: true } });
  const lines = [['Claim', 'Status', 'Employee ID', 'Employee', 'Department', 'Category', 'Date', 'Description', 'Amount (NGN)', 'Payment reference'].join(',')];
  for (const c of rows) for (const i of c.items) lines.push([c.reference, c.status, c.employee.employeeNo, fullName(c.employee), c.employee.department?.name, i.category, dateOnly(i.date), i.description, num(i.amount), c.paymentRef].map(csvCell).join(','));
  await pwmAudit(req, { action: 'EXPORT', entity: 'PwmExpenseClaim', entityId: 'export', meta: { claims: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="expense-claims.csv"');
  res.send(lines.join('\r\n'));
});

// GET /travel?status=
export const listTravel = handle(async (req, res) => {
  const a = access(req);
  const status = str(req.query.status, 20);
  const rows = await prisma.pwmTravelRequest.findMany({ where: { employee: employeeScope(a), ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 300, include: { employee: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } } });
  return apiResponse.success(res, 'Travel.', rows.map((t) => ({ ...t, estimatedCost: num(t.estimatedCost), advance: num(t.advance), perDiem: num(t.perDiem), employee: { name: fullName(t.employee), department: t.employee.department?.name ?? null }, canDecide: t.status === 'PENDING' && can(a, 'manageLeave') })));
});
export const decideTravelReq = handle(async (req, res) => {
  const a = access(req);
  try { await decideTravel(req.params.id, { userId: a.userId, isHr: can(a, 'manageLeave') }, req.body?.approve === true, str(req.body?.note, 300)); return apiResponse.success(res, 'Recorded.', null); } catch (e) { if (e instanceof SpendError) throw new HttpError(e.status, e.message); throw e; }
});

