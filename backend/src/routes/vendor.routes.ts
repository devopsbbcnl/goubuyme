import { Router } from 'express';
import {
  getVendors, getVendorById, getVendorMenu,
  getMyVendorProfile, updateMyVendorProfile, toggleStoreStatus,
  getVendorDashboardStats, getMyOrders, updateMyOrderStatus, getMyEarnings,
  getMyMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
  getPayoutAccount, savePayoutAccount, switchMyTier,
  getMyDocument, submitDocument,
  getMyBusinessVerification, submitBusinessVerification,
  getMyLicenses, submitLicense, deleteLicense,
  getMyPromotions, createPromotion, togglePromotion, deletePromotion,
  getActiveVendorPromotions,
} from '../controllers/vendor.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requireMfa } from '../middleware/mfa.middleware';

const router = Router();

// Protected vendor-only routes (must be declared before /:id to avoid wildcard capture)
const vendorAuth = [verifyToken, requireRole('VENDOR')];
router.get('/me',                          ...vendorAuth, getMyVendorProfile);
router.patch('/me',                        ...vendorAuth, updateMyVendorProfile);
router.patch('/me/status',                 ...vendorAuth, toggleStoreStatus);
router.get('/me/stats',                    ...vendorAuth, getVendorDashboardStats);
router.get('/me/orders',                   ...vendorAuth, getMyOrders);
router.patch('/me/orders/:orderId/status', ...vendorAuth, updateMyOrderStatus);
router.get('/me/earnings',                 ...vendorAuth, getMyEarnings);
router.get('/me/payout-account',           ...vendorAuth, getPayoutAccount);
router.post('/me/payout-account',          ...vendorAuth, requireMfa, savePayoutAccount);
router.patch('/me/tier',                   ...vendorAuth, switchMyTier);
router.get('/me/document',                         ...vendorAuth, getMyDocument);
router.post('/me/document',                        ...vendorAuth, submitDocument);
router.get('/me/business-verification',            ...vendorAuth, getMyBusinessVerification);
router.post('/me/business-verification',           ...vendorAuth, submitBusinessVerification);
router.get('/me/licenses',                         ...vendorAuth, getMyLicenses);
router.post('/me/licenses',                        ...vendorAuth, submitLicense);
router.delete('/me/licenses/:id',                  ...vendorAuth, deleteLicense);

// Menu CRUD
router.get('/me/menu',                     ...vendorAuth, getMyMenuItems);
router.post('/me/menu',                    ...vendorAuth, createMenuItem);
router.patch('/me/menu/:itemId',           ...vendorAuth, updateMenuItem);
router.delete('/me/menu/:itemId',          ...vendorAuth, deleteMenuItem);

// Promotion routes (vendor-authenticated)
router.get('/me/promotions',                   ...vendorAuth, getMyPromotions);
router.post('/me/promotions',                  ...vendorAuth, createPromotion);
router.patch('/me/promotions/:id/toggle',      ...vendorAuth, togglePromotion);
router.delete('/me/promotions/:id',            ...vendorAuth, deletePromotion);

// Public routes
router.get('/active-promotions', getActiveVendorPromotions);
router.get('/',        getVendors);
router.get('/:id',     getVendorById);
router.get('/:id/menu', getVendorMenu);

export default router;
