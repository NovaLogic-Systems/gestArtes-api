const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const teacherController = require('../controllers/teacher.controller');

const router = express.Router();
const teacherAccess = [requireAuth, requireRole(['TEACHER'])];

router.get('/admissions/pending', ...teacherAccess, teacherController.getPendingAdmissions);
router.patch('/admissions/:joinRequestId/approve', ...teacherAccess, teacherController.approveJoinRequest);
router.patch('/admissions/:joinRequestId/reject', ...teacherAccess, teacherController.rejectJoinRequest);

router.get('/admission-requests', ...teacherAccess, teacherController.getAdmissionRequests);
router.get('/dashboard', ...teacherAccess, teacherController.getDashboard);
router.get('/schedule/today', ...teacherAccess, teacherController.getTodaySchedule);
router.patch('/admission-requests/:joinRequestId/review', ...teacherAccess, teacherController.reviewAdmissionRequest);

module.exports = router;
