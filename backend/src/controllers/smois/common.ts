// Shared helpers for the SMOIS controllers.
import { RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { notifyUser } from '../../services/notification.service';
import { sendSmoisAlertEmail } from '../../services/email.service';
import { SmoisRequest } from '../../middleware/smois.middleware';
import { SmoisAccess } from '../../services/smois/workflow';
import logger from '../../utils/logger';

/** Thrown inside handlers to answer with a specific status. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

/** Wrap an async handler so HttpError becomes a clean response. */
export const handle = (fn: (req: SmoisRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as SmoisRequest, res).catch((err) => {
      if (err instanceof HttpError) return apiResponse.error(res, err.message, err.status);
      next(err);
    });
  };

export const access = (req: SmoisRequest): SmoisAccess => req.smois!;

export const str = (v: unknown, max = 5000): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
export const reqStr = (v: unknown, label: string, max = 500): string => {
  const s = str(v, max);
  if (!s) fail(400, `${label} is required.`);
  return s as string;
};
export const strList = (v: unknown, maxItems = 60, maxLen = 100): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean).map((x) => x.slice(0, maxLen)))].slice(0, maxItems) : [];

export const date = (v: unknown, label: string): Date | null => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) fail(400, `${label} is not a valid date.`);
  return d;
};

export const oneOf = <T extends string>(v: unknown, allowed: readonly T[], label: string): T => {
  if (!allowed.includes(v as T)) fail(400, `${label} must be one of: ${allowed.join(', ')}.`);
  return v as T;
};

export const httpUrl = (v: unknown, label: string): string | null => {
  const s = str(v, 2000);
  if (!s) return null;
  if (!/^https?:\/\/\S+$/i.test(s)) fail(400, `${label} must be a full http(s) link.`);
  return s;
};

export const mediaList = (v: unknown): { url: string; type?: string }[] => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 20).map((m) => {
    const item = (typeof m === 'string' ? { url: m } : m) as { url?: unknown; type?: unknown };
    const url = httpUrl(item?.url, 'Media link');
    if (!url) fail(400, 'Each media item needs a link.');
    return { url: url as string, ...(item?.type ? { type: String(item.type).slice(0, 20) } : {}) };
  });
};

export const getSettings = async () =>
  prisma.smoisSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });

/** userId -> display name for a batch of ids. */
export const nameMap = async (ids: (string | null | undefined)[]): Promise<Map<string, string>> => {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
};

/**
 * In-app (+ push when the person has a device) notification to several people, skipping the actor.
 * An email copy goes to everyone who hasn't switched email alerts off, unless `email: false` (chatty events).
 */
export const notifyMany = async (
  userIds: (string | null | undefined)[],
  payload: { title: string; body: string; data?: Record<string, unknown>; email?: boolean },
  exceptUserId?: string,
): Promise<void> => {
  const targets = [...new Set(userIds.filter((x): x is string => !!x && x !== exceptUserId))];
  if (!targets.length) return;
  await Promise.all(targets.map((id) =>
    notifyUser(id, { title: payload.title, body: payload.body, data: payload.data, type: 'smois' }).catch((err) => logger.warn(`SMOIS notify failed for ${id}: ${(err as Error).message}`)),
  ));
  if (payload.email === false) return;
  try {
    const [users, prefs] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: targets }, isActive: true }, select: { id: true, name: true, email: true } }),
      prisma.smoisPreference.findMany({ where: { userId: { in: targets } }, select: { userId: true, emailAlerts: true } }),
    ]);
    const off = new Set(prefs.filter((p) => !p.emailAlerts).map((p) => p.userId));
    const link = typeof payload.data?.link === 'string' ? payload.data.link : undefined;
    await Promise.all(users.filter((u) => !off.has(u.id)).map((u) => sendSmoisAlertEmail(u.email, u.name, payload.title, payload.body, link)));
  } catch (err) {
    logger.warn(`SMOIS email alerts failed: ${(err as Error).message}`);
  }
};

/** Active people who can approve (reviewers, management, super admins). */
export const approverUserIds = async (): Promise<string[]> => {
  const [members, supers] = await Promise.all([
    prisma.smoisMember.findMany({ where: { isActive: true, canApprove: true, role: { not: 'VIEWER' } }, select: { userId: true } }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } }),
  ]);
  return [...members.map((m) => m.userId), ...supers.map((s) => s.id)];
};

/** Management and super admins: who gets escalations. */
export const managementUserIds = async (): Promise<string[]> => {
  const [members, supers] = await Promise.all([
    prisma.smoisMember.findMany({ where: { isActive: true, role: 'MANAGEMENT' }, select: { userId: true } }),
    prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } }),
  ]);
  return [...members.map((m) => m.userId), ...supers.map((s) => s.id)];
};

export const isAssignedToAccount = async (memberId: string | null, accountId: string): Promise<boolean> => {
  if (!memberId) return false;
  const now = new Date();
  const a = await prisma.smoisAssignment.findFirst({
    where: { memberId, accountId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true },
  });
  return !!a;
};

// ── Reporting periods ───────────────────────────────────────────────────────

import { PERIOD_KEYS, resolvePeriod } from '../../services/smois/period';

/** Calendar date in Lagos for an instant, as YYYY-MM-DD. */
export const lagosYmd = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** period / from / to query parameters -> instants plus the Lagos dates snapshots are keyed by. */
export const readPeriod = (q: Record<string, string>, fallback: (typeof PERIOD_KEYS)[number] = 'month') => {
  const key = q.period ? oneOf(q.period, PERIOD_KEYS, 'Period') : fallback;
  const p = resolvePeriod(key, new Date(), { from: date(q.from, 'From'), to: date(q.to, 'To') });
  if (p.from > p.to) fail(400, 'The start date is after the end date.');
  const toYmd = lagosYmd(p.to);
  const today = lagosYmd(new Date());
  return { ...p, fromYmd: lagosYmd(p.from), toYmd, asOfYmd: today < toYmd ? today : toYmd };
};

/** Accounts a person may see figures for: everything for management/viewers, only assigned accounts for managers. */
export const visibleAccountIds = async (a: SmoisAccess, filters: { platform?: string; accountId?: string } = {}) => {
  const where: Prisma.SmoisAccountWhereInput = { archivedAt: null, ...(filters.platform ? { platform: filters.platform as never } : {}), ...(filters.accountId ? { id: filters.accountId } : {}) };
  if (a.level === 'MANAGER') {
    const now = new Date();
    where.assignments = { some: { memberId: a.memberId ?? '__none__', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } };
  }
  return prisma.smoisAccount.findMany({ where, select: { id: true, name: true, platform: true }, orderBy: [{ platform: 'asc' }, { name: 'asc' }] });
};

/** Refuse media that comes from a library asset which has expired or been rejected. Links not in the library are left alone. */
export const assertAssetsUsable = async (urls: string[]): Promise<void> => {
  if (!urls.length) return;
  const assets = await prisma.smoisAsset.findMany({ where: { url: { in: urls } }, select: { name: true, expiresAt: true, approvalStatus: true } });
  const now = new Date();
  for (const a of assets) {
    if (a.approvalStatus === 'REJECTED') fail(400, '"' + a.name + '" was rejected in the media library and cannot be used.');
    if (a.expiresAt && a.expiresAt <= now) fail(400, '"' + a.name + '" has expired in the media library (usage rights ended). Choose another asset.');
  }
};
