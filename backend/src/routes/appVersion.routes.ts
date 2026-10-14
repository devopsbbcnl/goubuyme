import { Router } from 'express';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { versionPolicy } from '../services/appVersion.service';

const router = Router();

// Public and read-only: a phone that is too old cannot be expected to sign in
// first, so the gate has to be answerable without a token.
router.get('/', catchAsync(async (req, res) => {
  const platform = req.query.platform === 'ios' ? 'ios' : 'android';
  return apiResponse.success(res, 'App version policy.', await versionPolicy(platform));
}));

export default router;
