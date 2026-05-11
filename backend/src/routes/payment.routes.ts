import { Router } from 'express';
import { initializePayment, verifyPayment, handleWebhook, resolveAccount } from '../controllers/payment.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/initialize', verifyToken, initializePayment);
router.post('/verify', verifyToken, verifyPayment);
router.post('/webhook', handleWebhook);
router.get('/resolve-account', verifyToken, resolveAccount);

export default router;
