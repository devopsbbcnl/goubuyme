import { Request, Response } from 'express';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { issueCredit } from '../../services/storeCredit.service';
import { notifyUser } from '../../services/notification.service';
import { emailLayout, sendEmail } from '../../services/email.service';
import { logCrmActivity } from '../../services/crm/activity.service';
import {
  CRM_ROLES, ProfileNotFoundError, findCrmSubject, getProfile, getTimeline, listProfiles,
} from '../../services/crm/profile.service';
import { CrmRole, LifecycleStage } from '../../services/crm/health.service';

const STAGES: LifecycleStage[] = ['NEW', 'ACTIVE', 'AT_RISK', 'CHURNED'];
const MAX_MANUAL_CREDIT = 100_000;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Runs a handler, turning a missing/non-CRM subject into a 404. */
const withSubject = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ProfileNotFoundError) return apiResponse.error(res, err.message, 404);
      throw err;
    }
  });

// GET /admin/crm/profiles
export const listCrmProfiles = catchAsync(async (req: Request, res: Response) => {
  const { role, search, tagId, stage, isActive, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

  if (role && !CRM_ROLES.includes(role as CrmRole)) return apiResponse.error(res, 'Invalid role.', 400);
  if (stage && !STAGES.includes(stage as LifecycleStage)) return apiResponse.error(res, 'Invalid stage.', 400);

  const { data, total } = await listProfiles({
    role: (role || undefined) as CrmRole | undefined,
    search: search?.trim() || undefined,
    tagId: tagId || undefined,
    stage: (stage || undefined) as LifecycleStage | undefined,
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    page: pageNum,
    limit: limitNum,
  });

  return apiResponse.paginated(res, 'Profiles fetched.', data, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/crm/profiles/:userId
export const getCrmProfile = withSubject(async (req, res) => {
  const profile = await getProfile(req.params.userId);
  return apiResponse.success(res, 'Profile fetched.', profile);
});

// GET /admin/crm/profiles/:userId/timeline
export const getCrmTimeline = withSubject(async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50')) || 50));
  const items = await getTimeline(req.params.userId, limit);
  return apiResponse.success(res, 'Timeline fetched.', items);
});

// POST /admin/crm/profiles/:userId/credit  { amount, reason }
export const issueCrmCredit = withSubject(async (req, res) => {
  const subject = await findCrmSubject(req.params.userId);
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason ?? '').trim();

  if (!Number.isFinite(amount) || amount <= 0) return apiResponse.error(res, 'Amount must be a positive number.', 400);
  if (amount > MAX_MANUAL_CREDIT) {
    return apiResponse.error(res, `Manual credit is capped at ₦${MAX_MANUAL_CREDIT.toLocaleString()}.`, 400);
  }
  if (reason.length < 3) return apiResponse.error(res, 'A reason is required.', 400);

  const rounded = Math.round(amount);
  await issueCredit(subject.id, rounded, `Admin credit: ${reason}`);
  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId, type: 'CREDIT_ISSUED',
    title: `Issued ₦${rounded.toLocaleString()} store credit`, meta: { amount: rounded, reason },
  });

  return apiResponse.success(res, 'Credit issued.', { amount: rounded });
});

// PATCH /admin/crm/profiles/:userId/status  { isActive, reason }
export const setCrmAccountStatus = withSubject(async (req, res) => {
  const subject = await findCrmSubject(req.params.userId);
  const isActive = req.body?.isActive;
  const reason = String(req.body?.reason ?? '').trim();

  if (typeof isActive !== 'boolean') return apiResponse.error(res, 'isActive must be true or false.', 400);
  if (!isActive && reason.length < 3) return apiResponse.error(res, 'A reason is required to suspend an account.', 400);
  if (subject.isActive === isActive) {
    return apiResponse.error(res, `Account is already ${isActive ? 'active' : 'suspended'}.`, 409);
  }

  // Clearing the refresh token ends the session once the short-lived access token expires.
  await prisma.user.update({
    where: { id: subject.id },
    data: isActive ? { isActive } : { isActive, refreshToken: null },
  });
  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId,
    type: isActive ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_SUSPENDED',
    title: isActive ? 'Account reactivated' : `Account suspended: ${reason}`,
    meta: { reason: reason || undefined },
  });

  return apiResponse.success(res, isActive ? 'Account reactivated.' : 'Account suspended.', { isActive });
});

// POST /admin/crm/profiles/:userId/message  { title, body, channels: ('push' | 'email')[] }
export const sendCrmMessage = withSubject(async (req, res) => {
  const subject = await findCrmSubject(req.params.userId);
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  const channels: unknown = req.body?.channels;

  if (!title || !body) return apiResponse.error(res, 'Title and message are required.', 400);
  if (title.length > 120 || body.length > 2000) return apiResponse.error(res, 'Message is too long.', 400);
  if (!Array.isArray(channels) || channels.length === 0 || channels.some(c => c !== 'push' && c !== 'email')) {
    return apiResponse.error(res, 'Choose at least one channel: push or email.', 400);
  }

  const sent: string[] = [];
  if (channels.includes('push')) {
    // notifyUser always stores an in-app notification, and pushes if the device is registered.
    await notifyUser(subject.id, { title, body, type: 'admin_message' });
    sent.push('in-app');
    if (subject.pushToken) sent.push('push');
  }
  if (channels.includes('email')) {
    const html = emailLayout(`
      <h2 style="margin:0 0 12px;font-size:20px;color:#1A1410;">${escapeHtml(title)}</h2>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#444;white-space:pre-wrap;">${escapeHtml(body)}</p>`);
    await sendEmail(subject.email, title, html);
    sent.push('email');
  }

  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId, type: 'MESSAGE_SENT',
    title: `Message sent: ${title}`, meta: { channels: sent, body },
  });

  return apiResponse.success(res, 'Message sent.', { channels: sent });
});
