import Joi from 'joi';

const AUDIENCES = ['ALL', 'CUSTOMERS', 'VENDORS', 'RIDERS'];

export const sendBroadcastSchema = Joi.object({
  title: Joi.string().trim().min(3).max(80).required(),
  body: Joi.string().trim().min(3).max(500).required(),
  audience: Joi.string().valid(...AUDIENCES).required(),
});

export const broadcastAudienceQuery = Joi.object({
  audience: Joi.string().valid(...AUDIENCES).required(),
});
