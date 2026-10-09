import { Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { lagosYesterday, runOpsBriefing } from '../services/opsBriefing.service';

// GET /admin/ops-briefings — recent briefings, newest first
export const listOpsBriefings = catchAsync(async (_req: AuthRequest, res: Response) => {
  const briefings = await prisma.opsBriefing.findMany({
    orderBy: { day: 'desc' },
    take: 30,
    select: {
      id: true, day: true, analyzedBy: true, model: true, summary: true, flags: true,
      html: true, sentAt: true, sendError: true, createdAt: true, updatedAt: true,
    },
  });
  return apiResponse.success(res, 'Ops briefings fetched.', briefings);
});

// POST /admin/ops-briefings/run — regenerate a day's briefing; optionally send it to Telegram
export const runOpsBriefingNow = catchAsync(async (req: AuthRequest, res: Response) => {
  const { day, send } = req.body as { day?: string; send?: boolean };
  const result = await runOpsBriefing({ day: day ?? lagosYesterday(), send: Boolean(send), force: true });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: send ? 'OPS_BRIEFING_SENT' : 'OPS_BRIEFING_PREVIEWED',
      entity: 'OpsBriefing',
      entityId: result.day,
      meta: { analyzedBy: result.analyzedBy, sent: result.sent },
      ip: req.ip ?? null,
    },
  });

  const message = !send
    ? 'Briefing generated (not sent).'
    : result.sent ? 'Briefing sent to Telegram.' : 'Briefing generated, but sending to Telegram failed. Check the Telegram settings.';
  return apiResponse.success(res, message, result);
});
