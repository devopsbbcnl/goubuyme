import { Router } from 'express';
import {
  getCart, addToCart, updateCartItem, removeCartItem, clearCart,
  getAddresses, addAddress, updateAddress, deleteAddress,
  getOrders, getOrderById,
  getFavorites, toggleFavorite,
  getReferral,
} from '../controllers/customer.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

const auth = [verifyToken, requireRole('CUSTOMER')];

router.get('/cart',                  ...auth, getCart);
router.post('/cart/add',             ...auth, addToCart);
router.put('/cart/update/:itemId',   ...auth, updateCartItem);
router.delete('/cart/remove/:itemId',...auth, removeCartItem);
router.delete('/cart/clear',         ...auth, clearCart);

router.get('/addresses',             ...auth, getAddresses);
router.post('/addresses',            ...auth, addAddress);
router.put('/addresses/:id',         ...auth, updateAddress);
router.delete('/addresses/:id',      ...auth, deleteAddress);

router.get('/orders',                ...auth, getOrders);
router.get('/orders/:id',            ...auth, getOrderById);

router.get('/favorites',             ...auth, getFavorites);
router.post('/favorites/:vendorId',  ...auth, toggleFavorite);
router.delete('/favorites/:vendorId',...auth, toggleFavorite);

router.get('/referral',              ...auth, getReferral);

export default router;
