// Lead finder (staff only). Routes under /api/v1/admin/crm/prospecting.
import { Request, Response } from 'express';
import { Prisma, ProspectStatus } from '@prisma/client';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { LeadError, phoneKey } from '../../services/crm/lead.service';
import { interpretQuery } from '../../services/crm/prospecting/rules';
import {
  addToPipeline, createSearch, finderStatus, outreachFor, rewriteDrafts, runInBackground, startRun, updateSearch,
} from '../../services/crm/prospecting/prospecting.service';

const guard = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof LeadError) return apiResponse.error(res, err.message, err.status);
      throw err;
    }
  });

const PAGE_SIZE = 50;

// GET /prospecting/status
export const getFinderStatus = catchAsync(async (_req: Request, res: Response) =>
  apiResponse.success(res, 'Status fetched.', await finderStatus()));

// POST /prospecting/interpret  { query }  — what the rules understand, shown before a search is run
export const interpret = catchAsync(async (req: Request, res: Response) =>
  apiResponse.success(res, 'Interpreted.', interpretQuery(String(req.body?.query ?? '').slice(0, 200))));

// GET /prospecting/searches
export const listSearches = catchAsync(async (_req: Request, res: Response) => {
  const searches = await prisma.prospectSearch.findMany({
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { prospects: { where: { status: 'NEW', existingVendorId: null } } } } },
  });
  return apiResponse.success(res, 'Searches fetched.', searches.map(({ runs, _count, ...s }) => ({ ...s, lastRun: runs[0] ?? null, newProspects: _count.prospects })));
});

// POST /prospecting/searches  { query, category?, city?, area?, minRating?, minReviews?, maxResults?, schedule?, autoAddMinScore? }
export const createSearchAndRun = guard(async (req, res) => {
  const search = await createSearch(req.body ?? {}, req.user!.userId);
  try {
    const run = await startRun(search.id);
    runInBackground(run.id);
    return apiResponse.success(res, 'Search started.', { search, run }, 201);
  } catch (err) {
    // A search that could not even start is not worth keeping as a saved search.
    await prisma.prospectSearch.delete({ where: { id: search.id } }).catch(() => undefined);
    throw err;
  }
});

// PATCH /prospecting/searches/:id  { schedule?, autoAddMinScore?, maxResults? }
export const patchSearch = guard(async (req, res) =>
  apiResponse.success(res, 'Search updated.', await updateSearch(req.params.id, req.body ?? {})));

// DELETE /prospecting/searches/:id  — prospects it found are kept
export const deleteSearch = catchAsync(async (req: Request, res: Response) => {
  const deleted = await prisma.prospectSearch.deleteMany({ where: { id: req.params.id } });
  if (deleted.count === 0) return apiResponse.error(res, 'Search not found.', 404);
  return apiResponse.success(res, 'Search deleted.', { id: req.params.id });
});

// POST /prospecting/searches/:id/run
export const runSearch = guard(async (req, res) => {
  const run = await startRun(req.params.id);
  runInBackground(run.id);
  return apiResponse.success(res, 'Search started.', run, 201);
});

// GET /prospecting/runs/:id
export const getRun = catchAsync(async (req: Request, res: Response) => {
  const run = await prisma.prospectRun.findUnique({ where: { id: req.params.id } });
  if (!run) return apiResponse.error(res, 'Run not found.', 404);
  return apiResponse.success(res, 'Run fetched.', run);
});

// GET /prospecting/prospects?view=NEW|ADDED|DISMISSED|WITH_US&searchId=&minScore=&search=&page=
export const listProspects = catchAsync(async (req: Request, res: Response) => {
  const { view = 'NEW', searchId, minScore, search, page } = req.query as Record<string, string>;
  const and: Prisma.ProspectWhereInput[] = [];
  if (view === 'WITH_US') and.push({ existingVendorId: { not: null } });
  else if ((['NEW', 'ADDED', 'DISMISSED'] as string[]).includes(view)) and.push({ status: view as ProspectStatus, existingVendorId: null });
  if (searchId) and.push({ searchId });
  const min = parseInt(minScore ?? '', 10);
  if (Number.isFinite(min) && min > 0) and.push({ fitScore: { gte: min } });
  if (search?.trim()) {
    const q = search.trim();
    const key = phoneKey(q);
    and.push({ OR: [
      { name: { contains: q, mode: 'insensitive' } }, { area: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(key ? [{ phoneKey: key }] : []),
    ] });
  }
  const pageNo = Math.max(1, parseInt(page ?? '1', 10) || 1);
  const where = { AND: and };
  const [items, total] = await Promise.all([
    prisma.prospect.findMany({
      where, orderBy: [{ fitScore: 'desc' }, { reviewCount: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (pageNo - 1) * PAGE_SIZE, take: PAGE_SIZE,
    }),
    prisma.prospect.count({ where }),
  ]);
  return apiResponse.success(res, 'Prospects fetched.', { items, total, page: pageNo, pageSize: PAGE_SIZE });
});

// POST /prospecting/prospects/add  { ids: string[] }
export const addProspects = guard(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((i): i is string => typeof i === 'string') : [];
  if (ids.length === 0) return apiResponse.error(res, 'Choose at least one business.', 400);
  if (ids.length > 200) return apiResponse.error(res, 'Add at most 200 at a time.', 400);
  const result = await addToPipeline(ids, req.user!.userId);
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: 'CRM_PROSPECTS_ADDED', entity: 'Lead', entityId: req.user!.userId, meta: { added: result.added, skipped: result.skipped.length } },
  });
  return apiResponse.success(res, `Added ${result.added} to the pipeline.`, result);
});

// PATCH /prospecting/prospects/:id  { status: 'DISMISSED' | 'NEW' }
export const setProspectStatus = catchAsync(async (req: Request, res: Response) => {
  const status = req.body?.status as ProspectStatus;
  if (status !== 'DISMISSED' && status !== 'NEW') return apiResponse.error(res, 'Status must be DISMISSED or NEW.', 400);
  const updated = await prisma.prospect.updateMany({
    where: { id: req.params.id, status: status === 'DISMISSED' ? 'NEW' : 'DISMISSED', leadId: null }, data: { status },
  });
  if (updated.count === 0) return apiResponse.error(res, 'That business cannot be changed (it may already be in the pipeline).', 409);
  return apiResponse.success(res, status === 'DISMISSED' ? 'Dismissed.' : 'Restored.', { id: req.params.id, status });
});

// GET /prospecting/prospects/:id/outreach
export const getOutreach = catchAsync(async (req: AuthRequest, res: Response) => {
  const prospect = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!prospect) return apiResponse.error(res, 'Prospect not found.', 404);
  return apiResponse.success(res, 'Messages fetched.', await outreachFor(prospect, req.user!.userId));
});

// POST /prospecting/prospects/:id/outreach/rewrite
export const rewriteOutreach = guard(async (req, res) =>
  apiResponse.success(res, 'Messages rewritten.', await rewriteDrafts(req.params.id, req.user!.userId)));
