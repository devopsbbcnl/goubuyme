// PWM Phase 2: the pre-boarding portal. HR issues an expiring link; the new hire proves who they are with a
// one-time code emailed to their personal address, then submits their details and documents before day one.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { encryptSecret } from '../../utils/crypto';
import { pwmAudit } from '../../services/pwm/audit';
import { getPwmConfig } from '../../services/pwm/settings';
import { fromYmd, fullName, isNin, normalisePhone } from '../../services/pwm/rules';
import { canSeeEmployee, hrAdminUserIds } from '../../services/pwm/people';
import { notifyPwm } from '../../services/pwm/notify';
import { sendPwmReminderEmail } from '../../services/email.service';
import { access, email, fail, handle, reqStr, str, HttpError } from './common';

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const SECRET = () => `${process.env.JWT_ACCESS_SECRET}:pwm-preboarding`;
const OTP_MINUTES = 10;
const MAX_ATTEMPTS = 5;

// ── HR side ──────────────────────────────────────────────────────────────────

// POST /employees/:id/preboarding : issue (or reissue) the link
export const issueLink = handle(async (req, res) => {
  const a = access(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: req.params.id } });
  if (!e || !canSeeEmployee(a, e)) fail(404, 'Employee not found.');
  if (e!.status !== 'PENDING_ONBOARDING') fail(409, 'Pre-boarding is for people who have not started yet.');
  if (!e!.personalEmail) fail(400, 'Add the new hire\'s personal email first. The one-time code is sent there.');
  const cfg = await getPwmConfig();
  await prisma.pwmPreboarding.updateMany({ where: { employeeId: e!.id, revokedAt: null, submittedAt: null }, data: { revokedAt: new Date() } });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + cfg.preboardingDays * 86_400_000);
  await prisma.pwmPreboarding.create({ data: { employeeId: e!.id, tokenHash: sha(token), expiresAt, createdById: a.userId } });
  const base = (process.env.ADMIN_URL ?? '').split(',')[0].trim().replace(/\/$/, '');
  const link = `${base}/preboarding/${token}`;
  await sendPwmReminderEmail(e!.personalEmail as string, e!.firstName, `Welcome to ${cfg.companyName}: complete your details before day one`, `Open the secure link below, confirm it is you with the code we email you, then add your details and documents. The link works until ${expiresAt.toLocaleDateString('en-GB')}.`, undefined).catch(() => false);
  await pwmAudit(req, { action: 'PREBOARDING_LINK_ISSUED', entity: 'PwmEmployee', entityId: e!.id, meta: { expiresAt: expiresAt.toISOString() } });
  // The link is also handed back so HR can send it themselves if email is slow.
  return apiResponse.success(res, 'Link created. The new hire needs it plus the code sent to their personal email.', { link, expiresAt }, 201);
});

// ── Public side ──────────────────────────────────────────────────────────────

const loadLink = async (token: string) => {
  const row = await prisma.pwmPreboarding.findUnique({ where: { tokenHash: sha(token) } });
  if (!row || row.revokedAt || row.submittedAt || row.expiresAt < new Date()) throw new HttpError(410, 'This link has expired or was replaced. Ask HR to send you a new one.');
  return row;
};

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) =>
  fn(req, res).catch((err) => {
    if (err instanceof HttpError) return apiResponse.error(res, err.message, err.status);
    return apiResponse.error(res, 'Something went wrong. Please try again.', 500);
  });

const maskEmail = (m: string) => m.replace(/^(.).*(@.*)$/, '$1***$2');

// POST /pwm-public/preboarding/start { token } : emails a one-time code
export const start = wrap(async (req, res) => {
  const link = await loadLink(reqStr(req.body?.token, 'Link', 200));
  const e = await prisma.pwmEmployee.findUnique({ where: { id: link.employeeId }, select: { firstName: true, personalEmail: true } });
  if (!e?.personalEmail) throw new HttpError(409, 'No email is on record for this link. Contact HR.');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.pwmPreboarding.update({ where: { id: link.id }, data: { otpHash: sha(`${link.id}:${code}`), otpExpires: new Date(Date.now() + OTP_MINUTES * 60_000), otpAttempts: 0 } });
  await sendPwmReminderEmail(e.personalEmail, e.firstName, 'Your one-time code', `Your code is ${code}. It works for ${OTP_MINUTES} minutes. If you did not ask for it, ignore this message.`, undefined);
  return apiResponse.success(res, `We sent a 6-digit code to ${maskEmail(e.personalEmail)}.`, { firstName: e.firstName });
});

// POST /pwm-public/preboarding/verify { token, code } -> short-lived session
export const verify = wrap(async (req, res) => {
  const link = await loadLink(reqStr(req.body?.token, 'Link', 200));
  const code = String(req.body?.code ?? '').trim();
  if (!link.otpHash || !link.otpExpires || link.otpExpires < new Date()) fail(400, 'That code has expired. Ask for a new one.');
  if (link.otpAttempts >= MAX_ATTEMPTS) fail(429, 'Too many wrong codes. Ask for a new one.');
  if (sha(`${link.id}:${code}`) !== link.otpHash) {
    await prisma.pwmPreboarding.update({ where: { id: link.id }, data: { otpAttempts: { increment: 1 } } });
    fail(400, 'That code is not right.');
  }
  await prisma.pwmPreboarding.update({ where: { id: link.id }, data: { otpHash: null, verifiedAt: new Date() } });
  const session = jwt.sign({ pre: link.id }, SECRET(), { expiresIn: '45m' });
  return apiResponse.success(res, 'Verified.', { session });
});

const session = async (req: Request) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'Please confirm the code first.');
  let id: string;
  try { id = (jwt.verify(h.slice(7), SECRET()) as { pre: string }).pre; } catch { throw new HttpError(401, 'Your session ended. Please confirm the code again.'); }
  const link = await prisma.pwmPreboarding.findUnique({ where: { id } });
  if (!link || link.revokedAt || link.submittedAt || link.expiresAt < new Date() || !link.verifiedAt) throw new HttpError(410, 'This link is no longer active.');
  return link;
};

// GET /pwm-public/preboarding/form : what is already on file (nothing sensitive)
export const getForm = wrap(async (req, res) => {
  const link = await session(req);
  const e = await prisma.pwmEmployee.findUnique({ where: { id: link.employeeId }, select: { firstName: true, lastName: true, jobTitle: true, hireDate: true, phone: true, address: true, dateOfBirth: true, emergencyContacts: true, department: { select: { name: true } } } });
  const cfg = await getPwmConfig();
  return apiResponse.success(res, 'Form.', { ...e, companyName: cfg.companyName });
});

// POST /pwm-public/preboarding/submit
export const submit = wrap(async (req, res) => {
  const link = await session(req);
  const b = req.body ?? {};
  if (b.consent !== true) fail(400, 'Please confirm that the details are correct and that HR may keep them.');
  const data: Prisma.PwmEmployeeUpdateInput = {};
  if (b.phone !== undefined && str(b.phone, 40)) { const p = normalisePhone(String(b.phone)); if (!p) fail(400, 'Phone number is not valid.'); data.phone = p; }
  if (b.address !== undefined) data.address = str(b.address, 400);
  if (b.dateOfBirth) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.dateOfBirth))) fail(400, 'Date of birth is not valid.'); data.dateOfBirth = fromYmd(String(b.dateOfBirth)); }
  if (b.personalEmail) data.personalEmail = email(b.personalEmail, 'Personal email');
  const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map((x) => ({ name: String((x as Record<string, unknown>).name ?? '').slice(0, 120), relationship: String((x as Record<string, unknown>).relationship ?? '').slice(0, 60), phone: String((x as Record<string, unknown>).phone ?? '').slice(0, 30), address: String((x as Record<string, unknown>).address ?? '').slice(0, 300), occupation: String((x as Record<string, unknown>).occupation ?? '').slice(0, 80) })).filter((x) => x.name) : undefined);
  const ec = list(b.emergencyContacts, 5); if (ec) data.emergencyContacts = ec;
  const nok = list(b.nextOfKin, 3); if (nok) data.nextOfKin = nok;
  const gu = list(b.guarantors, 4); if (gu) data.guarantors = gu;
  for (const k of ['nin', 'tin', 'rsaPin', 'nhfNo', 'bankAccountNo'] as const) {
    const v = str(b[k], 40);
    if (!v) continue;
    if (k === 'nin' && !isNin(v)) fail(400, 'NIN must be 11 digits.');
    if (k === 'bankAccountNo' && !/^\d{10}$/.test(v)) fail(400, 'A Nigerian bank account number has 10 digits.');
    (data as Record<string, unknown>)[k] = encryptSecret(v);
  }
  for (const k of ['pfaName', 'bankName', 'bankAccountName'] as const) if (str(b[k], 120)) (data as Record<string, unknown>)[k] = str(b[k], 120);

  const docs = (Array.isArray(b.documents) ? b.documents : []).slice(0, 12) as { name?: string; category?: string; url?: string; checksum?: string }[];
  for (const d of docs) if (!d.url || !/^https:\/\/res\.cloudinary\.com\//i.test(d.url) || !d.name) fail(400, 'Each document needs a name and must come from the upload box.');

  const emp = await prisma.pwmEmployee.update({ where: { id: link.employeeId }, data: { ...data, version: { increment: 1 } }, select: { id: true, firstName: true, lastName: true, employeeNo: true, hrOfficerUserId: true } });
  for (const d of docs) {
    const category = ['Identification', 'Qualification', 'Certification', 'Guarantor', 'Offer/Appointment', 'Other'].includes(d.category ?? '') ? (d.category as string) : 'Other';
    await prisma.pwmDocument.create({ data: { employeeId: emp.id, kind: category === 'Certification' ? 'CERTIFICATION' : 'DOCUMENT', category, name: String(d.name).slice(0, 200), url: d.url as string, checksum: str(d.checksum, 100), restricted: ['Identification', 'Guarantor'].includes(category) } });
  }
  await prisma.pwmPreboarding.update({ where: { id: link.id }, data: { submittedAt: new Date() } });
  // Tick off the matching onboarding task so HR sees it is done.
  await prisma.pwmChecklistTask.updateMany({ where: { checklist: { employeeId: emp.id, kind: 'ONBOARDING', status: 'OPEN' }, title: { startsWith: 'Collect personal details' }, status: { in: ['PENDING', 'IN_PROGRESS'] } }, data: { status: 'DONE', completedAt: new Date(), note: 'Submitted by the new hire through pre-boarding.' } });
  await pwmAudit(null, { action: 'PREBOARDING_SUBMITTED', entity: 'PwmEmployee', entityId: emp.id, meta: { documents: docs.length, sensitiveFieldsProvided: ['nin', 'tin', 'rsaPin', 'nhfNo', 'bankAccountNo'].filter((k) => b[k]) }, userId: null });
  await notifyPwm([emp.hrOfficerUserId, ...(emp.hrOfficerUserId ? [] : await hrAdminUserIds())], { title: `Pre-boarding submitted: ${fullName(emp)} (${emp.employeeNo})`, body: 'Review the details and documents before day one.', link: `/pwm/employees/${emp.id}` });
  return apiResponse.success(res, 'Thank you. Your details have been sent to HR.', null, 201);
});
