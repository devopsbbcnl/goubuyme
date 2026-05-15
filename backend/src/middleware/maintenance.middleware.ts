import { RequestHandler } from 'express';
import { apiResponse } from '../utils/apiResponse';
import { getPlatformSettings } from '../services/settings.service';

const ADMIN_PREFIX = '/api/v1/admin';
const AUTH_PREFIX = '/api/v1/auth';

export const maintenanceGuard: RequestHandler = async (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith(ADMIN_PREFIX) || req.path.startsWith(AUTH_PREFIX)) {
    return next();
  }

  try {
    const settings = await getPlatformSettings();
    if (!settings.maintenanceMode) return next();

    return apiResponse.error(
      res,
      'GoBuyMe is temporarily down for maintenance. Please try again shortly.',
      503,
    );
  } catch (err) {
    return next(err);
  }
};
