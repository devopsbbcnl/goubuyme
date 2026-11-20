import { Router } from 'express';
import { unsubscribeByToken } from '../controllers/crm/marketingPreferences.controller';
import { leadStopByCode } from '../controllers/crm/leadBroadcast.controller';

// Public (no auth): reached from the unsubscribe link in marketing emails.
const router = Router();

router.post('/unsubscribe', unsubscribeByToken);
// Reached from the "opt out" link in SMS/email sent to pipeline leads (who are not users).
router.post('/lead-stop', leadStopByCode);

export default router;
