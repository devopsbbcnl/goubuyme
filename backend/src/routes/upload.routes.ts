import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { uploadLimiter } from '../middleware/rateLimiter.middleware';
import { issueUploadTicket } from '../controllers/upload.controller';

const router = Router();

router.post('/ticket', verifyToken, uploadLimiter, issueUploadTicket);

export default router;
