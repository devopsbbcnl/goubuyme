import { Request } from 'express';
import jwt from 'jsonwebtoken';

// For public ingest endpoints (error reports, analytics events) that accept traffic
// before login but should attach the caller's identity when a valid token is present.
// An invalid or expired token is treated as anonymous rather than rejected.
export const decodeOptionalUser = (req: Request): { userId?: string; role?: string } => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return {};
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_ACCESS_SECRET as string) as {
      userId: string;
      role: string;
    };
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return {};
  }
};
