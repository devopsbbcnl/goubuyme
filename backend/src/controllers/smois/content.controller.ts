// SMOIS content: briefs, platform variants, versions, review, scheduling, publishing records, calendar.
import { Prisma, SmoisContentStatus } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { SmoisRequest } from '../../middleware/smois.middleware';
import {
  EDITABLE, IN_REVIEW, SIGNED_OFF, canMoveManually, canRecordPublish, canSchedule, can, detectConflicts,
  isMaterialChange, needsBypass, qualityWarnings, reviewTarget, statusAfterMaterialEdit, submitTarget,
} from '../../services/smois/workflow';
import {
  access, approverUserIds, date, fail, getSettings, handle, httpUrl, isAssignedToAccount, managementUserIds, mediaList,
  nameMap, notifyMany, oneOf, reqStr, str, strList,
} from './common';

const STATUSES = Object.values(SmoisContentStatus) as SmoisContentStatus[];
const FORMATS = ['TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY', 'POLL', 'LINK', 'DOCUMENT'] as const;

const variantSelect = {
  id: true, contentId: true, accountId: true, status: true, caption: true, hashtags: true, mentions: true, mediaUrls: true,
  linkUrl: true, plannedAt: true, scheduledAt: true, version: true, creatorId: true, submittedById: true, submittedAt: true,
  assignedReviewerId: true, approvedById: true, approvedAt: true, publishedAt: true, publishedUrl: true, publishedById: true,
  publishMechanism: true, emergencyBypass: true, createdAt: true, updatedAt: true,
  account: { select: { id: true, name: true, platform: true, handle: true, archivedAt: true } },
  content: { select: { id: true, number: true, title: true, format: true, category: { select: { id: true, name: true } } } },
} satisfies Prisma.SmoisVariantSelect;

type VariantRow = Prisma.SmoisVariantGetPayload<{ select: typeof variantSelect }>;

/** Adds the names of the people involved. */
const withPeople = async <T extends { creatorId: string; submittedById: string | null; approvedById: string | null; publishedById: string | null; assignedReviewerId: string | null }>(rows: T[]) => {
  const names = await nameMap(rows.flatMap((r) => [r.creatorId, r.submittedById, r.approvedById, r.publishedById, r.assignedReviewerId]));
  const n = (id: string | null) => (id ? names.get(id) ?? null : null);
  return rows.map((r) => ({
    ...r,
    creatorName: n(r.creatorId), submittedByName: n(r.submittedById), approvedByName: n(r.approvedById),
    publishedByName: n(r.publishedById), reviewerName: n(r.assignedReviewerId),
  }));
};

const snapshot = (v: { caption: string; hashtags: string[]; mentions: string[]; mediaUrls: Prisma.JsonValue; linkUrl: string | null; plannedAt: Date | null; version: number; id: string }, editorId: string, reason: string | null) => ({
  variantId: v.id, version: v.version, caption: v.caption, hashtags: v.hashtags, mentions: v.mentions,
  mediaUrls: v.mediaUrls as Prisma.InputJsonValue, linkUrl: v.linkUrl, plannedAt: v.plannedAt, editorId, reason,
});

/** May this person edit/submit this variant's copy? Management, or a manager currently assigned to its account. */
const canWorkOn = async (req: SmoisRequest, v: { creatorId: string; accountId: string }): Promise<boolean> => {
  const a = access(req);
  if (!can(a, 'createContent')) return false;
  if (a.level === 'SUPER' || a.level === 'MANAGEMENT') return true;
  // Managers work only where they are currently assigned; ending an assignment ends their edit rights.
  return isAssignedToAccount(a.memberId, v.accountId);
};

/** May this person put content on this account? Management and super admins anywhere; managers only where assigned. */
const canUseAccount = async (req: SmoisRequest, accountId: string): Promise<boolean> => {
  const a = access(req);
  if (!can(a, 'createContent')) return false;
  if (a.level === 'SUPER' || a.level === 'MANAGEMENT') return true;
  return isAssignedToAccount(a.memberId, accountId);
};

const loadVariant = async (id: string) => {
  const v = await prisma.smoisVariant.findUnique({ where: { id }, include: { account: true, content: true } });
  if (!v) return fail(404, 'Content not found.');
  return v;
};

// ── Briefs ───────────────────────────────────────────────────────────────────

// GET /content?q&status&accountId&platform&categoryId&mine=1&archived=1&page
export const listContent = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const a = access(req);
  const page = Math.max(1, Number(q.page) || 1);
  const take = 25;
  const variantWhere: Prisma.SmoisVariantWhereInput = {
    ...(q.status ? { status: oneOf(q.status, STATUSES, 'Status') } : {}),
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.platform ? { account: { platform: q.platform as never } } : {}),
  };
  const where: Prisma.SmoisContentWhereInput = {
    archivedAt: q.archived === '1' ? { not: null } : null,
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.mine === '1' ? { OR: [{ creatorId: a.userId }, { variants: { some: { creatorId: a.userId } } }] } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { variants: { some: { caption: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    ...(Object.keys(variantWhere).length ? { variants: { some: variantWhere } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.smoisContent.findMany({
      where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * take, take,
      select: {
        id: true, number: true, title: true, format: true, objective: true, creatorId: true, createdAt: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        variants: { select: { id: true, status: true, plannedAt: true, scheduledAt: true, account: { select: { id: true, name: true, platform: true } } } },
      },
    }),
    prisma.smoisContent.count({ where }),
  ]);
  const names = await nameMap(rows.map((r) => r.creatorId));
  return apiResponse.success(res, 'Content.', {
    items: rows.map((r) => ({ ...r, creatorName: names.get(r.creatorId) ?? null })),
    pagination: { page, total, pages: Math.ceil(total / take) },
  });
});

const parseVariantInput = async (input: Record<string, unknown>) => {
  const accountId = reqStr(input.accountId, 'Account', 60);
  const account = await prisma.smoisAccount.findUnique({ where: { id: accountId } });
  if (!account || account.archivedAt) fail(400, 'Choose an active account.');
  return {
    accountId,
    caption: str(input.caption, 10000) ?? '',
    hashtags: strList(input.hashtags, 60, 80).map((h) => h.replace(/^#/, '')),
    mentions: strList(input.mentions, 30, 80),
    mediaUrls: mediaList(input.mediaUrls) as unknown as Prisma.InputJsonValue,
    linkUrl: httpUrl(input.linkUrl, 'Link'),
    plannedAt: date(input.plannedAt, 'Planned date'),
  };
};

// POST /content { title, ..., variants: [{ accountId, caption, ... }] }
export const createContent = handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const a = access(req);
  const title = reqStr(b.title, 'Title', 160);
  const format = b.format ? oneOf(b.format, FORMATS, 'Format') : 'TEXT';
  const categoryId = b.categoryId ? String(b.categoryId) : null;
  if (categoryId && !(await prisma.smoisCategory.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }))) fail(400, 'Unknown category.');
  const inputs = Array.isArray(b.variants) ? (b.variants as Record<string, unknown>[]) : [];
  const parsed = await Promise.all(inputs.map(parseVariantInput));
  for (const p of parsed) {
    if (!(await canUseAccount(req, p.accountId))) fail(403, 'You are not assigned to one of those accounts.');
  }
  const startStatus: SmoisContentStatus = b.status ? oneOf(b.status, ['IDEA', 'PLANNED', 'BRIEFED', 'IN_PRODUCTION'] as const, 'Status') : 'IN_PRODUCTION';

  const created = await prisma.$transaction(async (tx) => {
    const content = await tx.smoisContent.create({
      data: {
        title, description: str(b.description, 3000), objective: str(b.objective, 1000), categoryId, audience: str(b.audience, 500),
        format, keywords: strList(b.keywords, 30, 60), creatorId: a.userId, reviewerId: b.reviewerId ? String(b.reviewerId) : null,
      },
    });
    for (const p of parsed) {
      const v = await tx.smoisVariant.create({
        data: { contentId: content.id, creatorId: a.userId, status: startStatus, assignedReviewerId: content.reviewerId, ...p },
      });
      await tx.smoisVariantVersion.create({ data: snapshot(v, a.userId, 'Created') });
    }
    await smoisAudit(req, { action: 'CONTENT_CREATED', entity: 'SmoisContent', entityId: content.id, after: { title, variants: parsed.length } }, tx);
    return content;
  });
  return apiResponse.success(res, 'Content created.', { id: created.id, number: created.number }, 201);
});

// GET /content/:id
export const getContent = handle(async (req, res) => {
  const content = await prisma.smoisContent.findUnique({
    where: { id: req.params.id },
    include: {
      category: { select: { id: true, name: true } },
      variants: { select: { ...variantSelect, versions: { orderBy: { version: 'desc' } }, reviews: { orderBy: { createdAt: 'desc' } }, comments: { orderBy: { createdAt: 'asc' } }, attempts: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!content) return fail(404, 'Content not found.');
  const ids = [
    content.creatorId, content.reviewerId,
    ...content.variants.flatMap((v) => [
      v.creatorId, v.submittedById, v.approvedById, v.publishedById, v.assignedReviewerId,
      ...v.versions.map((x) => x.editorId), ...v.reviews.map((x) => x.reviewerId), ...v.comments.map((x) => x.authorId), ...v.attempts.map((x) => x.initiatedById),
    ]),
  ];
  const names = await nameMap(ids);
  const n = (id: string | null) => (id ? names.get(id) ?? null : null);
  const settings = await getSettings();
  const a = access(req);
  const variants = await Promise.all(content.variants.map(async (v) => ({
    ...v,
    creatorName: n(v.creatorId), submittedByName: n(v.submittedById), approvedByName: n(v.approvedById), publishedByName: n(v.publishedById), reviewerName: n(v.assignedReviewerId),
    versions: v.versions.map((x) => ({ ...x, editorName: n(x.editorId) })),
    reviews: v.reviews.map((x) => ({ ...x, reviewerName: n(x.reviewerId) })),
    comments: v.comments.map((x) => ({ ...x, authorName: n(x.authorId) })),
    attempts: v.attempts.map((x) => ({ ...x, initiatedByName: n(x.initiatedById) })),
    warnings: qualityWarnings(v.account.platform, { caption: v.caption, hashtags: v.hashtags, mediaUrls: v.mediaUrls, linkUrl: v.linkUrl }, content.format),
    // What this person may do right now, so the screen doesn't have to guess.
    actions: {
      edit: (EDITABLE.includes(v.status) || IN_REVIEW.includes(v.status) || SIGNED_OFF.includes(v.status)) && (await canWorkOn(req, v)),
      submit: !!submitTarget(v.status) && (await canWorkOn(req, v)),
      review: IN_REVIEW.includes(v.status) && can(a, 'approve') && (settings.allowSelfApproval || (v.submittedById !== a.userId && v.creatorId !== a.userId)),
      schedule: can(a, 'publish') && canSchedule(v.status, settings.requireApproval),
      publish: can(a, 'publish') && canRecordPublish(v.status, settings.requireApproval),
      emergencyPublish: (a.level === 'SUPER' || a.canEmergencyPublish) && needsBypass(v.status),
      retry: can(a, 'publish') && v.status === 'PUBLISH_FAILED',
    },
  })));
  return apiResponse.success(res, 'Content.', { ...content, creatorName: n(content.creatorId), reviewerName: n(content.reviewerId), variants, settings: { requireApproval: settings.requireApproval, allowSelfApproval: settings.allowSelfApproval } });
});

// PATCH /content/:id: brief fields only (copy lives on variants)
export const updateContent = handle(async (req, res) => {
  const c = await prisma.smoisContent.findUnique({ where: { id: req.params.id } });
  if (!c) return fail(404, 'Content not found.');
  const a = access(req);
  if (!can(a, 'createContent')) fail(403, 'Forbidden. Insufficient permissions.');
  if (c.creatorId !== a.userId && a.level !== 'SUPER' && a.level !== 'MANAGEMENT') fail(403, 'Only the author or management can change the brief.');
  const b = (req.body ?? {}) as Record<string, unknown>;
  const data: Prisma.SmoisContentUncheckedUpdateInput = {};
  if ('title' in b) data.title = reqStr(b.title, 'Title', 160);
  if ('description' in b) data.description = str(b.description, 3000);
  if ('objective' in b) data.objective = str(b.objective, 1000);
  if ('audience' in b) data.audience = str(b.audience, 500);
  if ('format' in b) data.format = oneOf(b.format, FORMATS, 'Format');
  if ('keywords' in b) data.keywords = strList(b.keywords, 30, 60);
  if ('categoryId' in b) data.categoryId = b.categoryId ? String(b.categoryId) : null;
  if ('reviewerId' in b) {
    data.reviewerId = b.reviewerId ? String(b.reviewerId) : null;
    await prisma.smoisVariant.updateMany({ where: { contentId: c.id, status: { in: ['SUBMITTED', 'RESUBMITTED', ...EDITABLE] } }, data: { assignedReviewerId: data.reviewerId as string | null } });
  }
  const u = await prisma.smoisContent.update({ where: { id: c.id }, data });
  await smoisAudit(req, { action: 'CONTENT_EDITED', entity: 'SmoisContent', entityId: c.id, before: { title: c.title, objective: c.objective, categoryId: c.categoryId }, after: { title: u.title, objective: u.objective, categoryId: u.categoryId } });
  return apiResponse.success(res, 'Brief updated.', u);
});

// POST /content/:id/archive
export const archiveContent = handle(async (req, res) => {
  const c = await prisma.smoisContent.findUnique({ where: { id: req.params.id }, include: { variants: { select: { status: true } } } });
  if (!c) return fail(404, 'Content not found.');
  const a = access(req);
  if (c.creatorId !== a.userId && a.level !== 'SUPER' && a.level !== 'MANAGEMENT') fail(403, 'Only the author or management can archive this.');
  if (c.variants.some((v) => ['SUBMITTED', 'RESUBMITTED', 'SCHEDULED', 'PUBLISHING'].includes(v.status))) fail(409, 'Cancel scheduled or in-review versions first.');
  const archived = req.body?.restore ? null : new Date();
  await prisma.smoisContent.update({ where: { id: c.id }, data: { archivedAt: archived } });
  await smoisAudit(req, { action: archived ? 'CONTENT_ARCHIVED' : 'CONTENT_RESTORED', entity: 'SmoisContent', entityId: c.id });
  return apiResponse.success(res, archived ? 'Archived.' : 'Restored.');
});

// ── Variants ─────────────────────────────────────────────────────────────────

// POST /content/:id/variants { accountId, caption, ... }
export const addVariant = handle(async (req, res) => {
  const c = await prisma.smoisContent.findUnique({ where: { id: req.params.id } });
  if (!c || c.archivedAt) return fail(404, 'Content not found.');
  const a = access(req);
  const p = await parseVariantInput(req.body ?? {});
  if (!(await canUseAccount(req, p.accountId))) fail(403, 'You are not assigned to that account.');
  if (await prisma.smoisVariant.findFirst({ where: { contentId: c.id, accountId: p.accountId, status: { notIn: ['CANCELLED', 'ARCHIVED', 'REJECTED'] } }, select: { id: true } })) {
    fail(409, 'This brief already has a live version for that account.');
  }
  const v = await prisma.$transaction(async (tx) => {
    const row = await tx.smoisVariant.create({ data: { contentId: c.id, creatorId: a.userId, status: 'IN_PRODUCTION', assignedReviewerId: c.reviewerId, ...p } });
    await tx.smoisVariantVersion.create({ data: snapshot(row, a.userId, 'Created') });
    await smoisAudit(req, { action: 'CONTENT_VARIANT_ADDED', entity: 'SmoisContent', entityId: c.id, after: { variantId: row.id, accountId: p.accountId } }, tx);
    return row;
  });
  return apiResponse.success(res, 'Version added.', v, 201);
});

// PATCH /variants/:id { caption?, hashtags?, mentions?, mediaUrls?, linkUrl?, plannedAt?, accountId?, reason? }
export const updateVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  if (!(await canWorkOn(req, v))) fail(403, 'You cannot edit this content.');
  if (!(EDITABLE.includes(v.status) || IN_REVIEW.includes(v.status) || SIGNED_OFF.includes(v.status))) fail(409, 'This content can no longer be edited.');
  const a = access(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const reason = str(b.reason, 300);

  const next = {
    caption: 'caption' in b ? str(b.caption, 10000) ?? '' : v.caption,
    hashtags: 'hashtags' in b ? strList(b.hashtags, 60, 80).map((h) => h.replace(/^#/, '')) : v.hashtags,
    mentions: 'mentions' in b ? strList(b.mentions, 30, 80) : v.mentions,
    mediaUrls: ('mediaUrls' in b ? mediaList(b.mediaUrls) : v.mediaUrls) as Prisma.InputJsonValue,
    linkUrl: 'linkUrl' in b ? httpUrl(b.linkUrl, 'Link') : v.linkUrl,
    plannedAt: 'plannedAt' in b ? date(b.plannedAt, 'Planned date') : v.plannedAt,
    accountId: v.accountId,
  };
  if ('accountId' in b && b.accountId !== v.accountId) {
    const acc = await prisma.smoisAccount.findUnique({ where: { id: String(b.accountId) } });
    if (!acc || acc.archivedAt) fail(400, 'Choose an active account.');
    if (!(await canUseAccount(req, acc!.id))) fail(403, 'You are not assigned to that account.');
    next.accountId = acc!.id;
  }
  const material = isMaterialChange(
    { caption: v.caption, hashtags: v.hashtags, mentions: v.mentions, mediaUrls: v.mediaUrls, linkUrl: v.linkUrl, accountId: v.accountId },
    { ...next, mediaUrls: next.mediaUrls },
  );
  const reviewed = IN_REVIEW.includes(v.status) || SIGNED_OFF.includes(v.status);
  if (material && reviewed && !reason) fail(400, 'Say why you are changing content that has already been submitted or approved.');

  const status = material ? statusAfterMaterialEdit(v.status) : v.status;
  const version = material ? v.version + 1 : v.version;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.smoisVariant.update({
      where: { id: v.id },
      data: {
        ...next, status, version,
        // A signed-off item going back to review loses its sign-off and any schedule.
        ...(status === 'RESUBMITTED' && status !== v.status ? { approvedById: null, approvedAt: null, scheduledAt: null, submittedById: a.userId, submittedAt: new Date() } : {}),
      },
    });
    if (material) await tx.smoisVariantVersion.create({ data: snapshot(row, a.userId, reason) });
    await smoisAudit(req, {
      action: 'CONTENT_EDITED', entity: 'SmoisContent', entityId: v.contentId,
      before: { variantId: v.id, caption: v.caption, version: v.version, status: v.status },
      after: { variantId: v.id, caption: row.caption, version: row.version, status: row.status },
      meta: { reason, material },
    }, tx);
    return row;
  });
  if (status === 'RESUBMITTED' && status !== v.status) {
    await notifyMany(await approverUserIds(), { title: 'Approved content changed', body: `"${v.content.title}" on ${v.account.name} was edited after approval and needs review again.`, data: { link: '/smois/approvals' } }, a.userId);
  }
  return apiResponse.success(res, material && status !== v.status ? 'Saved. It needs approval again.' : 'Saved.', updated);
});

// POST /variants/:id/submit
export const submitVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  if (!(await canWorkOn(req, v))) fail(403, 'You cannot submit this content.');
  const target = submitTarget(v.status);
  if (!target) return fail(409, 'This content is not in a state that can be submitted.');
  const warnings = qualityWarnings(v.account.platform, { caption: v.caption, hashtags: v.hashtags, mediaUrls: v.mediaUrls, linkUrl: v.linkUrl }, v.content.format);
  if (!v.caption.trim()) fail(400, 'Add a caption before submitting.');
  const a = access(req);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.smoisVariant.update({ where: { id: v.id }, data: { status: target, submittedById: a.userId, submittedAt: new Date(), lastReminderAt: null } });
    await smoisAudit(req, { action: target === 'RESUBMITTED' ? 'CONTENT_RESUBMITTED' : 'CONTENT_SUBMITTED', entity: 'SmoisContent', entityId: v.contentId, after: { variantId: v.id, version: v.version }, meta: { account: v.account.name } }, tx);
    return row;
  });
  const recipients = v.assignedReviewerId ? [v.assignedReviewerId] : await approverUserIds();
  await notifyMany(recipients, { title: 'Content to review', body: `"${v.content.title}" for ${v.account.name} was submitted.`, data: { link: '/smois/approvals' } }, a.userId);
  return apiResponse.success(res, 'Submitted for review.', { variant: updated, warnings });
});

// POST /variants/:id/review { decision, comments?, rejectionReason?, version }
export const reviewVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const a = access(req);
  if (!can(a, 'approve')) fail(403, 'You do not have approval permission.');
  const decision = oneOf(req.body?.decision, ['APPROVED', 'REJECTED', 'REVISION_REQUESTED'] as const, 'Decision');
  const target = reviewTarget(v.status, decision);
  if (!target) return fail(409, 'This item is not waiting for review.');
  const settings = await getSettings();
  if (!settings.allowSelfApproval && (v.submittedById === a.userId || v.creatorId === a.userId)) {
    fail(403, 'You cannot review content you wrote or submitted. Ask another reviewer.');
  }
  if (Number(req.body?.version) !== v.version) fail(409, 'The copy changed since you opened it. Reload to review the latest version.');
  const comments = str(req.body?.comments, 3000);
  const rejectionReason = str(req.body?.rejectionReason, 500);
  if (decision === 'REJECTED' && !rejectionReason) fail(400, 'Give a rejection reason.');
  if (decision === 'REVISION_REQUESTED' && !comments) fail(400, 'Say what needs to change.');

  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({
      where: { id: v.id },
      data: decision === 'APPROVED' ? { status: target, approvedById: a.userId, approvedAt: new Date() } : { status: target, approvedById: null, approvedAt: null },
    });
    await tx.smoisReview.create({ data: { variantId: v.id, reviewerId: a.userId, decision, comments, rejectionReason, versionReviewed: v.version } });
    await smoisAudit(req, {
      action: decision === 'APPROVED' ? 'CONTENT_APPROVED' : decision === 'REJECTED' ? 'CONTENT_REJECTED' : 'CONTENT_REVISION_REQUESTED',
      entity: 'SmoisContent', entityId: v.contentId, before: { status: v.status }, after: { status: target, variantId: v.id, version: v.version }, meta: { comments, rejectionReason },
    }, tx);
  });
  const verb = { APPROVED: 'approved', REJECTED: 'rejected', REVISION_REQUESTED: 'sent back for changes' }[decision];
  await notifyMany([v.creatorId, v.submittedById], { title: `Content ${verb}`, body: `"${v.content.title}" on ${v.account.name} was ${verb}.${comments ? ` ${comments.slice(0, 120)}` : ''}`, data: { link: `/smois/content?open=${v.contentId}` } }, a.userId);
  return apiResponse.success(res, `Marked ${verb}.`);
});

// POST /variants/:id/status { status }: plain moves (plan, brief, cancel, archive, un-schedule)
export const moveVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const to = oneOf(req.body?.status, STATUSES, 'Status');
  if (!canMoveManually(v.status, to)) return fail(409, `Cannot move from ${v.status.replace(/_/g, ' ').toLowerCase()} to ${to.replace(/_/g, ' ').toLowerCase()}.`);
  const a = access(req);
  const privileged = to === 'CANCELLED' && v.status === 'SCHEDULED';
  if (privileged ? !can(a, 'publish') && !(await canWorkOn(req, v)) : !(await canWorkOn(req, v))) fail(403, 'You cannot change this content.');
  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({ where: { id: v.id }, data: { status: to, ...(to === 'APPROVED' || to === 'CANCELLED' ? { scheduledAt: null } : {}) } });
    await smoisAudit(req, { action: to === 'CANCELLED' ? 'CONTENT_CANCELLED' : to === 'ARCHIVED' ? 'CONTENT_ARCHIVED' : 'CONTENT_STATUS_CHANGED', entity: 'SmoisContent', entityId: v.contentId, before: { status: v.status }, after: { status: to, variantId: v.id } }, tx);
  });
  return apiResponse.success(res, 'Updated.');
});

// POST /variants/:id/comments { body }
export const commentOnVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const a = access(req);
  const body = reqStr(req.body?.body, 'Comment', 2000);
  const c = await prisma.smoisComment.create({ data: { variantId: v.id, authorId: a.userId, body } });
  await notifyMany([v.creatorId, v.submittedById, v.assignedReviewerId], { title: 'New comment', body: `On "${v.content.title}": ${body.slice(0, 120)}`, data: { link: `/smois/content?open=${v.contentId}` }, email: false }, a.userId);
  return apiResponse.success(res, 'Comment added.', c, 201);
});

// ── Scheduling & publishing records ──────────────────────────────────────────

// POST /variants/:id/schedule { scheduledAt }
export const scheduleVariant = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const settings = await getSettings();
  if (!canSchedule(v.status, settings.requireApproval)) return fail(409, settings.requireApproval ? 'Only approved content can be scheduled.' : 'This content cannot be scheduled right now.');
  const at = date(req.body?.scheduledAt, 'Publish time');
  if (!at) fail(400, 'Choose a publish time.');
  if (at!.getTime() < Date.now() - 60_000) fail(400, 'The publish time is in the past.');
  const retry = v.status === 'PUBLISH_FAILED';
  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({ where: { id: v.id }, data: { status: 'SCHEDULED', scheduledAt: at, plannedAt: at } });
    await smoisAudit(req, { action: 'CONTENT_SCHEDULED', entity: 'SmoisContent', entityId: v.contentId, before: { status: v.status, scheduledAt: v.scheduledAt }, after: { status: 'SCHEDULED', scheduledAt: at, variantId: v.id }, meta: { retry } }, tx);
  });
  return apiResponse.success(res, 'Scheduled. It is recorded as published once someone posts it and logs the result.');
});

// POST /variants/:id/publish { publishedUrl?, publishedAt?, emergencyReason? }
// Phase 1 has no platform integration, so this logs a post that a person made on the platform.
export const recordPublish = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const a = access(req);
  const settings = await getSettings();
  const url = httpUrl(req.body?.publishedUrl, 'Post link');
  const at = date(req.body?.publishedAt, 'Published time') ?? new Date();
  if (at.getTime() > Date.now() + 5 * 60_000) fail(400, 'Published time cannot be in the future.');
  const emergencyReason = str(req.body?.emergencyReason, 500);

  let bypass = false;
  if (!canRecordPublish(v.status, settings.requireApproval)) {
    if (needsBypass(v.status) && emergencyReason) {
      if (!(a.level === 'SUPER' || a.canEmergencyPublish)) fail(403, 'You are not permitted to publish without approval.');
      bypass = true;
    } else if (needsBypass(v.status)) {
      return fail(409, 'This content is not approved. An emergency publish needs a reason and the emergency permission.');
    } else {
      return fail(409, 'This content cannot be marked as published from its current status.');
    }
  } else if (!can(a, 'publish')) {
    fail(403, 'You do not have publishing permission.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({
      where: { id: v.id },
      data: { status: 'PUBLISHED', publishedAt: at, publishedUrl: url, publishedById: a.userId, publishMechanism: 'MANUAL', emergencyBypass: bypass, scheduledAt: v.scheduledAt ?? at },
    });
    await tx.smoisPublishAttempt.create({ data: { variantId: v.id, success: true, mechanism: 'MANUAL', initiatedById: a.userId, publishedUrl: url, recovery: bypass ? 'EMERGENCY' : null } });
    if (bypass) await tx.smoisReview.create({ data: { variantId: v.id, reviewerId: a.userId, decision: 'APPROVED', comments: emergencyReason, versionReviewed: v.version, emergencyBypass: true } });
    await smoisAudit(req, {
      action: bypass ? 'CONTENT_EMERGENCY_PUBLISHED' : 'CONTENT_PUBLISHED', entity: 'SmoisContent', entityId: v.contentId,
      before: { status: v.status }, after: { status: 'PUBLISHED', variantId: v.id, publishedUrl: url },
      meta: { account: v.account.name, platform: v.account.platform, mechanism: 'MANUAL', ...(bypass ? { emergencyReason } : {}) },
    }, tx);
  });
  if (bypass) {
    await notifyMany(await managementUserIds(), { title: 'Emergency publish', body: `${v.account.name}: "${v.content.title}" went out without approval. Reason: ${emergencyReason}`, data: { link: '/smois/publishing' } }, a.userId);
  } else {
    await notifyMany([v.creatorId], { title: 'Published', body: `"${v.content.title}" was published on ${v.account.name}.`, data: { link: '/smois/publishing' }, email: false }, a.userId);
  }
  return apiResponse.success(res, 'Recorded as published.');
});

// POST /variants/:id/fail { errorCode?, errorMessage }
export const recordPublishFailure = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const a = access(req);
  if (!can(a, 'publish')) fail(403, 'You do not have publishing permission.');
  if (!['APPROVED', 'SCHEDULED', 'PUBLISHING'].includes(v.status)) fail(409, 'Only approved or scheduled content can be marked as failed.');
  const errorMessage = reqStr(req.body?.errorMessage, 'What went wrong', 500);
  const errorCode = str(req.body?.errorCode, 60);
  const attempts = await prisma.smoisPublishAttempt.count({ where: { variantId: v.id, success: false } });
  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({ where: { id: v.id }, data: { status: 'PUBLISH_FAILED' } });
    await tx.smoisPublishAttempt.create({ data: { variantId: v.id, success: false, mechanism: 'MANUAL', initiatedById: a.userId, errorCode, errorMessage, retryCount: attempts, recovery: 'PENDING' } });
    await smoisAudit(req, { action: 'CONTENT_PUBLISH_FAILED', entity: 'SmoisContent', entityId: v.contentId, before: { status: v.status }, after: { status: 'PUBLISH_FAILED', variantId: v.id }, meta: { errorCode, errorMessage, account: v.account.name }, success: false }, tx);
  });
  await notifyMany([v.creatorId, ...(await managementUserIds())], { title: 'Publishing failed', body: `${v.account.name}: "${v.content.title}". ${errorMessage}`, data: { link: '/smois/publishing' } }, a.userId);
  return apiResponse.success(res, 'Failure recorded.');
});

// ── Flat lists ───────────────────────────────────────────────────────────────

const rangeWhere = (field: 'scheduledAt' | 'plannedAt' | 'publishedAt', q: Record<string, string>) => {
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) fail(400, 'Invalid date range.');
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
};

// GET /publishing?q&accountId&platform&creatorId&categoryId&status&from&to&sort=recent|oldest
// The permanent record of what went out (and what failed).
export const listPublishing = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, Number(q.page) || 1);
  const take = 30;
  const where: Prisma.SmoisVariantWhereInput = {
    status: q.status ? oneOf(q.status, ['PUBLISHED', 'PUBLISH_FAILED', 'SCHEDULED'] as const, 'Status') : { in: ['PUBLISHED', 'PUBLISH_FAILED'] },
    ...(q.accountId ? { accountId: q.accountId } : {}),
    ...(q.platform ? { account: { platform: q.platform as never } } : {}),
    ...(q.creatorId ? { creatorId: q.creatorId } : {}),
    ...(q.categoryId ? { content: { categoryId: q.categoryId } } : {}),
    ...(q.q ? { OR: [{ caption: { contains: q.q, mode: 'insensitive' } }, { content: { title: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    ...rangeWhere(q.status === 'SCHEDULED' ? 'scheduledAt' : 'publishedAt', q),
  };
  const [rows, total] = await Promise.all([
    prisma.smoisVariant.findMany({ where, select: variantSelect, orderBy: q.status === 'SCHEDULED' ? { scheduledAt: 'asc' } : { publishedAt: q.sort === 'oldest' ? 'asc' : 'desc' }, skip: (page - 1) * take, take }),
    prisma.smoisVariant.count({ where }),
  ]);
  const failures = await prisma.smoisPublishAttempt.findMany({
    where: { variantId: { in: rows.map((r) => r.id) }, success: false }, orderBy: { createdAt: 'desc' },
    select: { variantId: true, errorCode: true, errorMessage: true, createdAt: true },
  });
  const lastFailure = new Map<string, (typeof failures)[number]>();
  for (const f of failures) if (!lastFailure.has(f.variantId)) lastFailure.set(f.variantId, f);
  const people = await withPeople(rows);
  return apiResponse.success(res, 'Publishing records.', {
    items: people.map((r) => ({ ...r, lastFailure: lastFailure.get(r.id) ?? null })),
    pagination: { page, total, pages: Math.ceil(total / take) },
  });
});

// GET /approvals?view=queue|mine|feedback|history
export const listApprovals = handle(async (req, res) => {
  const a = access(req);
  const view = String(req.query.view ?? 'queue');
  const settings = await getSettings();
  let where: Prisma.SmoisVariantWhereInput;
  if (view === 'queue') {
    if (!can(a, 'approve') && !can(a, 'viewAll')) fail(403, 'Forbidden. Insufficient permissions.');
    where = { status: { in: ['SUBMITTED', 'RESUBMITTED'] } };
  } else if (view === 'mine') {
    where = { status: { in: ['SUBMITTED', 'RESUBMITTED'] }, OR: [{ creatorId: a.userId }, { submittedById: a.userId }] };
  } else if (view === 'feedback') {
    where = { status: 'REVISION_REQUESTED', OR: [{ creatorId: a.userId }, { submittedById: a.userId }] };
  } else {
    where = { reviews: { some: {} }, ...(can(a, 'viewAll') || can(a, 'approve') ? {} : { OR: [{ creatorId: a.userId }, { submittedById: a.userId }] }) };
  }
  const rows = await prisma.smoisVariant.findMany({
    where, take: 100,
    select: { ...variantSelect, reviews: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, decision: true, comments: true, rejectionReason: true, reviewerId: true, versionReviewed: true, emergencyBypass: true, createdAt: true } } },
    orderBy: view === 'queue' || view === 'mine' ? { submittedAt: 'asc' } : { updatedAt: 'desc' },
  });
  const names = await nameMap(rows.flatMap((r) => r.reviews.map((x) => x.reviewerId)));
  const people = await withPeople(rows);
  const cutoff = Date.now() - settings.approvalReminderHours * 3600_000;
  return apiResponse.success(res, 'Approvals.', people.map((r) => ({
    ...r,
    reviews: r.reviews.map((x) => ({ ...x, reviewerName: names.get(x.reviewerId) ?? null })),
    overdue: !!r.submittedAt && r.submittedAt.getTime() < cutoff && IN_REVIEW.includes(r.status),
    canReview: can(a, 'approve') && (settings.allowSelfApproval || (r.submittedById !== a.userId && r.creatorId !== a.userId)),
  })));
});

// GET /calendar?from&to&accountId&platform&creatorId&categoryId
export const getCalendar = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const from = date(q.from, 'From');
  const to = date(q.to, 'To');
  if (!from || !to) fail(400, 'from and to are required.');
  if (to!.getTime() - from!.getTime() > 100 * 86_400_000) fail(400, 'Choose a range of up to about three months.');
  const dateClause: Prisma.SmoisVariantWhereInput = {
    OR: [
      { scheduledAt: { gte: from!, lte: to! } },
      { scheduledAt: null, plannedAt: { gte: from!, lte: to! } },
      { publishedAt: { gte: from!, lte: to! } },
    ],
  };
  const where: Prisma.SmoisVariantWhereInput = {
    AND: [
      dateClause,
      { status: { notIn: ['ARCHIVED'] } },
      ...(q.accountId ? [{ accountId: q.accountId }] : []),
      ...(q.platform ? [{ account: { platform: q.platform as never } }] : []),
      ...(q.creatorId ? [{ creatorId: q.creatorId }] : []),
      ...(q.categoryId ? [{ content: { categoryId: q.categoryId } }] : []),
    ],
  };
  const rows = await prisma.smoisVariant.findMany({ where, select: variantSelect, take: 1000 });
  const settings = await getSettings();
  const items = rows.map((r) => ({ ...r, at: r.publishedAt ?? r.scheduledAt ?? r.plannedAt }));
  const conflicts = detectConflicts(
    items.filter((i) => i.status !== 'PUBLISHED').map((i) => ({ id: i.id, accountId: i.accountId, status: i.status, caption: i.caption, at: i.scheduledAt ?? i.plannedAt })),
    new Date(), settings.minPostGapMinutes,
  );
  const people = await withPeople(items);
  return apiResponse.success(res, 'Calendar.', { items: people, conflicts, minPostGapMinutes: settings.minPostGapMinutes });
});

// POST /variants/:id/plan { plannedAt }: drag-to-reschedule a draft on the calendar
export const reschedulePlan = handle(async (req, res) => {
  const v = await loadVariant(req.params.id);
  const at = date(req.body?.plannedAt, 'Date');
  if (!at) fail(400, 'Choose a date.');
  const a = access(req);
  if (v.status === 'SCHEDULED') {
    if (!can(a, 'publish')) fail(403, 'You do not have publishing permission.');
  } else if (!(EDITABLE.includes(v.status) || IN_REVIEW.includes(v.status) || v.status === 'APPROVED') || !(await canWorkOn(req, v))) {
    fail(403, 'You cannot reschedule this content.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.smoisVariant.update({ where: { id: v.id }, data: { plannedAt: at, ...(v.status === 'SCHEDULED' ? { scheduledAt: at } : {}) } });
    await smoisAudit(req, { action: 'CONTENT_RESCHEDULED', entity: 'SmoisContent', entityId: v.contentId, before: { plannedAt: v.plannedAt, scheduledAt: v.scheduledAt }, after: { plannedAt: at, variantId: v.id } }, tx);
  });
  return apiResponse.success(res, 'Date updated.');
});
