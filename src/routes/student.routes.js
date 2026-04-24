const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const studentController = require('../controllers/student.controller');

const router = express.Router();
const studentAccess = [requireAuth, requireRole(['STUDENT'])];

router.get('/profile', ...studentAccess, studentController.getProfile);
router.get('/dashboard', ...studentAccess, studentController.getDashboard);
router.get('/schedule/upcoming', ...studentAccess, studentController.getUpcomingSchedule);

module.exports = router;
