import { Router } from 'express';
import {
  register, login, refresh, logout,
  getMe, updateProfile, forgotPassword, resetPassword, changePassword,
  verifyOtp, resendOtp, activationStatus,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { verifyToken } from '../middleware/auth.middleware';
import { requireMfa } from '../middleware/mfa.middleware';
import { authLimiter } from '../middleware/rateLimiter.middleware';
import {
  registerSchema, loginSchema, forgotPasswordSchema,
  resetPasswordSchema, refreshTokenSchema, verifyOtpSchema, resendOtpSchema,
  changePasswordSchema,
} from '../validators/auth.validator';
import mfaRoutes from './mfa.routes';

const router = Router();

router.use('/mfa', mfaRoutes);

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);
router.post('/resend-otp', authLimiter, validate(resendOtpSchema), resendOtp);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, getMe);
router.get('/activation-status', verifyToken, activationStatus);
router.patch('/profile', verifyToken, updateProfile);
router.patch('/change-password', verifyToken, requireMfa, validate(changePasswordSchema), changePassword);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

export default router;
