import Joi from 'joi';

export const updateAgentSchema = Joi.object({
  mode: Joi.string().valid('OFF', 'SUGGEST', 'AUTO'),
  autoActions: Joi.array().items(Joi.string().max(50)).max(20),
  settings: Joi.object().pattern(Joi.string().max(50), Joi.number()),
}).min(1);

export const rejectSuggestionSchema = Joi.object({
  note: Joi.string().trim().max(500).allow('').optional(),
});
