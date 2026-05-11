import { Router } from 'express';
import { getOffers } from '../controllers/offer.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/', verifyToken, getOffers);

export default router;
