// My HR: employee self-service. Mounted at /api/v1/my-hr. Everything here is about the signed-in person's own record.
import { Router } from 'express';
import { myHrAuth } from '../middleware/myhr.middleware';
import { hrFiles } from '../middleware/hrFiles.middleware';
import * as ss from '../controllers/pwm/selfservice.controller';
import * as m3 from '../controllers/pwm/myhr3.controller';
import * as m4 from '../controllers/pwm/myhr4.controller';
import * as ins from '../controllers/pwm/insights.controller';

const router = Router();
router.use(...myHrAuth);
// HR files are private: stored as references, shown as short-lived signed links (see hrFiles.middleware).
router.use(hrFiles);

router.get('/me',                  ss.getMe);
router.get('/announcements',       ss.announcements);
router.patch('/profile',           ss.updateProfile);
router.post('/bank-change',        ss.requestBankChange);
router.get('/contracts',           ss.myContracts);
router.get('/documents',           ss.myDocuments);
router.post('/documents',          ss.addMyDocument);
router.get('/tasks',               ss.myTasks);
router.patch('/tasks/:id',         ss.updateMyTask);
router.get('/policies',            ss.myPolicies);
router.post('/policies/:id/ack',   ss.ackPolicy);
router.get('/directory',           ss.directory);

router.get('/leave',                 m3.myLeave);
router.post('/leave/preview',        m3.previewMyLeave);
router.post('/leave',                m3.submitMyLeave);
router.post('/leave/:id/cancel',     m3.cancelMyLeave);
router.get('/attendance',            m3.myAttendance);
router.post('/attendance/clock-in',  m3.doClockIn);
router.post('/attendance/clock-out', m3.doClockOut);
router.post('/attendance/corrections', m3.myCorrection);
router.post('/attendance/:id/explain', m3.explainAbsence);
router.post('/overtime',             m3.myOvertime);
router.get('/approvals',             m3.myApprovals);
router.post('/approvals/leave/:id',  m3.decideMy('leave'));
router.post('/approvals/corrections/:id', m3.decideMy('correction'));
router.post('/approvals/overtime/:id', m3.decideMy('overtime'));
router.get('/calendar',              m3.myCalendar);
router.get('/reviews',               m3.myReviews);
router.get('/reviews/:id',           m3.myReviewDetail);
router.post('/reviews/:id/self',     m3.submitSelf);
router.post('/reviews/:id/manager',  m3.submitManager);
router.post('/reviews/:id/discussed', m3.markDiscussed);
router.post('/reviews/:id/acknowledge', m3.acknowledge);
router.get('/objectives',            m3.myObjectives);
router.patch('/objectives/:id',      m3.updateMyObjective);
router.get('/team',                  m3.myTeam);
router.post('/team/:employeeId/objectives', m3.teamObjective);
router.post('/team/:employeeId/feedback', m3.teamFeedback);

router.get('/learning',              m4.myLearning);
router.post('/learning/request',     m4.requestCourse);
router.post('/learning/:id/certificate', m4.attachCertificate);
router.post('/learning/:id/cancel',  m4.cancelMyCourse);
router.post('/development',          m4.myPlan);
router.get('/assets',                m4.myAssets);
router.post('/assets/:id/acknowledge', m4.acknowledgeAsset);
router.get('/cases',                 m4.myCases);
router.post('/cases/:id/respond',    m4.respondToCase);
router.post('/cases/:id/appeal',     m4.appealCase);
router.post('/grievance',            m4.raiseGrievance);
router.get('/recognition',           m4.myRecognition);
router.get('/expenses',              m4.myExpenses);
router.post('/expenses',             m4.submitMyClaim);
router.post('/travel',               m4.submitMyTravel);
router.get('/approvals/more',        m4.approvalsPhase4);
router.post('/approvals/enrolments/:id', m4.decideMy4('enrolment'));
router.post('/approvals/expenses/:id', m4.decideMy4('claim'));
router.post('/approvals/travel/:id', m4.decideMy4('travel'));
router.get('/surveys',               ins.mySurveys);
router.post('/surveys/:id/respond',  ins.respondSurvey);

export default router;
