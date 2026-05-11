import { Response, NextFunction, RequestHandler } from 'express';
import { AuthRequest } from './auth.middleware';
import { apiResponse } from '../utils/apiResponse';

export const requireRole = (...roles: string[]): RequestHandler => {
  return (req, res, next) => {
    const authReq = req as AuthRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      apiResponse.error(res, 'Forbidden. Insufficient permissions.', 403);
      return;
    }
    next();
  };
};
