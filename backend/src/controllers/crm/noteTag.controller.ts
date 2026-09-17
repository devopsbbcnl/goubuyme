import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { logCrmActivity } from '../../services/crm/activity.service';
import { ProfileNotFoundError, findCrmSubject } from '../../services/crm/profile.service';

const MAX_NOTE_LENGTH = 5000;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const canModerate = (role: string) => role === 'SUPER_ADMIN' || role === 'OPERATIONS_ADMIN';

const noteSelect = {
  id: true, body: true, pinned: true, createdAt: true, updatedAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.CrmNoteSelect;

const subjectOr404 = async (res: Response, userId: string) => {
  try {
    return await findCrmSubject(userId);
  } catch (err) {
    if (err instanceof ProfileNotFoundError) {
      apiResponse.error(res, err.message, 404);
      return null;
    }
    throw err;
  }
};

// ─── Notes ────────────────────────────────────────────────────────────────────

// POST /admin/crm/profiles/:userId/notes  { body, pinned? }
export const createNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const subject = await subjectOr404(res, req.params.userId);
  if (!subject) return;

  const body = String(req.body?.body ?? '').trim();
  if (!body) return apiResponse.error(res, 'Note cannot be empty.', 400);
  if (body.length > MAX_NOTE_LENGTH) return apiResponse.error(res, 'Note is too long.', 400);

  const note = await prisma.crmNote.create({
    data: { subjectUserId: subject.id, authorId: req.user!.userId, body, pinned: req.body?.pinned === true },
    select: noteSelect,
  });
  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId, type: 'NOTE_ADDED',
    title: 'Note added', meta: { noteId: note.id, preview: body.slice(0, 140) },
  });

  return apiResponse.success(res, 'Note added.', note, 201);
});

// PATCH /admin/crm/notes/:noteId  { body?, pinned? }  — author, or ops/super admin
export const updateNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await prisma.crmNote.findUnique({ where: { id: req.params.noteId } });
  if (!note) return apiResponse.error(res, 'Note not found.', 404);
  if (note.authorId !== req.user!.userId && !canModerate(req.user!.role)) {
    return apiResponse.error(res, 'You can only edit your own notes.', 403);
  }

  const data: Prisma.CrmNoteUpdateInput = {};
  if (req.body?.body !== undefined) {
    const body = String(req.body.body).trim();
    if (!body) return apiResponse.error(res, 'Note cannot be empty.', 400);
    if (body.length > MAX_NOTE_LENGTH) return apiResponse.error(res, 'Note is too long.', 400);
    data.body = body;
  }
  if (typeof req.body?.pinned === 'boolean') data.pinned = req.body.pinned;

  const updated = await prisma.crmNote.update({ where: { id: note.id }, data, select: noteSelect });
  return apiResponse.success(res, 'Note updated.', updated);
});

// DELETE /admin/crm/notes/:noteId  — author, or ops/super admin
export const deleteNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await prisma.crmNote.findUnique({ where: { id: req.params.noteId } });
  if (!note) return apiResponse.error(res, 'Note not found.', 404);
  if (note.authorId !== req.user!.userId && !canModerate(req.user!.role)) {
    return apiResponse.error(res, 'You can only delete your own notes.', 403);
  }

  await prisma.crmNote.delete({ where: { id: note.id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_NOTE_DELETED', entity: 'CrmNote', entityId: note.id,
      meta: { subjectUserId: note.subjectUserId } },
  });
  return apiResponse.success(res, 'Note deleted.', { id: note.id });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

// GET /admin/crm/tags
export const listTags = catchAsync(async (_req: Request, res: Response) => {
  const tags = await prisma.crmTag.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, _count: { select: { users: true } } },
  });
  return apiResponse.success(res, 'Tags fetched.', tags.map(({ _count, ...t }) => ({ ...t, userCount: _count.users })));
});

// POST /admin/crm/tags  { name, color? }
export const createTag = catchAsync(async (req: AuthRequest, res: Response) => {
  const name = String(req.body?.name ?? '').trim();
  const color = req.body?.color ? String(req.body.color) : undefined;
  if (!name || name.length > 40) return apiResponse.error(res, 'Tag name must be 1–40 characters.', 400);
  if (color && !HEX_COLOR.test(color)) return apiResponse.error(res, 'Color must be a hex value like #FF521B.', 400);

  const existing = await prisma.crmTag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (existing) return apiResponse.error(res, 'A tag with that name already exists.', 409);

  const tag = await prisma.crmTag.create({ data: { name, color }, select: { id: true, name: true, color: true } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_TAG_CREATED', entity: 'CrmTag', entityId: tag.id, meta: { name } },
  });
  return apiResponse.success(res, 'Tag created.', { ...tag, userCount: 0 }, 201);
});

// DELETE /admin/crm/tags/:tagId
export const deleteTag = catchAsync(async (req: AuthRequest, res: Response) => {
  const tag = await prisma.crmTag.findUnique({ where: { id: req.params.tagId } });
  if (!tag) return apiResponse.error(res, 'Tag not found.', 404);

  await prisma.crmTag.delete({ where: { id: tag.id } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_TAG_DELETED', entity: 'CrmTag', entityId: tag.id, meta: { name: tag.name } },
  });
  return apiResponse.success(res, 'Tag deleted.', { id: tag.id });
});

// POST /admin/crm/profiles/:userId/tags  { tagId }
export const addTagToProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const subject = await subjectOr404(res, req.params.userId);
  if (!subject) return;

  const tag = await prisma.crmTag.findUnique({ where: { id: String(req.body?.tagId ?? '') } });
  if (!tag) return apiResponse.error(res, 'Tag not found.', 404);

  const existing = await prisma.crmUserTag.findUnique({ where: { userId_tagId: { userId: subject.id, tagId: tag.id } } });
  if (existing) return apiResponse.success(res, 'Tag already applied.', tag);

  await prisma.crmUserTag.create({ data: { userId: subject.id, tagId: tag.id, addedById: req.user!.userId } });
  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId, type: 'TAG_ADDED',
    title: `Tagged "${tag.name}"`, meta: { tagId: tag.id, name: tag.name },
  });
  return apiResponse.success(res, 'Tag added.', { id: tag.id, name: tag.name, color: tag.color }, 201);
});

// DELETE /admin/crm/profiles/:userId/tags/:tagId
export const removeTagFromProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const subject = await subjectOr404(res, req.params.userId);
  if (!subject) return;

  const link = await prisma.crmUserTag.findUnique({
    where: { userId_tagId: { userId: subject.id, tagId: req.params.tagId } },
    include: { tag: { select: { name: true } } },
  });
  if (!link) return apiResponse.error(res, 'Tag is not applied to this profile.', 404);

  await prisma.crmUserTag.delete({ where: { userId_tagId: { userId: subject.id, tagId: req.params.tagId } } });
  await logCrmActivity({
    subjectUserId: subject.id, actorId: req.user!.userId, type: 'TAG_REMOVED',
    title: `Removed tag "${link.tag.name}"`, meta: { tagId: req.params.tagId, name: link.tag.name },
  });
  return apiResponse.success(res, 'Tag removed.', { tagId: req.params.tagId });
});
