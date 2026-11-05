import Joi from 'joi';

const AUDIENCES = ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS', 'USER'];

// The one account to message: required for USER, and meaningless for any other audience.
const targetUserId = Joi.string().guid().when('audience', {
  is: 'USER',
  then: Joi.required(),
  otherwise: Joi.forbidden(),
});

export const sendBroadcastSchema = Joi.object({
  title: Joi.string().trim().min(3).max(80).required(),
  body: Joi.string().trim().min(3).max(500).required(),
  audience: Joi.string().valid(...AUDIENCES).required(),
  targetUserId,
});

export const broadcastAudienceQuery = Joi.object({
  audience: Joi.string().valid(...AUDIENCES).required(),
  targetUserId,
});

export const recipientSearchQuery = Joi.object({
  q: Joi.string().trim().min(2).max(80).required(),
});
