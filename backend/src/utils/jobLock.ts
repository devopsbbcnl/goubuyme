import { Prisma } from '@prisma/client';
import prisma from '../config/db';

/**
 * Claims a one-off run of a scheduled job (e.g. "task-digest:2026-09-17"). Returns true for
 * exactly one caller across all PM2 workers; everyone else gets false and should skip.
 */
export const claimJobRun = async (key: string): Promise<boolean> => {
  try {
    await prisma.jobLock.create({ data: { key } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
};

/** Calendar date in Lagos time, for daily job keys. */
export const lagosDateKey = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
