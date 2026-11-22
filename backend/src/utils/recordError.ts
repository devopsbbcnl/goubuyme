import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from './logger';
import { redactText, redactDeep } from './redact';

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
  // Personal data (phone numbers, emails, tokens, identity numbers) is stripped before anything is stored,
  // written to a log file, or later sent to Anthropic/Telegram for analysis.
  const stack = err instanceof Error ? redactText(err.stack) : undefined;
  const errorMessage = err instanceof Error ? redactText(err.message) : err !== undefined ? redactText(String(err)) : undefined;
  const safeContext = context ? redactDeep(context) : undefined;

  logger.error(redactText(message) as string, { error: errorMessage, stack, ...safeContext });

  void prisma.errorLog
    .create({
      data: {
        platform: 'BACKEND',
        source,
        message: errorMessage ? `${redactText(message)}: ${errorMessage}` : (redactText(message) as string),
        stack,
        context: safeContext as Prisma.InputJsonValue | undefined,
      },
    })
    .then((log) => {
      // Fire-and-forget classification + Telegram escalation. Lazy import breaks
      // the require cycle (errorAnalysis.service imports telegram.service, which
      // imports this file).
      void import('../services/errorAnalysis.service').then((m) => m.analyzeErrorLog(log.id));
    })
    .catch((logErr) => logger.error('Failed to persist ErrorLog', { error: (logErr as Error).message, source }));
};
