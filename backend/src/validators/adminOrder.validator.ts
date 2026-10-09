import Joi from 'joi';

export const adminCancelOrderSchema = Joi.object({
  reason: Joi.string().trim().min(5).max(500).required(),
});

export const adminAssignRiderSchema = Joi.object({
  riderId: Joi.string().required(),
  note: Joi.string().trim().max(500).optional().allow(''),
});

export const adminUnassignRiderSchema = Joi.object({
  note: Joi.string().trim().max(500).optional().allow(''),
});

export const adminOrderCreditSchema = Joi.object({
  amount: Joi.number().positive().max(1_000_000).precision(2).required(),
  note: Joi.string().trim().min(5).max(500).required(),
});