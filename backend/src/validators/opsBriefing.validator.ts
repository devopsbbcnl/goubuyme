import Joi from 'joi';

export const runOpsBriefingSchema = Joi.object({
  day: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  send: Joi.boolean().optional(),
});
