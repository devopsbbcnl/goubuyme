// Public PWM endpoints (no login): the careers page feed and the pre-boarding portal. Mounted at /api/v1/pwm-public.
// Every route is rate limited by IP; the pre-boarding ones also depend on an unguessable link plus an emailed code.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as rec from '../controllers/pwm/recruitment.controller';
import * as pre from '../controllers/pwm/preboarding.controller';
import { hrFilesFor } from '../middleware/hrFiles.middleware';
import { publicUploadTicket } from '../controllers/upload.controller';

const router = Router();
const limiter = (max: number, windowMin: number) => rateLimit({ windowMs: windowMin * 60_000, max, standardHeaders: true, legacyHeaders: false, message: { status: 'error', message: 'Too many attempts. Please try again later.' } });
// Routes that carry files: the stored files are checked (exists, size, type) after the rate limiter has let the request through.
const publicFiles = hrFilesFor({ publicRoute: true });

router.get('/vacancies',                 limiter(120, 15), rec.publicVacancies);
router.post('/vacancies/:id/apply',      limiter(10, 60), publicFiles, rec.publicApply);
router.post('/preboarding/start',        limiter(6, 30), pre.start);
router.post('/preboarding/verify',       limiter(15, 30), pre.verify);
router.get('/preboarding/form',          limiter(60, 15), pre.getForm);
router.post('/preboarding/submit',       limiter(10, 60), publicFiles, pre.submit);
// A signed upload link for a CV or a new-hire document (no login). Tight limit: it is open to anyone.
router.post('/upload-ticket',            limiter(20, 60), publicUploadTicket);

export default router;
