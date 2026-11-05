import { Router } from 'express';
import {
  getVendors, getVendorById, getVendorMenu,
  getMyVendorProfile, updateMyVendorProfile, toggleStoreStatus,
  getMyAvailability, updateAvailabilityMode, setBusinessHours,
  listTemporaryClosures, createTemporaryClosure, deleteTemporaryClosure,
  getVendorDashboardStats, getMyOrders, getMyOrderById, updateMyOrderStatus, markOrderViewed, registerPushSubscription, getMyEarnings,
  getMyMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
  getMenuItemDrinkOptions, createMenuItemDrinkOption, updateMenuItemDrinkOption, deleteMenuItemDrinkOption,
  getMenuItemOptionGroups, createMenuItemOptionGroup, deleteMenuItemOptionGroup,
  createMenuItemOptionItem, updateMenuItemOptionItem, deleteMenuItemOptionItem,
  getPayoutAccount, savePayoutAccount, switchMyTier,
  getMyDocument, submitDocument,
  getMyBusinessVerification, submitBusinessVerification,
  getMyLicenses, submitLicense, deleteLicense,
  getMyPromotions, createPromotion, togglePromotion, deletePromotion, updatePromotionPosition,
  getActiveVendorPromotions, searchMenuItems, unifiedSearch, browseItems, getMenuItemById, getSimilarMenuItems,
  getPublicCommissionRates,
} from '../controllers/vendor.controller';
import {
  listMyBranches, createBranch, updateBranch, deleteBranch,
  createBranchLogin, updateBranchLogin, resetBranchLoginPassword, revokeBranchLogin,
} from '../controllers/branch.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requireMfa } from '../middleware/mfa.middleware';
import { requireOwner, vendorContext } from '../middleware/vendorContext';

const router = Router();

// Protected vendor-only routes (must be declared before /:id to avoid wildcard capture)
// `vendorAuth` acts on whichever of the owner's locations the x-vendor-id header selects (default:
// the main business). `mainAuth` ignores the header: branch management, payout account, plan tier
// and verification documents always belong to the main business and are shared by its branches.
const mainAuth = [verifyToken, requireRole('VENDOR'), requireOwner];
const locationAuth = [verifyToken, requireRole('VENDOR'), vendorContext];
const vendorAuth = locationAuth;
router.get('/me',                          ...vendorAuth, getMyVendorProfile);
router.patch('/me',                        ...vendorAuth, updateMyVendorProfile);
router.patch('/me/status',                 ...vendorAuth, toggleStoreStatus);
router.get('/me/availability',             ...vendorAuth, getMyAvailability);
router.patch('/me/availability',           ...vendorAuth, updateAvailabilityMode);
router.put('/me/business-hours',           ...vendorAuth, setBusinessHours);
router.get('/me/temporary-closures',       ...vendorAuth, listTemporaryClosures);
router.post('/me/temporary-closures',      ...vendorAuth, createTemporaryClosure);
router.delete('/me/temporary-closures/:id', ...vendorAuth, deleteTemporaryClosure);
router.get('/me/branches',                  ...mainAuth, listMyBranches);
router.post('/me/branches',                 ...mainAuth, createBranch);
router.patch('/me/branches/:id',            ...mainAuth, updateBranch);
router.delete('/me/branches/:id',           ...mainAuth, deleteBranch);
router.post('/me/branches/:id/login',                 ...mainAuth, createBranchLogin);
router.patch('/me/branches/:id/login',                ...mainAuth, updateBranchLogin);
router.post('/me/branches/:id/login/reset-password',  ...mainAuth, resetBranchLoginPassword);
router.delete('/me/branches/:id/login',               ...mainAuth, revokeBranchLogin);
router.get('/me/stats',                    ...vendorAuth, getVendorDashboardStats);
router.get('/me/orders',                   ...vendorAuth, getMyOrders);
router.get('/me/orders/:orderId',          ...vendorAuth, getMyOrderById);
router.patch('/me/orders/:orderId/status', ...vendorAuth, updateMyOrderStatus);
router.patch('/me/orders/:orderId/view',   ...vendorAuth, markOrderViewed);
router.post('/me/push-subscriptions',      ...vendorAuth, registerPushSubscription);
router.get('/me/earnings',                 ...vendorAuth, getMyEarnings);
router.get('/me/payout-account',           ...mainAuth, getPayoutAccount);
router.post('/me/payout-account',          ...mainAuth, requireMfa, savePayoutAccount);
router.patch('/me/tier',                   ...mainAuth, switchMyTier);
router.get('/me/document',                         ...mainAuth, getMyDocument);
router.post('/me/document',                        ...mainAuth, submitDocument);
router.get('/me/business-verification',            ...mainAuth, getMyBusinessVerification);
router.post('/me/business-verification',           ...mainAuth, submitBusinessVerification);
router.get('/me/licenses',                         ...mainAuth, getMyLicenses);
router.post('/me/licenses',                        ...mainAuth, submitLicense);
router.delete('/me/licenses/:id',                  ...mainAuth, deleteLicense);

// Menu CRUD
router.get('/me/menu',                                          ...vendorAuth, getMyMenuItems);
router.post('/me/menu',                                         ...vendorAuth, createMenuItem);
router.patch('/me/menu/:itemId',                                ...vendorAuth, updateMenuItem);
router.delete('/me/menu/:itemId',                               ...vendorAuth, deleteMenuItem);

// Drink options
router.get('/me/menu/:itemId/drink-options',                                        ...vendorAuth, getMenuItemDrinkOptions);
router.post('/me/menu/:itemId/drink-options',                                       ...vendorAuth, createMenuItemDrinkOption);
router.patch('/me/menu/:itemId/drink-options/:optionId',                            ...vendorAuth, updateMenuItemDrinkOption);
router.delete('/me/menu/:itemId/drink-options/:optionId',                           ...vendorAuth, deleteMenuItemDrinkOption);

// Option groups (add-on / choice groups)
router.get('/me/menu/:itemId/option-groups',                                        ...vendorAuth, getMenuItemOptionGroups);
router.post('/me/menu/:itemId/option-groups',                                       ...vendorAuth, createMenuItemOptionGroup);
router.delete('/me/menu/:itemId/option-groups/:groupId',                            ...vendorAuth, deleteMenuItemOptionGroup);
router.post('/me/menu/:itemId/option-groups/:groupId/items',                        ...vendorAuth, createMenuItemOptionItem);
router.patch('/me/menu/:itemId/option-groups/:groupId/items/:optItemId',            ...vendorAuth, updateMenuItemOptionItem);
router.delete('/me/menu/:itemId/option-groups/:groupId/items/:optItemId',           ...vendorAuth, deleteMenuItemOptionItem);

// Promotion routes (vendor-authenticated)
router.get('/me/promotions',                   ...vendorAuth, getMyPromotions);
router.post('/me/promotions',                  ...vendorAuth, createPromotion);
router.patch('/me/promotions/:id/toggle',      ...vendorAuth, togglePromotion);
router.patch('/me/promotions/:id/position',    ...vendorAuth, updatePromotionPosition);
router.delete('/me/promotions/:id',            ...vendorAuth, deletePromotion);

// Public routes
router.get('/commission-rates',   getPublicCommissionRates);
router.get('/active-promotions',  getActiveVendorPromotions);
router.get('/browse-items',       browseItems);
router.get('/search',             unifiedSearch);
router.get('/menu-items/search',  searchMenuItems);
router.get('/menu-items/:id/similar', getSimilarMenuItems);
router.get('/menu-items/:id',         getMenuItemById);
router.get('/',                       getVendors);
router.get('/:id',                getVendorById);
router.get('/:id/menu',           getVendorMenu);

export default router;
