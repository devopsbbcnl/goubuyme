import { Router } from 'express';
import Joi from 'joi';
import { setupMfa, verifyMfaSetup, disableMfa, getMfaStatus } from '../controllers/mfa.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const mfaTokenSchema = Joi.object({
  token: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

const router = Router();

router.get('/status',        verifyToken, getMfaStatus);
router.post('/setup',        verifyToken, setupMfa);
router.post('/verify-setup', verifyToken, validate(mfaTokenSchema), verifyMfaSetup);
router.delete('/disable',    verifyToken, validate(mfaTokenSchema), disableMfa);

export default router;
