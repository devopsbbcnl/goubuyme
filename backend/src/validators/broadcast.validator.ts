import Joi from 'joi';

const AUDIENCES = ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'LOGISTICS_COMPANIES', 'USER'];

// The one account to message: required for USER, and meaningless for any other audience.
const targetUserId = Joi.string().guid().when('audience', {
  is: 'USER',
  then: Joi.required(),
  otherwise: Joi.forbidden(),
});

export const sendBroadcastSchema = Joi.object({
  title: Joi.string().trim().min(3).max(80).required(),
  // May be empty on an email-only send (the email message stands in); the service enforces the rest.
  body: Joi.string().trim().allow('').max(500).default(''),
  audience: Joi.string().valid(...AUDIENCES).required(),
  targetUserId,
  // Where it goes: in-app + push (default) and/or email.
  sendInApp: Joi.boolean().default(true),
  sendEmail: Joi.boolean().default(false),
  emailType: Joi.when('sendEmail', {
    is: true,
    then: Joi.string().valid('SERVICE', 'PROMOTIONAL').required(),
    otherwise: Joi.forbidden(),
  }),
  // Longer text for the email; the 500-character body is the fallback.
  emailBody: Joi.when('sendEmail', {
    is: true,
    then: Joi.string().trim().min(3).max(3000).optional().allow(''),
    otherwise: Joi.forbidden(),
  }),
});

export const broadcastAudienceQuery = Joi.object({
  audience: Joi.string().valid(...AUDIENCES).required(),
  targetUserId,
});

export const recipientSearchQuery = Joi.object({
  q: Joi.string().trim().min(2).max(80).required(),
});

// Email list export: a whole role (or everyone), never a single user.
export const emailExportQuery = Joi.object({
  audience: Joi.string().valid('ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'LOGISTICS_COMPANIES').required(),
  marketingOnly: Joi.boolean().default(false),
});
