const express = require('express');
const {
  APP_PERMISSIONS,
  requireAuth,
  requirePermission,
} = require('../middlewares/auth.middleware');
const teacherController = require('../controllers/teacher.controller');
const availabilityController = require('../controllers/availability.controller');

const router = express.Router();
const teacherAccess = [requireAuth, requirePermission(APP_PERMISSIONS.TEACHER_PORTAL_ACCESS)];

router.get('/admissions/pending', ...teacherAccess, teacherController.getPendingAdmissions);
router.patch('/admissions/:joinRequestId/approve', ...teacherAccess, teacherController.approveJoinRequest);
router.patch('/admissions/:joinRequestId/reject', ...teacherAccess, teacherController.rejectJoinRequest);

router.get('/sessions/pending', ...teacherAccess, teacherController.getPendingSessions);
router.patch('/sessions/:id/confirm-completion', ...teacherAccess, teacherController.confirmCompletion);
router.post('/sessions/:id/no-show', ...teacherAccess, teacherController.registerNoShow);

router.get('/admission-requests', ...teacherAccess, teacherController.getAdmissionRequests);
router.get('/dashboard', ...teacherAccess, teacherController.getDashboard);
router.get('/schedule/today', ...teacherAccess, teacherController.getTodaySchedule);
router.patch('/admission-requests/:joinRequestId/review', ...teacherAccess, teacherController.reviewAdmissionRequest);

router.get('/sessions/pending', ...teacherAccess, teacherController.getPendingSessions);
router.patch('/sessions/:sessionId/confirm-completion', ...teacherAccess, teacherController.confirmCompletion);
router.post('/sessions/:sessionId/no-show', ...teacherAccess, teacherController.registerNoShow);

router.post('/availability', ...teacherAccess, availabilityController.submitTeacherAvailability);
router.get('/availability', ...teacherAccess, availabilityController.listTeacherAvailability);
router.patch('/availability/:availabilityId', ...teacherAccess, availabilityController.updateTeacherAvailability);
router.post('/availability/exceptions', ...teacherAccess, availabilityController.createTeacherException);
router.get('/availability/exceptions/pending', ...teacherAccess, availabilityController.listPendingTeacherExceptions);

module.exports = router;
