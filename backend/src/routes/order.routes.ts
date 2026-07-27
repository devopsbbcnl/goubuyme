import { Router } from 'express';
import { placeOrder, cancelOrder, rateOrder, estimateDeliveryFee, validatePromo } from '../controllers/order.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import Joi from 'joi';

const placeOrderSchema = Joi.object({
  deliveryAddressId: Joi.string().required(),
  paymentMethod: Joi.string().valid('CARD', 'BANK_TRANSFER', 'PAYSTACK_USSD', 'CASH_ON_DELIVERY').required(),
  note: Joi.string().max(300).optional(),
  promoCode: Joi.string().max(40).optional().allow('', null),
});

const router = Router();

router.use(verifyToken);

router.get('/estimate-fee', requireRole('CUSTOMER'), estimateDeliveryFee);
router.get('/validate-promo', requireRole('CUSTOMER'), validatePromo);
router.post('/', requireRole('CUSTOMER'), validate(placeOrderSchema), placeOrder);
router.post('/:id/cancel', requireRole('CUSTOMER'), cancelOrder);
router.post('/:id/rate', requireRole('CUSTOMER'), rateOrder);

export default router;
