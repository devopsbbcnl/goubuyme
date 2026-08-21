import Joi from 'joi';

export const reportErrorSchema = Joi.object({
  platform: Joi.string().valid('MOBILE', 'WEB', 'ADMIN').required(),
  source: Joi.string().max(50).required(),
  message: Joi.string().max(2000).required(),
  stack: Joi.string().max(8000).optional().allow(''),
  context: Joi.object().optional(),
  appVersion: Joi.string().max(50).optional().allow(''),
  deviceInfo: Joi.object().optional(),
  url: Joi.string().max(500).optional().allow(''),
  method: Joi.string().max(10).optional().allow(''),
});

export const resolveErrorLogSchema = Joi.object({
  resolved: Joi.boolean().optional(),
});

export const bulkResolveErrorLogsSchema = Joi.object({
  ids: Joi.array().items(Joi.string()).min(1).max(500).required(),
  resolved: Joi.boolean().optional(),
});
