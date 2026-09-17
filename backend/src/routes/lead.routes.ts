import { Router } from 'express';
import { inboundLead } from '../controllers/crm/lead.controller';

// Server-to-server only: the website's form handler forwards partner enquiries here with
// the shared LEADS_INBOUND_SECRET header. Not callable from browsers.
const router = Router();

router.post('/inbound', inboundLead);

export default router;
