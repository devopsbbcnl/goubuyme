import { Router } from 'express';
import {
  getMyRiderProfile,
  toggleOnlineStatus,
  getRiderDashboardStats,
  getAvailableJobs,
  acceptJob,
  getActiveDelivery,
  updateDeliveryStatus,
  getRecentDeliveries,
  getRiderEarnings,
  updateLocation,
  getPayoutAccount,
  savePayoutAccount,
  getMyRiderDocument,
  submitRiderDocument,
} from '../controllers/rider.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requireMfa } from '../middleware/mfa.middleware';

const router = Router();

const riderAuth = [verifyToken, requireRole('RIDER')];

router.get('/me',                              ...riderAuth, getMyRiderProfile);
router.patch('/me/online',                     ...riderAuth, toggleOnlineStatus);
router.get('/me/stats',                        ...riderAuth, getRiderDashboardStats);
router.get('/me/available-jobs',               ...riderAuth, getAvailableJobs);
router.post('/me/accept/:orderId',             ...riderAuth, acceptJob);
router.get('/me/active',                       ...riderAuth, getActiveDelivery);
router.patch('/me/orders/:orderId/status',     ...riderAuth, updateDeliveryStatus);
router.get('/me/deliveries',                   ...riderAuth, getRecentDeliveries);
router.get('/me/earnings',                     ...riderAuth, getRiderEarnings);
router.patch('/me/location',                   ...riderAuth, updateLocation);
router.get('/me/payout-account',               ...riderAuth, getPayoutAccount);
router.post('/me/payout-account',              ...riderAuth, requireMfa, savePayoutAccount);
router.get('/me/document',                     ...riderAuth, getMyRiderDocument);
router.post('/me/document',                    ...riderAuth, submitRiderDocument);

export default router;
