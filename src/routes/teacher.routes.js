const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const teacherController = require('../controllers/teacher.controller');

const router = express.Router();

router.get('/dashboard', requireAuth, requireRole('teacher'), teacherController.getDashboard);
router.get('/schedule/today', requireAuth, requireRole('teacher'), teacherController.getTodaySchedule);

module.exports = router;
