import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { apiResponse } from '../utils/apiResponse';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return apiResponse.error(res, 'Validation failed.', 422, errors);
    }
    return next();
  };
};
