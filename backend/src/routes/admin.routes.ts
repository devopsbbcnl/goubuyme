import { Router } from 'express';
import {
  getDashboardStats,
  getAdminSettings,
  updateAdminSettings,
  getAdminVendors, updateVendorStatus, updateVendorTier, adminCreateVendor,
  adminCreateRider,
  getVendorDetail, updateVendorDocumentStatus,
  updateVendorBusinessVerifStatus, updateVendorLicenseStatus,
  deleteVendor,
  getAdminRiders, getAdminRiderDetail, updateRiderStatus, updateRiderDocumentStatus,
  getAdminCustomers,
  getCustomerAddresses,
  deleteCustomer,
  getAdminOrders,
  getAdminOrderDetail,
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
import {
  getPricingProfiles,
  getPricingProfile,
  createPricingProfile,
  updatePricingProfile,
  deletePricingProfile,
  createPricingBucket,
  updatePricingBucket,
  deletePricingBucket,
  createPricingModifier,
  updatePricingModifier,
  deletePricingModifier,
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getSurgeEvents,
  createSurgeEvent,
  updateSurgeEvent,
  deleteSurgeEvent,
  simulatePricing,
} from '../controllers/pricing.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All three admin roles can read; only ops+ can write; only super admin handles payouts/offers/admin-users.
const superAdminAuth = [verifyToken, requireRole('SUPER_ADMIN')];
const opsAuth        = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN')];
const readAuth       = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN')];

// Dashboard
router.get('/dashboard', ...readAuth, getDashboardStats);
router.get('/settings', ...readAuth, getAdminSettings);
router.patch('/settings', ...superAdminAuth, updateAdminSettings);

// Vendors
router.get('/vendors',                                          ...readAuth,       getAdminVendors);
router.post('/vendors/create',                                  ...opsAuth,        adminCreateVendor);
router.get('/vendors/:id',                                      ...readAuth,       getVendorDetail);
router.patch('/vendors/:id/status',                             ...opsAuth,        updateVendorStatus);
router.patch('/vendors/:id/tier',                               ...superAdminAuth, updateVendorTier);
router.patch('/vendors/:id/document/status',                    ...opsAuth,        updateVendorDocumentStatus);
router.patch('/vendors/:id/business-verification/status',       ...opsAuth,        updateVendorBusinessVerifStatus);
router.patch('/vendors/:id/licenses/:licenseId/status',         ...opsAuth,        updateVendorLicenseStatus);
router.delete('/vendors/:id',                                   ...superAdminAuth, deleteVendor);

// Riders
router.get('/riders',                        ...readAuth, getAdminRiders);
router.post('/riders/create',                ...opsAuth,  adminCreateRider);
router.get('/riders/:id',                    ...readAuth, getAdminRiderDetail);
router.patch('/riders/:id/status',           ...opsAuth,  updateRiderStatus);
router.patch('/riders/:id/document/status',  ...opsAuth,  updateRiderDocumentStatus);

// Customers & Orders
router.get('/customers', ...readAuth, getAdminCustomers);
router.get('/customers/:id/addresses', ...readAuth, getCustomerAddresses);
router.delete('/customers/:id', ...superAdminAuth, deleteCustomer);
router.get('/orders',    ...readAuth, getAdminOrders);
router.get('/orders/:id', ...readAuth, getAdminOrderDetail);

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

// Pricing Management — ops+ admin
router.get('/pricing/profiles',                    ...readAuth,  getPricingProfiles);
router.get('/pricing/profiles/:id',                ...readAuth,  getPricingProfile);
router.post('/pricing/profiles',                   ...opsAuth,   createPricingProfile);
router.patch('/pricing/profiles/:id',               ...opsAuth,   updatePricingProfile);
router.delete('/pricing/profiles/:id',              ...superAdminAuth, deletePricingProfile);

router.post('/pricing/buckets',                    ...opsAuth,   createPricingBucket);
router.patch('/pricing/buckets/:id',               ...opsAuth,   updatePricingBucket);
router.delete('/pricing/buckets/:id',              ...superAdminAuth, deletePricingBucket);

router.post('/pricing/modifiers',                   ...opsAuth,   createPricingModifier);
router.patch('/pricing/modifiers/:id',              ...opsAuth,   updatePricingModifier);
router.delete('/pricing/modifiers/:id',             ...superAdminAuth, deletePricingModifier);

router.get('/pricing/zones',                       ...readAuth,  getDeliveryZones);
router.post('/pricing/zones',                      ...opsAuth,   createDeliveryZone);
router.patch('/pricing/zones/:id',                 ...opsAuth,   updateDeliveryZone);
router.delete('/pricing/zones/:id',                ...superAdminAuth, deleteDeliveryZone);

router.get('/pricing/surge-events',                ...readAuth,  getSurgeEvents);
router.post('/pricing/surge-events',               ...opsAuth,   createSurgeEvent);
router.patch('/pricing/surge-events/:id',          ...opsAuth,   updateSurgeEvent);
router.delete('/pricing/surge-events/:id',         ...superAdminAuth, deleteSurgeEvent);

router.post('/pricing/simulate',                   ...readAuth,  simulatePricing);

export default router;
