import { Router } from 'express';
import { unsubscribeByToken } from '../controllers/crm/marketingPreferences.controller';

// Public (no auth): reached from the unsubscribe link in marketing emails.
const router = Router();

router.post('/unsubscribe', unsubscribeByToken);

export default router;
