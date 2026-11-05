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
  role: Joi.string().valid('CUSTOMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY').required(),
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
    then: Joi.string().valid('RESTAURANT', 'EMART', 'PHARMACY', 'BAKERY', 'DRINKS', 'BUTCHER', 'GAS').required(),
    otherwise: Joi.forbidden(),
  }),
  address: Joi.when('role', {
    is: Joi.valid('VENDOR', 'RIDER', 'LOGISTICS_COMPANY'),
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  city: Joi.when('role', {
    is: Joi.valid('VENDOR', 'RIDER', 'LOGISTICS_COMPANY'),
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  state: Joi.when('role', {
    is: Joi.valid('VENDOR', 'RIDER', 'LOGISTICS_COMPANY'),
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
  latitude: Joi.when('role', {
    is: Joi.valid('VENDOR', 'RIDER', 'LOGISTICS_COMPANY'),
    then: Joi.number().optional(),
    otherwise: Joi.forbidden(),
  }),
  longitude: Joi.when('role', {
    is: Joi.valid('VENDOR', 'RIDER', 'LOGISTICS_COMPANY'),
    then: Joi.number().optional(),
    otherwise: Joi.forbidden(),
  }),
  companyName: Joi.when('role', {
    is: 'LOGISTICS_COMPANY',
    then: Joi.string().trim().min(2).max(150).required(),
    otherwise: Joi.forbidden(),
  }),
  registrationNumber: Joi.when('role', {
    is: 'LOGISTICS_COMPANY',
    then: Joi.string().trim().max(60).optional().allow(''),
    otherwise: Joi.forbidden(),
  }),
  // Extra locations a vendor adds at signup. The vendor's own address is the main one.
  branches: Joi.when('role', {
    is: 'VENDOR',
    then: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().trim().min(2).max(100).required(),
          address: Joi.string().trim().min(3).max(250).required(),
          city: Joi.string().trim().min(2).max(100).required(),
          state: Joi.string().trim().max(100).optional().allow(''),
          latitude: Joi.number().min(-90).max(90).optional(),
          longitude: Joi.number().min(-180).max(180).optional(),
          phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).optional().allow(''),
        }),
      )
      .max(10)
      .optional(),
    otherwise: Joi.forbidden(),
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
  otp: Joi.string().length(6).required(),
});

export const deleteAccountSchema = Joi.object({
  password: Joi.string().required(),
});

export const sendPhoneOtpSchema = Joi.object({
  // Optional: omit to verify the number already on the account. Format is checked
  // by normalizeNigerianMobile so the user gets a specific error message.
  phone: Joi.string().max(20).optional().allow(''),
});

export const verifyPhoneOtpSchema = Joi.object({
  code: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});
