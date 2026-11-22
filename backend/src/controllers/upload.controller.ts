import { Request, Response } from 'express';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolvePwmAccess } from '../middleware/pwm.middleware';
import { createUploadTicket, StorageNotConfiguredError, UploadNotAllowedError } from '../services/objectStorage.service';
import { recordError } from '../utils/recordError';

const MY_HR_ROLES = ['STAFF', 'SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'];

/** Same people who can use HR screens: PWM team members, or anyone with a current employee record (My HR). */
async function hasHrAccess(userId: string, role: string): Promise<boolean> {
  if (await resolvePwmAccess(userId, role)) return true;
  if (!MY_HR_ROLES.includes(role)) return false;
  const emp = await prisma.pwmEmployee.findUnique({ where: { userId }, select: { status: true } });
  return !!emp && !['RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(emp.status);
}

function failure(res: Response, err: unknown, purpose: string) {
  if (err instanceof UploadNotAllowedError) return apiResponse.error(res, err.message, 403);
  if (err instanceof StorageNotConfiguredError) {
    recordError('uploads', 'Upload requested but file storage is not configured', err, { purpose });
    return apiResponse.error(res, 'Uploads are not available right now. Please try again later.', 503);
  }
  throw err;
}

/**
 * POST /uploads/ticket { purpose, contentType }
 * Returns a short-lived signed link for uploading exactly one new file to our own storage. The app then PUTs the file
 * to `uploadUrl` with the given headers and sends `reference` back to the API when it saves the record.
 * purpose: kyc | avatar | logo | cover | menu | promo | media | hr. Who may use which is decided in objectStorage.service;
 * `hr` (contracts, certificates, receipts, CVs) additionally needs HR access: a PWM member, or someone with an employee record.
 */
export const issueUploadTicket = catchAsync(async (req: AuthRequest, res: Response) => {
  const { purpose, contentType } = req.body as { purpose?: string; contentType?: string };
  if (!purpose || !contentType) return apiResponse.error(res, 'purpose and contentType are required.', 400);

  try {
    if (purpose === 'hr' && !(await hasHrAccess(req.user!.userId, req.user!.role))) {
      return apiResponse.error(res, 'Your account cannot upload HR documents.', 403);
    }
    const ticket = await createUploadTicket({ purpose, contentType, userId: req.user!.userId, role: req.user!.role });
    res.setHeader('Cache-Control', 'no-store');
    return apiResponse.success(res, 'Upload ticket issued.', ticket);
  } catch (err) {
    return failure(res, err, purpose);
  }
});

/**
 * POST /pwm-public/upload-ticket { contentType }  (no login)
 * For a CV on the careers page or a document in the pre-boarding portal. The file goes to the private HR folder under
 * `hr/public/` and is only ever shown to HR staff through short-lived links. Strictly rate limited by the route.
 */
export const publicUploadTicket = catchAsync(async (req: Request, res: Response) => {
  const { contentType } = req.body as { contentType?: string };
  if (!contentType) return apiResponse.error(res, 'contentType is required.', 400);
  try {
    const ticket = await createUploadTicket({ purpose: 'hrpublic', contentType, userId: 'public', role: 'PUBLIC', allowInternal: true });
    res.setHeader('Cache-Control', 'no-store');
    return apiResponse.success(res, 'Upload ticket issued.', ticket);
  } catch (err) {
    return failure(res, err, 'hrpublic');
  }
});
