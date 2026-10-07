import Joi from 'joi';
import { CLIENT_EVENTS } from '../services/analytics.service';

// Flat primitive properties only (no nested objects), capped in count and size,
// so a client can't turn the analytics table into a dumping ground.
const propertiesSchema = Joi.object()
  .pattern(
    Joi.string().max(40),
    Joi.alternatives(Joi.string().max(200).allow(''), Joi.number(), Joi.boolean(), Joi.valid(null)),
  )
  .max(20);

export const ingestEventsSchema = Joi.object({
  platform: Joi.string().valid('MOBILE', 'WEB').required(),
  anonymousId: Joi.string().max(64).optional(),
  appVersion: Joi.string().max(50).optional().allow(''),
  events: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().valid(...CLIENT_EVENTS).required(),
        occurredAt: Joi.string().isoDate().optional(),
        sessionId: Joi.string().max(64).optional(),
        screen: Joi.string().max(120).optional(),
        properties: propertiesSchema.optional(),
      }),
    )
    .min(1)
    .max(50)
    .required(),
});

export const analyticsPreferenceSchema = Joi.object({
  analyticsOptIn: Joi.boolean().required(),
});
