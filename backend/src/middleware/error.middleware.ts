import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from '../utils/logger';
import { redactText, redactUrl } from '../utils/redact';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  const safeMessage = redactText(err.message) ?? '';
  const safeStack = redactText(err.stack);
  logger.error(safeMessage, { stack: safeStack });

  // Fire-and-forget: a failure to log the error must never mask the original error response.
  // Personal data is stripped first (the query string can carry emails and tokens).
  void prisma.errorLog.create({
    data: {
      platform: 'BACKEND',
      source: 'express',
      message: safeMessage,
      stack: safeStack,
      url: redactUrl(req.originalUrl),
      method: req.method,
    },
  })
    .then((log) => {
      void import('../services/errorAnalysis.service').then((m) => m.analyzeErrorLog(log.id));
    })
    .catch((logErr) => logger.error('Failed to persist ErrorLog', { error: (logErr as Error).message }));

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ status: 'error', message: 'A record with that value already exists.' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ status: 'error', message: 'Record not found.' });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ status: 'error', message: 'Invalid data provided.' });
  }

  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  const message = statusCode < 500 ? err.message : 'Something went wrong. Please try again.';

  return res.status(statusCode).json({ status: 'error', message });
};
