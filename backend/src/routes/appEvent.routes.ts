import { Router } from 'express';
import { ingestEvents } from '../controllers/appEvent.controller';
import { validate } from '../middleware/validate.middleware';
import { ingestEventsSchema } from '../validators/appEvent.validator';
import { eventsIpLimiter, eventsLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

router.post('/', eventsIpLimiter, eventsLimiter, validate(ingestEventsSchema), ingestEvents);

export default router;
