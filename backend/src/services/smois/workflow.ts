// SMOIS rules that don't touch the database: who may do what, which status moves are legal,
// calendar conflicts and recurring-task periods. Kept pure so they can be unit-tested.
import type { SmoisContentStatus, SmoisRole, SmoisRecurrence } from '@prisma/client';

// ── Access ───────────────────────────────────────────────────────────────────

export type SmoisLevel = 'SUPER' | SmoisRole;

export interface SmoisAccess {
  userId: string;
  memberId: string | null;
  level: SmoisLevel;
  canApprove: boolean;
  canPublish: boolean;
  canEmergencyPublish: boolean;
  canConnectAccounts: boolean;
}

/** Defaults granted to a new member of each role (super admins can change them per person). */
export const roleDefaults = (role: SmoisRole) => ({
  canApprove: role === 'MANAGEMENT' || role === 'REVIEWER',
  canPublish: role === 'MANAGEMENT',
  canEmergencyPublish: false,
  canConnectAccounts: false,
});

export type Capability =
  | 'createContent'    // draft, edit own, submit
  | 'approve'
  | 'publish'
  | 'manageTasks'      // create / assign / review tasks, recurring rules
  | 'completeTasks'
  | 'manageAccounts'   // register, edit, archive, assign
  | 'manageTeam'
  | 'configure'
  | 'viewAll'          // department-wide visibility (staff, all tasks, all activity)
  | 'viewActivity';    // the activity log (scoped to own for non-management)

export const can = (a: SmoisAccess, cap: Capability): boolean => {
  const L = a.level;
  switch (cap) {
    case 'createContent': return L === 'SUPER' || L === 'MANAGEMENT' || L === 'MANAGER';
    case 'approve': return L === 'SUPER' || (L !== 'VIEWER' && a.canApprove);
    case 'publish': return L === 'SUPER' || ((L === 'MANAGEMENT' || L === 'MANAGER') && a.canPublish);
    case 'manageTasks': return L === 'SUPER' || L === 'MANAGEMENT';
    case 'completeTasks': return L === 'SUPER' || L === 'MANAGEMENT' || L === 'MANAGER';
    case 'manageAccounts': return L === 'SUPER' || (L === 'MANAGEMENT' && a.canConnectAccounts);
    case 'manageTeam':
    case 'configure': return L === 'SUPER';
    case 'viewAll': return L === 'SUPER' || L === 'MANAGEMENT' || L === 'VIEWER';
    case 'viewActivity': return L !== 'VIEWER' && L !== 'REVIEWER';
    default: return false;
  }
};

// ── Content workflow ────────────────────────────────────────────────────────

type S = SmoisContentStatus;

/** Statuses where the copy is still being drafted by its author. */
export const DRAFTING: S[] = ['IDEA', 'PLANNED', 'BRIEFED', 'IN_PRODUCTION'];
export const IN_REVIEW: S[] = ['SUBMITTED', 'RESUBMITTED'];
/** Copy can be edited freely (no re-approval, no review in flight). */
export const EDITABLE: S[] = [...DRAFTING, 'REVISION_REQUESTED'];
/** Copy has been signed off, so a material edit sends it back for review. */
export const SIGNED_OFF: S[] = ['APPROVED', 'SCHEDULED', 'PUBLISH_FAILED'];
export const TERMINAL: S[] = ['PUBLISHED', 'REJECTED', 'ARCHIVED', 'CANCELLED'];

/** Plain moves a person can make without going through submit / review / publish. */
const MANUAL_MOVES: Partial<Record<S, S[]>> = {
  IDEA: ['PLANNED', 'BRIEFED', 'IN_PRODUCTION', 'CANCELLED'],
  PLANNED: ['IDEA', 'BRIEFED', 'IN_PRODUCTION', 'CANCELLED'],
  BRIEFED: ['PLANNED', 'IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['BRIEFED', 'CANCELLED'],
  REVISION_REQUESTED: ['IN_PRODUCTION', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  SCHEDULED: ['APPROVED', 'CANCELLED'], // un-schedule or cancel
  PUBLISH_FAILED: ['CANCELLED'],
  REJECTED: ['ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
};
export const canMoveManually = (from: S, to: S) => !!MANUAL_MOVES[from]?.includes(to);

export const submitTarget = (from: S): S | null => {
  if (DRAFTING.includes(from)) return 'SUBMITTED';
  if (from === 'REVISION_REQUESTED') return 'RESUBMITTED';
  return null;
};

export const reviewTarget = (from: S, decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED'): S | null =>
  IN_REVIEW.includes(from) ? decision : null;

/** Where a variant must be to be scheduled / published through the normal route. */
export const canSchedule = (from: S, requireApproval: boolean): boolean =>
  from === 'APPROVED' || from === 'SCHEDULED' || from === 'PUBLISH_FAILED' ||
  (!requireApproval && (DRAFTING.includes(from) || from === 'REVISION_REQUESTED'));

export const canRecordPublish = (from: S, requireApproval: boolean): boolean =>
  from === 'APPROVED' || from === 'SCHEDULED' || from === 'PUBLISHING' || from === 'PUBLISH_FAILED' ||
  (!requireApproval && (DRAFTING.includes(from) || from === 'REVISION_REQUESTED'));

/** Anything not yet cleared that an emergency bypass could publish. */
export const needsBypass = (from: S): boolean =>
  DRAFTING.includes(from) || IN_REVIEW.includes(from) || from === 'REVISION_REQUESTED';

export interface CopyFields {
  caption: string;
  hashtags: string[];
  mentions: string[];
  mediaUrls: unknown;
  linkUrl: string | null;
  accountId?: string;
}

const norm = (v: unknown) => JSON.stringify(v ?? null);

/** Material = anything a reader of the published post would see. Planning dates aren't. */
export const isMaterialChange = (before: CopyFields, after: CopyFields): boolean =>
  before.caption.trim() !== after.caption.trim() ||
  norm(before.hashtags) !== norm(after.hashtags) ||
  norm(before.mentions) !== norm(after.mentions) ||
  norm(before.mediaUrls) !== norm(after.mediaUrls) ||
  (before.linkUrl ?? '') !== (after.linkUrl ?? '') ||
  (after.accountId !== undefined && before.accountId !== undefined && before.accountId !== after.accountId);

/** Status after a material edit: in-review items stay in review; signed-off items go back for re-approval. */
export const statusAfterMaterialEdit = (from: S): S => {
  if (SIGNED_OFF.includes(from)) return 'RESUBMITTED';
  return from;
};

/** Per-platform caption limits we can warn about (soft check, not a block). */
export const CAPTION_LIMITS: Record<string, number> = {
  X: 280, THREADS: 500, INSTAGRAM: 2200, FACEBOOK: 63206, LINKEDIN: 3000, TIKTOK: 2200,
  YOUTUBE: 5000, PINTEREST: 500, WHATSAPP: 4096,
};

export const qualityWarnings = (platform: string, v: { caption: string; hashtags: string[]; mediaUrls: unknown; linkUrl: string | null }, format: string): string[] => {
  const out: string[] = [];
  const limit = CAPTION_LIMITS[platform];
  if (limit && v.caption.length > limit) out.push(`Caption is ${v.caption.length} characters; ${platform} allows ${limit}.`);
  if (!v.caption.trim()) out.push('Caption is empty.');
  if (v.hashtags.length > 30) out.push('More than 30 hashtags.');
  const media = Array.isArray(v.mediaUrls) ? v.mediaUrls : [];
  if (['IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY'].includes(format) && media.length === 0) out.push(`A ${format.toLowerCase()} post has no media attached.`);
  if (v.linkUrl && !/^https?:\/\//i.test(v.linkUrl)) out.push('Link does not start with http(s)://.');
  return out;
};

// ── Calendar conflicts ───────────────────────────────────────────────────────

export interface CalendarItem {
  id: string;
  accountId: string;
  status: S;
  caption: string;
  /** scheduledAt when set, otherwise plannedAt. */
  at: Date | null;
}

export type ConflictType = 'DUPLICATE' | 'TOO_CLOSE' | 'PAST_DATE' | 'UNAPPROVED_SCHEDULED';
export interface Conflict { type: ConflictType; variantIds: string[]; message: string }

const LIVE: S[] = ['IDEA', 'PLANNED', 'BRIEFED', 'IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'SCHEDULED'];
const normCaption = (c: string) => c.toLowerCase().replace(/\s+/g, ' ').trim();

export const detectConflicts = (items: CalendarItem[], now: Date, gapMinutes: number): Conflict[] => {
  const out: Conflict[] = [];
  const live = items.filter((i) => LIVE.includes(i.status));

  // Same caption on the same account.
  const byCaption = new Map<string, CalendarItem[]>();
  for (const i of live) {
    const c = normCaption(i.caption);
    if (c.length < 12) continue;
    const k = `${i.accountId}|${c}`;
    byCaption.set(k, [...(byCaption.get(k) ?? []), i]);
  }
  for (const group of byCaption.values()) {
    if (group.length > 1) out.push({ type: 'DUPLICATE', variantIds: group.map((g) => g.id), message: 'Same caption is planned more than once on this account.' });
  }

  // Posts too close together on one account.
  const byAccount = new Map<string, CalendarItem[]>();
  for (const i of live) if (i.at) byAccount.set(i.accountId, [...(byAccount.get(i.accountId) ?? []), i]);
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.at!.getTime() - b.at!.getTime());
    for (let n = 1; n < list.length; n++) {
      const diff = (list[n].at!.getTime() - list[n - 1].at!.getTime()) / 60000;
      if (diff < gapMinutes) out.push({ type: 'TOO_CLOSE', variantIds: [list[n - 1].id, list[n].id], message: `Two posts are ${Math.round(diff)} min apart (minimum ${gapMinutes}).` });
    }
  }

  for (const i of live) {
    if (!i.at) continue;
    if (i.at.getTime() < now.getTime() && i.status !== 'IDEA') out.push({ type: 'PAST_DATE', variantIds: [i.id], message: 'Planned date has passed and it is not published.' });
    const within24h = i.at.getTime() - now.getTime() < 24 * 3600_000 && i.at.getTime() >= now.getTime();
    if (within24h && !['APPROVED', 'SCHEDULED'].includes(i.status)) out.push({ type: 'UNAPPROVED_SCHEDULED', variantIds: [i.id], message: 'Goes out within 24 hours but is not approved yet.' });
  }
  return out;
};

// ── Recurring tasks ─────────────────────────────────────────────────────────

const LAGOS = 'Africa/Lagos';

const lagosParts = (d: Date) => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { key: `${p.year}-${p.month}-${p.day}`, dow, dom: Number(p.day) };
};

/** The occurrence key to generate today, or null if the rule isn't due today. */
export const occurrenceDue = (
  rule: { recurrence: SmoisRecurrence; dayOfWeek: number | null; dayOfMonth: number | null },
  now: Date,
): string | null => {
  const t = lagosParts(now);
  if (rule.recurrence === 'DAILY') return t.key;
  if (rule.recurrence === 'WEEKLY') return t.dow === (rule.dayOfWeek ?? 1) ? t.key : null;
  return t.dom === (rule.dayOfMonth ?? 1) ? t.key : null;
};

export const lagosDay = (d: Date) => lagosParts(d).key;

// ── Tasks ───────────────────────────────────────────────────────────────────

import type { SmoisTaskStatus } from '@prisma/client';
type T = SmoisTaskStatus;

export const TASK_DONE: T[] = ['COMPLETED', 'CANCELLED'];
/** Open work that can be overdue. */
export const isOverdue = (t: { status: T; deadline: Date | null }, now: Date) =>
  !!t.deadline && t.deadline.getTime() < now.getTime() && !TASK_DONE.includes(t.status);

/** Moves the assignee may make. */
const ASSIGNEE_MOVES: Partial<Record<T, T[]>> = {
  PENDING: ['ACCEPTED', 'IN_PROGRESS'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  REVISION_REQUIRED: ['IN_PROGRESS', 'SUBMITTED'],
};
/** Moves a task manager may make. */
const MANAGER_MOVES: Partial<Record<T, T[]>> = {
  PENDING: ['CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  IN_PROGRESS: ['CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REVISION_REQUIRED', 'COMPLETED'],
  UNDER_REVIEW: ['APPROVED', 'REVISION_REQUIRED', 'COMPLETED'],
  APPROVED: ['COMPLETED'],
  REVISION_REQUIRED: ['CANCELLED'],
};
export const taskMoveAllowed = (from: T, to: T, role: 'assignee' | 'manager'): boolean =>
  (role === 'assignee' ? ASSIGNEE_MOVES : MANAGER_MOVES)[from]?.includes(to) ?? false;
