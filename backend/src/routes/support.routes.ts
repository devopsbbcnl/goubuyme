import { Router, Response } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { apiResponse } from '../utils/apiResponse';
import { sendEmail } from '../services/email.service';

const router = Router();
router.use(verifyToken);

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@gobuyme.shop';

router.post('/contact', catchAsync(async (req: AuthRequest, res: Response) => {
  const { topic, message } = req.body;
  if (!message?.trim()) return apiResponse.error(res, 'Message is required.', 400);

  const user = req.user!;

  await sendEmail(
    SUPPORT_EMAIL,
    `[Support] ${topic || 'General'} — ${user.email}`,
    `<p><strong>From:</strong> ${user.email} (ID: ${user.userId})</p>
     <p><strong>Topic:</strong> ${topic || 'General'}</p>
     <p><strong>Message:</strong></p>
     <p style="white-space:pre-wrap">${message.trim()}</p>`,
  );

  return apiResponse.success(res, 'Support message received.');
}));

export default router;
