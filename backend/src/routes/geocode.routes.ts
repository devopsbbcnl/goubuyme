import { Router } from 'express';
import { searchGeocode, reverseGeocode } from '../controllers/geocode.controller';
import { geocodeLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

// Public — used by mobile registration/onboarding screens before the user has a JWT.
router.get('/search',  geocodeLimiter, searchGeocode);
router.get('/reverse', geocodeLimiter, reverseGeocode);

export default router;
