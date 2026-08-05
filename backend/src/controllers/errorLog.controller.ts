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

// GET /admin/error-logs
export const listErrorLogs = catchAsync(async (req: Request, res: Response) => {
  const {
    platform, source, role, resolved, search, from, to,
    page = '1', limit = '20',
  } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, parseInt(limit));

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform;
  if (source) where.source = source;
  if (role) where.role = role;
  if (resolved !== undefined) where.resolved = resolved === 'true';
  if (search) where.message = { contains: search, mode: 'insensitive' };
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

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
