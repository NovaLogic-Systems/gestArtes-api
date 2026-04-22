const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const teacherController = require('../controllers/teacher.controller');

const router = express.Router();

router.get('/admissions/pending', requireAuth, requireRole('teacher'), teacherController.getPendingAdmissions);
router.patch('/admissions/:joinRequestId/approve', requireAuth, requireRole('teacher'), teacherController.approveJoinRequest);
router.patch('/admissions/:joinRequestId/reject', requireAuth, requireRole('teacher'), teacherController.rejectJoinRequest);

router.get('/admission-requests', requireAuth, requireRole('teacher'), teacherController.getAdmissionRequests);
router.get('/dashboard', requireAuth, requireRole('teacher'), teacherController.getDashboard);
router.get('/schedule/today', requireAuth, requireRole('teacher'), teacherController.getTodaySchedule);
router.patch('/admission-requests/:joinRequestId/review', requireAuth, requireRole('teacher'), teacherController.reviewAdmissionRequest);

module.exports = router;
