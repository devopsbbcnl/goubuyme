import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import {
  getCrmProfile, getCrmTimeline, issueCrmCredit, listCrmProfiles, sendCrmMessage, setCrmAccountStatus,
} from '../controllers/crm/profile.controller';
import {
  addTagToProfile, createNote, createTag, deleteNote, deleteTag, listTags, removeTagFromProfile, updateNote,
} from '../controllers/crm/noteTag.controller';
import {
  bulkUpdateTickets, createCannedReply, createTicketForUser, creditFromTicket, deleteCannedReply, getTicket,
  listAgents, listCannedReplies, listTickets, replyToTicket, ticketSummary, updateCannedReply, updateTicket,
} from '../controllers/crm/ticket.controller';
import {
  cancelCampaign, createAutomation, createCampaign, createSegment, deleteAutomation, deleteCampaign, deleteSegment,
  getCampaign, getSegment, listAutomations, listCampaigns, listSegmentFields, listSegments, previewAutomation,
  previewSegment, runAutomationNow, scheduleCampaign, testCampaign, updateAutomation, updateCampaign, updateSegment,
} from '../controllers/crm/marketing.controller';
import {
  addLeadActivity, createLead, deleteLead, getLead, importLeads, leadSummary, linkLeadAccount, listLeads, updateLead,
} from '../controllers/crm/lead.controller';
import { createTask, deleteTask, listTasks, updateTask } from '../controllers/crm/task.controller';
import { getCrmOverview } from '../controllers/crm/overview.controller';

const router = Router();

// Same tiers as admin.routes: all admins read and annotate; ops+ act on accounts and money.
const opsAuth  = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN')];
const readAuth = [verifyToken, requireRole('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN')];
// Actually messaging customers at scale (and automations that do so) is super-admin only.
const superAuth = [verifyToken, requireRole('SUPER_ADMIN')];

// Overview
router.get('/overview',                     ...readAuth, getCrmOverview);

// Profiles
router.get('/profiles',                     ...readAuth, listCrmProfiles);
router.get('/profiles/:userId',             ...readAuth, getCrmProfile);
router.get('/profiles/:userId/timeline',    ...readAuth, getCrmTimeline);
router.post('/profiles/:userId/credit',     ...opsAuth,  issueCrmCredit);
router.patch('/profiles/:userId/status',    ...opsAuth,  setCrmAccountStatus);
router.post('/profiles/:userId/message',    ...opsAuth,  sendCrmMessage);

// Notes (edit/delete also check authorship in the controller)
router.post('/profiles/:userId/notes',      ...readAuth, createNote);
router.patch('/notes/:noteId',              ...readAuth, updateNote);
router.delete('/notes/:noteId',             ...readAuth, deleteNote);

// Tags
router.get('/tags',                         ...readAuth, listTags);
router.post('/tags',                        ...opsAuth,  createTag);
router.delete('/tags/:tagId',               ...opsAuth,  deleteTag);
router.post('/profiles/:userId/tags',       ...readAuth, addTagToProfile);
router.delete('/profiles/:userId/tags/:tagId', ...readAuth, removeTagFromProfile);

// Helpdesk (static paths before /tickets/:id)
router.get('/tickets',                      ...readAuth, listTickets);
router.get('/tickets/summary',              ...readAuth, ticketSummary);
router.get('/tickets/agents',               ...readAuth, listAgents);
router.post('/tickets',                     ...readAuth, createTicketForUser);
router.post('/tickets/bulk',                ...opsAuth,  bulkUpdateTickets);
router.get('/tickets/:id',                  ...readAuth, getTicket);
router.patch('/tickets/:id',                ...readAuth, updateTicket);
router.post('/tickets/:id/messages',        ...readAuth, replyToTicket);
router.post('/tickets/:id/credit',          ...opsAuth,  creditFromTicket);

// Canned replies
router.get('/canned-replies',               ...readAuth, listCannedReplies);
router.post('/canned-replies',              ...opsAuth,  createCannedReply);
router.patch('/canned-replies/:id',         ...opsAuth,  updateCannedReply);
router.delete('/canned-replies/:id',        ...opsAuth,  deleteCannedReply);

// Segments
router.get('/segments/fields',               ...readAuth,  listSegmentFields);
router.post('/segments/preview',             ...opsAuth,   previewSegment);
router.get('/segments',                      ...readAuth,  listSegments);
router.post('/segments',                     ...opsAuth,   createSegment);
router.get('/segments/:id',                  ...readAuth,  getSegment);
router.patch('/segments/:id',                ...opsAuth,   updateSegment);
router.delete('/segments/:id',               ...opsAuth,   deleteSegment);

// Campaigns
router.get('/campaigns',                     ...readAuth,  listCampaigns);
router.post('/campaigns',                    ...opsAuth,   createCampaign);
router.get('/campaigns/:id',                 ...readAuth,  getCampaign);
router.patch('/campaigns/:id',               ...opsAuth,   updateCampaign);
router.delete('/campaigns/:id',              ...opsAuth,   deleteCampaign);
router.post('/campaigns/:id/test',           ...opsAuth,   testCampaign);
router.post('/campaigns/:id/schedule',       ...superAuth, scheduleCampaign);
router.post('/campaigns/:id/cancel',         ...superAuth, cancelCampaign);

// Automations
router.get('/automations',                   ...readAuth,  listAutomations);
router.post('/automations/preview',          ...readAuth,  previewAutomation);
router.post('/automations',                  ...superAuth, createAutomation);
router.patch('/automations/:id',             ...superAuth, updateAutomation);
router.delete('/automations/:id',            ...superAuth, deleteAutomation);
router.post('/automations/:id/run',          ...superAuth, runAutomationNow);

// Pipeline (static paths before /leads/:id)
router.get('/leads',                         ...readAuth,  listLeads);
router.get('/leads/summary',                 ...readAuth,  leadSummary);
router.post('/leads',                        ...opsAuth,   createLead);
router.post('/leads/import',                 ...opsAuth,   importLeads);
router.get('/leads/:id',                     ...readAuth,  getLead);
router.patch('/leads/:id',                   ...opsAuth,   updateLead);
router.delete('/leads/:id',                  ...superAuth, deleteLead);
router.post('/leads/:id/activities',         ...opsAuth,   addLeadActivity);
router.post('/leads/:id/link',               ...opsAuth,   linkLeadAccount);

// Tasks (ownership rules for support agents are enforced in the controller)
router.get('/tasks',                         ...readAuth,  listTasks);
router.post('/tasks',                        ...readAuth,  createTask);
router.patch('/tasks/:id',                   ...readAuth,  updateTask);
router.delete('/tasks/:id',                  ...readAuth,  deleteTask);

export default router;
