import { Router } from 'express';
import {
  getDashboardStats,
  getAdminVendors, updateVendorStatus, updateVendorTier, adminCreateVendor,
  adminCreateRider,
  getVendorDetail, updateVendorDocumentStatus,
  updateVendorBusinessVerifStatus, updateVendorLicenseStatus,
  getAdminRiders, updateRiderStatus, updateRiderDocumentStatus,
  getAdminCustomers,
  getAdminOrders,
  getAuditLogs,
  getAdminPayouts,
  processManualPayout,
  triggerPayoutBatch,
  listAdminUsers,
  createAdminUser,
  updateAdminRole,
  deactivateAdminUser,
} from '../controllers/admin.controller';
import { createOffer, updateOffer } from '../controllers/offer.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All three admin roles can read; only ops+ can write; only super admin handles payouts/offers/admin-users.
const superAdminAuth = [verifyToken, requireRole('SUPER_ADMIN')];
const opsAuth        = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN')];
const readAuth       = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN')];

// Dashboard
router.get('/dashboard', ...readAuth, getDashboardStats);

// Vendors
router.get('/vendors',                                          ...readAuth,       getAdminVendors);
router.post('/vendors/create',                                  ...opsAuth,        adminCreateVendor);
router.get('/vendors/:id',                                      ...readAuth,       getVendorDetail);
router.patch('/vendors/:id/status',                             ...opsAuth,        updateVendorStatus);
router.patch('/vendors/:id/tier',                               ...superAdminAuth, updateVendorTier);
router.patch('/vendors/:id/document/status',                    ...opsAuth,        updateVendorDocumentStatus);
router.patch('/vendors/:id/business-verification/status',       ...opsAuth,        updateVendorBusinessVerifStatus);
router.patch('/vendors/:id/licenses/:licenseId/status',         ...opsAuth,        updateVendorLicenseStatus);

// Riders
router.get('/riders',                        ...readAuth, getAdminRiders);
router.post('/riders/create',                ...opsAuth,  adminCreateRider);
router.patch('/riders/:id/status',           ...opsAuth,  updateRiderStatus);
router.patch('/riders/:id/document/status',  ...opsAuth,  updateRiderDocumentStatus);

// Customers & Orders
router.get('/customers', ...readAuth, getAdminCustomers);
router.get('/orders',    ...readAuth, getAdminOrders);

// Audit logs
router.get('/audit', ...readAuth, getAuditLogs);

// Payouts — super admin only
router.get('/payouts',            ...superAdminAuth, getAdminPayouts);
router.patch('/payouts/:id/pay',  ...superAdminAuth, processManualPayout);
router.post('/payouts/run-batch', ...superAdminAuth, triggerPayoutBatch);

// Offers — super admin only
router.post('/offers',    ...superAdminAuth, createOffer);
router.patch('/offers/:id', ...superAdminAuth, updateOffer);

// Admin user management — super admin only
router.get('/admins',            ...superAdminAuth, listAdminUsers);
router.post('/admins',           ...superAdminAuth, createAdminUser);
router.patch('/admins/:id/role', ...superAdminAuth, updateAdminRole);
router.delete('/admins/:id',     ...superAdminAuth, deactivateAdminUser);

export default router;
