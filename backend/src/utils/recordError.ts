import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from './logger';

// Mirrors what error.middleware.ts does for errors that reach Express: log to winston
// AND persist an ErrorLog row so it shows up in the admin dashboard. This is for
// failures caught locally (cron jobs, sockets, webhooks, fire-and-forget calls) that
// would otherwise never reach the Express error handler and would only ever be visible
// by SSHing into the VPS and grepping the winston log file.
//
// Never throws — a failure to persist the log must not break the caller.
export const recordError = (
  source: string,
  message: string,
  err?: unknown,
  context?: Record<string, unknown>,
): void => {
  const stack = err instanceof Error ? err.stack : undefined;
  const errorMessage = err instanceof Error ? err.message : err !== undefined ? String(err) : undefined;

  logger.error(message, { error: errorMessage, stack, ...context });

  void prisma.errorLog
    .create({
      data: {
        platform: 'BACKEND',
        source,
        message: errorMessage ? `${message}: ${errorMessage}` : message,
        stack,
        context: context as Prisma.InputJsonValue | undefined,
      },
    })
    .catch((logErr) => logger.error('Failed to persist ErrorLog', { error: (logErr as Error).message, source }));
};
