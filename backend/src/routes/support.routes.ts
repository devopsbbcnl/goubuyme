import { Router, Response } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { apiResponse } from '../utils/apiResponse';
import { sendEmail } from '../services/email.service';
import prisma from '../config/db';

const router = Router();
router.use(verifyToken);

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@gobuyme.shop';

router.post('/contact', catchAsync(async (req: AuthRequest, res: Response) => {
  const { topic, message } = req.body;
  if (!message?.trim()) return apiResponse.error(res, 'Message is required.', 400);

  const user = req.user!;
  
  // Fetch user email from database
  const userRecord = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { email: true }
  });
  
  const userEmail = userRecord?.email || 'unknown';

  await sendEmail(
    SUPPORT_EMAIL,
    `[Support] ${topic || 'General'} — ${userEmail}`,
    `<p><strong>From:</strong> ${userEmail} (ID: ${user.userId})</p>
     <p><strong>Topic:</strong> ${topic || 'General'}</p>
     <p><strong>Message:</strong></p>
     <p style="white-space:pre-wrap">${message.trim()}</p>`,
  );

  return apiResponse.success(res, 'Support message received.');
}));

export default router;
