const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const studentController = require('../controllers/student.controller');

const router = express.Router();

router.get('/profile', requireAuth, studentController.getProfile);
router.get('/dashboard', requireAuth, requireRole('student'), studentController.getDashboard);

module.exports = router;