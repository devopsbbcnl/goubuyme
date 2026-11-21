import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { apiResponse } from '../utils/apiResponse';

export interface AuthRequest extends Request {
  user?: { userId: string; role: string };
  /** Set by vendorContext: the vendor location (main or branch) this request acts on. */
  vendorId?: string;
  /** Set by vendorContext when the caller is a branch manager (a login limited to one branch). */
  isBranchManager?: boolean;
}

export const verifyToken: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    apiResponse.error(res, 'No token provided.', 401);
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET as string) as {
      userId: string;
      role: string;
    };
    (req as AuthRequest).user = decoded;
    next();
  } catch {
    apiResponse.error(res, 'Invalid or expired token.', 401);
  }
};

/**
 * Like verifyToken, but never rejects: a valid bearer token sets req.user, anything else just
 * continues as a guest. For public routes that behave differently for known users (e.g. the
 * review-only demo vendor).
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      (req as AuthRequest).user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET as string) as {
        userId: string;
        role: string;
      };
    } catch {
      /* invalid or expired: treat as a guest */
    }
  }
  next();
};
