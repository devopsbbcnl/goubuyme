// SMOIS media and brand asset library: links to files with metadata, approval, versions, expiry and usage.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import { smoisAudit } from '../../services/smois/audit';
import { assetExpiry } from '../../services/smois/community';
import { can } from '../../services/smois/workflow';
import { access, date, fail, handle, httpUrl, managementUserIds, nameMap, notifyMany, oneOf, reqStr, str, strList } from './common';

const CATEGORIES = ['LOGO', 'BRAND_GUIDELINES', 'COMPANY_PHOTO', 'EXECUTIVE_PHOTO', 'PRODUCT_PHOTO', 'MARKETING_DESIGN', 'VIDEO', 'TEMPLATE', 'CAMPAIGN_ASSET', 'EVENT_PHOTO', 'PRESS_MATERIAL', 'APPROVED_CAPTION', 'CORPORATE_DESCRIPTION', 'OTHER'] as const;
const FILE_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'TEXT', 'OTHER'] as const;

const present = (a: Prisma.SmoisAssetGetPayload<object>, names: Map<string, string>, now = new Date()) => ({
  ...a, uploadedByName: names.get(a.uploadedById) ?? null, approvedByName: a.approvedById ? names.get(a.approvedById) ?? null : null,
  expiry: assetExpiry(a.expiresAt, now),
  /** Whether this can be attached to content right now. */
  usable: a.approvalStatus === 'APPROVED' && assetExpiry(a.expiresAt, now) !== 'EXPIRED' && !a.archivedAt,
});

// GET /assets?category&folder&q&status&expiry=soon|expired&archived=1&page
export const listAssets = handle(async (req, res) => {
  const q = req.query as Record<string, string>;
  const page = Math.max(1, Number(q.page) || 1);
  const take = 40;
  const now = new Date();
  const where: Prisma.SmoisAssetWhereInput = {
    archivedAt: q.archived === '1' ? { not: null } : null,
    ...(q.category ? { category: oneOf(q.category, CATEGORIES, 'Category') } : {}),
    ...(q.folder ? { folder: q.folder } : {}),
    ...(q.status ? { approvalStatus: oneOf(q.status, ['DRAFT', 'APPROVED', 'REJECTED'] as const, 'Status') } : {}),
    ...(q.expiry === 'expired' ? { expiresAt: { lte: now } } : q.expiry === 'soon' ? { expiresAt: { gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) } } : {}),
    ...(q.usable === '1' ? { approvalStatus: 'APPROVED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : {}),
    ...(q.q ? { AND: [{ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { tags: { has: q.q.toLowerCase() } }] }] } : {}),
  };
  const [rows, total, folders] = await Promise.all([
    prisma.smoisAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take }),
    prisma.smoisAsset.count({ where }),
    prisma.smoisAsset.findMany({ where: { archivedAt: null, folder: { not: null } }, distinct: ['folder'], select: { folder: true } }),
  ]);
  const names = await nameMap(rows.flatMap((r) => [r.uploadedById, r.approvedById]));
  return apiResponse.success(res, 'Assets.', { items: rows.map((r) => present(r, names, now)), folders: folders.map((f) => f.folder), pagination: { page, total, pages: Math.ceil(total / take) } });
});

const parseAsset = (b: Record<string, unknown>, partial: boolean) => {
  const data: Prisma.SmoisAssetUncheckedUpdateInput = {};
  const has = (k: string) => k in b;
  if (!partial || has('name')) data.name = reqStr(b.name, 'Name', 140);
  if (!partial || has('url')) data.url = httpUrl(b.url, 'File link') ?? fail(400, 'A file link is required.');
  if (has('description')) data.description = str(b.description, 1000);
  if (has('category')) data.category = oneOf(b.category, CATEGORIES, 'Category');
  if (has('fileType')) data.fileType = oneOf(b.fileType, FILE_TYPES, 'File type');
  if (has('fileSize')) { const n = b.fileSize === '' || b.fileSize === null ? null : Number(b.fileSize); if (n !== null && (!Number.isInteger(n) || n < 0)) fail(400, 'File size must be a whole number of bytes.'); data.fileSize = n; }
  if (has('folder')) data.folder = str(b.folder, 80);
  if (has('tags')) data.tags = strList(b.tags, 15, 40).map((t) => t.toLowerCase());
  if (has('usageRestrictions')) data.usageRestrictions = str(b.usageRestrictions, 500);
  if (has('expiresAt')) { data.expiresAt = date(b.expiresAt, 'Expiry date'); data.expiryNotifiedAt = null; }
  return data;
};

// POST /assets
export const createAsset = handle(async (req, res) => {
  const data = parseAsset((req.body ?? {}) as Record<string, unknown>, false) as Prisma.SmoisAssetUncheckedCreateInput;
  const a = await prisma.smoisAsset.create({ data: { ...data, uploadedById: access(req).userId } });
  await smoisAudit(req, { action: 'ASSET_UPLOADED', entity: 'SmoisAsset', entityId: a.id, after: { name: a.name, category: a.category } });
  return apiResponse.success(res, 'Added to the library. It can be used in content once approved.', present(a, new Map()), 201);
});

// GET /assets/:id: with version history and where it is used
export const getAsset = handle(async (req, res) => {
  const a = await prisma.smoisAsset.findUnique({ where: { id: req.params.id } });
  if (!a) return fail(404, 'Asset not found.');
  // Walk back through the versions this one replaced.
  const history: Prisma.SmoisAssetGetPayload<object>[] = [];
  let prev = a.previousVersionId;
  for (let i = 0; prev && i < 50; i++) { const p = await prisma.smoisAsset.findUnique({ where: { id: prev } }); if (!p) break; history.push(p); prev = p.previousVersionId; }
  const usage = await prisma.$queryRaw<{ id: string; contentId: string; title: string; status: string }[]>(Prisma.sql`
    SELECT v.id, v."contentId", c.title, v.status::text AS status FROM smois_variants v JOIN smois_contents c ON c.id = v."contentId"
    WHERE v."mediaUrls"::text LIKE ${'%' + a.url + '%'} ORDER BY v."updatedAt" DESC LIMIT 25`);
  const names = await nameMap([a.uploadedById, a.approvedById, ...history.flatMap((h) => [h.uploadedById, h.approvedById])]);
  return apiResponse.success(res, 'Asset.', { ...present(a, names), history: history.map((h) => present(h, names)), usage });
});

// PATCH /assets/:id
export const updateAsset = handle(async (req, res) => {
  const a = await prisma.smoisAsset.findUnique({ where: { id: req.params.id } });
  if (!a) return fail(404, 'Asset not found.');
  const me = access(req);
  if (a.uploadedById !== me.userId && me.level !== 'SUPER' && me.level !== 'MANAGEMENT') fail(403, 'Only the uploader or management can edit this asset.');
  const data = parseAsset((req.body ?? {}) as Record<string, unknown>, true);
  // Changing the file itself is a new version, so approved history stays intact.
  if ('url' in data && data.url !== a.url) fail(400, 'To replace the file, add a new version instead.');
  const u = await prisma.smoisAsset.update({ where: { id: a.id }, data });
  await smoisAudit(req, { action: 'ASSET_UPDATED', entity: 'SmoisAsset', entityId: a.id, before: { name: a.name, expiresAt: a.expiresAt, usageRestrictions: a.usageRestrictions }, after: { name: u.name, expiresAt: u.expiresAt, usageRestrictions: u.usageRestrictions } });
  return apiResponse.success(res, 'Saved.', present(u, new Map()));
});

// POST /assets/:id/approve { decision: APPROVED | REJECTED, note? }
export const reviewAsset = handle(async (req, res) => {
  const a = await prisma.smoisAsset.findUnique({ where: { id: req.params.id } });
  if (!a) return fail(404, 'Asset not found.');
  const me = access(req);
  const decision = oneOf(req.body?.decision, ['APPROVED', 'REJECTED'] as const, 'Decision');
  if (a.uploadedById === me.userId) fail(403, 'You cannot approve an asset you uploaded.');
  await prisma.$transaction(async (tx) => {
    await tx.smoisAsset.update({ where: { id: a.id }, data: { approvalStatus: decision, approvedById: me.userId } });
    await smoisAudit(req, { action: decision === 'APPROVED' ? 'ASSET_APPROVED' : 'ASSET_REJECTED', entity: 'SmoisAsset', entityId: a.id, meta: { note: str(req.body?.note, 300), name: a.name } }, tx);
  });
  await notifyMany([a.uploadedById], { title: `Asset ${decision.toLowerCase()}`, body: a.name, data: { link: '/smois/media' }, email: false }, me.userId);
  return apiResponse.success(res, decision === 'APPROVED' ? 'Approved. It can now be used in content.' : 'Rejected.');
});

// POST /assets/:id/version { url, fileSize?, note? }: replaces the file; the old version is kept
export const addVersion = handle(async (req, res) => {
  const old = await prisma.smoisAsset.findUnique({ where: { id: req.params.id } });
  if (!old) return fail(404, 'Asset not found.');
  if (old.archivedAt) fail(409, 'This asset has already been replaced or archived.');
  const url = httpUrl(req.body?.url, 'New file link') ?? fail(400, 'A file link is required.');
  const size = req.body?.fileSize === undefined || req.body?.fileSize === '' ? old.fileSize : Number(req.body.fileSize);
  const created = await prisma.$transaction(async (tx) => {
    await tx.smoisAsset.update({ where: { id: old.id }, data: { archivedAt: new Date() } });
    const n = await tx.smoisAsset.create({ data: { name: old.name, description: old.description, category: old.category, fileType: old.fileType, fileSize: size, url, folder: old.folder, tags: old.tags, version: old.version + 1, previousVersionId: old.id, usageRestrictions: old.usageRestrictions, expiresAt: old.expiresAt, uploadedById: access(req).userId } });
    await smoisAudit(req, { action: 'ASSET_VERSION_ADDED', entity: 'SmoisAsset', entityId: n.id, after: { name: n.name, version: n.version }, meta: { replaces: old.id, note: str(req.body?.note, 300) } }, tx);
    return n;
  });
  return apiResponse.success(res, 'New version added. It needs approval before use.', present(created, new Map()), 201);
});

// POST /assets/:id/archive { restore? }
export const archiveAsset = handle(async (req, res) => {
  const a = await prisma.smoisAsset.findUnique({ where: { id: req.params.id } });
  if (!a) return fail(404, 'Asset not found.');
  const me = access(req);
  if (a.uploadedById !== me.userId && !can(me, 'manageAccounts') && me.level !== 'MANAGEMENT' && me.level !== 'SUPER') fail(403, 'Only the uploader or management can archive this.');
  await prisma.smoisAsset.update({ where: { id: a.id }, data: { archivedAt: req.body?.restore ? null : new Date() } });
  await smoisAudit(req, { action: req.body?.restore ? 'ASSET_RESTORED' : 'ASSET_ARCHIVED', entity: 'SmoisAsset', entityId: a.id, meta: { name: a.name } });
  return apiResponse.success(res, req.body?.restore ? 'Restored.' : 'Archived.');
});

