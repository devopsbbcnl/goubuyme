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

// Either an explicit page-scoped `ids` list, or `all: true` with the same
// filters the list view is currently showing — lets "select all N matching
// errors" resolve/reopen the whole filtered set without shipping thousands
// of ids in the request body.
export const bulkResolveErrorLogsSchema = Joi.object({
  resolved: Joi.boolean().optional(),
  ids: Joi.array().items(Joi.string()).min(1).max(500),
  all: Joi.boolean().valid(true),
  platform: Joi.string().valid('MOBILE', 'WEB', 'ADMIN', 'BACKEND'),
  source: Joi.string().max(50),
  role: Joi.string().max(50),
  search: Joi.string().max(200).allow(''),
  from: Joi.string().isoDate(),
  to: Joi.string().isoDate(),
  filterResolved: Joi.boolean(),
}).xor('ids', 'all');
