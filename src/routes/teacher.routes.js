const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const teacherController = require('../controllers/teacher.controller');

const router = express.Router();
const teacherAccess = [requireAuth, requireRole(['TEACHER'])];

router.get('/dashboard', ...teacherAccess, teacherController.getDashboard);
router.get('/schedule/today', ...teacherAccess, teacherController.getTodaySchedule);

module.exports = router;
