// SMOIS (social media operations). Mounted at /api/v1/admin/smois.
// Access is decided by smoisAuth (membership + capability), never by the admin role alone.
import { Router } from 'express';
import { smoisAuth } from '../middleware/smois.middleware';
import * as core from '../controllers/smois/core.controller';
import * as content from '../controllers/smois/content.controller';
import * as tasks from '../controllers/smois/task.controller';
import * as dash from '../controllers/smois/dashboard.controller';

const router = Router();
const any = smoisAuth();

// Identity & shared pickers
router.get('/me',                      ...any, core.getMe);
router.get('/people',                  ...any, core.listPeople);
router.get('/notifications',           ...any, core.listNotifications);
router.post('/notifications/read',     ...any, core.markNotificationsRead);
router.get('/dashboard',               ...any, dash.getDashboard);

// Team (super admin manages; management can read)
router.get('/members',                 ...any, core.listMembers);
router.get('/eligible-users',          ...smoisAuth('manageTeam'), core.listEligibleUsers);
router.post('/members',                ...smoisAuth('manageTeam'), core.createMember);
router.patch('/members/:id',           ...smoisAuth('manageTeam'), core.updateMember);
router.post('/members/:id/revoke',     ...smoisAuth('manageTeam'), core.revokeMember);
router.post('/members/:id/restore',    ...smoisAuth('manageTeam'), core.restoreMember);

// Accounts & assignments
router.get('/accounts',                ...any, core.listAccounts);
router.get('/accounts/:id',            ...any, core.getAccount);
router.post('/accounts',               ...smoisAuth('manageAccounts'), core.createAccount);
router.patch('/accounts/:id',          ...smoisAuth('manageAccounts'), core.updateAccount);
router.post('/accounts/:id/archive',   ...smoisAuth('manageAccounts'), core.setAccountArchived(true));
router.post('/accounts/:id/restore',   ...smoisAuth('manageAccounts'), core.setAccountArchived(false));
router.post('/accounts/:id/assignments', ...smoisAuth('manageAccounts'), core.assignMember);
router.post('/assignments/:id/end',    ...smoisAuth('manageAccounts'), core.endAssignment);

// Categories & settings
router.get('/categories',              ...any, core.listCategories);
router.post('/categories',             ...smoisAuth('configure'), core.createCategory);
router.patch('/categories/:id',        ...smoisAuth('configure'), core.updateCategory);
router.get('/settings',                ...any, core.readSettings);
router.patch('/settings',              ...smoisAuth('configure'), core.updateSettings);

// Content (briefs + platform variants)
router.get('/content',                 ...any, content.listContent);
router.post('/content',                ...smoisAuth('createContent'), content.createContent);
router.get('/content/:id',             ...any, content.getContent);
router.patch('/content/:id',           ...smoisAuth('createContent'), content.updateContent);
router.post('/content/:id/archive',    ...smoisAuth('createContent'), content.archiveContent);
router.post('/content/:id/variants',   ...smoisAuth('createContent'), content.addVariant);
router.patch('/variants/:id',          ...smoisAuth('createContent'), content.updateVariant);
router.post('/variants/:id/submit',    ...smoisAuth('createContent'), content.submitVariant);
router.post('/variants/:id/review',    ...smoisAuth('approve'), content.reviewVariant);
router.post('/variants/:id/status',    ...smoisAuth('createContent'), content.moveVariant);
router.post('/variants/:id/comments',  ...any, content.commentOnVariant);
router.post('/variants/:id/plan',      ...any, content.reschedulePlan);
router.post('/variants/:id/schedule',  ...smoisAuth('publish'), content.scheduleVariant);
router.post('/variants/:id/publish',   ...smoisAuth('createContent'), content.recordPublish);
router.post('/variants/:id/fail',      ...smoisAuth('publish'), content.recordPublishFailure);
router.get('/publishing',              ...any, content.listPublishing);
router.get('/approvals',               ...any, content.listApprovals);
router.get('/calendar',                ...any, content.getCalendar);

// Tasks
router.get('/tasks',                   ...any, tasks.listTasks);
router.post('/tasks',                  ...smoisAuth('manageTasks'), tasks.createTask);
router.get('/tasks/:id',               ...any, tasks.getTask);
router.patch('/tasks/:id',             ...smoisAuth('manageTasks'), tasks.updateTask);
router.post('/tasks/:id/status',       ...smoisAuth('completeTasks'), tasks.setTaskStatus);
router.post('/tasks/:id/evidence',     ...smoisAuth('completeTasks'), tasks.addEvidence);
router.post('/tasks/:id/comments',     ...any, tasks.commentOnTask);
router.get('/recurring',               ...smoisAuth('manageTasks'), tasks.listRules);
router.post('/recurring',              ...smoisAuth('manageTasks'), tasks.createRule);
router.patch('/recurring/:id',         ...smoisAuth('manageTasks'), tasks.updateRule);

// Activity trail (read-only: there is deliberately no write or delete endpoint)
router.get('/activity',                ...smoisAuth('viewActivity'), dash.listActivity);
router.get('/activity/export',         ...smoisAuth('viewActivity'), dash.exportActivity);
router.get('/timeline/:entity/:id',    ...smoisAuth('viewActivity'), dash.getTimeline);

export default router;
