import { Response } from 'express';
import { BroadcastAudience } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { broadcastAudienceQuery } from '../validators/broadcast.validator';
import * as broadcasts from '../services/broadcast.service';

// GET /admin/broadcasts
export const listBroadcasts = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const { rows, pagination } = await broadcasts.list({ page, limit });
  return apiResponse.paginated(res, 'Broadcasts fetched.', rows, pagination);
});

// GET /admin/broadcasts/preview?audience=
export const previewBroadcast = catchAsync(async (req: AuthRequest, res: Response) => {
  const { error, value } = broadcastAudienceQuery.validate(req.query);
  if (error) return apiResponse.error(res, 'Choose an audience.', 400);
  return apiResponse.success(res, 'Audience previewed.', await broadcasts.preview(value.audience as BroadcastAudience));
});

// POST /admin/broadcasts
export const sendBroadcast = catchAsync(async (req: AuthRequest, res: Response) => {
  try {
    const broadcast = await broadcasts.send(req.user!.userId, req.body);
    return apiResponse.success(res, 'Broadcast sent.', broadcast, 201);
  } catch (err) {
    if (err instanceof broadcasts.BroadcastError) return apiResponse.error(res, err.message, err.status);
    throw err;
  }
});
