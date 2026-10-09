import { Router } from 'express';
import {
  getDashboardStats,
  getAdminSettings,
  updateAdminSettings,
  getAdminVendors, updateVendorStatus, updateVendorTier, updateVendorCategory, adminCreateVendor,
  adminCreateRider,
  getVendorDetail, updateVendorDocumentStatus,
  updateVendorBusinessVerifStatus, updateVendorLicenseStatus,
  deleteVendor, featureVendor, regeocodeVendor,
  getAdminRiders, getAdminRiderDetail, updateRiderStatus, updateRiderDocumentStatus, deleteRider,
  getAdminCustomers,
  getCustomerAddresses,
  deleteCustomer,
  getAdminOrders,
  getAdminOrderDetail,
  deleteAdminOrder,
  getAuditLogs,
  getLogFiles,
  getServerLogs,
  getAdminPayouts,
  processManualPayout,
  triggerPayoutBatch,
  listAdminUsers,
  createAdminUser,
  updateAdminRole,
  deactivateAdminUser,
} from '../controllers/admin.controller';
import { listErrorLogs, getErrorLogDetail, resolveErrorLog, bulkResolveErrorLogs, reanalyzeErrorLog } from '../controllers/errorLog.controller';
import { validate } from '../middleware/validate.middleware';
import { bulkResolveErrorLogsSchema } from '../validators/errorLog.validator';
import {
  getOrderCandidateRiders, cancelOrderAsAdmin, assignRiderAsAdmin, unassignRiderAsAdmin, issueOrderCreditAsAdmin,
} from '../controllers/adminOrderActions.controller';
import {
  adminCancelOrderSchema, adminAssignRiderSchema, adminUnassignRiderSchema, adminOrderCreditSchema,
} from '../validators/adminOrder.validator';
import { runOpsBriefingSchema } from '../validators/opsBriefing.validator';
import { listOpsBriefings, runOpsBriefingNow } from '../controllers/opsBriefing.controller';
import {
  listAgents, updateAgent, listSuggestions, approveAgentSuggestion, rejectAgentSuggestion,
} from '../controllers/agents.controller';
import { updateAgentSchema, rejectSuggestionSchema } from '../validators/agents.validator';
import { getOnboardingFunnel, getStuckUsers, getOnboardingEventFunnel } from '../controllers/analytics.controller';
import { getUsageOverview, getUsageFunnel, getUsageRetention, listAppEvents, getEventCatalog } from '../controllers/appEvent.controller';
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
import { listBlockedIps, blockIpManually, unblockIpManually } from '../controllers/admin.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// All three admin roles can read; only ops+ can write; only super admin handles payouts/offers/admin-users.
const superAdminAuth = [verifyToken, requireRole('SUPER_ADMIN')];
const opsAuth        = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN')];
const readAuth       = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN')];

// Dashboard
router.get('/dashboard', ...readAuth, getDashboardStats);

// Onboarding analytics (derived from existing data)
router.get('/analytics/funnel', ...readAuth, getOnboardingFunnel);
router.get('/analytics/event-funnel', ...readAuth, getOnboardingEventFunnel);
router.get('/analytics/stuck-users', ...readAuth, getStuckUsers);

// App usage analytics (AppEvent stream)
router.get('/analytics/usage/overview', ...readAuth, getUsageOverview);
router.get('/analytics/usage/funnel', ...readAuth, getUsageFunnel);
router.get('/analytics/usage/retention', ...readAuth, getUsageRetention);
router.get('/analytics/usage/events', ...readAuth, listAppEvents);
router.get('/analytics/usage/catalog', ...readAuth, getEventCatalog);
router.get('/settings', ...readAuth, getAdminSettings);
router.patch('/settings', ...superAdminAuth, updateAdminSettings);

// Vendors
router.get('/vendors',                                          ...readAuth,       getAdminVendors);
router.post('/vendors/create',                                  ...opsAuth,        adminCreateVendor);
router.get('/vendors/:id',                                      ...readAuth,       getVendorDetail);
router.patch('/vendors/:id/status',                             ...opsAuth,        updateVendorStatus);
router.patch('/vendors/:id/tier',                               ...superAdminAuth, updateVendorTier);
router.patch('/vendors/:id/category',                           ...opsAuth,        updateVendorCategory);
router.patch('/vendors/:id/document/status',                    ...opsAuth,        updateVendorDocumentStatus);
router.patch('/vendors/:id/business-verification/status',       ...opsAuth,        updateVendorBusinessVerifStatus);
router.patch('/vendors/:id/licenses/:licenseId/status',         ...opsAuth,        updateVendorLicenseStatus);
router.patch('/vendors/:id/feature',                            ...opsAuth,        featureVendor);
router.post('/vendors/:id/regeocode',                           ...opsAuth,        regeocodeVendor);
router.delete('/vendors/:id',                                   ...superAdminAuth, deleteVendor);

// Riders
router.get('/riders',                        ...readAuth, getAdminRiders);
router.post('/riders/create',                ...opsAuth,  adminCreateRider);
router.get('/riders/:id',                    ...readAuth, getAdminRiderDetail);
router.patch('/riders/:id/status',           ...opsAuth,  updateRiderStatus);
router.patch('/riders/:id/document/status',  ...opsAuth,  updateRiderDocumentStatus);
router.delete('/riders/:id',                 ...superAdminAuth, deleteRider);

// Customers & Orders
router.get('/customers', ...readAuth, getAdminCustomers);
router.get('/customers/:id/addresses', ...readAuth, getCustomerAddresses);
router.delete('/customers/:id', ...superAdminAuth, deleteCustomer);
router.get('/orders',    ...readAuth, getAdminOrders);
router.get('/orders/:id', ...readAuth, getAdminOrderDetail);
router.delete('/orders/:id', ...superAdminAuth, deleteAdminOrder);
router.get('/orders/:id/candidate-riders', ...opsAuth, getOrderCandidateRiders);
router.post('/orders/:id/cancel',          ...opsAuth, validate(adminCancelOrderSchema), cancelOrderAsAdmin);
router.post('/orders/:id/assign-rider',    ...opsAuth, validate(adminAssignRiderSchema), assignRiderAsAdmin);
router.post('/orders/:id/unassign-rider',  ...opsAuth, validate(adminUnassignRiderSchema), unassignRiderAsAdmin);
router.post('/orders/:id/credit',          ...opsAuth, validate(adminOrderCreditSchema), issueOrderCreditAsAdmin);

// Daily ops briefing agent
router.get('/ops-briefings',      ...readAuth,       listOpsBriefings);
router.post('/ops-briefings/run', ...superAdminAuth, validate(runOpsBriefingSchema), runOpsBriefingNow);

// Agent framework: config (super admin) + suggestion inbox (ops can approve/reject)
router.get('/agents',                               ...readAuth,       listAgents);
router.get('/agents/suggestions',                   ...readAuth,       listSuggestions);
router.post('/agents/suggestions/:id/approve',      ...opsAuth,        approveAgentSuggestion);
router.post('/agents/suggestions/:id/reject',       ...opsAuth,        validate(rejectSuggestionSchema), rejectAgentSuggestion);
router.patch('/agents/:key',                        ...superAdminAuth, validate(updateAgentSchema), updateAgent);

// Audit logs
router.get('/audit', ...readAuth, getAuditLogs);

// Server logs (Winston files on disk) — super admin only
router.get('/logs/files', ...superAdminAuth, getLogFiles);
router.get('/logs',       ...superAdminAuth, getServerLogs);

// Client/backend error logs — all admin roles can view and resolve
router.get('/error-logs',            ...readAuth, listErrorLogs);
router.patch('/error-logs/bulk-resolve', ...readAuth, validate(bulkResolveErrorLogsSchema), bulkResolveErrorLogs);
router.get('/error-logs/:id',        ...readAuth, getErrorLogDetail);
router.post('/error-logs/:id/analyze', ...readAuth, reanalyzeErrorLog);
router.patch('/error-logs/:id/resolve', ...readAuth, resolveErrorLog);

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

// Security/IP Management — ops+ admin
router.get('/security/blocked-ips',        ...readAuth,   listBlockedIps);
router.post('/security/block-ip',          ...opsAuth,    blockIpManually);
router.delete('/security/unblock-ip/:ip',  ...opsAuth,    unblockIpManually);

export default router;
