import { Router } from 'express';
import {
  getDashboardStats,
  getAdminVendors, updateVendorStatus, updateVendorTier,
  getVendorDetail, updateVendorDocumentStatus,
  updateVendorBusinessVerifStatus, updateVendorLicenseStatus,
  getAdminRiders, updateRiderStatus, updateRiderDocumentStatus,
  getAdminCustomers,
  getAdminOrders,
  getAuditLogs,
  getAdminPayouts,
  processManualPayout,
  triggerPayoutBatch,
} from '../controllers/admin.controller';
import { createOffer, updateOffer } from '../controllers/offer.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

const adminAuth = [verifyToken, requireRole('SUPER_ADMIN')];

router.get('/dashboard',             ...adminAuth, getDashboardStats);
router.get('/vendors',                          ...adminAuth, getAdminVendors);
router.get('/vendors/:id',                      ...adminAuth, getVendorDetail);
router.patch('/vendors/:id/status',             ...adminAuth, updateVendorStatus);
router.patch('/vendors/:id/tier',               ...adminAuth, updateVendorTier);
router.patch('/vendors/:id/document/status',                    ...adminAuth, updateVendorDocumentStatus);
router.patch('/vendors/:id/business-verification/status',       ...adminAuth, updateVendorBusinessVerifStatus);
router.patch('/vendors/:id/licenses/:licenseId/status',         ...adminAuth, updateVendorLicenseStatus);
router.get('/riders',                ...adminAuth, getAdminRiders);
router.patch('/riders/:id/status',   ...adminAuth, updateRiderStatus);
router.patch('/riders/:id/document/status',  ...adminAuth, updateRiderDocumentStatus);
router.get('/customers',             ...adminAuth, getAdminCustomers);
router.get('/orders',                ...adminAuth, getAdminOrders);
router.get('/audit',                 ...adminAuth, getAuditLogs);
router.get('/payouts',               ...adminAuth, getAdminPayouts);
router.patch('/payouts/:id/pay',     ...adminAuth, processManualPayout);
router.post('/payouts/run-batch',    ...adminAuth, triggerPayoutBatch);
router.post('/offers',               ...adminAuth, createOffer);
router.patch('/offers/:id',          ...adminAuth, updateOffer);

export default router;
