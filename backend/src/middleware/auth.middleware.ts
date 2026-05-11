import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { apiResponse } from '../utils/apiResponse';

export interface AuthRequest extends Request {
  user?: { userId: string; role: string };
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
