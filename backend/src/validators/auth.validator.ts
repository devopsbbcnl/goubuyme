import Joi from 'joi';

const strongPassword = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'symbol')
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters.',
    'string.pattern.name': 'Password must include at least one {#name}.',
  });

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).optional().allow(''),
  password: strongPassword,
  role: Joi.string().valid('CUSTOMER', 'VENDOR', 'RIDER').required(),
  referralCode: Joi.string().optional(),
  commissionTier: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().valid('TIER_1', 'TIER_2').required(),
    otherwise: Joi.forbidden(),
  }),
  businessName: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().min(2).max(150).required(),
    otherwise: Joi.forbidden(),
  }),
  category: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().valid('RESTAURANT', 'GROCERY', 'PHARMACY', 'ERRAND').required(),
    otherwise: Joi.forbidden(),
  }),
  address: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  city: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  state: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.string().required(),
    otherwise: Joi.optional().allow(''),
  }),
  vehicleType: Joi.when('role', {
    is: 'RIDER',
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  plateNumber: Joi.when('role', {
    is: 'RIDER',
    then: Joi.string().min(1).required(),
    otherwise: Joi.forbidden(),
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const googleAuthSchema = Joi.object({
  idToken: Joi.string().required(),
  role: Joi.string().valid('CUSTOMER', 'VENDOR', 'RIDER').optional(),
  referralCode: Joi.string().optional(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const verifyOtpSchema = Joi.object({
  userId: Joi.string().required(),
  otp: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

export const resendOtpSchema = Joi.object({
  userId: Joi.string().required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
