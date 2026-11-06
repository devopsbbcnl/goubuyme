// SMOIS (social media operations). Mounted at /api/v1/admin/smois.
// Access is decided by smoisAuth (membership + capability), never by the admin role alone.
import { Router } from 'express';
import { smoisAuth } from '../middleware/smois.middleware';
import * as core from '../controllers/smois/core.controller';
import * as content from '../controllers/smois/content.controller';
import * as tasks from '../controllers/smois/task.controller';
import * as dash from '../controllers/smois/dashboard.controller';
import * as analytics from '../controllers/smois/analytics.controller';
import * as perf from '../controllers/smois/performance.controller';
import * as reports from '../controllers/smois/report.controller';
import * as inbox from '../controllers/smois/inbox.controller';
import * as campaigns from '../controllers/smois/campaign.controller';
import * as assets from '../controllers/smois/asset.controller';
import * as connections from '../controllers/smois/connection.controller';
import * as monitoring from '../controllers/smois/monitoring.controller';
import * as ai from '../controllers/smois/ai.controller';

const router = Router();
const any = smoisAuth();

// Identity & shared pickers
router.get('/me',                      ...any, core.getMe);
router.patch('/me/preferences',        ...any, core.updatePreferences);
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

// Analytics (manually recorded readings until a platform is connected)
router.get('/metrics/dictionary',              ...any, analytics.getDictionary);
router.get('/analytics/overview',              ...smoisAuth('viewAnalytics'), analytics.getOverview);
router.get('/metrics/snapshots',               ...smoisAuth('viewAnalytics'), analytics.listSnapshots);
router.post('/metrics/snapshots',               ...smoisAuth('recordMetrics'), analytics.recordSnapshot);
router.put('/metrics/snapshots/:id',           ...smoisAuth('correctMetrics'), analytics.correctSnapshot);
router.get('/metrics/posts',                   ...smoisAuth('viewAnalytics'), analytics.listPostMetrics);
router.post('/metrics/posts',                   ...smoisAuth('recordMetrics'), analytics.recordPostMetric);
router.get('/connections',                     ...any, connections.getConnections);
router.post('/connections/:accountId/connect',    ...smoisAuth('manageAccounts'), connections.startConnect);
router.post('/connections/:accountId/sync',       ...smoisAuth('manageAccounts'), connections.syncNow);
router.post('/connections/:accountId/disconnect', ...smoisAuth('manageAccounts'), connections.disconnectAccount);
router.get('/integrations',                    ...any, analytics.getIntegrations);

// Targets, performance, evaluations
router.get('/targets',                         ...any, perf.listTargets);
router.post('/targets',                         ...smoisAuth('manageTargets'), perf.createTarget);
router.patch('/targets/:id',                     ...smoisAuth('manageTargets'), perf.updateTarget);
router.get('/performance',                     ...smoisAuth('viewPerformance'), perf.listPerformance);
router.get('/performance/me',                  ...any, perf.getMyPerformance);
router.get('/performance/:memberId',           ...any, perf.getPerformance);
router.post('/evaluations',                     ...smoisAuth('viewPerformance'), perf.createEvaluation);

// Reports
router.get('/reports',                         ...any, reports.listReports);
router.post('/reports/draft',                   ...any, reports.createDraft);
router.get('/reports/:id',                     ...any, reports.getReport);
router.patch('/reports/:id',                     ...any, reports.updateReport);
router.post('/reports/:id/refresh',             ...any, reports.refreshReport);
router.post('/reports/:id/submit',              ...any, reports.submitReport);
router.post('/reports/:id/review',              ...smoisAuth('reviewReports'), reports.reviewReport);
router.get('/reports/:id/export',              ...any, reports.exportReport);

// Inbox, contacts (people who wrote to the company accounts; personal data, so handled by staff who work the inbox)
router.get('/inbox/summary',                 ...smoisAuth('handleInbox'), inbox.inboxSummary);
router.get('/inbox',                         ...smoisAuth('handleInbox'), inbox.listInbox);
router.post('/inbox',                         ...smoisAuth('handleInbox'), inbox.logConversation);
router.get('/inbox/:id',                     ...smoisAuth('handleInbox'), inbox.getConversation);
router.patch('/inbox/:id',                     ...smoisAuth('handleInbox'), inbox.updateConversation);
router.post('/inbox/:id/assign',              ...smoisAuth('handleInbox'), inbox.assignConversation);
router.post('/inbox/:id/messages',            ...smoisAuth('handleInbox'), inbox.addMessage);
router.post('/inbox/:id/status',              ...smoisAuth('handleInbox'), inbox.setStatus);
router.post('/inbox/:id/escalate',            ...smoisAuth('handleInbox'), inbox.escalate);
router.get('/saved-replies',                 ...smoisAuth('handleInbox'), inbox.listSavedReplies);
router.post('/saved-replies',                 ...smoisAuth('handleInbox'), inbox.createSavedReply);
router.delete('/saved-replies/:id',             ...smoisAuth('handleInbox'), inbox.deleteSavedReply);
router.get('/contacts',                      ...smoisAuth('handleInbox'), inbox.listContacts);
router.post('/contacts',                      ...smoisAuth('handleInbox'), inbox.createContact);
router.get('/contacts/:id',                  ...smoisAuth('handleInbox'), inbox.getContact);
router.patch('/contacts/:id',                  ...smoisAuth('handleInbox'), inbox.updateContact);
router.post('/contacts/:id/anonymize',        ...smoisAuth('manageListening'), inbox.anonymizeContact);

// Campaigns
router.get('/campaigns',                     ...smoisAuth('viewCampaigns'), campaigns.listCampaigns);
router.post('/campaigns',                     ...smoisAuth('manageCampaigns'), campaigns.createCampaign);
router.get('/campaigns/:id',                 ...smoisAuth('viewCampaigns'), campaigns.getCampaign);
router.patch('/campaigns/:id',                 ...smoisAuth('manageCampaigns'), campaigns.updateCampaign);
router.post('/campaigns/:id/status',          ...smoisAuth('manageCampaigns'), campaigns.setCampaignStatus);
router.post('/campaigns/:id/results',         ...smoisAuth('viewCampaigns'), campaigns.addResult);
router.post('/campaigns/:id/content',         ...smoisAuth('viewCampaigns'), campaigns.linkContent);
router.get('/campaigns/:id/summary',         ...smoisAuth('viewCampaigns'), campaigns.getSummary);

// Media and brand asset library
router.get('/assets',                        ...any, assets.listAssets);
router.post('/assets',                        ...smoisAuth('createContent'), assets.createAsset);
router.get('/assets/:id',                    ...any, assets.getAsset);
router.patch('/assets/:id',                    ...smoisAuth('createContent'), assets.updateAsset);
router.post('/assets/:id/approve',            ...smoisAuth('approve'), assets.reviewAsset);
router.post('/assets/:id/version',            ...smoisAuth('createContent'), assets.addVersion);
router.post('/assets/:id/archive',            ...smoisAuth('createContent'), assets.archiveAsset);

// Social listening and competitors (logged by people; no automated monitoring)
router.get('/keywords',                      ...smoisAuth('viewAnalytics'), monitoring.listKeywords);
router.post('/keywords',                      ...smoisAuth('manageListening'), monitoring.createKeyword);
router.patch('/keywords/:id',                  ...smoisAuth('manageListening'), monitoring.updateKeyword);
router.get('/listening/overview',            ...smoisAuth('viewAnalytics'), monitoring.listeningOverview);
router.get('/mentions',                      ...smoisAuth('viewAnalytics'), monitoring.listMentions);
router.post('/mentions',                      ...smoisAuth('handleInbox'), monitoring.logMention);
router.patch('/mentions/:id',                  ...smoisAuth('handleInbox'), monitoring.updateMention);
router.get('/competitors',                   ...smoisAuth('viewAnalytics'), monitoring.listCompetitors);
router.post('/competitors',                   ...smoisAuth('manageListening'), monitoring.createCompetitor);
router.patch('/competitors/:id',               ...smoisAuth('manageListening'), monitoring.updateCompetitor);
router.get('/competitors/:id/snapshots',     ...smoisAuth('viewAnalytics'), monitoring.listCompetitorSnapshots);
router.post('/competitors/:id/snapshots',     ...smoisAuth('recordMetrics'), monitoring.addCompetitorSnapshot);

// AI assistance (drafts only) and predictive insights
router.get('/ai/status',                     ...any, ai.getAiStatus);
router.post('/ai/content',                    ...smoisAuth('createContent'), ai.aiContent);
router.post('/ai/ask',                        ...smoisAuth('viewAnalytics'), ai.aiAsk);
router.post('/ai/report-commentary',          ...smoisAuth('createContent'), ai.aiReportCommentary);
router.post('/ai/sentiment',                  ...smoisAuth('handleInbox'), ai.aiSentiment);
router.get('/ai/usage',                      ...smoisAuth('configure'), ai.aiUsage);
router.get('/insights/forecast',             ...smoisAuth('viewAnalytics'), ai.getForecast);
router.get('/insights/posting-times',        ...smoisAuth('viewAnalytics'), ai.getPostingTimes);
router.get('/insights/workflow',             ...smoisAuth('reviewReports'), ai.getWorkflowInsights);

// Activity trail (read-only: there is deliberately no write or delete endpoint)
router.get('/activity',                ...smoisAuth('viewActivity'), dash.listActivity);
router.get('/activity/export',         ...smoisAuth('viewActivity'), dash.exportActivity);
router.get('/timeline/:entity/:id',    ...smoisAuth('viewActivity'), dash.getTimeline);

export default router;
