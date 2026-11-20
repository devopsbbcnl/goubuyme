// People & Workforce Management (PWM). Mounted at /api/v1/admin/pwm.
// Access is decided by pwmAuth (membership + capability), never by the admin role alone.
import { Router } from 'express';
import { pwmAuth } from '../middleware/pwm.middleware';
import * as core from '../controllers/pwm/core.controller';
import * as emp from '../controllers/pwm/employee.controller';
import * as con from '../controllers/pwm/contract.controller';
import * as ren from '../controllers/pwm/renewal.controller';
import * as chk from '../controllers/pwm/checklist.controller';
import * as dash from '../controllers/pwm/dashboard.controller';
import * as rec from '../controllers/pwm/recruitment.controller';
import * as cnt from '../controllers/pwm/content.controller';
import * as ext from '../controllers/pwm/exit.controller';
import * as ss from '../controllers/pwm/selfservice.controller';
import * as pre from '../controllers/pwm/preboarding.controller';
import * as tw from '../controllers/pwm/timework.controller';
import * as ln from '../controllers/pwm/learning.controller';
import * as as from '../controllers/pwm/assets.controller';
import * as cs from '../controllers/pwm/cases.controller';
import * as sp from '../controllers/pwm/spend.controller';
import * as ins from '../controllers/pwm/insights.controller';
import * as pl from '../controllers/pwm/planning.controller';

const router = Router();
const any = pwmAuth();

// Identity & pickers
router.get('/me',                       ...any, core.getMe);
router.get('/people',                   ...any, core.listPeople);
router.get('/dashboard',                ...any, dash.getDashboard);

// Team access (super admin manages; HR administrators and auditors can read)
router.get('/members',                  ...pwmAuth('viewAudit'), core.listMembers);
router.get('/eligible-users',           ...pwmAuth('manageTeam'), core.listEligibleUsers);
router.post('/members',                 ...pwmAuth('manageTeam'), core.createMember);
router.patch('/members/:id',            ...pwmAuth('manageTeam'), core.updateMember);
router.post('/members/:id/revoke',      ...pwmAuth('manageTeam'), core.setMemberActive(false));
router.post('/members/:id/restore',     ...pwmAuth('manageTeam'), core.setMemberActive(true));

// Settings
router.get('/settings',                 ...pwmAuth('configure'), core.readSettings);
router.patch('/settings',               ...pwmAuth('configure'), core.updateSettings);

// Organisation
router.get('/departments',              ...any, core.listDepartments);
router.post('/departments',             ...pwmAuth('manageOrganisation'), core.createDepartment);
router.post('/departments/seed',        ...pwmAuth('manageOrganisation'), core.seedDepartments);
router.patch('/departments/:id',        ...pwmAuth('manageOrganisation'), core.updateDepartment);
router.post('/departments/:id/archive', ...pwmAuth('manageOrganisation'), core.archiveDepartment);

// Employees
router.get('/employees',                ...any, emp.listEmployees);
router.get('/employees/lookup',         ...any, emp.lookupEmployees);
router.get('/employees/export.csv',     ...pwmAuth('manageEmployees'), emp.exportEmployees);
router.post('/employees',               ...pwmAuth('manageEmployees'), emp.createEmployee);
router.get('/employees/:id',            ...any, emp.getEmployee);
router.patch('/employees/:id',          ...pwmAuth('manageEmployees'), emp.updateEmployee);
router.post('/employees/:id/reveal',    ...any, emp.revealSensitive);
router.post('/employees/:id/status',    ...pwmAuth('changeStatus'), emp.changeStatus);
router.post('/employees/:id/rehire',    ...pwmAuth('manageEmployees'), emp.rehire);
router.post('/employees/:id/documents', ...pwmAuth('manageEmployees'), emp.addDocument);
router.get('/employees/:id/timeline',   ...pwmAuth('manageEmployees'), emp.timeline);
router.post('/employees/:id/checklists', ...pwmAuth('manageChecklists'), chk.startForEmployee);
router.get('/employees/:id/compensation', ...any, chk.listCompensation);
router.post('/employees/:id/compensation', ...pwmAuth('manageCompensation'), chk.proposeCompensation);
router.post('/documents/:id/archive',   ...pwmAuth('manageEmployees'), emp.archiveDocument);
router.get('/expiring-documents',       ...any, emp.expiringDocuments);
router.post('/import/employees',        ...pwmAuth('import'), emp.importEmployees);

// Status approvals and pay approvals
router.get('/status-requests',          ...any, emp.listStatusRequests);
router.post('/status-requests/:id/decide', ...any, emp.decideStatusRequest);
router.get('/compensation/pending',     ...any, chk.pendingCompensation);
router.post('/compensation/:id/decide', ...pwmAuth('approveCompensation'), chk.decideCompensation);

// Contracts
router.get('/contracts',                ...any, con.listContracts);
router.get('/contracts/export.csv',     ...pwmAuth('manageContracts'), dash.exportContracts);
router.post('/contracts',               ...pwmAuth('manageContracts'), con.createContract);
router.get('/contracts/:id',            ...any, con.getContract);
router.patch('/contracts/:id',          ...pwmAuth('manageContracts'), con.updateContract);
router.post('/contracts/:id/submit',    ...pwmAuth('manageContracts'), con.submitContract);
router.post('/contracts/:id/approval',  ...pwmAuth('approveContracts'), con.decideContract);
router.post('/contracts/:id/issue',     ...pwmAuth('manageContracts'), con.issueContract);
router.post('/contracts/:id/sign',      ...pwmAuth('manageContracts'), con.signContract);
router.post('/contracts/:id/decline',   ...pwmAuth('manageContracts'), con.declineContract);
router.post('/contracts/:id/cancel',    ...pwmAuth('manageContracts'), con.cancelContract);
router.post('/contracts/:id/amendments', ...pwmAuth('manageContracts'), con.addAmendment);
router.post('/contracts/:id/documents', ...pwmAuth('manageContracts'), con.addContractDocument);
router.post('/contracts/:id/renewal',   ...pwmAuth('manageContracts'), ren.openRenewal);

// Renewals
router.get('/renewals',                 ...any, ren.listRenewals);
router.get('/renewals/:id',             ...any, ren.getRenewal);
router.post('/renewals/:id/recommend',  ...pwmAuth('recommend'), ren.recommend);
router.post('/renewals/:id/decide',     ...pwmAuth('decide'), ren.decide);
router.post('/renewals/:id/prepare',    ...pwmAuth('manageContracts'), ren.prepare);

// Automated reminders
router.get('/reminders',                ...any, ren.listReminders);
router.get('/reminders/upcoming',       ...any, ren.upcomingReminders);
router.post('/reminders/:id/ack',       ...any, ren.acknowledge);
router.post('/reminders/:id/resend',    ...pwmAuth('manageReminders'), ren.resend);
router.get('/engine',                   ...pwmAuth('viewReminders'), ren.engineStatus);
router.post('/engine/run',              ...pwmAuth('manageTeam'), ren.runEngine);

// Checklists (onboarding / offboarding)
router.get('/checklists',               ...any, chk.listChecklists);
router.get('/checklists/:id',           ...any, chk.getChecklist);
router.post('/checklists/:id/complete', ...pwmAuth('manageChecklists'), chk.completeChecklist);
router.post('/checklist-tasks',         ...pwmAuth('manageChecklists'), chk.addTask);
router.patch('/checklist-tasks/:id',    ...any, chk.updateTask);

// Reports and activity
router.get('/reports/monthly',          ...any, dash.monthlyReport);
router.get('/activity',                 ...pwmAuth('viewAudit'), dash.listActivity);
router.get('/activity/export.csv',      ...pwmAuth('viewAudit'), dash.exportActivity);

// Recruitment
router.get('/recruitment/summary',      ...pwmAuth('viewRecruitment'), rec.recruitmentSummary);
router.get('/vacancies',                ...pwmAuth('viewRecruitment'), rec.listVacancies);
router.post('/vacancies',               ...pwmAuth('manageRecruitment'), rec.createVacancy);
router.get('/vacancies/:id',            ...pwmAuth('viewRecruitment'), rec.getVacancy);
router.patch('/vacancies/:id',          ...pwmAuth('manageRecruitment'), rec.updateVacancy);
router.post('/vacancies/:id/status',    ...pwmAuth('viewRecruitment'), rec.vacancyAction);
router.post('/vacancies/:id/applications', ...pwmAuth('manageRecruitment'), rec.addApplication);
router.patch('/applications/:id',       ...pwmAuth('manageRecruitment'), rec.updateApplication);
router.post('/applications/:id/interviews', ...pwmAuth('manageRecruitment'), rec.scheduleInterview);
router.post('/applications/:id/hire',   ...pwmAuth('manageRecruitment'), rec.hire);
router.post('/interviews/:id/feedback', ...pwmAuth('viewRecruitment'), rec.interviewFeedback);
router.post('/candidates/:id/anonymise', ...pwmAuth('manageRecruitment'), rec.anonymiseCandidate);

// Policies, announcements, templates
router.get('/policies',                 ...any, cnt.listPolicies);
router.post('/policies',                ...pwmAuth('managePolicies'), cnt.createPolicy);
router.get('/policies/:id',             ...any, cnt.getPolicy);
router.patch('/policies/:id',           ...pwmAuth('managePolicies'), cnt.updatePolicy);
router.post('/policies/:id/publish',    ...pwmAuth('managePolicies'), cnt.publishPolicy);
router.post('/policies/:id/archive',    ...pwmAuth('managePolicies'), cnt.archivePolicy);
router.get('/policies/:id/acknowledgements', ...pwmAuth('managePolicies'), cnt.policyAcks);
router.get('/announcements',            ...pwmAuth('manageAnnouncements'), cnt.listAnnouncements);
router.post('/announcements',           ...pwmAuth('manageAnnouncements'), cnt.createAnnouncement);
router.post('/announcements/:id/archive', ...pwmAuth('manageAnnouncements'), cnt.archiveAnnouncement);
router.get('/templates',                ...pwmAuth('manageTemplates'), cnt.listTemplates);
router.post('/templates',               ...pwmAuth('manageTemplates'), cnt.createTemplate);
router.post('/templates/seed',          ...pwmAuth('manageTemplates'), cnt.seedTemplates);
router.patch('/templates/:id',          ...pwmAuth('manageTemplates'), cnt.updateTemplate);
router.post('/templates/:id/approve',   ...pwmAuth('approveContracts'), cnt.approveTemplate);
router.post('/templates/:id/generate',  ...pwmAuth('manageTemplates'), cnt.generate);

// Exit, org chart, self-service administration, pre-boarding
router.get('/employees/:id/exit',       ...any, ext.getExit);
router.put('/employees/:id/exit-interview', ...pwmAuth('manageChecklists'), ext.saveExitInterview);
router.post('/clearance/:id/sign',      ...any, ext.signClearance);
router.get('/reports/exit-reasons',     ...pwmAuth('viewExitInterviews'), ext.exitReasons);
router.get('/org-chart',                ...any, ext.orgChart);
router.post('/employees/:id/my-hr-access', ...pwmAuth('manageEmployees'), ss.provisionAccess);
router.post('/employees/:id/my-hr-access/revoke', ...pwmAuth('manageEmployees'), ss.revokeAccess);
router.post('/employees/:id/preboarding', ...pwmAuth('manageEmployees'), pre.issueLink);
router.get('/change-requests',          ...any, ss.listChangeRequests);
router.post('/change-requests/:id/decide', ...any, ss.decideChangeRequest);

// Leave, holidays
router.get('/leave/types',              ...any, tw.listLeaveTypes);
router.post('/leave/types/seed',        ...pwmAuth('configureLeave'), tw.seedLeaveTypes);
router.post('/leave/types',             ...pwmAuth('configureLeave'), tw.createLeaveType);
router.patch('/leave/types/:id',        ...pwmAuth('configureLeave'), tw.updateLeaveType);
router.get('/holidays',                 ...any, tw.listHolidays);
router.post('/holidays',                ...pwmAuth('configureLeave'), tw.addHoliday);
router.post('/holidays/seed',           ...pwmAuth('configureLeave'), tw.seedHolidays);
router.post('/holidays/:id/delete',     ...pwmAuth('configureLeave'), tw.deleteHoliday);
router.get('/leave/requests',           ...pwmAuth('viewLeave'), tw.listLeaveRequests);
router.post('/leave/requests',          ...pwmAuth('manageLeave'), tw.createLeaveForEmployee);
router.post('/leave/requests/:id/decide', ...any, tw.decideLeaveRequest);
router.post('/leave/requests/:id/cancel', ...pwmAuth('manageLeave'), tw.cancelLeaveRequest);
router.get('/leave/balances',           ...pwmAuth('viewLeave'), tw.listBalances);
router.post('/leave/adjust',            ...pwmAuth('manageLeave'), tw.adjust);
router.post('/leave/year-end',          ...pwmAuth('configureLeave'), tw.runYearEnd);
router.get('/leave/report',             ...pwmAuth('viewLeave'), tw.leaveReport);

// Attendance
router.get('/schedules',                ...pwmAuth('viewAttendance'), tw.listSchedules);
router.post('/schedules',               ...pwmAuth('manageAttendance'), tw.createSchedule);
router.patch('/schedules/:id',          ...pwmAuth('manageAttendance'), tw.updateSchedule);
router.post('/schedules/:id/assign',    ...pwmAuth('manageAttendance'), tw.assignSchedule);
router.get('/attendance/register',      ...pwmAuth('viewAttendance'), tw.register);
router.get('/attendance/summary',       ...pwmAuth('viewAttendance'), tw.attendanceSummary);
router.post('/attendance/:id/excuse',   ...pwmAuth('manageAttendance'), tw.excuseAbsence);
router.get('/attendance/corrections',   ...pwmAuth('viewAttendance'), tw.listCorrections);
router.post('/attendance/corrections/:id/decide', ...any, tw.decideCorrectionReq);
router.get('/overtime',                 ...pwmAuth('viewAttendance'), tw.listOvertime);
router.post('/overtime/:id/decide',     ...any, tw.decideOvertimeReq);

// Performance
router.get('/performance/cycles',       ...pwmAuth('viewPerformance'), tw.listCycles);
router.post('/performance/cycles',      ...pwmAuth('managePerformance'), tw.createCycle);
router.post('/performance/cycles/:id/launch', ...pwmAuth('managePerformance'), tw.launch);
router.post('/performance/cycles/:id/close', ...pwmAuth('managePerformance'), tw.closeCycle);
router.get('/performance/reviews',      ...pwmAuth('viewPerformance'), tw.listReviews);
router.get('/performance/reviews/:id',  ...pwmAuth('viewPerformance'), tw.getReview);
router.post('/performance/reviews/:id/reopen', ...pwmAuth('managePerformance'), tw.reopenReview);
router.post('/performance/reviews/:id/reviewer', ...pwmAuth('managePerformance'), tw.setReviewer);
router.get('/performance/report',       ...pwmAuth('viewPerformance'), tw.performanceReport);
router.get('/employees/:id/performance', ...pwmAuth('viewPerformance'), tw.employeePerformance);
router.get('/objectives/departments',   ...pwmAuth('viewPerformance'), tw.listDepartmentObjectives);
router.post('/objectives',              ...pwmAuth('viewPerformance'), tw.createObjective);
router.patch('/objectives/:id',         ...pwmAuth('viewPerformance'), tw.updateObjective);
router.post('/employees/:id/feedback',  ...pwmAuth('viewPerformance'), tw.addFeedback);
router.post('/employees/:id/pips',      ...pwmAuth('managePerformance'), tw.createPip);
router.post('/pips/:id/close',          ...pwmAuth('managePerformance'), tw.closePip);

// HR calendar
router.get('/calendar',                 ...any, tw.calendar);

// Learning
router.get('/learning/courses',         ...pwmAuth('viewLearning'), ln.listCourses);
router.post('/learning/courses',        ...pwmAuth('manageLearning'), ln.createCourse);
router.patch('/learning/courses/:id',   ...pwmAuth('manageLearning'), ln.updateCourse);
router.post('/learning/courses/:id/assign-mandatory', ...pwmAuth('manageLearning'), ln.assignMandatoryReq);
router.get('/learning/enrolments',      ...pwmAuth('viewLearning'), ln.listEnrolments);
router.post('/learning/enrolments',     ...pwmAuth('manageLearning'), ln.assignCourse);
router.post('/learning/enrolments/:id/decide', ...any, ln.decideEnrolmentReq);
router.post('/learning/enrolments/:id/complete', ...pwmAuth('manageLearning'), ln.completeEnrolment);
router.post('/learning/enrolments/:id/cancel', ...pwmAuth('manageLearning'), ln.cancelEnrolment);
router.get('/learning/budgets',         ...pwmAuth('viewLearning'), ln.listBudgets);
router.put('/learning/budgets',         ...pwmAuth('manageLearning'), ln.setBudget);
router.get('/learning/compliance',      ...pwmAuth('viewLearning'), ln.compliance);
router.get('/skills',                   ...pwmAuth('viewLearning'), ln.listSkills);
router.post('/skills',                  ...pwmAuth('manageLearning'), ln.createSkill);
router.post('/skills/assess',           ...pwmAuth('viewPerformance'), ln.assessSkill);
router.put('/skills/requirements',      ...pwmAuth('manageLearning'), ln.setRequirement);
router.get('/skills/matrix',            ...pwmAuth('viewLearning'), ln.skillMatrix);
router.get('/employees/:id/development', ...pwmAuth('viewLearning'), ln.listPlans);
router.post('/employees/:id/development', ...pwmAuth('viewLearning'), ln.createPlan);
router.patch('/development/:id',        ...pwmAuth('viewLearning'), ln.updatePlan);

// Assets
router.get('/assets',                   ...pwmAuth('viewAssets'), as.listAssets);
router.get('/assets/expiring',          ...pwmAuth('viewAssets'), as.expiring);
router.post('/assets',                  ...pwmAuth('manageAssets'), as.createAsset);
router.get('/assets/:id',               ...pwmAuth('viewAssets'), as.getAsset);
router.patch('/assets/:id',             ...pwmAuth('manageAssets'), as.updateAsset);
router.post('/assets/:id/assign',       ...pwmAuth('manageAssets'), as.assign);
router.post('/assets/:id/events',       ...pwmAuth('manageAssets'), as.addEvent);
router.post('/assets/:id/retire',       ...pwmAuth('manageAssets'), as.retireAsset);
router.post('/assets/assignments/:id/return', ...pwmAuth('manageAssets'), as.returnAsset);
router.post('/assets/assignments/:id/resolve', ...pwmAuth('manageAssets'), as.resolveAssignment);
router.get('/employees/:id/assets',     ...pwmAuth('viewAssets'), as.employeeAssets);

// Employee relations and recognition
router.get('/cases',                    ...pwmAuth('handleCases'), cs.listCases);
router.post('/cases',                   ...pwmAuth('createCases'), cs.createCase);
router.get('/cases/:id',                ...pwmAuth(), cs.getCase);
router.post('/cases/:id/break-glass',   ...pwmAuth('manageTeam'), cs.breakGlass);
router.post('/cases/:id/handlers',      ...pwmAuth(), cs.addHandler);
router.post('/cases/:id/recuse',        ...pwmAuth(), cs.recuse);
router.post('/cases/:id/events',        ...pwmAuth(), cs.addCaseEvent);
router.post('/cases/:id/query',         ...pwmAuth(), cs.issueQuery);
router.post('/cases/:id/stage',         ...pwmAuth(), cs.setStage);
router.post('/cases/:id/outcome',       ...pwmAuth(), cs.recordOutcome);
router.post('/cases/:id/close',         ...pwmAuth(), cs.closeCase);
router.get('/employees/:id/warnings',   ...pwmAuth(), cs.employeeWarnings);
router.get('/er/report',                ...pwmAuth('viewERReports'), cs.erReport);
router.post('/employees/:id/recognition', ...pwmAuth('manageRecognition'), cs.giveRecognition);
router.get('/employees/:id/recognition', ...pwmAuth(), cs.employeeRecognition);

// Surveys
router.get('/surveys',                  ...pwmAuth('manageSurveys'), ins.listSurveys);
router.post('/surveys',                 ...pwmAuth('manageSurveys'), ins.createSurvey);
router.patch('/surveys/:id',            ...pwmAuth('manageSurveys'), ins.updateSurvey);
router.post('/surveys/:id/open',        ...pwmAuth('manageSurveys'), ins.openSurvey);
router.post('/surveys/:id/close',       ...pwmAuth('manageSurveys'), ins.closeSurvey);
router.get('/surveys/:id/results',      ...pwmAuth('viewSurveyResults'), ins.surveyResults);

// Expenses and travel
router.get('/expenses',                 ...pwmAuth('viewExpenses'), sp.listClaims);
router.get('/expenses/export.csv',      ...pwmAuth('viewExpenses'), sp.exportClaims);
router.post('/expenses/:id/decide',     ...any, sp.decideClaimReq);
router.post('/expenses/:id/pay',        ...pwmAuth('payExpenses'), sp.payClaim);
router.get('/travel',                   ...pwmAuth('viewExpenses'), sp.listTravel);
router.post('/travel/:id/decide',       ...any, sp.decideTravelReq);

// Analytics
router.get('/analytics/scorecards',     ...pwmAuth('viewAnalytics'), ins.scorecards);
router.get('/analytics/workforce',      ...pwmAuth('viewAnalytics'), ins.workforce);

// Workforce planning and succession (Phase 5)
router.get('/planning',                 ...pwmAuth('viewPlanning'), pl.plan);
router.put('/planning',                 ...pwmAuth('managePlanning'), pl.upsertLine);
router.post('/planning/submit',         ...pwmAuth('managePlanning'), pl.submitYear);
router.post('/planning/decide',         ...pwmAuth('approvePlanning'), pl.decideYear);
router.delete('/planning/:id',          ...pwmAuth('managePlanning'), pl.deleteLine);
router.get('/succession',               ...pwmAuth('viewSuccession'), pl.listPositions);
router.post('/succession',              ...pwmAuth('manageSuccession'), pl.createPosition);
router.patch('/succession/:id',         ...pwmAuth('manageSuccession'), pl.updatePosition);
router.delete('/succession/successors/:id', ...pwmAuth('manageSuccession'), pl.removeSuccessor);
router.delete('/succession/:id',        ...pwmAuth('manageSuccession'), pl.archivePosition);
router.post('/succession/:id/successors', ...pwmAuth('manageSuccession'), pl.setSuccessor);

export default router;
