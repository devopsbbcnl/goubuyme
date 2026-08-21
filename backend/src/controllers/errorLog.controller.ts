import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import logger from '../utils/logger';

// Error reports can arrive before login (e.g. Google Sign-In failures), so the
// ingest endpoint doesn't require a token — but if one is present, attaching the
// user's identity makes the admin dashboard far more useful for support staff.
const decodeUserIfPresent = (req: Request): { userId?: string; role?: string } => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return {};
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET as string) as {
      userId: string;
      role: string;
    };
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return {};
  }
};

// POST /api/v1/errors — public ingest from mobile/web/admin clients
export const reportError = catchAsync(async (req: Request, res: Response) => {
  const { platform, source, message, stack, context, appVersion, deviceInfo, url, method } = req.body;
  const { userId, role } = decodeUserIfPresent(req);

  const log = await prisma.errorLog.create({
    data: { platform, source, message, stack, context, appVersion, deviceInfo, url, method, userId, role },
  });

  logger.warn('Client error reported', { platform, source, message, userId });

  return apiResponse.success(res, 'Error report received.', { id: log.id }, 201);
});

interface ErrorLogFilters {
  platform?: string;
  source?: string;
  role?: string;
  resolved?: boolean;
  search?: string;
  from?: string;
  to?: string;
}

// Shared between the list view and bulk-resolve's "all matching" mode so the
// two can never drift on what a given filter combination actually selects.
const buildErrorLogWhere = (f: ErrorLogFilters): Record<string, unknown> => {
  const where: Record<string, unknown> = {};
  if (f.platform) where.platform = f.platform;
  if (f.source) where.source = f.source;
  if (f.role) where.role = f.role;
  if (f.resolved !== undefined) where.resolved = f.resolved;
  if (f.search) where.message = { contains: f.search, mode: 'insensitive' };
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(f.to ? { lte: new Date(f.to) } : {}),
    };
  }
  return where;
};

// GET /admin/error-logs
export const listErrorLogs = catchAsync(async (req: Request, res: Response) => {
  const {
    platform, source, role, resolved, search, from, to,
    page = '1', limit = '20',
  } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where = buildErrorLogWhere({
    platform, source, role, search, from, to,
    resolved: resolved !== undefined ? resolved === 'true' : undefined,
  });

  const [logs, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.errorLog.count({ where }),
  ]);

  return apiResponse.paginated(res, 'Error logs fetched.', logs, {
    page: pageNum, limit: limitNum, total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /admin/error-logs/:id
export const getErrorLogDetail = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const log = await prisma.errorLog.findUnique({ where: { id } });
  if (!log) return apiResponse.error(res, 'Error log not found.', 404);
  return apiResponse.success(res, 'Error log fetched.', log);
});

// PATCH /admin/error-logs/:id/resolve
export const resolveErrorLog = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const resolved = req.body.resolved ?? true;
  const authReq = req as AuthRequest;

  const log = await prisma.errorLog.update({
    where: { id },
    data: {
      resolved,
      resolvedAt: resolved ? new Date() : null,
      resolvedBy: resolved ? authReq.user?.userId ?? null : null,
    },
  });

  return apiResponse.success(res, resolved ? 'Marked resolved.' : 'Reopened.', log);
});

// PATCH /admin/error-logs/bulk-resolve — batch resolve/reopen, either an explicit
// page-scoped `ids` list, or `all: true` + the list view's current filters to sweep
// every matching row (e.g. "select all 2,983 unresolved errors") without the client
// ever having to fetch and ship every id.
export const bulkResolveErrorLogs = catchAsync(async (req: Request, res: Response) => {
  const {
    ids, all, resolved = true,
    platform, source, role, search, from, to, filterResolved,
  } = req.body as {
    ids?: string[]; all?: boolean; resolved?: boolean;
    platform?: string; source?: string; role?: string; search?: string; from?: string; to?: string;
    filterResolved?: boolean;
  };
  const authReq = req as AuthRequest;

  const where = all
    ? buildErrorLogWhere({ platform, source, role, search, from, to, resolved: filterResolved })
    : { id: { in: ids! } };

  const { count } = await prisma.errorLog.updateMany({
    where,
    data: {
      resolved,
      resolvedAt: resolved ? new Date() : null,
      resolvedBy: resolved ? authReq.user?.userId ?? null : null,
    },
  });

  return apiResponse.success(res, `${count} log(s) ${resolved ? 'resolved' : 'reopened'}.`, { count });
});
