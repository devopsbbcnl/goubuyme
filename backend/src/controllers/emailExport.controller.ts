import { Response } from 'express';
import { BroadcastAudience } from '@prisma/client';
import prisma from '../config/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { emailExportQuery } from '../validators/broadcast.validator';
import { audienceWhere } from '../services/broadcast.service';

// A spreadsheet opens a cell starting with = + - @ as a formula, so a hostile name could run in
// whoever opens the export. Prefix those with an apostrophe, then apply normal CSV quoting.
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADER = ['email', 'name', 'role', 'business_name', 'city', 'marketing_opt_in'];
const PAGE = 2000;

// GET /admin/exports/emails?audience=&marketingOnly=
// CSV of the email addresses of active accounts in a role, for sending a message from a mail tool.
// Personal data, so it is limited to operations and super admins, and every export is audit-logged.
export const exportEmails = catchAsync(async (req: AuthRequest, res: Response) => {
  const { error, value } = emailExportQuery.validate(req.query);
  if (error) return apiResponse.error(res, 'Choose who to export.', 400);

  const audience = value.audience as BroadcastAudience;
  const marketingOnly = value.marketingOnly as boolean;
  const where = { ...audienceWhere(audience), ...(marketingOnly ? { marketingOptIn: true } : {}) };

  const lines: string[] = [HEADER.join(',')];
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where, orderBy: { id: 'asc' }, take: PAGE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, email: true, role: true, marketingOptIn: true,
        vendor: { select: { businessName: true, city: true } },
        logisticsCompany: { select: { companyName: true, city: true } },
      },
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;
    for (const u of users) {
      lines.push([
        u.email, u.name, u.role,
        u.vendor?.businessName ?? u.logisticsCompany?.companyName ?? '',
        u.vendor?.city ?? u.logisticsCompany?.city ?? '',
        u.marketingOptIn ? 'yes' : 'no',
      ].map(csvCell).join(','));
    }
    if (users.length < PAGE) break;
  }
  const count = lines.length - 1;

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'EMAIL_LIST_EXPORTED',
      entity: 'EmailExport',
      entityId: req.user!.userId,
      meta: { audience, marketingOnly, count },
      ip: req.ip,
    },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gobuyme-${audience.toLowerCase()}-emails-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send('﻿' + lines.join('\r\n'));
});
