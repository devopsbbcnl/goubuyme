import { Router } from 'express';
import {
  getMyCompany,
  updateMyCompany,
  getFleet,
  inviteRider,
  revokeInvite,
  removeRider,
  getFleetDeliveries,
} from '../controllers/company.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

const companyAuth = [verifyToken, requireRole('LOGISTICS_COMPANY')];

router.get('/me',                          ...companyAuth, getMyCompany);
router.patch('/me',                        ...companyAuth, updateMyCompany);
router.get('/me/fleet',                    ...companyAuth, getFleet);
router.post('/me/fleet/invites',           ...companyAuth, inviteRider);
router.delete('/me/fleet/invites/:id',     ...companyAuth, revokeInvite);
router.delete('/me/fleet/riders/:riderId', ...companyAuth, removeRider);
router.get('/me/deliveries',               ...companyAuth, getFleetDeliveries);

export default router;
