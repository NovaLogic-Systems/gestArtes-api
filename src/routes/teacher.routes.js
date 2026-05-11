/**
 * @file src/routes/teacher.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

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

router.get('/sessions/active', ...teacherAccess, teacherController.getActiveSessions);
router.get('/sessions/pending', ...teacherAccess, teacherController.getPendingSessions);
router.patch('/sessions/:sessionId/confirm-completion', ...teacherAccess, teacherController.confirmCompletion);
router.post('/sessions/:sessionId/no-show', ...teacherAccess, teacherController.registerNoShow);

router.get('/admission-requests', ...teacherAccess, teacherController.getAdmissionRequests);
router.get('/dashboard', ...teacherAccess, teacherController.getDashboard);
router.get('/schedule/today', ...teacherAccess, teacherController.getTodaySchedule);
router.get('/profile', ...teacherAccess, teacherController.getProfile);
router.patch('/profile', ...teacherAccess, teacherController.updateProfile);
router.post('/profile/password', ...teacherAccess, teacherController.changePassword);
router.patch('/admission-requests/:joinRequestId/review', ...teacherAccess, teacherController.reviewAdmissionRequest);

router.post('/availability', ...teacherAccess, availabilityController.submitTeacherAvailability);
router.post('/availability/submit', ...teacherAccess, availabilityController.submitTeacherAvailability);
router.get('/availability', ...teacherAccess, availabilityController.listTeacherAvailability);
router.get('/calendar', ...teacherAccess, availabilityController.getTeacherCalendar);
router.patch('/availability/:availabilityId', ...teacherAccess, availabilityController.updateTeacherAvailability);
router.delete('/availability/:availabilityId', ...teacherAccess, availabilityController.cancelTeacherAvailability);
router.post('/availability/exceptions', ...teacherAccess, availabilityController.createTeacherException);
router.get('/availability/exceptions/pending', ...teacherAccess, availabilityController.listPendingTeacherExceptions);

module.exports = router;

