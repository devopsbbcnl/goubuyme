// SMOIS: identity, team, accounts, assignments, categories, settings, in-app notifications.
import bcrypt from 'bcryptjs';
import { Prisma, SmoisAssignmentKind, SmoisConnectionStatus, SmoisPlatform, SmoisRole } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { generateReferralCode } from '../../utils/generateToken';
import { generateTempPassword, isStrongPassword } from '../../services/branchAccess.service';
import { smoisAudit } from '../../services/smois/audit';
import { can, roleDefaults } from '../../services/smois/workflow';
import {
  access, date, fail, getSettings, handle, httpUrl, isAssignedToAccount, nameMap, notifyMany,
  oneOf, reqStr, str,
} from './common';

const ROLES: readonly SmoisRole[] = ['MANAGEMENT', 'MANAGER', 'REVIEWER', 'VIEWER'];
const PLATFORMS: readonly SmoisPlatform[] = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER'];
const KINDS: readonly SmoisAssignmentKind[] = ['PRIMARY', 'SECONDARY', 'TEMPORARY'];

// ── Identity ─────────────────────────────────────────────────────────────────

// GET /me
export const getMe = handle(async (req, res) => {
  const a = access(req);
  const [user, unread, member, pref] = await Promise.all([
    prisma.user.findUnique({ where: { id: a.userId }, select: { id: true, name: true, email: true, role: true } }),
    prisma.notification.count({ where: { userId: a.userId, type: 'smois', isRead: false } }),
    a.memberId ? prisma.smoisMember.findUnique({ where: { id: a.memberId }, select: { jobTitle: true } }) : null,
    prisma.smoisPreference.findUnique({ where: { userId: a.userId }, select: { emailAlerts: true } }),
  ]);
  const caps = Object.fromEntries(
    (['createContent', 'approve', 'publish', 'manageTasks', 'completeTasks', 'manageAccounts', 'manageTeam', 'configure', 'viewAll', 'viewActivity', 'viewAnalytics', 'recordMetrics', 'correctMetrics', 'manageTargets', 'viewPerformance', 'reviewReports', 'handleInbox', 'manageCampaigns', 'viewCampaigns', 'manageListening'] as const)
      .map((c) => [c, can(a, c)]),
  );
  return apiResponse.success(res, 'SMOIS access.', {
    user, level: a.level, memberId: a.memberId, jobTitle: member?.jobTitle ?? null,
    canEmergencyPublish: a.level === 'SUPER' || a.canEmergencyPublish, unreadNotifications: unread, emailAlerts: pref?.emailAlerts ?? true, can: caps,
  });
});

// PATCH /me/preferences { emailAlerts }
export const updatePreferences = handle(async (req, res) => {
  const userId = access(req).userId;
  if (typeof req.body?.emailAlerts !== 'boolean') fail(400, 'emailAlerts must be true or false.');
  const p = await prisma.smoisPreference.upsert({ where: { userId }, create: { userId, emailAlerts: req.body.emailAlerts }, update: { emailAlerts: req.body.emailAlerts }, select: { emailAlerts: true } });
  return apiResponse.success(res, 'Preferences saved.', p);
});

// GET /people: the minimum every member needs to pick colleagues (assignees, reviewers).
export const listPeople = handle(async (_req, res) => {
  const [members, supers] = await Promise.all([
    prisma.smoisMember.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, role: true, canApprove: true, canPublish: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, name: true } }),
  ]);
  return apiResponse.success(res, 'People.', [
    ...supers.map((s) => ({ memberId: null, userId: s.id, name: s.name, role: 'SUPER', canApprove: true, canPublish: true })),
    ...members.map((m) => ({ memberId: m.id, userId: m.userId, name: m.user.name, role: m.role, canApprove: m.canApprove, canPublish: m.canPublish })),
  ]);
});

// ── Team ─────────────────────────────────────────────────────────────────────

const memberSelect = {
  id: true, userId: true, role: true, isActive: true, jobTitle: true, responsibilities: true, supervisorId: true,
  assignedToDeptAt: true, canApprove: true, canPublish: true, canEmergencyPublish: true, canConnectAccounts: true,
  revokedAt: true, createdAt: true,
  user: { select: { name: true, email: true, role: true, isActive: true } },
} satisfies Prisma.SmoisMemberSelect;

// GET /members (management sees the team; super admin manages it)
export const listMembers = handle(async (req, res) => {
  if (!can(access(req), 'viewAll')) fail(403, 'Forbidden. Insufficient permissions.');
  const now = new Date();
  const members = await prisma.smoisMember.findMany({
    select: {
      ...memberSelect,
      assignments: { where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true, kind: true, account: { select: { id: true, name: true, platform: true } } } },
    },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  return apiResponse.success(res, 'Team members.', members);
});

const parseFlags = (body: Record<string, unknown>, base: ReturnType<typeof roleDefaults>) => ({
  canApprove: 'canApprove' in body ? !!body.canApprove : base.canApprove,
  canPublish: 'canPublish' in body ? !!body.canPublish : base.canPublish,
  canEmergencyPublish: 'canEmergencyPublish' in body ? !!body.canEmergencyPublish : base.canEmergencyPublish,
  canConnectAccounts: 'canConnectAccounts' in body ? !!body.canConnectAccounts : base.canConnectAccounts,
});

// POST /members { userId } | { name, email, password? }, role, jobTitle?, flags?
export const createMember = handle(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const role = oneOf(body.role, ROLES, 'Role');
  const flags = parseFlags(body, roleDefaults(role));
  let tempPassword: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    let userId: string;
    if (body.userId) {
      const u = await tx.user.findUnique({ where: { id: String(body.userId) }, select: { id: true, role: true, isActive: true } });
      if (!u) return fail(404, 'User not found.');
      if (!['OPERATIONS_ADMIN', 'SUPPORT_ADMIN', 'SOCIAL_MEDIA'].includes(u.role)) fail(400, 'Only staff accounts can be given SMOIS access (super admins already have it).');
      userId = u.id;
      if (!u.isActive) await tx.user.update({ where: { id: u.id }, data: { isActive: true } });
    } else {
      const name = reqStr(body.name, 'Name', 120);
      const email = reqStr(body.email, 'Email', 200).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Enter a valid email address.');
      if (await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) fail(409, 'Email already registered.');
      const password = body.password ? String(body.password) : (tempPassword = generateTempPassword());
      if (!isStrongPassword(password)) fail(400, 'Password must be 8+ characters with upper, lower case and a number.');
      const user = await tx.user.create({
        data: { name, email, password: await bcrypt.hash(password, 10), role: 'SOCIAL_MEDIA', referralCode: generateReferralCode(), isEmailVerified: true, isActive: true },
        select: { id: true },
      });
      userId = user.id;
    }
    if (await tx.smoisMember.findUnique({ where: { userId }, select: { id: true } })) fail(409, 'This person already has SMOIS access.');

    const supervisorId = body.supervisorId ? String(body.supervisorId) : null;
    const member = await tx.smoisMember.create({
      data: {
        userId, role, ...flags, jobTitle: str(body.jobTitle, 120), responsibilities: str(body.responsibilities, 1000),
        supervisorId, createdById: access(req).userId,
      },
      select: memberSelect,
    });
    await smoisAudit(req, { action: 'MEMBER_ADDED', entity: 'SmoisMember', entityId: member.id, after: { role, ...flags, userId } }, tx);
    return member;
  });
  return apiResponse.success(res, 'Team member added.', { member: result, tempPassword }, 201);
});

// PATCH /members/:id { role?, jobTitle?, responsibilities?, supervisorId?, flags? }
export const updateMember = handle(async (req, res) => {
  const m = await prisma.smoisMember.findUnique({ where: { id: req.params.id } });
  if (!m) return fail(404, 'Team member not found.');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisMemberUncheckedUpdateInput = {};
  if ('role' in body) {
    data.role = oneOf(body.role, ROLES, 'Role');
    // A role change resets the switches to that role's defaults unless the caller sets them explicitly.
    Object.assign(data, parseFlags(body, roleDefaults(data.role as SmoisRole)));
  } else {
    for (const k of ['canApprove', 'canPublish', 'canEmergencyPublish', 'canConnectAccounts'] as const) if (k in body) data[k] = !!body[k];
  }
  if ('jobTitle' in body) data.jobTitle = str(body.jobTitle, 120);
  if ('responsibilities' in body) data.responsibilities = str(body.responsibilities, 1000);
  if ('supervisorId' in body) {
    const sup = body.supervisorId ? String(body.supervisorId) : null;
    if (sup === m.id) fail(400, 'Someone cannot supervise themselves.');
    data.supervisorId = sup;
  }
  const updated = await prisma.smoisMember.update({ where: { id: m.id }, data, select: memberSelect });
  await smoisAudit(req, {
    action: 'MEMBER_UPDATED', entity: 'SmoisMember', entityId: m.id,
    before: { role: m.role, canApprove: m.canApprove, canPublish: m.canPublish, canEmergencyPublish: m.canEmergencyPublish, canConnectAccounts: m.canConnectAccounts },
    after: { role: updated.role, canApprove: updated.canApprove, canPublish: updated.canPublish, canEmergencyPublish: updated.canEmergencyPublish, canConnectAccounts: updated.canConnectAccounts },
  });
  return apiResponse.success(res, 'Team member updated.', updated);
});

// POST /members/:id/revoke { reason? }: access ends, every record stays.
export const revokeMember = handle(async (req, res) => {
  const m = await prisma.smoisMember.findUnique({ where: { id: req.params.id }, include: { user: { select: { role: true } } } });
  if (!m) return fail(404, 'Team member not found.');
  if (m.userId === access(req).userId) fail(400, 'You cannot revoke your own access.');
  const reason = str(req.body?.reason, 300);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.smoisMember.update({ where: { id: m.id }, data: { isActive: false, revokedAt: now } });
    await tx.smoisAssignment.updateMany({ where: { memberId: m.id, endsAt: null }, data: { endsAt: now, endedReason: reason ?? 'Access revoked' } });
    // A SOCIAL_MEDIA account has nothing else to log into; staff admins keep their other roles.
    if (m.user.role === 'SOCIAL_MEDIA') await tx.user.update({ where: { id: m.userId }, data: { isActive: false } });
    await smoisAudit(req, { action: 'MEMBER_REVOKED', entity: 'SmoisMember', entityId: m.id, meta: { reason } }, tx);
  });
  return apiResponse.success(res, 'Access revoked. Their history is preserved.');
});

// POST /members/:id/restore
export const restoreMember = handle(async (req, res) => {
  const m = await prisma.smoisMember.findUnique({ where: { id: req.params.id }, include: { user: { select: { role: true } } } });
  if (!m) return fail(404, 'Team member not found.');
  await prisma.$transaction(async (tx) => {
    await tx.smoisMember.update({ where: { id: m.id }, data: { isActive: true, revokedAt: null } });
    if (m.user.role === 'SOCIAL_MEDIA') await tx.user.update({ where: { id: m.userId }, data: { isActive: true } });
    await smoisAudit(req, { action: 'MEMBER_RESTORED', entity: 'SmoisMember', entityId: m.id }, tx);
  });
  return apiResponse.success(res, 'Access restored.');
});

// GET /eligible-users: staff admins who could be given access
export const listEligibleUsers = handle(async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['OPERATIONS_ADMIN', 'SUPPORT_ADMIN', 'SOCIAL_MEDIA'] }, isActive: true, smoisMember: null },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
  return apiResponse.success(res, 'Eligible staff.', users);
});

// ── Accounts ─────────────────────────────────────────────────────────────────

const accountSelect = (now: Date) => ({
  id: true, platform: true, name: true, handle: true, profileImageUrl: true, url: true, category: true, accountType: true,
  ownerLabel: true, connectionStatus: true, apiAuthStatus: true, connectedAt: true, lastSyncAt: true, description: true,
  notes: true, archivedAt: true, createdAt: true,
  assignments: {
    where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true, kind: true, startsAt: true, endsAt: true, member: { select: { id: true, userId: true, user: { select: { name: true } } } } },
  },
}) satisfies Prisma.SmoisAccountSelect;

// GET /accounts?includeArchived=1&platform=
export const listAccounts = handle(async (req, res) => {
  const { platform, includeArchived } = req.query as Record<string, string>;
  const now = new Date();
  const accounts = await prisma.smoisAccount.findMany({
    where: {
      ...(includeArchived === '1' ? {} : { archivedAt: null }),
      ...(platform ? { platform: oneOf(platform, PLATFORMS, 'Platform') } : {}),
    },
    select: accountSelect(now),
    orderBy: [{ platform: 'asc' }, { name: 'asc' }],
  });
  return apiResponse.success(res, 'Accounts.', accounts);
});

// GET /accounts/:id: includes full assignment history and recent content
export const getAccount = handle(async (req, res) => {
  const now = new Date();
  const account = await prisma.smoisAccount.findUnique({
    where: { id: req.params.id },
    select: {
      ...accountSelect(now),
      assignments: {
        select: { id: true, kind: true, startsAt: true, endsAt: true, reason: true, endedReason: true, assignedById: true, member: { select: { id: true, user: { select: { name: true } } } } },
        orderBy: { startsAt: 'desc' },
      },
    },
  });
  if (!account) return fail(404, 'Account not found.');
  const [recent, names] = await Promise.all([
    prisma.smoisVariant.findMany({
      where: { accountId: account.id },
      select: { id: true, status: true, caption: true, publishedAt: true, publishedUrl: true, scheduledAt: true, content: { select: { id: true, title: true } } },
      orderBy: { updatedAt: 'desc' }, take: 10,
    }),
    nameMap(account.assignments.map((a) => a.assignedById)),
  ]);
  return apiResponse.success(res, 'Account.', {
    ...account,
    assignments: account.assignments.map((a) => ({ ...a, assignedByName: a.assignedById ? names.get(a.assignedById) ?? null : null })),
    recentContent: recent,
  });
});

const parseAccount = (body: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.SmoisAccountUncheckedUpdateInput = {};
  const has = (k: string) => k in body;
  if (!partial || has('platform')) data.platform = oneOf(body.platform, PLATFORMS, 'Platform');
  if (!partial || has('name')) data.name = reqStr(body.name, 'Account name', 120);
  if (has('handle')) data.handle = str(body.handle, 120)?.replace(/^@/, '') ?? null;
  if (has('profileImageUrl')) data.profileImageUrl = httpUrl(body.profileImageUrl, 'Profile image');
  if (has('url')) data.url = httpUrl(body.url, 'Account link');
  for (const k of ['category', 'accountType', 'ownerLabel'] as const) if (has(k)) data[k] = str(body[k], 120);
  if (has('description')) data.description = str(body.description, 1000);
  if (has('notes')) data.notes = str(body.notes, 2000);
  return data;
};

// POST /accounts
export const createAccount = handle(async (req, res) => {
  const data = parseAccount(req.body ?? {}, false) as Prisma.SmoisAccountUncheckedCreateInput;
  if (data.handle) {
    const dup = await prisma.smoisAccount.findFirst({ where: { platform: data.platform, handle: { equals: data.handle as string, mode: 'insensitive' } }, select: { id: true } });
    if (dup) fail(409, 'That account is already registered. Accounts are shared, so assign people to the existing record.');
  }
  const created = await prisma.smoisAccount.create({ data: { ...data, createdById: access(req).userId }, select: accountSelect(new Date()) });
  await smoisAudit(req, { action: 'ACCOUNT_CREATED', entity: 'SmoisAccount', entityId: created.id, after: { platform: created.platform, name: created.name, handle: created.handle } });
  return apiResponse.success(res, 'Account registered.', created, 201);
});

// PATCH /accounts/:id
export const updateAccount = handle(async (req, res) => {
  const before = await prisma.smoisAccount.findUnique({ where: { id: req.params.id } });
  if (!before) return fail(404, 'Account not found.');
  const data = parseAccount(req.body ?? {}, true);
  const body = req.body ?? {};
  // Connection state is reported by integrations; by hand only the notes-level states are allowed.
  if ('connectionStatus' in body) {
    const s = oneOf(body.connectionStatus, ['MANUAL', 'DISCONNECTED'] as const, 'Connection status');
    data.connectionStatus = s as SmoisConnectionStatus;
  }
  const updated = await prisma.smoisAccount.update({ where: { id: before.id }, data, select: accountSelect(new Date()) });
  await smoisAudit(req, {
    action: 'ACCOUNT_UPDATED', entity: 'SmoisAccount', entityId: before.id,
    before: { name: before.name, handle: before.handle, url: before.url, ownerLabel: before.ownerLabel, connectionStatus: before.connectionStatus },
    after: { name: updated.name, handle: updated.handle, url: updated.url, ownerLabel: updated.ownerLabel, connectionStatus: updated.connectionStatus },
  });
  return apiResponse.success(res, 'Account updated.', updated);
});

// POST /accounts/:id/archive  and  /restore: history stays either way.
export const setAccountArchived = (archived: boolean) => handle(async (req, res) => {
  const a = await prisma.smoisAccount.findUnique({ where: { id: req.params.id } });
  if (!a) return fail(404, 'Account not found.');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.smoisAccount.update({ where: { id: a.id }, data: { archivedAt: archived ? now : null } });
    if (archived) await tx.smoisAssignment.updateMany({ where: { accountId: a.id, endsAt: null }, data: { endsAt: now, endedReason: 'Account archived' } });
    await smoisAudit(req, { action: archived ? 'ACCOUNT_DISCONNECTED' : 'ACCOUNT_RESTORED', entity: 'SmoisAccount', entityId: a.id, meta: { name: a.name } }, tx);
  });
  return apiResponse.success(res, archived ? 'Account archived.' : 'Account restored.');
});

// ── Assignments ──────────────────────────────────────────────────────────────

// POST /accounts/:id/assignments { memberId, kind?, startsAt?, endsAt?, reason? }
export const assignMember = handle(async (req, res) => {
  const account = await prisma.smoisAccount.findUnique({ where: { id: req.params.id } });
  if (!account || account.archivedAt) return fail(404, 'Account not found.');
  const body = req.body ?? {};
  const member = await prisma.smoisMember.findUnique({ where: { id: String(body.memberId ?? '') }, include: { user: { select: { name: true } } } });
  if (!member || !member.isActive) return fail(400, 'That team member is not active.');
  if (member.role === 'VIEWER' || member.role === 'REVIEWER') fail(400, 'Only managers and management can be assigned to an account.');
  const kind = body.kind ? oneOf(body.kind, KINDS, 'Assignment type') : 'SECONDARY';
  const startsAt = date(body.startsAt, 'Start date') ?? new Date();
  const endsAt = date(body.endsAt, 'End date');
  if (kind === 'TEMPORARY' && !endsAt) fail(400, 'A temporary assignment needs an end date.');
  if (endsAt && endsAt <= startsAt) fail(400, 'End date must be after the start date.');

  const created = await prisma.$transaction(async (tx) => {
    const open = { memberId: member.id, accountId: account.id, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] };
    if (await tx.smoisAssignment.findFirst({ where: open, select: { id: true } })) fail(409, `${member.user.name} is already assigned to this account.`);
    // One primary at a time: a new primary demotes the old one to secondary and records why.
    if (kind === 'PRIMARY') {
      await tx.smoisAssignment.updateMany({ where: { accountId: account.id, kind: 'PRIMARY', OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, data: { kind: 'SECONDARY' } });
    }
    const row = await tx.smoisAssignment.create({
      data: { accountId: account.id, memberId: member.id, kind, startsAt, endsAt, reason: str(body.reason, 300), assignedById: access(req).userId },
    });
    await smoisAudit(req, { action: 'ACCOUNT_ASSIGNED', entity: 'SmoisAccount', entityId: account.id, after: { member: member.user.name, kind, startsAt, endsAt }, meta: { reason: row.reason } }, tx);
    return row;
  });
  await notifyMany([member.userId], { title: 'Account assignment', body: `You were assigned to ${account.name} (${account.platform}).`, data: { link: '/smois/accounts' } }, access(req).userId);
  return apiResponse.success(res, 'Assigned.', created, 201);
});

// POST /assignments/:id/end { reason }
export const endAssignment = handle(async (req, res) => {
  const row = await prisma.smoisAssignment.findUnique({ where: { id: req.params.id }, include: { account: { select: { name: true } }, member: { select: { userId: true, user: { select: { name: true } } } } } });
  if (!row) return fail(404, 'Assignment not found.');
  if (row.endsAt && row.endsAt <= new Date()) fail(400, 'That assignment has already ended.');
  const reason = reqStr(req.body?.reason, 'Reason for ending the assignment', 300);
  await prisma.$transaction(async (tx) => {
    await tx.smoisAssignment.update({ where: { id: row.id }, data: { endsAt: new Date(), endedReason: reason } });
    await smoisAudit(req, { action: 'ACCOUNT_UNASSIGNED', entity: 'SmoisAccount', entityId: row.accountId, before: { member: row.member.user.name, kind: row.kind }, meta: { reason } }, tx);
  });
  await notifyMany([row.member.userId], { title: 'Account assignment ended', body: `You are no longer assigned to ${row.account.name}. ${reason}`, data: { link: '/smois/accounts' } }, access(req).userId);
  return apiResponse.success(res, 'Assignment ended. The history is kept.');
});

// ── Categories & settings ────────────────────────────────────────────────────

// GET /categories
export const listCategories = handle(async (_req, res) => {
  const cats = await prisma.smoisCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return apiResponse.success(res, 'Categories.', cats);
});

// POST /categories { name }
export const createCategory = handle(async (req, res) => {
  const name = reqStr(req.body?.name, 'Name', 80);
  if (await prisma.smoisCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) fail(409, 'That category exists.');
  const max = await prisma.smoisCategory.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.smoisCategory.create({ data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await smoisAudit(req, { action: 'CATEGORY_CREATED', entity: 'SmoisCategory', entityId: c.id, after: { name } });
  return apiResponse.success(res, 'Category added.', c, 201);
});

// PATCH /categories/:id { name?, isActive? }
export const updateCategory = handle(async (req, res) => {
  const c = await prisma.smoisCategory.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Category not found.');
  const data: Prisma.SmoisCategoryUpdateInput = {};
  if ('name' in (req.body ?? {})) data.name = reqStr(req.body.name, 'Name', 80);
  if ('isActive' in (req.body ?? {})) data.isActive = !!req.body.isActive;
  const u = await prisma.smoisCategory.update({ where: { id: c.id }, data });
  await smoisAudit(req, { action: 'CATEGORY_UPDATED', entity: 'SmoisCategory', entityId: c.id, before: { name: c.name, isActive: c.isActive }, after: { name: u.name, isActive: u.isActive } });
  return apiResponse.success(res, 'Category updated.', u);
});

// GET /settings
export const readSettings = handle(async (_req, res) => apiResponse.success(res, 'Settings.', await getSettings()));

// PATCH /settings
export const updateSettings = handle(async (req, res) => {
  const before = await getSettings();
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisSettingsUpdateInput = { updatedById: access(req).userId };
  if ('requireApproval' in b) data.requireApproval = !!b.requireApproval;
  if ('allowSelfApproval' in b) data.allowSelfApproval = !!b.allowSelfApproval;
  if ('minPostGapMinutes' in b) {
    const n = Number(b.minPostGapMinutes);
    if (!Number.isInteger(n) || n < 0 || n > 1440) fail(400, 'Minimum gap must be 0–1440 minutes.');
    data.minPostGapMinutes = n;
  }
  if ('approvalReminderHours' in b) {
    const n = Number(b.approvalReminderHours);
    if (!Number.isInteger(n) || n < 1 || n > 168) fail(400, 'Reminder delay must be 1–168 hours.');
    data.approvalReminderHours = n;
  }
  for (const [k, lo, hi, label] of [['slaHighMinutes', 5, 1440, 'High-priority target'], ['slaStandardMinutes', 5, 2880, 'Standard target'], ['slaGeneralMinutes', 30, 10080, 'General target'], ['businessStartHour', 0, 23, 'Opening hour'], ['businessEndHour', 1, 24, 'Closing hour']] as const) {
    if (k in b) {
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < lo || n > hi) fail(400, label + ' must be between ' + lo + ' and ' + hi + '.');
      (data as Record<string, number>)[k] = n;
    }
  }
  if ('businessDays' in b) {
    const raw = Array.isArray(b.businessDays) ? (b.businessDays as unknown[]).map(Number) : [];
    if (!raw.length) fail(400, 'Choose at least one business day.');
    if (raw.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail(400, 'Business days are 0 (Sunday) to 6 (Saturday).');
    const days = [...new Set(raw)].sort();
    data.businessDays = days;
  }
  const hoursStart = (data.businessStartHour as number | undefined) ?? before.businessStartHour;
  const hoursEnd = (data.businessEndHour as number | undefined) ?? before.businessEndHour;
  if (hoursEnd <= hoursStart) fail(400, 'Closing hour must be after the opening hour.');
  const u = await prisma.smoisSettings.update({ where: { id: 'default' }, data });
  await smoisAudit(req, {
    action: 'SETTINGS_CHANGED', entity: 'SmoisSettings', entityId: 'default',
    before: { requireApproval: before.requireApproval, allowSelfApproval: before.allowSelfApproval, minPostGapMinutes: before.minPostGapMinutes, approvalReminderHours: before.approvalReminderHours },
    after: { requireApproval: u.requireApproval, allowSelfApproval: u.allowSelfApproval, minPostGapMinutes: u.minPostGapMinutes, approvalReminderHours: u.approvalReminderHours, sla: [u.slaHighMinutes, u.slaStandardMinutes, u.slaGeneralMinutes], hours: [u.businessStartHour, u.businessEndHour, u.businessDays] },
  });
  return apiResponse.success(res, 'Settings saved.', u);
});

// ── Notifications ────────────────────────────────────────────────────────────

// GET /notifications
export const listNotifications = handle(async (req, res) => {
  const userId = access(req).userId;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId, type: 'smois' }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, title: true, body: true, isRead: true, meta: true, createdAt: true } }),
    prisma.notification.count({ where: { userId, type: 'smois', isRead: false } }),
  ]);
  return apiResponse.success(res, 'Notifications.', { items, unread });
});

// POST /notifications/read { id? }: one, or all when omitted
export const markNotificationsRead = handle(async (req, res) => {
  const userId = access(req).userId;
  await prisma.notification.updateMany({ where: { userId, type: 'smois', isRead: false, ...(req.body?.id ? { id: String(req.body.id) } : {}) }, data: { isRead: true } });
  return apiResponse.success(res, 'Marked read.');
});

export { isAssignedToAccount };
