import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });

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
