import { Router } from 'express';
import {
  registerPushToken, getNotifications, markNotificationRead, markAllRead,
} from '../controllers/notification.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { getMarketingPreferences, updateMarketingPreferences } from '../controllers/crm/marketingPreferences.controller';

const router = Router();

router.use(verifyToken);

router.post('/register-token', registerPushToken);
router.get('/', getNotifications);
router.get('/preferences', getMarketingPreferences);
router.patch('/preferences', updateMarketingPreferences);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markNotificationRead);

export default router;
