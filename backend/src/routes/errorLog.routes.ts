import { Router } from 'express';
import { reportError } from '../controllers/errorLog.controller';
import { validate } from '../middleware/validate.middleware';
import { reportErrorSchema } from '../validators/errorLog.validator';

const router = Router();

router.post('/', validate(reportErrorSchema), reportError);

export default router;
