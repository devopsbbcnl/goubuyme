// Shared helpers for the PWM controllers.
import { RequestHandler, Response } from 'express';
import { apiResponse } from '../../utils/apiResponse';
import { HttpError, fail, str, reqStr, oneOf, nameMap } from '../smois/common';
import type { PwmRequest } from '../../middleware/pwm.middleware';
import { PwmAccess } from '../../services/pwm/rules';

export { HttpError, fail, str, reqStr, oneOf, nameMap };

/** Wrap an async handler so HttpError becomes a clean response. */
export const handle = (fn: (req: PwmRequest, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as PwmRequest, res).catch((err) => {
      if (err instanceof HttpError) return apiResponse.error(res, err.message, err.status);
      next(err);
    });
  };

export const access = (req: PwmRequest): PwmAccess => req.pwm!;

/** A calendar date as YYYY-MM-DD, or null when blank. Rejects anything else. */
export const ymd = (v: unknown, label: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) fail(400, `${label} is not a valid date.`);
  return s;
};
export const reqYmd = (v: unknown, label: string): string => {
  const d = ymd(v, label);
  if (!d) fail(400, `${label} is required.`);
  return d as string;
};

export const email = (v: unknown, label: string): string | null => {
  const s = str(v, 200);
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, `${label} is not a valid email address.`);
  return s.toLowerCase();
};

export const int = (v: unknown, label: string, min = 0, max = 100000): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label} must be a whole number between ${min} and ${max}.`);
  return n;
};

export const page = (q: Record<string, unknown>, defaultLimit = 25) => {
  const p = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(q.limit ?? defaultLimit), 10) || defaultLimit));
  return { page: p, limit, skip: (p - 1) * limit };
};

export const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  // Leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
